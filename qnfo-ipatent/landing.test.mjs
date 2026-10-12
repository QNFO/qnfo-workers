// IPATENT-UI-OVERHAUL-1 offline suite (qnfo-ipatent 3.17.0, agent_issues 2049). The drafting page served by the real fetch
// handler: it states what it is not (legal advice, a filing, a prior-art search), every form control has a label, the page
// works at phone width without relying on colour or capitals, every guide is linked, and the hooks the page script needs
// are all present. Run: node qnfo-ipatent/landing.test.mjs   (prints "N passed, 0 failed")
import { readFileSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const W = (await import("./worker.js")).default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const env = { IPATENT_DB: { prepare: stmt } };
const ctx = { waitUntil() {} };
const get = async (p) => { const r = await W.fetch(new Request("https://ipatent.qnfo.org" + p, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh) Safari/605" } }), env, ctx); return { status: r.status, h: await r.text() }; };
const page = (await get("/?v=2")).h;
const body = page.slice(page.indexOf("<body"));
const css = page.slice(page.indexOf("<style>"), page.indexOf("</style>"));
const markup = body.slice(0, body.indexOf("<script>"));
const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// 1. No legal promise: the limits are stated in the page, near the top and at the draft button.
ok(/not legal advice/i.test(text.slice(0, 1500)), "the first screen says it is not legal advice");
ok(/It does not give legal advice/.test(text) && /It does not file/.test(text) && /It does not search the prior art/.test(text) && /It does not supply the invention/.test(text), "the limits section names the four things iPatent does not do");
ok(/registered patent attorney or agent/.test(text) && /establishes no filing date|No USPTO filing date is established/.test(text), "it points to a registered practitioner and says a draft creates no filing date");
ok(!/\b(guarantee[sd]?|patent pending|will be granted|ensures? (?:your )?protection|legally binding)\b/i.test(text), "no promise of protection, grant or legal effect", (text.match(/.{40}(guarantee|patent pending|will be granted).{40}/i) || [])[0]);

// 2. The owner's frame: what it is, what it does, how it works.
ok(/<dt>What it is<\/dt>/.test(markup) && /<dt>What it does<\/dt>/.test(markup) && /<dt>How it works<\/dt>/.test(markup), "the description prompt asks what it is, what it does and how it works");
ok(/A provisional patent protects only what it describes/.test(text), "the headline states what a provisional protects");

// 3. Accessible and responsive.
ok(/<meta name="viewport" content="width=device-width, initial-scale=1.0">/.test(page) && /<html lang="en">/.test(page), "viewport and language are set");
ok(/class="skip" href="#draft"/.test(markup) && /id="draft"/.test(markup), "a skip link reaches the form");
const ids = [...markup.matchAll(/<(?:input|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== "subHp");
const unlabelled = ids.filter((id) => !new RegExp('<label for="' + id + '"').test(markup) && !new RegExp('<label[^>]*>\\s*<input[^>]*id="' + id + '"').test(markup));
ok(ids.length >= 8 && unlabelled.length === 0, "every input and textarea has a label", unlabelled);
ok((markup.match(/<h1\b/g) || []).length === 1, "one h1");
ok(/<svg[^>]*role="img"[^>]*aria-labelledby="figT figD"/.test(markup) && /<title id="figT">/.test(markup) && /<desc id="figD">/.test(markup), "the figure has a text alternative");
ok(/id="status" role="status" aria-live="polite"/.test(markup) && /id="deadlineOut" aria-live="polite"/.test(markup) && /id="meter" aria-live="polite"/.test(markup), "status, deadline and meter are live regions");
ok(/:focus-visible\{outline:3px solid/.test(css) && /prefers-reduced-motion:reduce/.test(css), "keyboard focus is visible and reduced motion is respected");
ok(!/text-transform:\s*uppercase/.test(css) && !/text-transform:\s*uppercase/.test(markup), "no capitalised interface text");
ok(/@media\(min-width:980px\)/.test(css) && /@media\(min-width:640px\)/.test(css) && !/@media\(max-width/.test(css), "the layout is built phone-first (min-width queries only)");
ok(/\.wrap\{max-width:1180px;margin:0 auto;padding:0 16px/.test(css) && /overflow-wrap:anywhere/.test(css), "a 16px gutter at phone width and long words wrap");
ok(/font-size:16px/.test(css.slice(css.indexOf("input[type=text]"), css.indexOf("input[type=text]") + 400)), "form text is 16px (no zoom on focus on phones)");
ok(/\.fs\.done \.fn::before\{content:"/.test(css) && /\.fs\.warn \.fn::before\{content:"/.test(css) && /\.mi\.ok::before/.test(css), "step and checklist states carry a mark, not colour alone");
ok(/@media print\{/.test(css) && /\.form-card/.test(css.slice(css.indexOf("@media print"))), "printing shows the draft, not the form");

// 4. A one-stop page: every guide and the worked example are linked.
const slugs = [...src.matchAll(/\{ slug: "([^"]+)", title:/g)].map((m) => m[1]);
ok(slugs.length >= 8 && slugs.every((s) => markup.includes('href="/guide/' + s + '"')), "every guide page is linked from the drafting page", slugs.filter((s) => !markup.includes('href="/guide/' + s + '"')));
ok(markup.includes('href="/guide"') && markup.includes('href="/example"') && markup.includes('href="/guide/file-a-us-provisional"'), "the main guide, the worked example and the filing guide are linked");

// 5. Every hook the page script uses exists once.
const script = body.slice(body.indexOf("<script>"));
const used = [...new Set([...script.matchAll(/getElementById\('([A-Za-z]+)'\)/g)].map((m) => m[1]))].filter((id) => id !== "retryBtn");
const missing = used.filter((id) => (markup.match(new RegExp('\\bid="' + id + '"', "g")) || []).length !== 1);
ok(used.length >= 25 && missing.length === 0, "every element the script looks up exists exactly once", missing);
ok(/Draft the disclosure<\/button>/.test(markup) && /btn\.textContent = 'Draft the disclosure'/.test(script), "the draft button keeps one name through the flow");
ok(!/DOCKET|STATUS <b>OPEN|\\u26A1/.test(body), "no mock docket chrome and no novelty glyphs");

// 6. The other pages take the same faces, and still say what they are.
for (const p of ["/guide", "/guide/file-a-us-provisional", "/example"]) {
  const g = await get(p);
  ok(g.status === 200 && /--paper:#eef1f4/.test(g.h) && /family=Archivo/.test(g.h) && !/IBM Plex Mono|Fraunces/.test(g.h), p + " uses the same tokens and faces");
  ok(/not legal advice/i.test(g.h), p + " keeps the not-legal-advice statement");
}
const one = (await get("/")).h;
ok(one === page, "one HTML for both variants");
const h = await (await W.fetch(new Request("https://ipatent.qnfo.org/health"), env, ctx)).json();
ok(versionAtLeast(h.version, "3.17.0"), "VERSION is 3.17.0 or later (a minimum, not a pin)", h.version);
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);

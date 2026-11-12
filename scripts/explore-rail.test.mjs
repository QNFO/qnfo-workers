// EXPLORE-RAIL-1 offline suite: the pure rail (eligibility, picks, privacy, idempotence, accessibility floor), the attach wrapper, and that every target worker holds the current block.
// Run: node scripts/explore-rail.test.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { TARGETS } from "./explore-rail-apply.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const src = readFileSync(join(root, "_shared", "explore-rail.js"), "utf8");
const ctx = { URL, Headers, Response, Date };
vm.createContext(ctx);
vm.runInContext(src + "\nthis.erInject=erInject;this.erWithRail=erWithRail;this.erAttach=erAttach;this.ER_PROPS=ER_PROPS;this.erProp=erProp;this.ER_CSS=ER_CSS;", ctx);
const { erInject, erWithRail, erAttach, ER_PROPS, erProp, ER_CSS } = ctx;
const page = "<!DOCTYPE html><html><head><title>T</title></head><body><main><p>Hello</p></main><footer>f</footer></body></html>";
const count = (h, re) => (h.match(re) || []).length;

// Catalog: public only, every entry complete and https, no personal host.
const personal = ["me.q08.org", "jobs.q08.org", "mind.q08.org", "watch.q08.org", "reading.q08.org", "travel.q08.org"];
ok(ER_PROPS.length >= 8, "catalog lists the public properties", ER_PROPS.length);
for (const p of ER_PROPS) {
  ok(p.url.startsWith("https://") && p.t && p.d && p.cta && p.hosts.length, "complete entry " + p.k);
  ok(p.next.every((k) => k !== p.k && ER_PROPS.some((q) => q.k === k)), "next list of " + p.k + " names other known properties", p.next);
  ok(p.next.length >= 4, "next list of " + p.k + " is long enough to rotate");
}
for (const h of personal) { ok(erProp(h) === null, "personal host is not a property: " + h); ok(erInject(page, "https://" + h + "/", 1) === page, "personal host page is never decorated: " + h); }
ok(!ER_PROPS.some((p) => /\b(me|jobs|mind|watch|reading|travel)\.q08\.org/.test(JSON.stringify(p))), "no personal host appears in any link or text");

// Injection.
const out = erInject(page, "https://papers.qnfo.org/papers/x", 7);
ok(out !== page && count(out, /data-explore-rail=/g) === 1, "rail added once");
ok(out.indexOf("data-explore-rail") < out.indexOf("<footer"), "rail sits before the footer, inside the page");
ok(erInject(out, "https://papers.qnfo.org/papers/x", 7) === out, "idempotent");
ok(count(out, /class="er-card"/g) === 3, "exactly three next steps (not overwhelming)");
const cards = [...out.matchAll(/class="er-card" href="https:\/\/([^/?]+)/g)].map((m) => m[1]);
ok(cards.length === 3 && !cards.includes("papers.qnfo.org"), "next steps never point at the current property", cards);
ok(/<details class="er-all">/.test(out) && /aria-current="page"/.test(out) && /you are here/.test(out), "full map is behind one disclosure and marks the current page");
const links = [...out.matchAll(/class="er-card" href="([^"]+)"/g)].map((m) => m[1]);
ok(links.length === 3 && links.every((l) => /utm_source=papers\.qnfo\.org&amp;utm_medium=explore-rail&amp;utm_campaign=explore-rail$/.test(l)), "every link is tagged for the click ledger", links);
const bare = erInject("<html><body><p>x</p></body></html>", "https://ideas.qnfo.org/", 1);
ok(/<\/aside><\/body>/.test(bare), "no footer: rail goes before </body>");
ok(erInject("<html><body>no close", "https://ideas.qnfo.org/", 1) === "<html><body>no close", "malformed page untouched");

// ULTRASTABLE-FOOTER-1: every rail, full or compact, carries the platform line and its links.
ok(/data-ultrastable-footer/.test(out) && /QNFO runs on Ultrastable/.test(out) && /href="https:\/\/ultrastable\.io\/proof\?/.test(out), "full rail names Ultrastable and links its proof");
ok(count(erInject(qds0(), "https://qnfo.org/", 1), /data-ultrastable-footer/g) === 1, "compact rail carries the Ultrastable footer too");
function qds0() { return '<html><body><main><section class="q-explore">x</section></main><footer>f</footer></body></html>'; }
ok(count(out, /class="er-plat"/g) === 1 && count(out, /<li><a href="https:\/\/(ultrastable\.io|qnfo\.org|fleet|papers|ask|archive|qwav)/g) >= 8, "eight cross-product links in the footer strip");

// Variety without chaos: same page+day is stable, different pages/days change the window.
const sets = new Set();
for (let d = 0; d < 12; d++) for (const p of ["/a", "/b", "/c"]) sets.add([...erInject(page, "https://qnfo.org" + p, d).matchAll(/class="er-card" href="https:\/\/([^/]+)/g)].map((m) => m[1]).join(","));
ok(sets.size >= 3, "the three doors rotate across pages and days", [...sets]);
ok(erInject(page, "https://qnfo.org/a", 3) === erInject(page, "https://qnfo.org/a", 3), "stable for one page and day");

// Pages with an existing Keep exploring section get the compact row, only with doors it lacks.
const qds = '<html><body><main><section class="q-explore">x</section></main><footer>f</footer></body></html>';
const comp = erInject(qds, "https://qnfo.org/", 1);
ok(/Also in the Qniverse/.test(comp) && !/class="er-all"/.test(comp), "compact row on a page that already has Keep exploring");
const compHosts = [...comp.matchAll(/class="er-card" href="https:\/\/([^/?]+)/g)].map((m) => m[1]);
ok(compHosts.length === 3 && compHosts.every((h) => !["qnfo.org", "papers.qnfo.org", "ask.qwav.org", "ideas.qnfo.org", "qwav.org", "q08.org"].includes(h)), "compact row repeats nothing the page already links", compHosts);

// Skips.
for (const p of ["/api/x", "/health", "/rss.xml", "/unsubscribe", "/confirm/abc", "/.webmcp/bridge.js", "/og.jpg", "/a.json", "/file.pdf", "/qds.css", "/work-with-me"]) ok(erInject(page, "https://papers.qnfo.org" + p, 1) === page, "skipped path " + p);
ok(erInject(page, "https://example.com/", 1) === page, "unknown host untouched");

// Accessibility floor in the rail's own CSS (DESIGN-STANDARD-1): no text under 14px, 44px targets, focus ring, reduced motion, dark scheme.
ok(![...ER_CSS.matchAll(/font(?:-size)?:\s*(\d+)px/g)].some((m) => +m[1] < 14), "no text under 14px");
ok(/min-height:44px/.test(ER_CSS) && /focus-visible/.test(ER_CSS) && /prefers-reduced-motion/.test(ER_CSS) && /prefers-color-scheme:dark/.test(ER_CSS), "44px targets, focus ring, reduced motion, dark scheme");

// Wrapper: only 200 text/html GET documents change; fails open.
const html = (b, init) => new Response(b, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, ...init });
const req = (u, o) => new Request(u, o);
const r1 = await erWithRail(html(page), req("https://qnfo.org/x"));
ok(r1.headers.get("X-Explore-Rail") === "1.2.0" && /data-explore-rail/.test(await r1.text()), "wrapper decorates a document");
ok(!/data-explore-rail/.test(await (await erWithRail(html(page), req("https://qnfo.org/x", { method: "POST" }))).text()), "POST untouched");
ok(!/data-explore-rail/.test(await (await erWithRail(html(page, { status: 404 }), req("https://qnfo.org/x"))).text()), "404 untouched");
ok(!/data-explore-rail/.test(await (await erWithRail(new Response(page, { headers: { "Content-Type": "application/json" } }), req("https://qnfo.org/x"))).text()), "non-HTML untouched");
ok(!/data-explore-rail/.test(await (await erWithRail(html(page), req("https://qnfo.org/x", { headers: { "Sec-Fetch-Dest": "iframe" } }))).text()), "iframe untouched");
const att = { async fetch() { return html(page); } };
erAttach(att); erAttach(att);
const attText = await (await att.fetch(req("https://ideas.qnfo.org/"))).text();
ok(count(attText, /data-explore-rail=/g) === 1, "attach wraps fetch once, attaching twice does not stack");
const boom = { async fetch() { throw new Error("origin down"); } };
erAttach(boom);
let threw = false; try { await boom.fetch(req("https://ideas.qnfo.org/")); } catch (e) { threw = true; }
ok(threw, "an origin error still surfaces unchanged (the wrapper hides nothing)");

// Every target worker holds the current block and attaches it; the mirror matches.
for (const w of TARGETS) for (const f of ["worker.js", "deployed-current.worker.js"]) {
  const t = readFileSync(join(root, w, f), "utf8").split(String.fromCharCode(13)).join(""); // a Windows checkout may hold CRLF
  const a = t.indexOf("// ---- EXPLORE-RAIL-1:BEGIN"), b = t.indexOf("// ---- EXPLORE-RAIL-1:END ----");
  const END = "// ---- EXPLORE-RAIL-1:END ----";
  ok(a >= 0 && b > a && t.slice(a, b + END.length) === src.trimEnd().split(String.fromCharCode(13)).join(""), w + "/" + f + " holds the current EXPLORE-RAIL-1 block (run node scripts/explore-rail-apply.mjs)");
  ok(count(t, /^erAttach\(\w+\);/gm) === 1, w + "/" + f + " attaches the rail once");
  ok(count(t, /function erProp\(/g) === 1, w + "/" + f + " defines the block once");
}
console.log("explore-rail: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

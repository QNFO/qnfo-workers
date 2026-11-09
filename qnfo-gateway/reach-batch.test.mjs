// REACH-BATCH-1 offline suite (qnfo-gateway 3.62.0): markdown negotiation, qwav discovery, atlas route, corrections feed,
// hub and paper cross-links, provenance basis wording. Run: node qnfo-gateway/reach-batch.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const paper = { slug: "a-paper", title: "A Paper", body_md: "Body text.", abstract: "abs", authors: "[]", status: "published", version: "1.0.0", created_at: "2026-10-05", updated_at: "2026-10-06" };
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; },
  async all() { if (/status = 'retracted'/.test(sql)) return { results: [{ slug: "old-one", title: "Old One", status: "retracted", updated_at: "2026-11-01" }] }; return { results: [paper] }; },
  async first() { if (/paper_change_ledger/.test(sql)) return { ts: "2026-11-02T00:00:00Z", reason: "Method error" }; if (/COUNT/.test(sql)) return { cnt: 1, count: 1 }; if (/FROM papers WHERE slug/.test(sql)) return paper; return null; },
  async run() { return {}; } }; return st; };
const objs = { "atlas/ai-science-failures/manifest.json": JSON.stringify({ version: "2026-11-09", files: { "errata.jsonl": { sha256: "abc" } } }), "atlas/ai-science-failures/DATACARD.md": "# Card", "atlas/ai-science-failures/errata.jsonl": "{}\n" };
const env = { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt },
  QNFO_BUCKET: { get: async (k) => objs[k] === undefined ? null : { body: objs[k], text: async () => objs[k], httpEtag: '"e"' } } };
const certs = { certificates: [{ page_url: "https://qnfo.github.io/qwav-demo-error-confinement/", status: "verified", checks: 11, independent_methods: ["m1"] }] };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (/qwav-certificates/.test(u)) return new Response(JSON.stringify(certs), { status: 200 });
  if (/kg\/neighbors/.test(u)) return new Response(JSON.stringify({ nodes: [{ id: "paper:a-paper", label: "Paper", name: "A" }, { id: "paper:b", label: "Paper", name: "B" }, { id: "paper:c", label: "Paper", name: "C" }, { id: "tag:x", label: "Tag", name: "x" }], edges: [{ s: "paper:a-paper", t: "paper:b", w: 1 }, { s: "paper:c", t: "paper:a-paper", w: 3 }] }), { status: 200 });
  return new Response("{}", { status: 404 });
};
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (u, h) => { const r = await gw.fetch(new Request(u, { headers: h || {} }), env, { waitUntil() {} }); return { s: r.status, t: await r.text(), h: r.headers }; };

// 8097
const md = await get("https://papers.qnfo.org/papers/a-paper", { Accept: "text/markdown" });
ok(md.s === 200 && /text\/markdown/.test(md.h.get("Content-Type")) && /Accept/.test(md.h.get("Vary") || "") && md.h.get("x-markdown-tokens"), "Accept text/markdown gets the markdown body", [md.s, md.h.get("Content-Type")]);
const html = await get("https://papers.qnfo.org/papers/a-paper", { Accept: "text/html" });
ok(html.s === 200 && /rel="alternate"; type="text\/markdown"/.test(html.h.get("Link") || ""), "HTML answer links the markdown mirror", html.h.get("Link"));
ok(html.t.indexOf("ask.qwav.org/paper/a-paper") > 0 && html.t.indexOf("ask.qwav.org/reproduce/a-paper") > 0, "paper page links living paper and reproduce");
ok(/Related papers/.test(html.t) && /papers\/c"/.test(html.t) && html.t.indexOf("papers/c\"") < html.t.indexOf("papers/b\""), "related papers block, heaviest edge first");
// 8130
const hub = await get("https://qnfo.org/");
ok(hub.t.includes("https://ideas.qnfo.org/stream") && hub.t.includes("https://ask.qwav.org/concepts") && hub.t.includes("https://ask.qwav.org/compute"), "hub links the idea stream and the tools");
// 8042 / 8098
const ll = await get("https://qwav.org/llms.txt");
ok(ll.s === 200 && /text\/plain/.test(ll.h.get("Content-Type")) && !/<!DOCTYPE/i.test(ll.t) && ll.t.includes("/demos/error-confinement"), "qwav llms.txt is text and lists demos");
const sm = await get("https://qwav.org/sitemap.xml");
ok(sm.s === 200 && (sm.t.match(/<loc>/g) || []).length > 10 && !/papers\.qnfo\.org/.test(sm.t), "qwav sitemap lists more than 10 own locs", (sm.t.match(/<loc>/g) || []).length);
const fd = await get("https://qwav.org/feed.xml");
ok(fd.s === 200 && /<rss/.test(fd.t), "qwav feed");
ok((await get("https://qwav.org/nope")).s === 404, "unknown qwav path is 404");
ok((await get("https://qwav.org/demos/error-confinement")).s === 200, "demo page");
const ce = await get("https://qwav.org/certificates.json");
ok(ce.s === 200 && /certificates/.test(ce.t) && ce.h.get("Access-Control-Allow-Origin") === "*", "certificates.json served with CORS");
const home = await get("https://qwav.org/");
ok(home.s === 200 && /Verified: 11 checks/.test(home.t) && /Not checked/.test(home.t) && /application\/ld\+json/.test(home.t), "home: badge verified and not checked, JSON-LD");
// 8095
const am = await get("https://papers.qnfo.org/data/ai-science-failures/manifest.json");
ok(am.s === 200 && /qnfo|version/.test(am.t) && am.h.get("Access-Control-Allow-Origin") === "*" && am.h.get("ETag"), "atlas file streamed");
ok((await get("https://papers.qnfo.org/data/ai-science-failures/secrets.txt")).s === 404, "atlas file allowlist");
const al = await get("https://papers.qnfo.org/data/ai-science-failures");
ok(al.s === 200 && /"@type":"Dataset"/.test(al.t) && /isAccessibleForFree/.test(al.t), "atlas landing with Dataset JSON-LD");
const lt = await get("https://papers.qnfo.org/llms.txt");
ok(lt.t.includes("/data/ai-science-failures"), "llms.txt lists the atlas");
// 8020
const cj = await get("https://papers.qnfo.org/api/corrections");
const cjj = JSON.parse(cj.t);
ok(cj.s === 200 && cjj.retractions.length === 1 && cjj.retractions[0].cope_type === "retraction" && cjj.retractions[0].reason === "Method error", "corrections JSON", cjj);
const ch = await get("https://papers.qnfo.org/corrections", { Accept: "text/html" });
ok(ch.s === 200 && /Old One/.test(ch.t), "corrections HTML");
// 8073
ok(/after its YAML front matter/.test(src), "provenance content_basis names the front matter");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

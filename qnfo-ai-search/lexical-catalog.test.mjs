// ASK-LEXICAL-CATALOG-1 (qnfo-ai-search 2.2.7) offline suite. No network: the gateway (catalog list, detail, keyword
// search) and AI Search are stubbed in the worker's own sandbox, and retrieve() runs exactly as served.
// Proves: a paper only the catalog knows (the vector index has had no feeder since 2026-08-11) is ranked first for a
// paraphrased question over a vector "hub" essay; a title query lifts the vector-only paper whose title the visitor typed
// above the lexical hits, and a quoted title lifts its catalog paper; a failing or hanging catalog falls back to the
// 2.2.6 path within CATALOG_WAIT_MS; the catalog is read in pages, without junk slugs, once per TTL, and a stale copy is
// served while one refresh runs; catalog rows with an abstract replace detail fetches; the code-loop latency anchor
// still occurs once.
// Run: node --no-warnings qnfo-ai-search/lexical-catalog.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const raw = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const src = raw.replace(/^export \{[^}]*\};?\s*$/m, "").replace(/^import [^;]*;/mg, "");

// ---- fixtures
const CATALOG = [
  { slug: "the-q-generalized-diameter", title: "The q-Generalized Diameter: Scaling Exponents for Arbitrary Ultrametric Ratios", doi: "10.5281/zenodo.11", abstract: "We count the levels a self-similar ultrametric hierarchy with scaling ratio q needs to span the gap between the classical electron radius and the reduced Compton wavelength, and show how the level count depends on q." },
  { slug: "physics-solved", title: "Physics, Solved", doi: "10.5281/zenodo.12", abstract: "A critique of claims that a single framework closes fundamental physics, with the tests that would falsify it." },
  { slug: "no-abstract-paper", title: "Ledger Notes on Distillation Factories", doi: null, abstract: "" },
  { slug: "audit-test-003", title: "Ultrametric hierarchy electron Compton scaling ratio test document", doi: null, abstract: "ultrametric hierarchy scaling ratio electron radius Compton wavelength levels" },
];
for (let i = 0; i < 450; i++) CATALOG.push({ slug: "filler-" + i, title: "Filler study " + i + " on " + ["spin chains", "graph colouring", "error budgets", "photonic links", "market design"][i % 5], doi: null, abstract: i % 2 ? "" : "A routine note about topic number " + i + " with ordinary words only." });
const DETAIL = { "beyond-the-qubit": { slug: "beyond-the-qubit", title: "Beyond the Qubit", doi: null, abstract: "An essay." }, "orchestrating-the-quantum-future": { slug: "orchestrating-the-quantum-future", title: "Orchestrating the Quantum Future", doi: null, abstract: "Orchestration essay." } };
CATALOG.forEach((p) => { DETAIL[p.slug] = p; });

const state = { listCalls: 0, detailCalls: [], listMode: "ok", chunks: [] };
async function fakeFetch(url) {
  const u = new URL(String(url));
  const resp = (j, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => j });
  if (u.hostname === "papers.qnfo.org" && u.pathname === "/papers" && u.searchParams.get("format") === "json" && u.searchParams.has("search")) return resp({ papers: [] });
  if (u.hostname === "papers.qnfo.org" && u.pathname === "/papers" && u.searchParams.get("format") === "json") {
    state.listCalls++;
    if (state.listMode === "fail") return resp({ error: "x" }, 500);
    if (state.listMode === "hang") return new Promise(() => {});
    const off = Number(u.searchParams.get("offset") || 0), lim = Number(u.searchParams.get("limit") || 200);
    return resp({ papers: CATALOG.slice(off, off + lim), total: CATALOG.length, hasMore: off + lim < CATALOG.length });
  }
  if (u.hostname === "papers.qnfo.org" && u.pathname.startsWith("/papers/")) {
    const slug = decodeURIComponent(u.pathname.slice(8));
    state.detailCalls.push(slug);
    return DETAIL[slug] ? resp(DETAIL[slug]) : resp({ error: "not found" }, 404);
  }
  return resp({}, 404);
}
const sb = { console: { log() {}, error() {}, warn() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, AbortController, setTimeout, clearTimeout, crypto, fetch: fakeFetch, encodeURIComponent, decodeURIComponent };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { retrieve, DEFAULT_CONFIG, titleQueryTokens, lexSearch, FIX_ANCHORS };", sb);
const { retrieve, DEFAULT_CONFIG, titleQueryTokens, FIX_ANCHORS } = sb.__x;
const env = { AI_SEARCH: { get: () => ({ search: async () => ({ chunks: state.chunks }) }) } };
const chunk = (slug, score, text) => ({ item: { key: slug + ".md" }, score, text });
const reset = () => vm.runInContext("_catalog = { at: 0, idx: null, loading: null };", sb);
const cfg = Object.assign({}, DEFAULT_CONFIG);

// 1. A catalog-only paper beats a vector hub essay for a paraphrased question; pages are read once, junk excluded.
state.chunks = [chunk("beyond-the-qubit", 0.646, "# Beyond the Qubit\nA broad essay on computation."), chunk("orchestrating-the-quantum-future", 0.62, "# Orchestrating the Quantum Future\nAn essay.")];
const q1 = "For a self-similar ultrametric hierarchy with an arbitrary scaling ratio q, how many levels are required to span the gap between the classical electron radius and the reduced Compton wavelength?";
let r = await retrieve(env, q1, cfg);
ok(r[0] && r[0].slug === "the-q-generalized-diameter", "a paper absent from the vector index is ranked first by the catalog leg", r.map((x) => x.slug + "@" + x.score));
ok(r.some((x) => x.slug === "beyond-the-qubit"), "the vector results are still among the sources");
ok(!r.some((x) => /^audit-test/.test(x.slug)), "junk slugs from the catalog never become sources");
ok(state.listCalls === 3, "the catalog (454 rows) is read in 3 pages of 200", state.listCalls);
ok(r[0].doi === "10.5281/zenodo.11" && r[0].published === true && /papers\.qnfo\.org\/papers\/the-q-generalized-diameter$/.test(r[0].url), "the catalog row supplies title, DOI and URL", r[0]);
ok(state.detailCalls.indexOf("the-q-generalized-diameter") < 0 && state.detailCalls.indexOf("beyond-the-qubit") >= 0, "catalog rows with an abstract need no detail fetch; vector-only sources are still fetched", state.detailCalls);

// 2. Cached: a second question in the TTL reads no catalog page.
state.detailCalls = [];
r = await retrieve(env, q1, cfg);
ok(state.listCalls === 3, "within the TTL the catalog is not read again", state.listCalls);

// 3. Title query: the vector-only paper whose title the visitor typed stays first, above the lexical hits.
r = await retrieve(env, "orchestrating quantum future", cfg);
ok(r[0] && r[0].slug === "orchestrating-the-quantum-future" && r[0].score >= 0.8, "a 2-5 word title query lifts the vector-only paper with that title", r.map((x) => x.slug + "@" + x.score));
// 4. Quoted title: the catalog paper is lifted even though the rest of the question ranks others first.
r = await retrieve(env, "What does “Physics, Solved” show, and what would falsify it?", cfg);
ok(r[0] && r[0].slug === "physics-solved", "a quoted title lifts its catalog paper to the first source", r.map((x) => x.slug + "@" + x.score));
ok(titleQueryTokens(q1).length === 0 && titleQueryTokens("adelic particle spectrum").length === 3 && titleQueryTokens("JPCUB").length === 0, "only quoted spans and 2-5 word questions are title queries");

// 5. Stale copy served while one refresh runs.
vm.runInContext("_catalog.at = Date.now() - CATALOG_TTL_MS - 1;", sb);
const before = state.listCalls;
r = await retrieve(env, q1, cfg);
ok(r[0] && r[0].slug === "the-q-generalized-diameter", "a stale catalog still ranks while it refreshes");
await new Promise((res) => setTimeout(res, 20));
ok(state.listCalls === before + 3, "exactly one refresh (3 pages) runs after the TTL", state.listCalls - before);

// 6. A failing catalog falls back to the 2.2.6 path.
reset(); state.listMode = "fail";
r = await retrieve(env, q1, cfg);
ok(r.length > 0 && r[0].slug === "beyond-the-qubit" && !r.some((x) => x.slug === "the-q-generalized-diameter"), "an unreadable catalog leaves the vector ranking as it was", r.map((x) => x.slug));
// 7. A hanging catalog costs at most CATALOG_WAIT_MS.
reset(); state.listMode = "hang";
vm.runInContext("CATALOG_WAIT_MS = 150;", sb);
const t0 = Date.now();
r = await retrieve(env, q1, cfg);
const took = Date.now() - t0;
ok(r.length > 0 && r[0].slug === "beyond-the-qubit" && took < 1000, "a hanging catalog is abandoned after CATALOG_WAIT_MS and retrieval still answers", { took, first: r[0] && r[0].slug });

// 8. The code loop's latency anchor is untouched.
ok(raw.split(FIX_ANCHORS.latency).length === 2, "FIX_ANCHORS.latency occurs exactly once in worker.js");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

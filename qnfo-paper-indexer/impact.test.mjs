// qnfo-paper-indexer impact suite (no network). Run: node qnfo-paper-indexer/impact.test.mjs
// SELECTED-WORKS-OPENALEX-1 (#1786, trigger 414 / #1803): the daily citation pass measures all seven selected works of
// docs/STRATEGY.md s2.4 whatever their age, each once, even when the flagship query fails.
// IMPACT-FAILCLOSED-2 (#1782): /run?commit=1 refuses every caller while IMPACT_TOKEN is unset.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.log("FAIL " + m); } }

const SELECTED = ["10.5281/zenodo.21637028", "10.5281/zenodo.22261547", "10.5281/zenodo.21821767", "10.5281/zenodo.21945415", "10.5281/zenodo.21901984", "10.5281/zenodo.22026592", "10.5281/zenodo.23079905"];
// STRATEGY s2.4 is the source of the list: every DOI there must be in the worker, and only those.
const strategy = readFileSync(join(here, "..", "docs", "STRATEGY.md"), "utf8");
const s24 = strategy.split("### 2.4 Selected works")[1].split("\n### ")[0];
ok(JSON.stringify((s24.match(/10\.5281\/zenodo\.\d+/g) || []).sort()) === JSON.stringify(SELECTED.slice().sort()), "the test list equals STRATEGY s2.4");

// ---- stubs
let inserts = [], flagshipThrows = false, fetched = [];
function d1(handler) {
  return { prepare(sql) { let args = []; const s = { bind(...a) { args = a; return s; }, async run() { return handler(sql, args, "run"); }, async all() { return handler(sql, args, "all"); }, async first() { return handler(sql, args, "first"); } }; return s; } };
}
const QNFO_AUDIT = d1((sql, args) => {
  if (/^CREATE TABLE/i.test(sql)) return { success: true };
  if (/FROM citation_stats WHERE source='zenodo' AND metric='downloads'/.test(sql)) {
    if (flagshipThrows) throw new Error("D1 overloaded");
    return { results: [{ doi: "10.5281/zenodo.22261547" }, { doi: "10.5281/zenodo.99999999" }] };
  }
  if (/INSERT OR REPLACE INTO citation_stats/.test(sql)) { inserts.push({ doi: args[1], source: args[2], metric: args[3], value: args[4] }); return { success: true }; }
  if (/INSERT OR REPLACE INTO impact_scores/.test(sql)) return { success: true };
  throw new Error("unexpected audit SQL: " + sql.slice(0, 80));
});
const LIVING_PAPER = d1((sql) => {
  if (/SELECT slug, doi, zenodo_doi FROM papers/.test(sql)) return { results: [{ slug: "newest", doi: null, zenodo_doi: "10.5281/zenodo.30000001" }, { slug: "jps-llm", doi: null, zenodo_doi: "10.5281/zenodo.21945415" }] };
  if (/COUNT\(\*\)/.test(sql)) return { c: 2 };
  throw new Error("unexpected living-paper SQL: " + sql.slice(0, 80));
});
globalThis.fetch = async (url) => {
  url = String(url);
  fetched.push(url);
  const u = new URL(url);
  const body = u.hostname === "api.openalex.org" ? { cited_by_count: 2 } : (u.hostname === "zenodo.org" && u.pathname.startsWith("/api/records")) ? { hits: { hits: [] } } : null;
  return new Response(JSON.stringify(body), { status: body ? 200 : 404, headers: { "content-type": "application/json" } });
};

const dir = mkdtempSync(join(tmpdir(), "impact-"));
writeFileSync(join(dir, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8"));
const { default: worker } = await import(pathToFileURL(join(dir, "w.mjs")).href);
const src = readFileSync(join(here, "worker.js"), "utf8");
const VERSION = /var VERSION = "([^"]+)"/.exec(src)[1];
const call = async (path, env, headers) => worker.fetch(new Request("https://qnfo-paper-indexer.q08.workers.dev" + path, { headers: headers || {} }), env, { waitUntil() {} });

// 1. IMPACT-FAILCLOSED-2
ok(!src.includes("if (!env.IMPACT_TOKEN) return true;"), "the source no longer opens /run?commit=1 when IMPACT_TOKEN is unset");
ok((await call("/run?commit=1", { QNFO_AUDIT, LIVING_PAPER })).status === 401, "/run?commit=1 is refused while IMPACT_TOKEN is unset");
ok((await call("/run?commit=1", { QNFO_AUDIT, LIVING_PAPER, IMPACT_TOKEN: "t0ken" }, { Authorization: "Bearer wrong" })).status === 401, "/run?commit=1 refuses a wrong token");
ok(inserts.length === 0, "a refused call writes nothing");
const pre = await (await call("/run", { QNFO_AUDIT, LIVING_PAPER })).json();
ok(pre.preview === true, "/run without commit stays a read-only preview");
ok((await (await call("/health", {})).json()).version === VERSION, "/health reports VERSION");

// 2. SELECTED-WORKS-OPENALEX-1 through the daily cron
const env = { QNFO_AUDIT, LIVING_PAPER };
await worker.scheduled({ cron: "0 4 * * *" }, env, { waitUntil() {} });
const oa = new Set(inserts.filter((r) => r.source === "openalex" && r.metric === "cited_by_count").map((r) => r.doi));
ok(SELECTED.every((d) => oa.has(d)), "the daily pass records an OpenAlex reading for all seven selected works (got " + SELECTED.filter((d) => oa.has(d)).length + ")");
ok(oa.has("10.5281/zenodo.30000001") && oa.has("10.5281/zenodo.99999999"), "the newest papers and the flagship set are still measured");
const isOpenAlex = (u) => { try { return new URL(u).hostname === "api.openalex.org"; } catch (e) { return false; } };
const oaCalls = fetched.filter(isOpenAlex);
ok(oaCalls.length === new Set(oaCalls).size && oaCalls.length === 9, "each DOI is fetched once (2 newest + 7 selected + 1 flagship, overlaps deduplicated): " + oaCalls.length);

// 3. the selected works do not depend on the flagship query
inserts = []; fetched = []; flagshipThrows = true;
const r = await (await call("/run?commit=1", { QNFO_AUDIT, LIVING_PAPER, IMPACT_TOKEN: "t0ken" }, { Authorization: "Bearer t0ken" })).json();
const oa2 = new Set(inserts.filter((x) => x.source === "openalex").map((x) => x.doi));
ok(SELECTED.every((d) => oa2.has(d)) && r.errors.some((e) => e.slug === "flagship-set"), "a failed flagship query still measures every selected work and reports the error");

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);

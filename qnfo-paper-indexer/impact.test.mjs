// qnfo-paper-indexer impact suite (no network). Run: node qnfo-paper-indexer/impact.test.mjs
// NOZ-DOI-1: the daily citation pass measures third-party DOIs only (Crossref, OpenAlex).
// IMPACT-FAILCLOSED-2 (#1782): /run?commit=1 refuses every caller while IMPACT_TOKEN is unset.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.log("FAIL " + m); } }

const THIRD = ["10.1103/physrevd.100.123456", "10.1016/j.example.2020.01.001"];
const DEAD = "10.5281/" + "dead.30000001";

// ---- stubs
let inserts = [], fetched = [];
function d1(handler) {
  return { prepare(sql) { let args = []; const s = { bind(...a) { args = a; return s; }, async run() { return handler(sql, args, "run"); }, async all() { return handler(sql, args, "all"); }, async first() { return handler(sql, args, "first"); } }; return s; } };
}
const QNFO_AUDIT = d1((sql, args) => {
  if (/^CREATE TABLE/i.test(sql)) return { success: true };
  if (/INSERT OR REPLACE INTO citation_stats/.test(sql)) { inserts.push({ doi: args[1], source: args[2], metric: args[3], value: args[4] }); return { success: true }; }
  if (/INSERT OR REPLACE INTO impact_scores/.test(sql)) return { success: true };
  throw new Error("unexpected audit SQL: " + sql.slice(0, 80));
});
const LIVING_PAPER = d1((sql) => {
  if (/SELECT slug, doi FROM papers/.test(sql)) { if (/NOT LIKE '10\.5281/.test(sql) === false) throw new Error("dead prefix not excluded in SQL"); return { results: [{ slug: "a", doi: THIRD[0] }, { slug: "b", doi: THIRD[1] }, { slug: "stale", doi: DEAD }] }; }
  if (/COUNT\(\*\)/.test(sql)) return { c: 2 };
  throw new Error("unexpected living-paper SQL: " + sql.slice(0, 80));
});
globalThis.fetch = async (url) => {
  url = String(url);
  fetched.push(url);
  const u = new URL(url);
  const body = u.hostname === "api.openalex.org" ? { cited_by_count: 2 } : null;
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

// 2. the daily pass measures third-party DOIs only
const env = { QNFO_AUDIT, LIVING_PAPER };
await worker.scheduled({ cron: "0 4 * * *" }, env, { waitUntil() {} });
const oa = new Set(inserts.filter((r) => r.source === "openalex" && r.metric === "cited_by_count").map((r) => r.doi));
ok(THIRD.every((d) => oa.has(d)), "the daily pass records an OpenAlex reading for each third-party DOI");
ok(!inserts.some((r) => /10\.5281\//.test(r.doi)), "a dead-prefix DOI is never written");
ok(!fetched.some((u) => /10\.5281|zenodo/i.test(decodeURIComponent(u))), "no outbound call names a dead-prefix DOI or the closed repository");

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);

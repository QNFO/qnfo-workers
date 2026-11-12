// CONSOLIDATE-1: signals-only mode records signals and makes no model call; ops_config q08_mode = full restores the essay engine.
// Run: node q08-signal-engine/signals-only.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const G = mod.__gen;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };
const auditWith = (v, boom) => ({ prepare: () => ({ first: async () => { if (boom) throw new Error("D1 down"); return v == null ? null : { value: v }; }, all: async () => ({ results: [] }), bind() { return this; } }) });
check("no row: signals mode", await G.q08Mode({ AUDIT: auditWith(null) }) === "signals");
check("no AUDIT binding: signals mode", await G.q08Mode({}) === "signals");
check("q08_mode = full restores the essay engine", await G.q08Mode({ AUDIT: auditWith("full") }) === "full");
check("q08_mode = FULL (case, spaces) restores it", await G.q08Mode({ AUDIT: auditWith(" FULL ") }) === "full");
check("any other value stays signals-only", await G.q08Mode({ AUDIT: auditWith("on") }) === "signals");
check("an unreadable config never starts the paid chain", await G.q08Mode({ AUDIT: auditWith(null, true) }) === "signals");

// the whole tick in signals mode: no model call, signals inserted idempotently, one skipped run row
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("hn.algolia.com") || u.includes("hacker-news.firebaseio.com")) return new Response(JSON.stringify({ hits: [] }), { status: 200 });
  return new Response("{}", { status: 404 });
};
let aiCalls = 0, sqls = [];
const DB = { prepare: (sql) => { sqls.push(sql); return { bind() { return this; }, run: async () => ({ meta: { changes: 1 } }), first: async () => null, all: async () => ({ results: [] }) }; } };
const env = { AI: { run: async () => { aiCalls++; return {}; } }, DB, AUDIT: auditWith(null), QNFO_AI: { fetch: async () => { aiCalls++; return new Response("{}"); } } };
const out = await G.governedGenerate(env);
check("governedGenerate answers signals mode", out && out.mode === "signals", out);
check("no model call was made", aiCalls === 0, aiCalls);
check("a run row records the tick as skipped with the mode named", sqls.some((q) => /INSERT INTO engine_runs/.test(q)));
check("the essay chain (published_pieces cap check) never ran", !sqls.some((q) => /FROM published_pieces/.test(q)));
globalThis.fetch = realFetch;
console.log("signals-only: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);

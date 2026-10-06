// DANGLING-BINDINGS-1 (transformation lever T9.4, pillar core): a daily census of every live script's bindings against the
// account's D1, KV, R2, queue, Vectorize and script lists; a binding whose target is gone is counted and named, an unreadable
// list or an unverifiable binding type is never a false dangling. Run: node qnfo-fleet-control/dangling-bindings.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- DANGLING-BINDINGS-1:BEGIN"), src.indexOf("// ---- DANGLING-BINDINGS-1:END"));
const calls = [];
const api = {};
const sandbox = {
  VERSION: "0.4.141-test", ACCOUNT: "acct0", __name: (f) => f, AbortSignal, JSON, Math, Object, Number, String, Array, Date, Promise, encodeURIComponent,
  fetch: async (url) => { calls.push(url); const p = String(url).replace("https://api.cloudflare.com/client/v4/accounts/acct0", ""); if (api[p] === "throw") throw new Error("ECONNRESET"); return { json: async () => (api[p] === undefined ? { success: false, errors: [{ code: 10000, message: "unknown" }] } : api[p]) }; }
};
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { dbCensusIds, bindingTarget, danglingBindings, danglingBindingsCensus, DB_CENSUS_SOURCES };", sandbox);
const { dbCensusIds, bindingTarget, danglingBindings, danglingBindingsCensus, DB_CENSUS_SOURCES } = sandbox.__export;
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); if (!c) fails++; };

// 1. the pure parts
check(bindingTarget({ type: "d1", name: "AUDIT", id: "35e2" }).target === "35e2" && bindingTarget({ type: "kv_namespace", namespace_id: "k1" }).kind === "kv" && bindingTarget({ type: "r2_bucket", bucket_name: "b" }).kind === "r2" && bindingTarget({ type: "queue", queue_name: "q" }).kind === "queue" && bindingTarget({ type: "vectorize", index_name: "v" }).kind === "vectorize" && bindingTarget({ type: "service", service: "qnfo-ai" }).kind === "script" && bindingTarget({ type: "durable_object_namespace", class_name: "C", script_name: "other" }).target === "other", "each verifiable binding type names its target");
check(bindingTarget({ type: "ai", name: "AI" }) === null && bindingTarget({ type: "durable_object_namespace", class_name: "C" }) === null && bindingTarget({ type: "secret_text", name: "K" }) === null, "ai, same-script durable objects and secrets are not verifiable");
check(Object.keys(dbCensusIds("d1", { success: true, result: [{ uuid: "a" }, { uuid: "b" }] })).join() === "a,b" && Object.keys(dbCensusIds("r2", { success: true, result: { buckets: [{ name: "x" }] } })).join() === "x" && dbCensusIds("kv", { success: false }) === null && Object.keys(dbCensusIds("queue", { success: true, result: [{ queue_name: "q1" }] })).join() === "q1", "each list answer yields its ids; a failed read is null");
const live = { d1: { a: 1 }, kv: { k1: 1 }, r2: { b: 1 }, queue: { q: 1 }, vectorize: { v: 1 }, script: { "qnfo-ai": 1, w1: 1, w2: 1 } };
const scripts = [
  { name: "w1", bindings: [{ type: "d1", name: "AUDIT", id: "a" }, { type: "service", name: "AI", service: "qnfo-ai" }, { type: "ai", name: "WAI" }, { type: "kv_namespace", name: "KV", namespace_id: "gone-kv" }] },
  { name: "w2", bindings: [{ type: "d1", name: "OLD", id: "deleted-d1" }, { type: "service", name: "RET", service: "qnfo-retired" }, { type: "queue", name: "Q", queue_name: "q" }, { type: "r2_bucket", name: "R", bucket_name: "b" }] }
];
let d = danglingBindings(scripts, live);
check(d.scripts === 2 && d.checked === 7 && d.unchecked === 1 && d.count === 3 && d.dangling.map((x) => x.script + "." + x.binding + ":" + x.kind + ":" + x.target).join() === "w1.KV:kv:gone-kv,w2.OLD:d1:deleted-d1,w2.RET:script:qnfo-retired" && d.by_kind.d1 === 1 && d.by_kind.kv === 1 && d.by_kind.script === 1, "a deleted D1, a deleted KV namespace and a retired service target are the three dangling bindings; the AI binding is unchecked", d);
d = danglingBindings(scripts, Object.assign({}, live, { kv: null }));
check(d.count === 2 && d.unreadable.join() === "kv" && d.unchecked === 2, "a list that could not be read makes its bindings unchecked, never dangling", d);
check(danglingBindings([], live).count === 0 && danglingBindings(null, null).count === 0, "nothing is a measured zero");

// 2. the census: one scripts list, five target lists, one settings read per script, the metric and the day's event
const writes = [];
const db = { prepare(sql) { let args = []; const s = { bind(...a) { args = a; return s; }, async run() { writes.push({ sql, args }); return { meta: { changes: 1 } }; } }; return s; } };
api["/workers/scripts?per_page=100"] = { success: true, result: [{ id: "w1" }, { id: "w2" }, { id: "qnfo-ai" }] };
api["/workers/scripts/qnfo-ai/settings"] = { success: true, result: { bindings: [{ type: "ai", name: "AI" }] } };
api[DB_CENSUS_SOURCES.d1] = { success: true, result: [{ uuid: "a" }] };
api[DB_CENSUS_SOURCES.kv] = { success: true, result: [{ id: "k1" }] };
api[DB_CENSUS_SOURCES.r2] = { success: true, result: { buckets: [{ name: "b" }] } };
api[DB_CENSUS_SOURCES.queue] = { success: true, result: [{ queue_name: "q" }] };
api[DB_CENSUS_SOURCES.vectorize] = "throw";
api["/workers/scripts/w1/settings"] = { success: true, result: { bindings: scripts[0].bindings } };
api["/workers/scripts/w2/settings"] = { success: false };
const r = await danglingBindingsCensus({ CF_DEPLOY_TOKEN: "t", AUDIT: db }, "2026-10-07T03:00:00Z");
check(calls.length === 9 && calls.filter((u) => /\/settings$/.test(u)).length === 3, "one scripts read, five list reads, one settings read per script", calls);
check(r.count === 1 && r.dangling[0].target === "gone-kv" && r.unreadable.join() === "vectorize" && r.settings_unreadable.join() === "w2" && r.scripts === 3 && r.checked === 3 && r.unchecked === 2, "the census counts w1's dead KV binding (its service binding to qnfo-ai is live), names the unreadable Vectorize list and w2's unreadable settings", r);
const m = writes.find((w) => /metric='dangling_bindings'/.test(w.sql));
check(m && m.args[0] === "1" && m.args[1] === "2026-10-07T03:00:00Z" && /state='MEASURED'/.test(m.sql), "dangling_bindings is written with the tick", m);
const ev = writes.find((w) => /cloud_ops_events/.test(w.sql));
check(ev && ev.args[0] === "dangling-bindings-2026-10-07" && ev.args[4] === "dangling" && /w1\.KV -> kv gone-kv/.test(ev.args[2]) && /unreadable lists: vectorize/.test(ev.args[2]) && /ON CONFLICT\(id\) DO UPDATE/.test(ev.sql), "the day's event names the binding, the unreadable list, upserted by id", ev && ev.args);
const meta = JSON.parse(ev.args[3]);
check(meta.count === 1 && meta.dangling[0].script === "w1" && meta.settings_unreadable[0] === "w2" && meta.v === "0.4.141-test", "the meta carries the names and the version", meta);
// 3. no token, or no scripts list: skipped, nothing written
writes.length = 0;
check((await danglingBindingsCensus({ AUDIT: db }, "2026-10-07T03:00:00Z")).skipped === "no CF_DEPLOY_TOKEN" && writes.length === 0, "without a token the census is skipped");
api["/workers/scripts?per_page=100"] = { success: false };
check(/unreadable/.test((await danglingBindingsCensus({ CF_DEPLOY_TOKEN: "t", AUDIT: db }, "2026-10-07T03:00:00Z")).skipped) && writes.length === 0, "an unreadable scripts list skips the census and writes nothing");

console.log(fails ? fails + " FAILED" : "dangling-bindings: all assertions passed");
process.exit(fails ? 1 : 0);

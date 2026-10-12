// WORKERS-BEST-PRACTICES-1 offline suite (qnfo-gateway 3.14.4): POST /sync on the graph host checks X-Sync-Token with the
// same constant-time helper as /query, fails closed when SYNC_TOKEN is unset, and still refuses near-miss tokens.
// Run: node qnfo-gateway/sync-token.test.mjs   -> prints "N passed, 0 failed"
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const noop = { prepare: () => { const st = { bind: () => st, run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }; return st; }, batch: async () => [] };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const sync = (env, token) => gw.fetch(new Request("https://graph-api.qnfo.org/sync", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, token === undefined ? {} : { "X-Sync-Token": token }), body: "{}" }), env, { waitUntil() {} });
const keyed = { DB: noop, SYNC_TOKEN: "sync-secret-4711" };
ok((await sync(keyed, "sync-secret-4711")).status !== 401, "the exact token passes the gate");
for (const t of ["sync-secret-4712", "sync-secret-471", "sync-secret-4711x", "SYNC-SECRET-4711", ""]) ok((await sync(keyed, t)).status === 401, "near-miss token '" + t + "' answers 401");
ok((await sync(keyed)).status === 401, "a missing header answers 401");
ok((await sync({ DB: noop }, "anything")).status === 401, "with SYNC_TOKEN unset every token answers 401");
ok((await sync({ DB: noop }, "")).status === 401, "with SYNC_TOKEN unset an empty token answers 401");
const src = readFileSync(join(here, "worker.js"), "utf8");
ok(!/get\("X-Sync-Token"\)\s*!==\s*env\.SYNC_TOKEN/.test(src), "no plain !== comparison of X-Sync-Token remains");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

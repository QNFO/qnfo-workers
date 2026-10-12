// Q08-STALL-RETRY-1 offline suite (q08-signal-engine 0.14.0, agent_issues 2286). While no piece has been published for STALL_RETRY_H hours
// the :30 cron makes a second generation attempt after its audit; never while the :00 attempt may still be running, never when ops_config
// q08_stall_retry is off, never when a piece was published recently. Run: node q08-signal-engine/stall-retry.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const S = mod.__stall;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };

const realNow = Date.now;
const at = (iso) => { Date.now = () => Date.parse(iso); };
const env = (lastPub, lastRun, flag) => ({
  DB: { prepare: (sql) => ({ first: async () => (/published_pieces/.test(sql) ? { t: lastPub } : { t: lastRun }), bind() { return this; } }) },
  AUDIT: { prepare: () => ({ first: async () => (flag ? { value: flag } : null) }) }
});

at("2026-10-12T15:30:05Z");
check("stalled 2 days, :30 tick, :00 attempt recorded at 15:06: due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 15:06:52")) === true);
check("a piece published 30 minutes ago: not due", await S.stallRetryDue(env("2026-10-12T15:00:05Z", "2026-10-12 15:06:52")) === false);
check("ops_config q08_stall_retry = off: not due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 15:06:52", "off")) === false);
check("at :30 the :00 attempt is presumed done even before its row lands", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 14:05:52")) === true);
at("2026-10-12T15:10:00Z");
check("ten minutes into the hour with no row yet: the :00 attempt may be running, not due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 14:05:52")) === false);
check("ten minutes in with this hour's row written: due", await S.stallRetryDue(env("2026-10-10T06:04:59Z", "2026-10-12 15:06:52")) === true);
check("a read failure is never a reason to generate", await S.stallRetryDue({ DB: { prepare: () => { throw new Error("D1 down"); } } }) === false);
check("the stall window is two hours", S.STALL_RETRY_H === 2);

// the :30 handler runs the audit first, then generation when due
at("2026-10-12T15:30:05Z");
const order = [];
const waits = [];
const sqlLog = [];
const fakeDB = { prepare: (sql) => { sqlLog.push(sql); const st = { bind: () => st, first: async () => (/MAX\(published_at\)/.test(sql) ? { t: "2026-10-10T06:04:59Z" } : /MAX\(ran_at\)/.test(sql) ? { t: "2026-10-12 15:06:52" } : null), all: async () => ({ results: [] }), run: async () => ({ meta: {} }) }; return st; } };
const fullEnv = { DB: fakeDB, AUDIT: { prepare: () => ({ bind() { return this; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) }, AI: { run: async () => { order.push("ai"); throw new Error("offline"); } } };
await mod.default.scheduled({ cron: "30 * * * *" }, fullEnv, { waitUntil: (p) => waits.push(p) });
await Promise.allSettled(waits);
check("the :30 tick reaches generation when stalled (it reads the published and run times)", sqlLog.some((q) => /MAX\(published_at\)/.test(q)), sqlLog.slice(0, 8));

Date.now = realNow;
console.log("stall-retry.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);

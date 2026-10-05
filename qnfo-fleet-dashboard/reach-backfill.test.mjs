// REACH-INGEST-BACKFILL-1 (#1711) + OUTREACH-WEEKDAY-1 (#1940) offline suite. Replays the reach ingest from worker.js
// (REACH_DDL through reachIngestTick) against an in-memory SQLite D1 with no network, and the weekday-hours helper the
// outreach queue audit uses. Proves: a day the cron missed is backfilled by a later tick (one day per tick, most recent
// first, within 7 days), a day that has any reach-ingest row is never attempted again by this step, nothing runs before
// 02:00Z; a Friday send is not stale on Sunday night, and weekday hours still count during the week.
// Run: node qnfo-fleet-dashboard/reach-backfill.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const slice = (startMark, endMark) => {
  const a = src.indexOf(startMark), b = src.indexOf(endMark, a + 1);
  if (a < 0 || b < a) throw new Error("block not found in worker.js: " + startMark);
  return src.slice(a, b);
};
const helpers = slice("function reachErr(e) {", "// Keeps the `cap` largest entries");
const ingest = slice("var REACH_DDL = [", "// Q08-REVIEW-2026-10-31 (agent_issues 1716");
const weekday = slice("function weekdayHoursSince(raw, nowMs) {", "async function buildState(env, ctx) {");
if (ingest.indexOf("async function reachIngestTick(env, opts) {") < 0) throw new Error("reachIngestTick is not inside the reach ingest block");
if (src.indexOf("ctx.waitUntil(within(reachIngestTick(env)") < 0) throw new Error("the cron does not run reachIngestTick");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, status TEXT DEFAULT 'received', received_at TEXT);
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
CREATE TABLE email_command_senders (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'owner', enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT,
  owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);`);
function stmtOn(sql) {
  let args = [];
  const self = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const AUDIT = { prepare: (sql) => stmtOn(sql), async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
const env = { AUDIT };
const cx = vm.createContext({ console, AbortSignal, fetch: async () => { throw new Error("no network in the offline suite"); } });
vm.runInContext("var VERSION = 'test'; var NAME = 'qnfo-fleet-dashboard'; var ACCOUNT = 'acct'; var DAY_MS = 864e5;\n" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" +
  helpers + "\n" + ingest + "\n" + weekday + "\n;this.__api = { reachIngestTick, reachShiftDay, weekdayHoursSince, REACH_BACKFILL_DAYS };", cx);
const api = cx.__api;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };
const ids = () => db.prepare("SELECT id FROM cloud_ops_events WHERE kind = 'reach-ingest' ORDER BY id").all().map((r) => r.id.replace("reach-ingest-", ""));

// A. REACH-INGEST-BACKFILL-1. "Now" is 2026-10-05 08:00Z, so yesterday (the live run) is 10-04; 09-30..10-03 have rows and
// 09-27..09-29 have none.
const NOW = Date.UTC(2026, 9, 5, 8, 0);
for (const d of ["2026-10-03", "2026-10-02", "2026-10-01", "2026-09-30"]) db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, 'reach-ingest', 'x', '{}', 'qnfo-fleet-dashboard', 'ok')").run("reach-ingest-" + d, d + "T03:00:00Z");
let t = await api.reachIngestTick(env, { nowMs: Date.UTC(2026, 9, 5, 1, 0) });
ok(t.live && t.live.not_yet && t.backfill === undefined && ids().length === 4, "before 02:00Z nothing runs, not even a backfill", t);
t = await api.reachIngestTick(env, { nowMs: NOW });
ok(t.live && t.live.day === "2026-10-04" && t.backfill && t.backfill.day === "2026-09-29", "the live run ingests yesterday, then the most recent missing day of the last 7 is backfilled", t.backfill);
ok(ids().includes("2026-10-04") && ids().includes("2026-09-29"), "both days now have their reach-ingest row", ids());
t = await api.reachIngestTick(env, { nowMs: NOW + 9e5 });
ok(t.backfill && t.backfill.day === "2026-09-28", "the next tick backfills the next missing day, one per tick", t.backfill);
t = await api.reachIngestTick(env, { nowMs: NOW + 18e5 });
ok(t.backfill && t.backfill.day === "2026-09-27", "the window is the 7 days before yesterday (10-04): 09-27 is its oldest day", t.backfill);
t = await api.reachIngestTick(env, { nowMs: NOW + 2.2e6 });
ok(t.backfill === null && ids().length === 8 && !ids().includes("2026-09-26"), "with every day of the window recorded, nothing more is backfilled (09-26 is out of the window)", { b: t.backfill, ids: ids() });
db.prepare("UPDATE cloud_ops_events SET status = 'error' WHERE id = 'reach-ingest-2026-09-29'").run();
t = await api.reachIngestTick(env, { nowMs: NOW + 27e5 });
ok(t.backfill === null, "a day whose backfill ended in error is not attempted again by this step (bounded)", t.backfill);
ok(api.REACH_BACKFILL_DAYS === 7, "the window is 7 days");

// B. OUTREACH-WEEKDAY-1: weekday hours, UTC.
const H = (iso, nowIso) => api.weekdayHoursSince(iso, Date.parse(nowIso));
ok(H("2026-10-02T09:00:00Z", "2026-10-04T21:00:00Z") === 15, "Friday 09:00 to Sunday 21:00 is 15 weekday hours, not 60", H("2026-10-02T09:00:00Z", "2026-10-04T21:00:00Z"));
ok(H("2026-10-02T09:00:00Z", "2026-10-05T08:00:00Z") === 23, "Friday 09:00 to Monday 08:00, before the 11:00 Amsterdam send, is 23 weekday hours (under the 26 h send bound)");
ok(H("2026-10-06T09:00:00Z", "2026-10-08T10:00:00Z") === 49, "Tuesday 09:00 to Thursday 10:00 counts every hour (49): a weekday stall is still seen");
ok(H("2026-10-03 10:00:00", "2026-10-04T23:00:00Z") === 0 && H(null, "2026-10-05T00:00:00Z") === null && H("garbage", "2026-10-05T00:00:00Z") === null, "a weekend-only span is 0; a missing or unreadable time is null");
ok(/const stale = !gated && open > 0 && wAge !== null && wAge > 24 && \(wSend === null \|\| wSend > 26\);/.test(src), "the outreach queue audit judges staleness in weekday hours");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

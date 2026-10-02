// WATCHMAKER-INDEX-1 offline suite: replays the watchmaker block from worker.js against an in-memory SQLite D1 with
// synthetic ledgers and proves: a fully fresh fleet reads 0; a stalled runner, a never-run one, an unreadable ledger,
// a research backlog, an evolve loop with neither a proposal nor a heartbeat, and code-task merges a person still does (waiting now, or merged or closed by a person in the last 30
// days) each count; a first run not yet due, a code loop dormant for 30 days and the owner's by-policy approvals do not; the daily run writes one row and the metric once per day, never before 07:00Z; GET /api/watchmaker serves it.
// REACH-LOOPS-WATCH-1: the delegated identity and reach loops read their run records (social ledgers by meta.last_ok,
// stale zenodo_stats and job-market handoffs count, an error run proves nothing, a weekend is not a weekday job's stall).
// Run: node qnfo-fleet-dashboard/watchmaker.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("var WATCHMAKER_AFTER_UTC_HOUR");
const b = src.indexOf("// NO-CLAUDE-RUNTIME-DEPENDENCY-1: the owner's data and workflow live on Cloudflare.");
if (a < 0 || b < a) throw new Error("WATCHMAKER-INDEX-1 block not found in worker.js");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT, kind TEXT, created_at TEXT);
CREATE TABLE charter_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
CREATE TABLE portfolio_sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, status TEXT);
CREATE TABLE evolve_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
CREATE TABLE objective_constraint_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, last_attempt_at TEXT);
CREATE TABLE intents (id TEXT PRIMARY KEY, status TEXT, type TEXT, created_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE errata_watch (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE social_channels (channel_id TEXT PRIMARY KEY, service TEXT, name TEXT, connected INTEGER, checked_at TEXT, checked_day TEXT);
CREATE TABLE zenodo_stats (doi TEXT PRIMARY KEY, downloads INTEGER, views INTEGER, fetched_at TEXT, updated_at TEXT);
CREATE TABLE handoffs (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, project_id TEXT NOT NULL, timestamp TEXT NOT NULL, claim_sheet TEXT);
CREATE TABLE events_radar (slug TEXT PRIMARY KEY, scanned_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT,
  owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);`);
const NOW = Date.parse("2026-10-06T08:00:00Z");
const ago = (h) => new Date(NOW - h * 36e5).toISOString();
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('portfolio-daily-2026-10-06', ?, 'ok')").run(ago(3));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('portfolio-dailyx', ?, 'ok')").run(ago(1));   // outside the id range
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('reach-ingest-2026-10-06', ?, 'ok')").run(ago(6));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('jo-qnfo-backlog-exec-abc', ?, 'ok')").run(ago(7));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('jr-grant-followup-ok1', ?, 'ok')").run(ago(4));
db.prepare("INSERT INTO portfolio_runs (run_date, kind, created_at) VALUES ('2026-10-05', 'identity-weekly', ?)").run(new Date(NOW - 26 * 36e5).toISOString().replace("T", " ").slice(0, 19));
db.prepare("INSERT INTO charter_snapshots (ts) VALUES (?)").run(ago(5));
db.prepare("INSERT INTO portfolio_sync_runs (ts, status) VALUES (?, 'ok')").run(ago(1));
db.prepare("INSERT INTO evolve_candidates (ts) VALUES (?)").run(ago(9));
db.prepare("INSERT INTO objective_constraint_runs (ts) VALUES (?)").run(ago(1));
db.prepare("INSERT INTO remediation_contracts (class, last_attempt_at) VALUES ('EVID-1', ?)").run(new Date(NOW - 2 * 36e5).toISOString().replace("T", " ").slice(0, 19));
db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('i1', 'pending', 'research', ?)").run(ago(10));
// errata-hub hourly ticks (#1747): the watchmaker reads $.last_ok, which a failed tick carries forward.
db.prepare("INSERT INTO errata_watch (key, value) VALUES ('tick:errata-watch', ?)").run(JSON.stringify({ ts: ago(0.5), ok: true, last_ok: ago(0.5) }));
db.prepare("INSERT INTO errata_watch (key, value) VALUES ('tick:errata-respond', ?)").run(JSON.stringify({ ts: ago(0.2), ok: false, last_ok: ago(1.2) }));
db.prepare("INSERT INTO errata_watch (key, value) VALUES ('tick:errata-publish', ?)").run(JSON.stringify({ ts: ago(0.1), ok: true, last_ok: ago(0.1) }));
// REACH-LOOPS-WATCH-1: the delegated identity and reach loops, each fresh against its cadence.
// qnfo-social SOCIAL-RUN-LEDGER-1 rows: one per op per day, meta.last_ok = last completed run.
const socialRow = (op, day, status, lastOkH, tsH) => db.prepare("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, meta, job, status) VALUES (?, ?, 'social-run', ?, 'qnfo-social', ?)").run("social-" + op + "-" + day, ago(tsH == null ? lastOkH : tsH), JSON.stringify({ op, last_ok: lastOkH == null ? null : ago(lastOkH), runs: 3 }), status);
socialRow("profile-sync", "2026-10-06", "ok", 1);
socialRow("drain", "2026-10-06", "ok", 1.5);
socialRow("scan", "2026-10-06", "ok", 2);
socialRow("engagement", "2026-10-06", "ok", 1);
db.prepare("INSERT INTO social_channels (channel_id, service, connected, checked_at, checked_day) VALUES ('chL', 'linkedin', 1, ?, '2026-10-06')").run(ago(7));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('jr-engagement-e1', ?, 'ok')").run(ago(3));
db.prepare("INSERT INTO zenodo_stats (doi, updated_at) VALUES ('10.5281/zenodo.1', '2026-10-04 07:03:00')").run();   // Sunday's run, space format
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('jr-email-triage-t1', ?, 'ok')").run(ago(20));
db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, job, status) VALUES ('mention-radar-2026-10-05', ?, 'mention-radar', 'radar-hub', 'degraded')").run(ago(23.5));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('jr-radar-r1', ?, 'ok')").run(ago(24.5));
db.prepare("INSERT INTO handoffs (session_id, project_id, timestamp, claim_sheet) VALUES ('cloud-workflow', 'job-market-watch-workflow-2026-10-05', ?, '{}')").run(ago(25));
db.prepare("INSERT INTO handoffs (session_id, project_id, timestamp, claim_sheet) VALUES ('s', 'job-market-watch-2026-10-06', ?, '{}')").run(ago(0.5));   // a session note, outside the id range
db.prepare("INSERT INTO events_radar (slug, scanned_at) VALUES ('events-radar-2026-10-05', ?)").run(ago(27));

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
const AUDIT = { prepare: (sql) => stmtOn(sql) };
const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, isNaN });
vm.runInContext("var VERSION = 'test'; var DAY_MS = 864e5; function squash(s) { return String(s).replace(/\\s+/g, ' '); }\n" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" +
  src.slice(a, b) + "\n;this.__api = { watchmakerMeasure, watchmakerDaily, wmIso };", cx);
const api = cx.__api;
const env = { AUDIT };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const op = (m, k) => m.ops.find((o) => o.key === k);

let m = await api.watchmakerMeasure(env, NOW);
ok(m.index === 0 && m.counted.length === 0, "a fully fresh fleet reads 0 (got " + m.index + ": " + m.counted.join(",") + ")");
ok(op(m, "portfolio-daily").state.startsWith("ok") && op(m, "portfolio-daily").age_h === 3, "the id range picks the real portfolio-daily row");
ok(op(m, "identity-weekly").state.startsWith("ok") && op(m, "time-gated-verification").state.startsWith("ok"), "space-format timestamps are read as UTC");
ok(!op(m, "linkedin-draft-approval").counted && /by policy/.test(op(m, "linkedin-draft-approval").state), "by-policy owner approvals are listed, not counted");
ok(!op(m, "code-task-merge").counted && /^0 code tasks.*; 0 waiting now$/.test(op(m, "code-task-merge").state), "no code-task PRs at all: merging is dormant, not counted");
// WATCHMAKER-CODE-MERGE-1: a PR a person merged or closed is person work; only a code loop quiet for 30 days is dormant.
db.prepare("INSERT INTO code_tasks (id, status, updated_at) VALUES ('cm1', 'merged', ?)").run(ago(10));
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "code-task-merge").counted && /^1 code tasks that needed a person.*; 0 waiting now$/.test(op(m, "code-task-merge").state) && m.index === 1, "a code-loop PR a person merged in the last 30 days counts although nothing waits now");
db.exec("UPDATE code_tasks SET status = 'closed' WHERE id = 'cm1'");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "code-task-merge").counted, "a code-loop PR a person closed in the last 30 days counts");
db.prepare("UPDATE code_tasks SET status = 'merged', updated_at = ? WHERE id = 'cm1'").run(ago(31 * 24));
m = await api.watchmakerMeasure(env, NOW);
ok(!op(m, "code-task-merge").counted && m.index === 0, "a merge older than 30 days with nothing waiting is dormant, not counted");
db.prepare("INSERT INTO code_tasks (id, status, updated_at) VALUES ('cm2', 'published', ?)").run(ago(40 * 24));
db.prepare("INSERT INTO code_tasks (id, status, updated_at) VALUES ('cm3', 'pr_open', ?)").run(ago(2));
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "code-task-merge").counted && /^2 code tasks.*; 2 waiting now$/.test(op(m, "code-task-merge").state), "a PR waiting on a person counts at any age, and the orchestrator's own pr_open rows count");
db.exec("DELETE FROM code_tasks");
// EVOLVE-HEARTBEAT-1: an idle evolve loop (no proposal for days) is alive while its daily heartbeat is fresh; a heartbeat
// that is not 'ok' proves nothing, and with neither the runner counts as stalled.
db.prepare("UPDATE evolve_candidates SET ts = ?").run(ago(70));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('evolve-tick-2026-10-06', ?, 'ok')").run(ago(1));
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('evolve-tickx', ?, 'ok')").run(ago(0));   // outside the id range
m = await api.watchmakerMeasure(env, NOW);
ok(!op(m, "fleet-defects").counted && op(m, "fleet-defects").age_h === 1, "an idle evolve loop with a fresh heartbeat is ok, not stalled");
db.exec("UPDATE cloud_ops_events SET status = 'error' WHERE id = 'evolve-tick-2026-10-06'");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "fleet-defects").counted && /stalled: last run 70h ago/.test(op(m, "fleet-defects").state) && m.index === 1, "no proposal and no ok heartbeat in 48h: the evolve loop counts as stalled");
db.exec("DELETE FROM cloud_ops_events WHERE id IN ('evolve-tick-2026-10-06', 'evolve-tickx')");
db.prepare("UPDATE evolve_candidates SET ts = ?").run(ago(9));
ok(m.retired.length === 4, "retired claude.ai Routines are listed with what replaced them");
ok(!op(m, "q08-review").counted && op(m, "q08-review").state === "no backlog", "the one-shot q08 review is not counted before it is 48h overdue (Q08-REVIEW-2026-10-31)");
ok(op(m, "errata-watch").state.startsWith("ok") && op(m, "errata-respond").age_h === 1.2 && !op(m, "errata-publish").counted, "errata-hub ticks are read from errata_watch $.last_ok");
db.prepare("UPDATE errata_watch SET value = ? WHERE key = 'tick:errata-respond'").run(JSON.stringify({ ts: ago(0.2), ok: false, last_ok: ago(3) }));
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "errata-respond").counted && /stalled: last run 3h ago, cadence 1h/.test(op(m, "errata-respond").state) && m.index === 1, "an errata member with no successful tick for over 2h counts as stalled");
db.prepare("UPDATE errata_watch SET value = ? WHERE key = 'tick:errata-respond'").run(JSON.stringify({ ts: ago(0.2), ok: true, last_ok: ago(0.2) }));
ok(op(m, "objective-constraints").state.startsWith("ok") && op(m, "objective-constraints").runner === "cron:qnfo-fleet-control", "OBJECTIVE-CONSTRAINTS-1 is listed with its hourly kernel ledger");

db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('t1', 'pending', 'task', ?)").run(ago(5));
m = await api.watchmakerMeasure(env, NOW);
ok(!op(m, "task-intent-intake").counted, "a fresh task intent is not yet counted");
db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('t2', 'pending', 'task', ?)").run(ago(100));
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "task-intent-intake").counted && /^1 pending task intents older than 48h with no consumer/.test(op(m, "task-intent-intake").state) && m.index === 1, "task intents nobody reads count once 48h old");
db.exec("DELETE FROM intents WHERE id IN ('t1', 't2')");

// GRANT-FOLLOWUP-1: only a run that read both mailboxes proves the op; a 'degraded' run (no GMAIL_PASS) does not.
db.exec("UPDATE cloud_ops_events SET status = 'degraded' WHERE id = 'jr-grant-followup-ok1'");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "grant-followup").counted && op(m, "grant-followup").state === "never ran" && m.index === 1, "a grant-followup run that missed Gmail does not prove the op");
db.prepare("UPDATE cloud_ops_events SET status = 'ok', ts = ? WHERE id = 'jr-grant-followup-ok1'").run(ago(25));
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "grant-followup").counted && /stalled: last run 25h ago, cadence 12h/.test(op(m, "grant-followup").state), "grant-followup silent for over 24h counts as stalled");
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'jr-grant-followup-ok1'").run(ago(4));
m = await api.watchmakerMeasure(env, NOW);
ok(!op(m, "grant-followup").counted && m.index === 0, "a fresh full grant-followup run is not counted");

// REACH-LOOPS-WATCH-1: the delegated identity and reach loops.
const REACH = ["social-profile-sync", "social-posting", "social-scan", "buffer-channel-audit", "social-engagement", "engagement-feed", "zenodo-stats", "email-triage", "mention-radar", "cloud-ops-radar", "job-market-watch", "events-radar"];
m = await api.watchmakerMeasure(env, NOW);
ok(REACH.every((k) => op(m, k) && op(m, k).state.startsWith("ok")) && m.index === 0, "every reach loop is listed and reads fresh (" + REACH.filter((k) => !op(m, k) || !op(m, k).state.startsWith("ok")).join(",") + ")");
ok(op(m, "social-posting").runner === "cron:qnfo-social" && op(m, "job-market-watch").runner === "cron:radar-hub" && op(m, "zenodo-stats").runner === "cron:qnfo-cloud-ops", "each loop names its Cloudflare runner");
ok(op(m, "job-market-watch").age_h === 25 && op(m, "zenodo-stats").age_h === 49, "job-market reads the handoffs id range (not a session note) and zenodo-stats reads space-format UTC");
// A failed tick after a good one: status error, but meta.last_ok still proves the last completed run.
socialRow("profile-sync", "2026-10-06", "error", 1, 0.2);
m = await api.watchmakerMeasure(env, NOW);
ok(!op(m, "social-profile-sync").counted && op(m, "social-profile-sync").age_h === 1, "a failed profile-sync tick does not hide the last good one (meta.last_ok)");
// A day of failures only: last_ok null on today's row, yesterday's row still answers.
socialRow("profile-sync", "2026-10-06", "error", null, 0.2);
socialRow("profile-sync", "2026-10-05", "ok", 20);
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "social-profile-sync").counted && /stalled: last run 20h ago, cadence 2h/.test(op(m, "social-profile-sync").state), "a profile sync failing all day counts as stalled from its last completed run");
db.exec("DELETE FROM cloud_ops_events WHERE id LIKE 'social-profile-sync-%'");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "social-profile-sync").counted && op(m, "social-profile-sync").state === "never ran", "a social op with no ledger row past its first due date counts");
const early2 = await api.watchmakerMeasure(env, Date.parse("2026-10-03T08:00:00Z"));
ok(!op(early2, "social-profile-sync").counted && /^first run due 2026-10-03T12:00/.test(op(early2, "social-profile-sync").state), "before the ledger's first due date it is not counted");
socialRow("profile-sync", "2026-10-06", "ok", 1);
// Mention radar: an error run proves nothing; degraded (a source refused) is a run.
db.exec("UPDATE cloud_ops_events SET status = 'error' WHERE id = 'mention-radar-2026-10-05'");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "mention-radar").counted && op(m, "mention-radar").state === "never ran", "a mention-radar run whose every source failed does not prove the radar");
db.exec("UPDATE cloud_ops_events SET status = 'degraded' WHERE id = 'mention-radar-2026-10-05'");
// Stale data: zenodo_stats frozen at 2026-08-29 (the 403 era) and the job market at 2026-09-08 both count.
db.exec("UPDATE zenodo_stats SET updated_at = '2026-08-29 07:04:24'");
db.exec("UPDATE handoffs SET timestamp = '2026-09-08T09:31:27.810Z' WHERE project_id = 'job-market-watch-workflow-2026-10-05'");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "zenodo-stats").counted && /cadence 168h/.test(op(m, "zenodo-stats").state) && op(m, "job-market-watch").counted && m.index === 2, "zenodo-stats frozen since 2026-08-29 and the job market silent since 2026-09-08 count as stalled");
db.exec("UPDATE zenodo_stats SET updated_at = '2026-10-04 07:03:00'");
db.prepare("UPDATE handoffs SET timestamp = ? WHERE project_id = 'job-market-watch-workflow-2026-10-05'").run(ago(25));
// Weekday-only jobs: the weekend is not a stall, a missed Monday is.
const MON = Date.parse("2026-10-05T07:05:00Z");
db.prepare("UPDATE cloud_ops_events SET ts = '2026-10-02T07:30:02.000Z' WHERE id = 'jr-radar-r1'").run();
db.prepare("UPDATE cloud_ops_events SET ts = '2026-10-02T12:00:20.000Z' WHERE id = 'jr-email-triage-t1'").run();
let wk = await api.watchmakerMeasure(env, MON);
ok(!op(wk, "cloud-ops-radar").counted && !op(wk, "email-triage").counted, "Friday to Monday morning is not a stall for the weekday radar and triage");
wk = await api.watchmakerMeasure(env, Date.parse("2026-10-06T13:00:00Z"));
ok(op(wk, "cloud-ops-radar").counted && op(wk, "email-triage").counted, "no weekday run since Friday by Tuesday afternoon counts for both");
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'jr-radar-r1'").run(ago(24.5));
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'jr-email-triage-t1'").run(ago(20));
// EMAIL-TRIAGE-D1-1: the 2026-09-30..10-01 'unauthorized' runs are errors and do not prove the triage.
db.prepare("INSERT INTO cloud_ops_events (id, ts, status) VALUES ('jr-email-triage-unauth', ?, 'error')").run(ago(0.5));
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'jr-email-triage-t1'").run(ago(80));
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "email-triage").counted && op(m, "email-triage").age_h === 80, "an error triage run (EMAIL_API_KEY 'unauthorized') does not prove the triage");
db.exec("DELETE FROM cloud_ops_events WHERE id = 'jr-email-triage-unauth'");
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'jr-email-triage-t1'").run(ago(20));
m = await api.watchmakerMeasure(env, NOW);
ok(m.index === 0, "the fixture is fresh again before the stall checks (" + m.counted.join(",") + ")");

// Stalled, never-run, backlog, live merges, unreadable
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'portfolio-daily-2026-10-06'").run(ago(60));
db.exec("DELETE FROM charter_snapshots");
db.prepare("INSERT INTO intents (id, status, type, created_at) VALUES ('i2', 'pending', 'research', ?)").run(ago(72));
db.prepare("INSERT INTO code_tasks (id, status, updated_at) VALUES ('c1', 'published', ?)").run(ago(48));
db.exec("DROP TABLE evolve_candidates");
m = await api.watchmakerMeasure(env, NOW);
ok(op(m, "portfolio-daily").counted && /stalled: last run 60h ago, cadence 24h/.test(op(m, "portfolio-daily").state), "a runner silent for over twice its cadence counts as stalled");
ok(op(m, "charter-loop").counted && op(m, "charter-loop").state === "never ran", "a runner past its first due date that never ran counts");
ok(op(m, "research-intent-triage").counted && /^1 pending research intents older than 48h/.test(op(m, "research-intent-triage").state), "a research backlog older than 48h counts");
ok(op(m, "code-task-merge").counted && /^1 code tasks.*; 1 waiting now$/.test(op(m, "code-task-merge").state), "a code task waiting on a person counts");
ok(op(m, "fleet-defects").counted && /^unmeasured/.test(op(m, "fleet-defects").state), "an unreadable ledger counts as unmeasured");
ok(m.index === 5 && m.counted.join(",") === "charter-loop,fleet-defects,portfolio-daily,research-intent-triage,code-task-merge".split(",").sort((x, y) => m.counted.indexOf(x) - m.counted.indexOf(y)).join(","), "the index is the number of counted operations (" + m.index + ")");
// first_due in the future: not counted
const early = await api.watchmakerMeasure(env, Date.parse("2026-10-01T15:00:00Z"));
ok(/^first run due/.test(op(early, "charter-loop").state) && !op(early, "charter-loop").counted, "a new loop is not counted before its first run is due");

// Daily run: once a day, after 07:00Z, writes the row and the metric
let d = await api.watchmakerDaily(env, { now: Date.parse("2026-10-06T06:30:00Z") });
ok(/before 7:00Z/.test(d.skipped || ""), "nothing runs before 07:00Z");
d = await api.watchmakerDaily(env, { now: NOW });
const row = db.prepare("SELECT day, index_value, counted FROM watchmaker_runs").get();
ok(row && row.day === "2026-10-06" && row.index_value === 5 && row.counted.includes("portfolio-daily"), "one watchmaker_runs row per day");
const mr = db.prepare("SELECT * FROM metric_registry WHERE metric = 'watchmaker_index'").get();
ok(mr && mr.last_value === "5" && mr.refresh_cadence === "daily" && mr.target === "0" && mr.source_of_truth && mr.disposition_actor, "metric_registry carries the index with the METRIC-INTEGRITY-1 fields");
d = await api.watchmakerDaily(env, { now: NOW + 36e5 });
ok(/already measured/.test(d.skipped || "") && db.prepare("SELECT COUNT(*) n FROM watchmaker_runs").get().n === 1, "a second run the same day is skipped");
ok(api.wmIso(1790849435000) === "2026-10-01T10:10:35.000Z" && api.wmIso(1790849435) === "2026-10-01T10:10:35.000Z" && api.wmIso("x") === null, "epoch ms, epoch s and junk are handled");

// GET /api/watchmaker through the real fetch handler (no OWNER_TOKEN configured: full view)
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const r = await worker.fetch(new Request("https://fleet.qnfo.org/api/watchmaker"), { AUDIT }, { waitUntil() {}, passThroughOnException() {} });
const j = await r.json();
ok(r.status === 200 && j.day === "2026-10-06" && j.index === 5 && Array.isArray(j.ops) && j.ops.length >= 10, "GET /api/watchmaker serves the latest run");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

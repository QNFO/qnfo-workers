// BREACH-DOCTOR-WATCH-1 (qnfo-cloud-ops 1.39.0, agent_issues 1000266 BREACH-DOCTOR-1): the second path of the breach doctor. The doctor runs on the qnfo-fleet-control */10 slot and writes its own
// metrics, so a stalled tick would stop the doctor and the numbers that report it together. This suite runs the real job (sliced from worker.js between its markers) on node:sqlite over fixtures
// with the live column lists, the live unique open-title index and the live birth-contract and refile-reopen triggers of agent_issues, and proves: a fresh tick writes doctor_tick_age_min and files
// nothing; a stale tick files exactly one issue with a d1-query contract whose probe fails on the stall and passes on a fresh tick; a second run inside 120 minutes files nothing (open twin and rate gate)
// and a re-stall after a close reopens the same issue with its contract re-armed; a missing doctor ledger and ops_config breach_doctor = off skip without writing; a failed filing leaves the metric written
// and an error heartbeat; the job is single flight, makes no model call and stays inside four D1 calls.
// Run: node qnfo-cloud-ops/breach-doctor-watch.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let fails = 0, passes = 0;
const check = (c, m, x) => { if (c) passes++; else { fails++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const A = src.indexOf("// ---- BREACH-DOCTOR-WATCH-1:BEGIN"), B = src.indexOf("// ---- BREACH-DOCTOR-WATCH-1:END");
check(A > 0 && B > A, "the BREACH-DOCTOR-WATCH-1 block is marked in worker.js");
if (!(A > 0 && B > A)) { console.log("breach-doctor-watch: " + passes + " passed, " + fails + " FAILED (the job is not in worker.js)"); process.exit(1); }
const block = src.slice(A, B);

const noisy = [];
const sandbox = { Date, Math, Number, JSON, String, Promise, isFinite, VERSION: "1.39.0-test", __name: () => {}, console: { log: () => {}, error: (...a) => noisy.push(a.join(" ")) } };
vm.createContext(sandbox);
vm.runInContext(block + "\n__export = { jobBreachDoctorWatch, breachDoctorWatchDecide, breachDoctorWatchMode, breachDoctorWatchMs, breachDoctorWatchDescription, BREACH_DOCTOR_WATCH_PROBE, BREACH_DOCTOR_WATCH_TITLE, BREACH_DOCTOR_WATCH_STALE_MIN, BREACH_DOCTOR_WATCH_LATE_MIN, BREACH_DOCTOR_WATCH_FILE_MIN };", sandbox);
const P = sandbox.__export;
const TITLE = "BREACH-DOCTOR-1: doctor stalled (watch)";

// ---- static ----
check(P.BREACH_DOCTOR_WATCH_TITLE === TITLE, "the issue title is the spec's", P.BREACH_DOCTOR_WATCH_TITLE);
check(P.BREACH_DOCTOR_WATCH_STALE_MIN === 30 && P.BREACH_DOCTOR_WATCH_LATE_MIN === 15 && P.BREACH_DOCTOR_WATCH_FILE_MIN === 120, "stall 30, healthy 15, one filing per 120 minutes");
check(P.BREACH_DOCTOR_WATCH_STALE_MIN <= 120 && P.BREACH_DOCTOR_WATCH_FILE_MIN <= 120, "no window exceeds 120 minutes (SLA-120M-1)");
check(!/\b\d+ ?(hours?|days?)\b/i.test(block), "no window, cadence or SLA in the block is stated in hours or days");
check(!/env\.AI\b|embedText|recordEvent|\bfetch\(|\.run\(\s*\w+Model|aiRun/.test(block), "no model call, embedding or network call in the job");
check(!/claude\.ai|anthropic\.com|skip[ -]ci/i.test(block), "no claude.ai or anthropic.com link and no skip-CI token in the block");
const probe = P.BREACH_DOCTOR_WATCH_PROBE;
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
check(/^SELECT /.test(probe) && probe.indexOf(";") === -1, "the closing probe is one literal SELECT with no semicolon");
check(!WRITE_KW.some((k) => probe.toLowerCase().indexOf(k) >= 0) && !RT_WRITE_KW.some((k) => probe.toLowerCase().indexOf(" " + k) >= 0), "the closing probe holds none of the write keywords the consumer and the remediation tick refuse (string literals included)");
check(/<= 15 THEN 'ok'/.test(probe) && /'ok' AS expected/.test(probe), "the probe expects ok and passes at a tick age of 15 minutes or less");

// ---- pure decision ----
{
  const now = Date.parse("2026-10-26T12:00:00Z"), m = (x) => new Date(now - x * 6e4).toISOString();
  const d = (row) => P.breachDoctorWatchDecide(row, now);
  check(d({ cfg: "on", last_tick: m(4) }).state === "ok" && d({ cfg: "on", last_tick: m(4) }).age_min === 4, "a tick 4 minutes old is ok and reads 4");
  check(d({ cfg: "on", last_tick: m(15) }).state === "ok", "15 minutes is the edge of healthy");
  check(d({ cfg: "on", last_tick: m(16) }).state === "late" && d({ cfg: "on", last_tick: m(16) }).age_min === 16, "16 minutes is late");
  check(d({ cfg: "on", last_tick: m(30) }).state === "late", "30 minutes is still late, not stalled (the stall is above 30)");
  check(d({ cfg: "on", last_tick: m(30.4) }).state === "stalled" && d({ cfg: "on", last_tick: m(30.4) }).age_min === 31, "30.4 minutes is stalled and the metric shows 31 (the integer the trigger 'gt 30' sees)");
  check(d({ cfg: "measure", last_tick: m(50) }).state === "stalled" && d({ cfg: null, last_tick: m(50) }).state === "stalled", "measure and a missing value both watch (the doctor's own reading: a missing value means measure)");
  for (const off of ["off", "OFF", " off ", "0", "false", "no", "disabled"]) check(d({ cfg: off, last_tick: m(500) }).state === "off", "ops_config value " + JSON.stringify(off) + " is off");
  check(d({ cfg: "on", last_tick: m(-5) }).age_min === 0, "a tick stamped in the future (clock skew) reads 0, never negative");
  check(d({ cfg: "on", last_tick: null, cfg_at: m(10).replace("T", " ").slice(0, 19) }).state === "ok" && d({ cfg: "on", last_tick: null, cfg_at: m(10).replace("T", " ").slice(0, 19) }).basis === "armed", "no tick yet: measured from the switch row (datetime('now') format parsed as UTC)");
  check(d({ cfg: "on", last_tick: null, cfg_at: m(45).replace("T", " ").slice(0, 19) }).state === "stalled", "armed 45 minutes ago and never ticked is a stall");
  check(d({ cfg: "on", last_tick: null, cfg_at: null }).state === "no-reference" && d({ cfg: "on", last_tick: "garbage", cfg_at: "garbage" }).state === "no-reference", "nothing to measure from is no-reference, not a stall");
  const desc = P.breachDoctorWatchDescription(d({ cfg: "on", last_tick: m(47) }), "1.39.0");
  check(/reads 47 minutes \(limit 30\)/.test(desc) && desc.indexOf(m(47)) >= 0 && /breach_doctor = on/.test(desc) && /Definition of done:/.test(desc) && /1000266/.test(desc), "the description carries the age, the last tick ts and the mode", desc.slice(0, 300));
  check(!/runtime-probe: \{|code-probe:|code-task:|code-anchor:/.test(desc), "the description holds no directive line that a birth trigger would turn into a contract or a code task");
}

// ---- fixture: live column lists, live index and live triggers ----
const SCHEMA = `
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE UNIQUE INDEX idx_agent_issues_open_title ON agent_issues(title) WHERE status = 'open';
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;
CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
  AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000))
BEGIN
  UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'REOPENED by issue_refile_reopen (DOCTRINE-1)'
  WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
    AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000) ORDER BY t.id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END;`;
// the doctor ledger exactly as migrations/2026-10-26-breach-doctor.sql creates it (the columns and the event CHECK that matter here)
const LEDGER = `CREATE TABLE breach_diagnosis_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), issue_id INTEGER, diagnosis_id INTEGER,
  event TEXT NOT NULL CHECK (event IN ('requested', 'selected', 'diagnosed', 'action', 'verify', 'renew', 'handoff', 'fail', 'revert', 'supersede', 'taint-drop', 'budget-skip', 'skip', 'demote', 'tick')), from_state TEXT, to_state TEXT, detail TEXT, tick_id TEXT);
CREATE INDEX idx_breach_diag_events_kind ON breach_diagnosis_events (event, ts);`;
const iso = (minAgo, base) => new Date((base || Date.now()) - minAgo * 6e4).toISOString();

function world(o) {
  o = o || {};
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  if (!o.noLedger) db.exec(LEDGER);
  if (!o.noMetric) db.prepare("INSERT INTO metric_registry (metric, layer, kind, target, owner, last_value, last_refreshed, state, refresh_class) VALUES ('doctor_tick_age_min', 'operational', 'target', '<= 15', 'qnfo-fleet-control', NULL, NULL, 'MEASURED', 'computed')").run();
  if (o.cfg !== undefined && o.cfg !== null) db.prepare("INSERT INTO ops_config (key, value, updated_at) VALUES ('breach_doctor', ?, ?)").run(o.cfg, o.cfgAt || iso(600).replace("T", " ").slice(0, 19));
  if (o.tickAgo !== undefined) db.prepare("INSERT INTO breach_diagnosis_events (ts, event, detail) VALUES (?, 'tick', 'x')").run(iso(o.tickAgo));
  return db;
}
function wrap(db, o) {
  o = o || {};
  const stats = { calls: 0, stmts: 0, sql: [] };
  const mk = (sql) => {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async first() { stats.calls++; stats.stmts++; stats.sql.push(sql); if (o.failRead) throw new Error("D1_ERROR: boom"); return db.prepare(sql).get(...args) || null; },
      async run() { stats.calls++; stats.stmts++; stats.sql.push(sql); const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      _run() { stats.stmts++; stats.sql.push(sql); const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
    };
    return s;
  };
  return {
    stats,
    env: { AUDIT: { prepare: mk, async batch(list) { stats.calls++; db.exec("BEGIN"); try { const out = list.map((s) => s._run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } } }
  };
}
const q = (db, sql, ...a) => db.prepare(sql).all(...a);
const one = (db, sql, ...a) => db.prepare(sql).get(...a);
async function run(db, o, now) { const w = wrap(db, o); const out = await P.jobBreachDoctorWatch(w.env, now ? { now } : undefined); return { out, stats: w.stats }; }
const issues = (db) => q(db, "SELECT * FROM agent_issues WHERE title = ?", TITLE);
const metric = (db) => one(db, "SELECT last_value, last_refreshed, state FROM metric_registry WHERE metric = 'doctor_tick_age_min'");
const evs = (db) => q(db, "SELECT * FROM cloud_ops_events WHERE kind = 'breach-doctor-watch' ORDER BY id");
const COUNTS = "SELECT (SELECT COUNT(*) FROM agent_issues) a, (SELECT COUNT(*) FROM cloud_ops_events) e, (SELECT COUNT(*) FROM remediation_contracts) c, (SELECT COALESCE(last_value,'') FROM metric_registry WHERE metric = 'doctor_tick_age_min') m";

// ---- fresh tick: the metric is written, nothing is filed ----
{
  const db = world({ cfg: "on", tickAgo: 4 });
  const { out, stats } = await run(db);
  check(out.status === "ok" && out.notes.state === "ok" && out.notes.age_min === 4, "fresh tick: ok, age 4", out);
  const m = metric(db);
  check(m.last_value === "4" && m.state === "MEASURED" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(m.last_refreshed || ""), "fresh tick: doctor_tick_age_min = 4, state MEASURED, last_refreshed an ISO second", m);
  check(issues(db).length === 0 && one(db, "SELECT COUNT(*) n FROM remediation_contracts").n === 0, "fresh tick: no issue and no contract");
  const e = evs(db);
  check(e.length === 1 && e[0].id === "breach-doctor-watch-tick" && e[0].status === "ok" && e[0].job === "breach-doctor-watch" && JSON.parse(e[0].meta).state === "ok", "fresh tick: one heartbeat event of kind breach-doctor-watch", e);
  check(stats.calls === 3 && stats.stmts === 3, "fresh tick: read, metric, heartbeat = 3 D1 calls", stats.calls);
  const again = await run(db);
  check(evs(db).length === 1 && again.out.status === "ok", "a second run rewrites the heartbeat in place (one row, not one per tick)");
}

// ---- late tick: measured, no issue ----
{
  const db = world({ cfg: "on", tickAgo: 20 });
  const { out } = await run(db);
  check(out.notes.state === "late" && metric(db).last_value === "20" && issues(db).length === 0, "20 minutes: the metric reads 20, the state is late, no issue yet", out.notes);
}

// ---- stale tick: one issue with a d1-query contract, and a probe that tells the truth ----
{
  const db = world({ cfg: "on", tickAgo: 47 });
  const { out, stats } = await run(db);
  check(out.status === "ok" && out.notes.state === "stalled" && out.notes.action === "file-issue", "stale tick: stalled and filed", out);
  check(metric(db).last_value === "47", "stale tick: the metric reads 47 (measured by this worker)", metric(db));
  const is = issues(db);
  check(is.length === 1 && is[0].status === "open" && is[0].source === "qnfo-cloud-ops" && is[0].priority === "high" && is[0].category === "reliability", "exactly one open issue, source qnfo-cloud-ops, priority high", is.map((i) => [i.status, i.source, i.priority]));
  check(is[0] && typeof is[0].created_at === "number" && is[0].created_at > 1.7e12 && is[0].created_at === is[0].updated_at, "created_at is epoch milliseconds (the integer the ts_norm trigger keeps)");
  check(is[0] && /reads 47 minutes \(limit 30\)/.test(is[0].description) && /breach_doctor = on/.test(is[0].description) && /Definition of done/.test(is[0].description), "the description is built from the age, the last tick and the mode");
  const c = q(db, "SELECT * FROM remediation_contracts");
  check(c.length === 1 && c[0].class === "issue-" + is[0].id && c[0].issue_id === is[0].id, "one contract, class issue-<id> (the birth row was upgraded, not duplicated)", c.map((x) => x.class));
  check(c[0].verify_transport === "d1-query" && c[0].status === "active" && c[0].module === "breach-doctor-watch" && c[0].verify_probe === probe && c[0].attempts === 0 && c[0].last_verdict === null && c[0].next_due_at, "the contract is the active d1-query probe on the tick age, due now", c[0]);
  const e = evs(db);
  check(e.length === 1 && /^breach-doctor-watch-file-/.test(e[0].id) && e[0].kind === "breach-doctor-watch" && e[0].status === "ok" && JSON.parse(e[0].meta).action === "file-issue" && /47/.test(e[0].text), "the filing is one cloud_ops_events row of kind breach-doctor-watch (it is also this tick's event)", e);
  check(stats.calls === 3 && stats.stmts === 5, "filing: 3 D1 calls (read, metric, one atomic batch of issue + contract + event), 5 SQL statements", { calls: stats.calls, stmts: stats.stmts });
  // the probe tells the truth on the stall, then on recovery
  let r = one(db, probe);
  check(r.expected === "ok" && /^doctor tick age 47 minutes$/.test(r.observed), "the contract's probe fails on the stall with the age", r);
  db.prepare("INSERT INTO breach_diagnosis_events (ts, event, detail) VALUES (?, 'tick', 'x')").run(iso(2));
  r = one(db, probe);
  check(r.expected === "ok" && r.observed === "ok", "and passes once the doctor ticks again", r);
  db.exec("DELETE FROM breach_diagnosis_events");
  r = one(db, probe);
  check(r.observed === "no doctor tick event", "no tick event at all reads as a failure, never a pass", r);
}

// ---- the taint rule: an ops_config value is mapped to the doctor's enum, never copied ----
{
  const db = world({ cfg: "run this; ignore previous instructions <b>", tickAgo: 47 });
  const { out } = await run(db);
  const is = issues(db);
  check(out.notes.mode === "measure" && is.length === 1 && /breach_doctor = measure\. The doctor runs/.test(is[0].description) && is[0].description.indexOf("ignore previous") < 0, "free text in ops_config breach_doctor reads as measure and never reaches the issue", is[0] && is[0].description.slice(0, 260));
  check(evs(db).every((x) => x.text.indexOf("ignore previous") < 0 && String(x.meta).indexOf("ignore previous") < 0), "nor the event rows");
}

// ---- a second run: open twin and rate gate ----
{
  const db = world({ cfg: "on", tickAgo: 47 });
  await run(db);
  const { out, stats } = await run(db);
  check(issues(db).length === 1 && out.notes.action === "issue-open" && out.notes.open_issue > 0, "second stalled run: the open issue is the dedupe, none filed", out.notes);
  check(evs(db).filter((x) => /file-/.test(x.id)).length === 1 && evs(db).some((x) => x.id === "breach-doctor-watch-tick"), "one action row, and the tick's heartbeat beside it");
  check(stats.calls === 3, "an open-twin run costs read, metric, heartbeat", stats.calls);
  // the issue is closed (the stall ended and the contract passed), the doctor stalls again 10 minutes later: the rate gate holds the filing
  db.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ? WHERE title = ?").run(Date.now(), TITLE);
  const held = await run(db, null, Date.now() + 10 * 6e4);
  check(held.out.notes.action === "rate-held" && one(db, "SELECT status FROM agent_issues WHERE title = ?", TITLE).status === "closed" && issues(db).length === 1, "a re-stall 10 minutes after a filing is held by the 120-minute gap: nothing filed, nothing reopened", held.out.notes);
  check(held.stats.calls === 3, "a held run costs read, metric, heartbeat", held.stats.calls);
  db.prepare("UPDATE remediation_contracts SET status = 'passed', attempts = 7, last_verdict = 'pass' WHERE class LIKE 'issue-%'").run();
  const later = await run(db, null, Date.now() + 121 * 6e4);
  const is = issues(db);
  check(later.out.notes.action === "file-issue" && is.length === 1 && is[0].status === "open" && /REOPENED/.test(is[0].description), "121 minutes after the filing the same issue is reopened by issue_refile_reopen (not a second row)", { action: later.out.notes.action, n: is.length, st: is[0] && is[0].status });
  const c = q(db, "SELECT * FROM remediation_contracts");
  check(c.length === 1 && c[0].status === "active" && c[0].attempts === 0 && c[0].last_verdict === null && c[0].module === "breach-doctor-watch", "and its contract is re-armed (active, attempts 0, no old verdict)", c[0]);
  check(evs(db).filter((x) => /file-/.test(x.id)).length === 2, "the second filing is its own event row");
  const none = await run(db, null, Date.now() + 130 * 6e4);
  check(none.out.notes.action === "issue-open" && issues(db).length === 1, "an open issue is never filed twice, whatever the gap");
}

// ---- a stall that outlives the gap with the issue still open files nothing new ----
{
  const db = world({ cfg: "on", tickAgo: 300 });
  await run(db);
  const out = await run(db, null, Date.now() + 200 * 6e4);
  check(issues(db).length === 1 && out.out.notes.action === "issue-open", "an issue open for 200 minutes stays the one issue (the open title is the dedupe)");
}

// ---- tolerance: the doctor ledger missing, the switch off ----
{
  const db = world({ cfg: "on", noLedger: true });
  const before = one(db, COUNTS);
  const { out, stats } = await run(db);
  check(out.status === "ok" && out.skipped === "ledger-missing" && out.notes.skipped === "ledger-missing", "missing breach_diagnosis_events: skipped, status ok (a failed or rolled-back doctor migration, or a deploy that lands before it; the live table has existed since 2026-10-26T10:22Z)", out);
  check(JSON.stringify(one(db, COUNTS)) === JSON.stringify(before) && stats.calls === 1, "and nothing was written (one read, no metric, no event, no issue)", { calls: stats.calls });
}
for (const off of ["off", "OFF", "0", "disabled"]) {
  const db = world({ cfg: off, tickAgo: 500 });
  const before = one(db, COUNTS);
  const { out, stats } = await run(db);
  check(out.status === "ok" && out.skipped === "breach_doctor off" && JSON.stringify(one(db, COUNTS)) === JSON.stringify(before) && stats.calls === 1, "breach_doctor = " + JSON.stringify(off) + ": skipped without writing even with a 500-minute-old tick", out);
}
{
  const db = world({ cfg: "on" }); // armed (switch row 600 minutes old) and never ticked
  const { out } = await run(db);
  check(out.notes.state === "stalled" && out.notes.basis === "armed" && issues(db).length === 1 && /absent \(measured from the breach_doctor switch row\)/.test(issues(db)[0].description), "a doctor armed 600 minutes ago that never ticked is a stall, measured from the switch row", out.notes);
  const db2 = world({ cfg: "on", cfgAt: iso(5).replace("T", " ").slice(0, 19) });
  const r2 = await run(db2);
  check(r2.out.notes.state === "ok" && issues(db2).length === 0, "armed 5 minutes ago and not ticked yet is inside the grace window");
  const db3 = world({});
  const b3 = one(db3, COUNTS);
  const r3 = await run(db3);
  check(r3.out.skipped && JSON.stringify(one(db3, COUNTS)) === JSON.stringify(b3), "no tick and no switch row: nothing to measure from, nothing written", r3.out);
}
{
  const db = world({ cfg: "on", tickAgo: 47, noMetric: true });
  const { out } = await run(db);
  check(out.notes.metric_rows === 0 && out.notes.action === "file-issue" && issues(db).length === 1, "a missing metric row (migration not applied) is reported as metric_rows 0 and does not stop the issue");
}

// ---- failures are loud, and the metric still lands ----
{
  const db = world({ cfg: "on", tickAgo: 47 });
  const before = one(db, COUNTS);
  const { out } = await run(db, { failRead: true });
  check(out.status === "error" && /boom/.test(out.notes.error) && JSON.stringify(one(db, COUNTS)) === JSON.stringify(before), "an unreadable ledger (not a missing table) is an error with the reason and writes nothing", out);
  check(noisy.some((x) => /jobBreachDoctorWatch\.read/.test(x)), "and is logged");
}
{
  const db = world({ cfg: "on", tickAgo: 47 });
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON agent_issues BEGIN SELECT RAISE(ABORT, 'boom'); END;");
  const { out, stats } = await run(db);
  check(out.status === "error" && out.notes.action === "file-failed" && /boom/.test(out.notes.file_error), "a failed filing reports error with the reason", out.notes);
  check(metric(db).last_value === "47", "the metric was written before the filing and survives its failure (a stalled doctor cannot hide)");
  check(issues(db).length === 0 && one(db, "SELECT COUNT(*) n FROM remediation_contracts").n === 0 && evs(db).every((x) => !/file-/.test(x.id)), "the batch is atomic: no issue, no contract, no filing event");
  const hb = evs(db);
  check(hb.length === 1 && hb[0].id === "breach-doctor-watch-tick" && hb[0].status === "error" && /boom/.test(JSON.parse(hb[0].meta).error), "an error heartbeat records the failure", hb);
  check(stats.calls === 4, "the worst case is 4 D1 calls (read, metric, failed batch, heartbeat)", stats.calls);
  db.exec("DROP TRIGGER boom");
  const retry = await run(db);
  check(retry.out.notes.action === "file-issue" && issues(db).length === 1, "the next tick retries the filing and succeeds");
}

// ---- single flight ----
{
  const db = world({ cfg: "on", tickAgo: 4 });
  const w = wrap(db);
  const [a, b] = await Promise.all([P.jobBreachDoctorWatch(w.env), P.jobBreachDoctorWatch(w.env)]);
  check((a.notes.skipped === "single-flight") !== (b.notes.skipped === "single-flight"), "two overlapping runs in one isolate: exactly one runs, the other is skipped as single-flight", [a.notes, b.notes]);
  const c = await P.jobBreachDoctorWatch(w.env);
  check(!c.skipped, "the flag is released after a run");
  const bad = { get AUDIT() { throw new Error("binding exploded"); } };
  let threw = false;
  try { await P.jobBreachDoctorWatch(bad); } catch (e) { threw = true; }
  const d = await P.jobBreachDoctorWatch(w.env);
  check(threw && !d.skipped, "the flag is released even when the run throws (finally)");
}

// ---- wiring ----
check(/"breach-doctor-watch": jobBreachDoctorWatch,/.test(src), "POST /run?job=breach-doctor-watch reaches it");
check(/runs\.push\(jobBreachDoctorWatch\(env\)\.catch\(/.test(src), "every 10-minute tick runs the job");
check(/__name\(jobBreachDoctorWatch, "jobBreachDoctorWatch"\);/.test(src), "the function is named for the bundle like its neighbours");
const ver = /^var VERSION = "(\d+)\.(\d+)\.(\d+)/m.exec(src);
check(ver && (Number(ver[1]) > 1 || (Number(ver[1]) === 1 && Number(ver[2]) >= 39)), "VERSION is at least 1.39.0 (a new capability raises the minor)", ver && ver[0]);
check(!/^var VERSION = "[^"]*"; \/\* 1\.39\.0/m.test(src) && /VERSION-LINE-NOTES-1/.test(src.slice(0, src.indexOf("var VERSION"))), "the 1.39.0 note is a comment above the VERSION line, none on it (VERSION-LINE-NOTES-1)");
const mirror = readFileSync(join(here, "deployed-current.worker.js"), "utf8");
check(mirror === src, "deployed-current.worker.js is identical to worker.js");
console.log("breach-doctor-watch: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);

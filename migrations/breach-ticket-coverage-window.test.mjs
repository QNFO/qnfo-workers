// BREACH-TICKET-COVERAGE-WINDOW-1: run the shipped coverage and reopener SQL on SQLite.
// Run: node migrations/breach-ticket-coverage-window.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runInNewContext } from "node:vm";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const migration = read("2026-10-30-breach-ticket-coverage-window.sql");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, updated_at INTEGER);
  CREATE TABLE issue_lifecycle (issue_id INTEGER, ts TEXT, to_status TEXT);
  CREATE TABLE v_metric_trigger_state (id INTEGER PRIMARY KEY, metric_key TEXT, val REAL, threshold REAL, hit INTEGER, queue_target TEXT);
  CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
  CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY, name TEXT UNIQUE, cron_expr TEXT, task_id TEXT, enabled INTEGER, timezone TEXT, next_fire TEXT, updated_at TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, state TEXT, last_value TEXT, last_refreshed TEXT);
  CREATE TABLE analytics_metric_triggers (metric_key TEXT UNIQUE, title TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, triage_state TEXT, triaged_at TEXT, reopened_count INTEGER, close_evidence TEXT);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT);
  CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
`);
db.exec(read("2026-10-18-breach-ticket-coverage.sql"));
db.exec(read("2026-10-19-breach-ticket-reopen-3.sql"));
const guard = read("2026-10-18-agent-issues-reopen-twin-guard.sql").match(/CREATE TRIGGER[\s\S]*?END;/)[0];
db.exec(guard);
const scalar = (sql) => Object.values(db.prepare(sql).get())[0];
const count = () => scalar("SELECT COUNT(*) FROM v_breaches_without_ticket");
const task = (id) => JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id=?").get(id).definition);
const run = (id) => {
  for (const step of task(id).steps) {
    assert.equal(step.type, "sql");
    assert.equal(step.db, "AUDIT");
    db.exec(step.sql);
  }
};
const observe = () => run("breach-ticket-coverage");
const measured = () => scalar("SELECT last_value FROM metric_registry WHERE metric='breaches_without_ticket'");
const firstSeen = () => scalar("SELECT first_seen FROM breach_ticket_coverage_gaps WHERE trigger_id=40");
const ageGap = (minutes) => db.exec(`UPDATE breach_ticket_coverage_gaps SET first_seen=datetime('now','-${minutes} minutes')`);
const issue = (id, trigger, status = "closed", suffix = "SOME-METRIC") => {
  db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, CAST(strftime('%s','now','-3 hours') AS INTEGER)*1000)")
    .run(id, `METRIC-TRIGGER-${trigger}-${suffix}: a title`, status);
};
const trigger = (id, hit = 1, queue = "agent_issues") => {
  db.prepare("INSERT INTO v_metric_trigger_state VALUES (?, 'some_metric', 9, 5, ?, ?)").run(id, hit, queue);
};
trigger(40);
issue(1, 40);
assert.equal(count(), 1, "pre-fix: a fresh recurrence with an old closure immediately alarms");
const reopener = JSON.stringify(task("breach-ticket-reopen"));
const oldView = scalar("SELECT sql FROM sqlite_master WHERE name='v_breaches_without_ticket'");
const oldDefinition = scalar("SELECT definition FROM fleet_tasks WHERE id='breach-ticket-coverage'");
db.exec(migration);
assert.equal(JSON.stringify(task("breach-ticket-reopen")), reopener, "do not replace the healthy reopener");
assert.equal(scalar("SELECT sql FROM sqlite_master WHERE name='agent_issues_reopen_open_twin_guard'"), guard.replace(/;$/, ""));
const cron = scalar("SELECT cron_expr FROM fleet_crons WHERE task_id='breach-ticket-coverage'");
assert.equal(cron, "5,15,25,35,45,55 * * * *");
const scheduler = read("../fleet-exec/worker.js").replace(/\r\n/g, "\n");
const nextFire = runInNewContext(scheduler.slice(scheduler.indexOf("function matchField("), scheduler.indexOf("async function runTick(")) + "\nnextFire");
let next = new Date("2026-10-30T09:00:00Z");
for (const expected of ["09:05", "09:15", "09:25", "09:35", "09:45", "09:55", "10:05"]) {
  next = nextFire(cron, next);
  assert.equal(next.toISOString(), `2026-10-30T${expected}:00.000Z`, "the deployed dispatcher supports the staggered 10-minute cadence");
}
assert.equal(scalar("SELECT refresh_cadence FROM metric_registry"), "10m");
assert.equal(scalar("SELECT status FROM agent_issues WHERE id=1"), "closed", "migration must not reopen tickets by hand");
assert.equal(count(), 0, "old closure alone no longer starts the alarm");
observe();
assert.equal(measured(), "0", "the first observation of a fresh recurrence is not a stopped reopener");
const first = firstSeen();
observe();
assert.equal(firstSeen(), first, "repeated observations preserve the start of the gap");
ageGap(109);
observe();
assert.equal(measured(), "0", "a gap inside the observation window is pending");
ageGap(110);
observe();
assert.equal(measured(), "1", "a sustained gap is reported even though the reopener has not run");
assert.ok(scalar("SELECT COUNT(*) FROM cloud_ops_events WHERE kind='breach-ticket-coverage' AND status='ok'") >= 1);
const probe = scalar("SELECT verify_probe FROM remediation_contracts WHERE class='fm-breach-ticket-coverage-window'");
assert.equal(db.prepare(probe).get().observed, "1", "the independent detector sees the same sustained gap");

db.exec("UPDATE agent_issues SET status='open' WHERE id=1");
assert.equal(count(), 0, "coverage recovery is visible even before the next observation");
observe();
assert.equal(measured(), "0");
assert.equal(scalar("SELECT COUNT(*) FROM breach_ticket_coverage_gaps"), 0, "covered gaps are removed");
db.exec("UPDATE agent_issues SET status='closed' WHERE id=1");
observe();
assert.equal(measured(), "0", "a second recurrence gets a new observation window");

ageGap(110);
db.exec("UPDATE v_metric_trigger_state SET hit=0 WHERE id=40");
observe();
assert.equal(scalar("SELECT COUNT(*) FROM breach_ticket_coverage_gaps"), 0, "metric recovery clears the timer");
db.exec("UPDATE v_metric_trigger_state SET hit=1 WHERE id=40");
observe();
assert.equal(measured(), "0");
ageGap(110);
db.exec("INSERT INTO issue_lifecycle VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes'), 'open')");
assert.equal(count(), 0, "a reopen between samples breaks continuity even if the ticket is closed again");
observe();
assert.equal(measured(), "0");
assert.equal(scalar("SELECT first_seen >= datetime('now','-1 minute') FROM breach_ticket_coverage_gaps WHERE trigger_id=40"), 1,
  "the intervening reopen resets first_seen to now");
ageGap(110);
db.exec("DELETE FROM issue_lifecycle");
db.exec("INSERT INTO issue_lifecycle SELECT 1, replace(first_seen,' ','T') || 'Z', 'open' FROM breach_ticket_coverage_gaps");
assert.equal(count(), 0, "a reopen in the first observation's second also breaks continuity");
observe();
assert.equal(measured(), "0");
db.exec("DELETE FROM issue_lifecycle");
ageGap(110);
db.exec("UPDATE breach_ticket_coverage_gaps SET last_seen=datetime('now','-21 minutes')");
assert.equal(count(), 0, "stale observations are not proof of continuous missing coverage");
observe();
assert.equal(measured(), "0", "resuming after missed observation windows starts a fresh timer");

trigger(41, 1, "alerts"); issue(2, 41);
trigger(42, 0); issue(3, 42);
trigger(43); // never filed: the existing reopener has no ticket to reopen
trigger(400); issue(4, 400, "open");
issue(5, 40, "open", "EDITED");
observe();
assert.equal(scalar("SELECT COUNT(*) FROM breach_ticket_coverage_gaps"), 0, "alerts, recovered metrics, never-filed breaches and open edited-title twins are excluded");
db.exec("UPDATE agent_issues SET status='closed' WHERE id IN (1,5)");
issue(6, 40, "superseded");
db.exec("INSERT INTO issue_triage VALUES (5,'closed',NULL,0,'prior recovery evidence')");
observe();
ageGap(110);
run("breach-ticket-reopen");
assert.deepEqual(db.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE 'METRIC-TRIGGER-40-%'").all().map((r) => r.id), [5],
  "standing reopener selects the newest non-superseded twin and respects trigger-id boundaries");
assert.equal(scalar("SELECT status FROM agent_issues WHERE id=6"), "superseded");
assert.equal(scalar("SELECT triage_state FROM issue_triage WHERE issue_id=5"), "triaged");
observe();
assert.equal(measured(), "0", "the actual reopener clears observed coverage failure");
assert.equal(scalar("SELECT COUNT(*) FROM breach_ticket_coverage_gaps"), 0);

db.exec(migration);
assert.equal(scalar("SELECT version FROM fleet_tasks WHERE id='breach-ticket-coverage'"), 2, "repeat apply does not keep incrementing the task version");
assert.equal(scalar("SELECT COUNT(*) FROM decision_log"), 1, "repeat apply does not duplicate the decision");
assert.equal(scalar("SELECT sql FROM bak_20261030_breach_coverage_view"), oldView, "repeat apply preserves original backup");
db.exec(/^-- Rollback: (.*)$/m.exec(migration)[1]);
assert.equal(scalar("SELECT definition FROM fleet_tasks WHERE id='breach-ticket-coverage'"), oldDefinition, "rollback restores the old task");
assert.equal(scalar("SELECT cron_expr FROM fleet_crons WHERE task_id='breach-ticket-coverage'"), "5,35 * * * *");
assert.equal(scalar("SELECT refresh_cadence FROM metric_registry"), "30m");
db.exec("UPDATE agent_issues SET status='closed', updated_at=CAST(strftime('%s','now','-3 hours') AS INTEGER)*1000 WHERE id=5");
assert.equal(count(), 1, "rollback restores the original closure-age predicate");
db.close();
console.log("BREACH-TICKET-COVERAGE-WINDOW-1: regression, sustained failure, recovery, reopener, repeat apply and rollback passed");

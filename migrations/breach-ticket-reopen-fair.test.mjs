// BREACH-TICKET-REOPEN-4: execute the shipped task with recurring newer tickets and terminal triage states.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const migration = read("2026-11-01-breach-ticket-reopen-fair.sql");
const db = new DatabaseSync(":memory:");
const terminal = ["closed", "closed-refuted", "closed-by-classification", "closed-verified-fixed", "resolved", "resolved-refuted", "wontfix"];
db.exec(`
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, updated_at INTEGER);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, triage_state TEXT, triaged_at TEXT, reopened_count INTEGER, close_evidence TEXT);
  CREATE TABLE issue_lifecycle (issue_id INTEGER, ts TEXT, to_status TEXT);
  CREATE TABLE v_metric_trigger_state (id INTEGER PRIMARY KEY, metric_key TEXT, val REAL, threshold REAL, hit INTEGER, queue_target TEXT);
  CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
  CREATE TABLE fleet_crons (name TEXT, cron_expr TEXT, next_fire TEXT, updated_at TEXT);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT);
  CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  INSERT INTO fleet_crons VALUES ('breach-ticket-reopen-30m', '*/30 * * * *', NULL, NULL);
`);
db.exec(read("2026-10-19-breach-ticket-reopen-3.sql"));
const guard = read("2026-10-18-agent-issues-reopen-twin-guard.sql").match(/CREATE TRIGGER[\s\S]*?END;/)[0];
db.exec(guard);
const scalar = (sql) => Object.values(db.prepare(sql).get())[0];
const task = () => JSON.parse(scalar("SELECT definition FROM fleet_tasks WHERE id='breach-ticket-reopen'"));
const run = () => {
  for (const step of task().steps) {
    assert.equal(step.type, "sql");
    assert.equal(step.db, "AUDIT");
    db.exec(step.sql);
  }
};
const issue = (id, trigger, state = "closed", age = 5, milliseconds = true, suffix = "METRIC") => {
  db.prepare("INSERT OR IGNORE INTO v_metric_trigger_state VALUES (?, 'metric', 2, 1, 1, 'agent_issues')").run(trigger);
  const updated = scalar(`SELECT CAST(strftime('%s','now','-${age} minutes') AS INTEGER)`);
  db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?)")
    .run(id, `METRIC-TRIGGER-${trigger}-${suffix}`, state, updated * (milliseconds ? 1000 : 1));
  db.prepare("INSERT INTO issue_triage VALUES (?, ?, NULL, NULL, 'prior closure evidence')")
    .run(id, terminal[id % terminal.length]);
};
try {
  issue(1, 1, "closed", 60);
  issue(2, 1, "closed", 50, true, "RENAMED");
  issue(3, 1, "superseded", 40);
  for (let id = 100; id < 120; id++) issue(id, id, "closed", 5, id % 2 === 0);

  for (let tick = 0; tick < 3; tick++) {
    run();
    assert.equal(scalar("SELECT status FROM agent_issues WHERE id=2"), "closed",
      "pre-fix: twenty newer relapses starve the older trigger indefinitely");
    assert.equal(scalar("SELECT triage_state FROM issue_triage WHERE issue_id=100"), "closed-by-classification",
      "pre-fix: reopening leaves unsupported terminal triage unchanged");
    db.exec("UPDATE agent_issues SET status='closed' WHERE id>=100");
  }
  db.exec("UPDATE agent_issues SET updated_at=CAST(strftime('%s','now','-5 minutes') AS INTEGER) WHERE id>=100");
  const before = db.prepare("SELECT * FROM agent_issues ORDER BY id").all();
  const oldDefinition = scalar("SELECT definition FROM fleet_tasks");
  const oldVersion = scalar("SELECT version FROM fleet_tasks");
  const guardBefore = scalar("SELECT sql FROM sqlite_master WHERE name='agent_issues_reopen_open_twin_guard'");
  db.exec(migration);
  const fixedDefinition = scalar("SELECT definition FROM fleet_tasks");
  db.exec(migration);
  assert.equal(scalar("SELECT definition FROM fleet_tasks"), fixedDefinition, "migration is idempotent");
  assert.deepEqual(db.prepare("SELECT * FROM agent_issues ORDER BY id").all(), before, "migration reopens no tickets by hand");
  assert.equal(scalar("SELECT version FROM fleet_tasks"), 4);
  assert.equal(scalar("SELECT cron_expr FROM fleet_crons"), "*/10 * * * *");
  assert.equal(scalar("SELECT sql FROM sqlite_master WHERE name='agent_issues_reopen_open_twin_guard'"), guardBefore);
  assert.equal(scalar("SELECT definition FROM bak_20261101_breach_reopen_task"), oldDefinition);
  assert.equal(scalar("SELECT COUNT(*) FROM decision_log"), 1);

  run();
  assert.equal(scalar("SELECT status FROM agent_issues WHERE id=2"), "open", "oldest trigger now receives coverage on the next tick");
  assert.equal(scalar("SELECT status FROM agent_issues WHERE id=1"), "closed", "newest eligible twin wins even after title changes");
  assert.equal(scalar("SELECT status FROM agent_issues WHERE id=3"), "superseded", "supersession is preserved");
  assert.equal(scalar("SELECT COUNT(*) FROM agent_issues WHERE status='open'"), 20, "the batch remains bounded");
  run();
  assert.equal(scalar("SELECT COUNT(*) FROM agent_issues WHERE status='open'"), 21, "next tick drains the remainder");

  // Each supported terminal state is reset exactly once; non-breaching and alert-routed issues are untouched.
  db.exec("DELETE FROM agent_issues; DELETE FROM issue_triage; DELETE FROM v_metric_trigger_state");
  for (let i = 0; i < terminal.length; i++) {
    issue(i + 10, i + 10);
    db.prepare("UPDATE issue_triage SET triage_state=? WHERE issue_id=?").run(terminal[i], i + 10);
  }
  issue(30, 30);
  issue(31, 31);
  issue(32, 32, "open");
  issue(33, 33);
  db.exec("UPDATE v_metric_trigger_state SET hit=0 WHERE id=30; UPDATE v_metric_trigger_state SET queue_target='alert' WHERE id=31");
  const probe = scalar("SELECT verify_probe FROM remediation_contracts");
  assert.notEqual(db.prepare(probe).get().observed, "0", "detector catches a breaching open ticket with stale terminal triage");
  run();
  for (const row of db.prepare("SELECT * FROM issue_triage WHERE issue_id BETWEEN 10 AND 16 OR issue_id=32").all()) {
    assert.equal(row.triage_state, "triaged");
    assert.equal(row.reopened_count, 1);
    assert.match(row.close_evidence, /prior closure evidence[\s\S]*REOPENED/);
  }
  const normalized = db.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all();
  run();
  assert.deepEqual(db.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all(), normalized, "repeated ticks do not recount normalized triage");
  assert.equal(scalar("SELECT status FROM agent_issues WHERE id=30"), "closed");
  assert.equal(scalar("SELECT status FROM agent_issues WHERE id=31"), "closed");
  assert.equal(db.prepare(probe).get().observed, "0");
  assert.match(scalar("SELECT text FROM cloud_ops_events WHERE kind='breach-ticket-reopen' ORDER BY id DESC LIMIT 1"), /without one after this tick/);

  db.exec(migration.match(/^-- Rollback: (.+)$/m)[1]);
  assert.equal(scalar("SELECT definition FROM fleet_tasks"), oldDefinition);
  assert.equal(scalar("SELECT version FROM fleet_tasks"), oldVersion);
  assert.equal(scalar("SELECT COUNT(*) FROM failure_modes"), 0);
  assert.equal(scalar("SELECT COUNT(*) FROM remediation_contracts"), 0);
  assert.equal(scalar("SELECT COUNT(*) FROM decision_log"), 1, "rollback preserves the append-only decision");
  console.log("BREACH-TICKET-REOPEN-4 regression checks passed");
} finally {
  db.close();
}

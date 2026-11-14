// CLOSING-PROBE-ADOPT-1: a loop-filed issue that carries its own read-only closing probe is probed by it instead of waiting 48 h for the filing loop.
// Replays migrations/2026-11-14-closing-probe-adopt.sql on node:sqlite with the columns it touches, then runs the hourly workflow's steps again.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const file = readFileSync(new URL("./2026-11-14-closing-probe-adopt.sql", import.meta.url), "utf8");
const LOOP = "monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)";
const PROBE_OK = "SELECT 'ok' AS expected, CASE WHEN verdict = 'ok' THEN 'ok' ELSE verdict END AS observed FROM cf_resource_registry WHERE id = 'worker:qnfo-ops'";

function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, created_at INTEGER);
    CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER,
      escalate_to TEXT, expected_cadence_h REAL, status TEXT, ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER);
    CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
    CREATE TABLE fleet_crons (name TEXT PRIMARY KEY, cron_expr TEXT, task_id TEXT, enabled INTEGER, timezone TEXT, updated_at TEXT, last_fired TEXT);
    CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER,
      trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
    CREATE TABLE decision_log (id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT,
      predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
    CREATE TABLE cf_resource_registry (id TEXT PRIMARY KEY, verdict TEXT);`);
  const ins = db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?, ?)");
  const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status, last_verdict) VALUES (?, ?, ?, 'd1-query', ?, ?)");
  // 1: unused-worker issue with its own probe, loop-owned contract -> adopted
  ins.run(1, "CF-RESOURCE-UNUSED-1: worker qnfo-ops", "no requests or cron invocations in 7 days\nclosing probe: " + PROBE_OK, "open", 1);
  con.run("issue-1", 1, "SELECT 'ok' AS expected, 'monitoring' AS observed", "monitoring", LOOP);
  // 2: dangling issue whose probe names r2:<name> instead of dangling:r2:<name>
  ins.run(2, "CF-RESOURCE-DANGLING-1: r2 d-drive", "bound by worker x\nclosing probe: SELECT 'ok' AS expected, CASE WHEN verdict = 'ok' THEN 'ok' ELSE verdict END AS observed FROM cf_resource_registry WHERE id = 'r2:d-drive'", "open", 1);
  con.run("issue-2", 2, "x", "monitoring", LOOP);
  // 3: a probe that writes is never adopted
  ins.run(3, "SOME-LOOP-1: x", "closing probe: SELECT 'ok' AS expected, 'ok' AS observed FROM t WHERE 1 = 1 AND (SELECT 1) UPDATE t SET a = 1", "open", 1);
  con.run("issue-3", 3, "orig-3", "monitoring", LOOP);
  // 4: a closed issue is left alone
  ins.run(4, "CF-RESOURCE-UNUSED-1: worker qnfo-ai", "closing probe: " + PROBE_OK, "closed", 1);
  con.run("issue-4", 4, "orig-4", "closed", "pass");
  // 5: an issue whose contract is already a real probe is left alone
  ins.run(5, "OTHER-1: y", "closing probe: " + PROBE_OK, "open", 1);
  con.run("issue-5", 5, "orig-5", "active", "fail");
  db.prepare("INSERT INTO cf_resource_registry VALUES (?, ?)").run("worker:qnfo-ops", "ok");
  db.prepare("INSERT INTO cf_resource_registry VALUES (?, ?)").run("dangling:r2:d-drive", "resolved");
  return db;
}
const get = (db, c) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);

test("the file applies and adopts only safe probes of open loop-owned issues", () => {
  const db = fresh();
  db.exec(file);
  const a = get(db, "issue-1");
  assert.equal(a.verify_probe, PROBE_OK);
  assert.equal(a.status, "active");
  assert.match(a.last_verdict, /^rearmed: CLOSING-PROBE-ADOPT-1/);
  assert.ok(a.next_due_at);
  assert.equal(get(db, "issue-3").verify_probe, "orig-3");
  assert.equal(get(db, "issue-3").last_verdict, LOOP);
  assert.equal(get(db, "issue-4").verify_probe, "orig-4");
  assert.equal(get(db, "issue-5").verify_probe, "orig-5");
  const bak = db.prepare("SELECT class FROM bak_20261114_closing_probe_adopt ORDER BY class").all().map((r) => r.class);
  assert.deepEqual(bak, ["issue-1", "issue-2"]);
});

test("the dangling probe names the registry row and passes when it is resolved", () => {
  const db = fresh();
  db.exec(file);
  const p = get(db, "issue-2").verify_probe;
  assert.match(p, /WHERE id = 'dangling:r2:d-drive'$/);
  const r = db.prepare(p).get();
  assert.equal(r.observed, r.expected);
  const r1 = db.prepare(get(db, "issue-1").verify_probe).get();
  assert.equal(r1.observed, r1.expected);
});

test("the hourly workflow carries the same two statements and is idempotent", () => {
  const db = fresh();
  db.exec(file);
  const t = db.prepare("SELECT definition, enabled FROM fleet_tasks WHERE id = 'closing-probe-adopt'").get();
  assert.equal(t.enabled, 1);
  const steps = JSON.parse(t.definition).steps;
  assert.equal(steps.length, 2);
  for (const s of steps) {
    assert.equal(s.type, "sql");
    assert.ok(file.includes(s.sql + ";"), "the step is the same statement as in the file");
    assert.ok(!s.sql.includes(";"));
  }
  // a new loop-filed issue arrives after the migration; the workflow adopts it
  db.prepare("INSERT INTO agent_issues VALUES (6, 'CF-RESOURCE-UNUSED-1: worker q', ?, 'open', 1)").run("x\nclosing probe: " + PROBE_OK);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, last_verdict) VALUES ('issue-6', 6, 'w', 'monitoring', ?)").run(LOOP);
  for (const s of steps) db.exec(s.sql);
  for (const s of steps) db.exec(s.sql);
  assert.equal(get(db, "issue-6").verify_probe, PROBE_OK);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bak_20261114_closing_probe_adopt WHERE class = 'issue-6'").get().n, 1);
  assert.equal(db.prepare("SELECT cron_expr FROM fleet_crons WHERE name = 'closing-probe-adopt-hourly'").get().cron_expr, "35 * * * *");
});

test("re-applying the file is harmless and the detector compiles", () => {
  const db = fresh();
  db.exec(file);
  db.exec(file);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1);
  const det = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-loop-owned-wait-hides-own-probe'").get().verify_probe;
  assert.ok(!det.includes(";"));
  const r = db.prepare(det).get();
  assert.equal(r.expected, "0");
});

test("the Rollback line restores the adopted contracts", () => {
  const db = fresh();
  db.exec(file);
  const rb = /^-- Rollback: (.*)$/m.exec(file)[1];
  db.exec(rb);
  assert.equal(get(db, "issue-1").last_verdict, LOOP);
  assert.equal(get(db, "issue-1").verify_probe, "SELECT 'ok' AS expected, 'monitoring' AS observed");
  assert.equal(get(db, "issue-2").verify_probe, "x");
  assert.equal(db.prepare("SELECT enabled FROM fleet_crons WHERE name = 'closing-probe-adopt-hourly'").get().enabled, 0);
});

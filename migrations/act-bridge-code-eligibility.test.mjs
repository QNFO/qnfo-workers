import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("./2026-11-01-act-bridge-code-eligibility.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
const oldFormula = "100 * breaching enabled triggers (v_metric_trigger_state.hit = 1) whose analytics_metric_triggers.action carries a code-task line at the start of a line (the form ACT-BRIDGE-1 hands to the code loop) / all breaching enabled triggers; n/a with none in breach";
const oldBranch = `WHEN 'breach_code_task_pct' THEN (SELECT CASE WHEN COUNT(*) > 0 THEN CAST(ROUND(100.0 * SUM(CASE WHEN instr(t.action, char(10) || 'code-task:') > 0 OR t.action LIKE 'code-task:%' THEN 1 ELSE 0 END) / COUNT(*), 1) AS TEXT) ELSE 'n/a: no trigger in breach' END FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1)`;

db.exec(`
  CREATE TABLE analytics_metric_triggers (
    id INTEGER PRIMARY KEY, metric_key TEXT, action TEXT, notes TEXT
  );
  CREATE TABLE trigger_hits (id INTEGER PRIMARY KEY, hit INTEGER);
  CREATE VIEW v_metric_trigger_state AS
    SELECT t.id, h.hit FROM analytics_metric_triggers t
    JOIN trigger_hits h ON h.id = t.id;
  CREATE TABLE metric_registry (
    metric TEXT PRIMARY KEY, formula TEXT, last_value TEXT, last_refreshed TEXT,
    state TEXT, target TEXT
  );
  CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, updated_at TEXT);
  CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT,
    outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT,
    predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
  );
  CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log
    BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
  CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log
    BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
`);

const insertTrigger = db.prepare("INSERT INTO analytics_metric_triggers VALUES (?, ?, ?, ?)");
const insertHit = db.prepare("INSERT INTO trigger_hits VALUES (?, ?)");
insertTrigger.run(1, "eligible-routed", "Pillar autonomy.\ncode-task: repo=qnfo-workers path=qnfo-ops/worker.js", "legacy note");
insertTrigger.run(2, "eligible-unrouted", "Pillar autonomy. A single-file code fix is needed.", "code-remedy: single-file");
insertTrigger.run(3, "policy", "Pillar cost. Adjust the spend cap.", null);
insertTrigger.run(4, "eligible-not-breaching", "Pillar autonomy.\ncode-task: repo=qnfo-workers path=qnfo-ops/worker.js", null);
insertTrigger.run(5, "metric-trigger", "Pillar autonomy. Measure eligible routes.", null);
for (const [id, hit] of [[1, 1], [2, 1], [3, 1], [4, 0], [5, 0]]) insertHit.run(id, hit);
db.prepare("INSERT INTO metric_registry VALUES (?, ?, ?, ?, ?, ?)").run(
  "breach_code_task_pct", oldFormula, "14.5", "2026-10-24T14:55:00Z", "MEASURED", ">= 30"
);
const refreshSql = `UPDATE metric_registry SET last_value = CASE metric ${oldBranch} ELSE last_value END WHERE metric = 'breach_code_task_pct'`;
const steps = [{}, {}, {}, {}, { type: "sql", db: "AUDIT", sql: refreshSql }];
db.prepare("INSERT INTO fleet_tasks VALUES (?, ?, ?)").run(
  "metric-refresh", JSON.stringify({ steps }), "2026-10-24T14:55:00Z"
);

assert.match(migration, /^-- APPLY-BY: ci$/m);
assert.match(migration, /^-- DB: qnfo-audit$/m);
assert.match(migration, /^-- Rollback:/m);
assert.doesNotMatch(migration, /^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im);

db.exec(migration);
assert.equal(db.prepare("SELECT notes FROM analytics_metric_triggers WHERE id = 1").get().notes,
  "legacy note\ncode-remedy: single-file\ncode-remedy-backfill: ACT-BRIDGE-CODE-ELIGIBILITY-1",
  "existing task-routed remedies are classified without losing their notes");
assert.equal(db.prepare("SELECT notes FROM analytics_metric_triggers WHERE id = 2").get().notes,
  "code-remedy: single-file", "an eligible but unrouted remedy remains in the denominator");
assert.equal(db.prepare("SELECT notes FROM analytics_metric_triggers WHERE id = 3").get().notes, null,
  "a policy remedy is not classified");
assert.equal(db.prepare("SELECT notes FROM analytics_metric_triggers WHERE id = 4").get().notes,
  "code-remedy: single-file\ncode-remedy-backfill: ACT-BRIDGE-CODE-ELIGIBILITY-1",
  "eligibility is backfilled even when the remedy is not currently breaching");

const formula = db.prepare("SELECT formula, target, last_value FROM metric_registry WHERE metric = ?")
  .get("breach_code_task_pct");
assert.match(formula.formula, /explicitly classified by a code-remedy: single-file/);
assert.equal(formula.target, ">= 30", "the target is unchanged");
assert.equal(formula.last_value, "50.0", "the immediate measurement is 1 routed / 2 eligible breaches");

let taskSql = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").get().definition).steps[4].sql;
assert.ok(!taskSql.includes(oldBranch), "metric-refresh no longer uses the all-breach denominator");
assert.match(taskSql, /code-remedy: single-file/);
db.exec(taskSql);
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric = ?").get("breach_code_task_pct").last_value,
  "50.0", "the scheduled refresh uses the same eligible-only denominator");

db.prepare("UPDATE analytics_metric_triggers SET action = action || char(10) || 'code-task: repo=qnfo-workers path=qnfo-ops/worker.js' WHERE id = 3").run();
db.exec(taskSql);
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric = ?").get("breach_code_task_pct").last_value,
  "50.0", "an unclassified policy trigger cannot inflate the metric by carrying a task line");

db.prepare("UPDATE analytics_metric_triggers SET action = action || char(10) || 'code-task: repo=qnfo-workers path=qnfo-ops/worker.js' WHERE id = 2").run();
db.exec(taskSql);
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric = ?").get("breach_code_task_pct").last_value,
  "100.0", "routing the remaining eligible breach raises the measured share");

db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "migration replay does not duplicate its decision");
assert.equal((db.prepare("SELECT notes FROM analytics_metric_triggers WHERE id = 1").get().notes.match(/code-remedy: single-file/g) || []).length,
  1, "migration replay does not duplicate eligibility markers");

const rollback = /^-- Rollback: (.*)$/m.exec(migration)?.[1];
assert.ok(rollback);
db.exec(rollback);
assert.equal(db.prepare("SELECT formula FROM metric_registry WHERE metric = ?").get("breach_code_task_pct").formula,
  oldFormula, "rollback restores the old metric formula");
assert.equal(db.prepare("SELECT notes FROM analytics_metric_triggers WHERE id = 1").get().notes,
  "legacy note", "rollback removes only the eligibility marker it added");
assert.equal(db.prepare("SELECT notes FROM analytics_metric_triggers WHERE id = 2").get().notes,
  "code-remedy: single-file", "rollback preserves a marker that existed before migration");
assert.equal(db.prepare("SELECT action FROM analytics_metric_triggers WHERE id = 5").get().action,
  "Pillar autonomy. Measure eligible routes.", "rollback removes the added classification instructions");
taskSql = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").get().definition).steps[4].sql;
assert.ok(taskSql.includes(oldBranch), "rollback restores the original refresh calculation");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback preserves the append-only decision");

console.log("act-bridge-code-eligibility.test.mjs ok");

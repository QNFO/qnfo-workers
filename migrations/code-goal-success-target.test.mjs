import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("./2026-11-01-code-goal-success-target.sql", import.meta.url), "utf8");
const previousTarget = "1.0 (owner: 100% deploy success)";
const target = "Recovery: >=0.9 after the historic failed-goal cohort exits the rolling 30-day window (expected by 2026-11-18 if new goals succeed at >=0.9); steady-state goal: 1.0";
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
assert.match(migration, /^-- APPLY-BY: ci$/m);
assert.match(migration, /^-- DB: qnfo-audit$/m);
assert.ok(rollback, "migration has a rollback");

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE metric_registry (
    metric TEXT PRIMARY KEY,
    target TEXT,
    last_value TEXT,
    last_refreshed TEXT
  );
  CREATE TABLE analytics_metric_triggers (
    metric_key TEXT PRIMARY KEY,
    operator TEXT,
    threshold REAL
  );
  CREATE TABLE decision_log (
    actor TEXT NOT NULL,
    assumption TEXT NOT NULL,
    action TEXT NOT NULL,
    evidence TEXT NOT NULL,
    outcome TEXT NOT NULL,
    blast_radius TEXT NOT NULL,
    rollback_path TEXT NOT NULL,
    capability_gain TEXT,
    predicted_outcome TEXT,
    reach_gain TEXT,
    surfaces_tested TEXT
  );
  INSERT INTO metric_registry VALUES
    ('code_goal_success_rate_30d', '1.0 (owner: 100% deploy success)', '0.622', '2026-11-01T19:01:38Z'),
    ('unrelated_metric', '0.5', '0.4', '2026-11-01T19:01:38Z');
  INSERT INTO analytics_metric_triggers VALUES ('code_goal_success_rate_30d', 'lt', 0.9);
`);

db.exec(migration);
db.exec(migration);
assert.equal(db.prepare("SELECT target FROM metric_registry WHERE metric = 'code_goal_success_rate_30d'").get().target, target);
assert.equal(db.prepare("SELECT target FROM metric_registry WHERE metric = 'unrelated_metric'").get().target, "0.5");
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'code_goal_success_rate_30d'").get().last_value, "0.622");
const trigger = db.prepare("SELECT operator, threshold FROM analytics_metric_triggers WHERE metric_key = 'code_goal_success_rate_30d'").get();
assert.equal(trigger.operator, "lt");
assert.equal(trigger.threshold, 0.9);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'CODE-GOAL-SUCCESS-TARGET-1:%'").get().n, 1);

db.exec(rollback);
assert.equal(db.prepare("SELECT target FROM metric_registry WHERE metric = 'code_goal_success_rate_30d'").get().target, previousTarget);
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'code_goal_success_rate_30d'").get().last_value, "0.622");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'CODE-GOAL-SUCCESS-TARGET-1:%'").get().n, 1);

db.close();
console.log("CODE-GOAL-SUCCESS-TARGET-1 migration checks passed");

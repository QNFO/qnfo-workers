import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("./2026-11-01-mttr-cycle-accounting.sql", import.meta.url), "utf8");
const rollback = /^-- Rollback: (.+)$/m.exec(migration)?.[1];
assert.ok(rollback, "migration has one rollback statement");
assert.match(migration, /^-- APPLY-BY: ci$/m);
assert.match(migration, /^-- DB: qnfo-audit$/m);
assert.match(migration, /^-- BACKUP: bak_20261101_mttr_cycle_accounting$/m);

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, owner TEXT);
  CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, event TEXT, to_status TEXT, ts TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, owner TEXT, disposition_actor TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, action TEXT, owner TEXT, enabled INTEGER, notes TEXT);
  CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  INSERT INTO metric_registry VALUES ('mttr_h_7d', 'old first-open formula', 'qnfo-kaizen', 'trigger gt 24', '52.5', '2026-11-01T17:01:31Z', 'MEASURED');
  INSERT INTO analytics_metric_triggers VALUES (3464, 'mttr_h_7d', 'old action', 'qnfo-kaizen', 1, 'old notes');
  CREATE TRIGGER doctrine_rev5_tick AFTER INSERT ON fleet_tick
  WHEN strftime('%M', 'now') < '10'
  BEGIN
    UPDATE metric_registry SET last_value = 'old' WHERE metric = 'mttr_h_7d';
  END;
`);

const now = Date.now();
const hours = 3600000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const add = db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?, ?)");
const triage = db.prepare("INSERT INTO issue_triage VALUES (?, ?)");
const event = db.prepare("INSERT INTO issue_lifecycle (issue_id, event, to_status, ts) VALUES (?, ?, ?, ?)");
const closed = (id, title, owner, createdAgoH, closedAgoMin, reopenAgoMin) => {
  const created = now - createdAgoH * hours;
  const closedAt = now - closedAgoMin * 60000;
  add.run(id, title, "closed", created, closedAt);
  triage.run(id, owner);
  if (reopenAgoMin !== null) {
    event.run(id, "opened", "open", iso(created));
    event.run(id, "reopened", "open", iso(now - reopenAgoMin * 60000));
  } else if (createdAgoH > 0) {
    event.run(id, "opened", "open", iso(created));
  }
};

closed(1, "METRIC-TRIGGER-1-ONE: Reopened issue", "qnfo-social", 240, 5, 35);
closed(2, "METRIC-TRIGGER-2-TWO: First resolution", "qnfo-social", 3, 60, null);
closed(3, "METRIC-TRIGGER-3-THREE: Missing lifecycle fallback", "qnfo-social", 6, 120, null);
closed(4, "RESEARCH-TERMINAL abc: Slow close", "qnfo-ops", 6, 120, null);
closed(5, "METRIC-TRIGGER-5-OLD: Outside window", "qnfo-social", 200, 8 * 24 * 60, null);
add.run(6, "METRIC-TRIGGER-6-OPEN: Still open", "open", now - 8 * hours, now - 5 * 60000);
triage.run(6, "qnfo-social");
add.run(7, "METRIC-TRIGGER-7-WONTFIX: Not a resolution", "wontfix", now - 8 * hours, now - 5 * 60000);
triage.run(7, "qnfo-social");

const runnableMigration = migration.replace("WHEN strftime('%M', 'now') < '10'", "WHEN 1");
assert.notEqual(runnableMigration, migration, "test forces the normal hourly trigger to run");
db.exec(runnableMigration);

const tickSql = db.prepare("INSERT INTO fleet_tick DEFAULT VALUES");
tickSql.run();
const metric = db.prepare("SELECT last_value, owner FROM metric_registry WHERE metric = 'mttr_h_7d'").get();
assert.equal(metric.owner, "qnfo-fleet-control", "metric owner points to the active issue loop");
assert.equal(metric.last_value, "2.6", "the hourly metric uses the latest open/reopen cycle and falls back to created_at");

const groups = db.prepare("SELECT family, owner, closes_7d, avg_open_to_close_h, max_open_to_close_h FROM v_issue_mttr_by_family_owner_7d ORDER BY family, owner").all();
assert.deepEqual(groups, [
  { family: "METRIC-TRIGGER", owner: "qnfo-social", closes_7d: 3, avg_open_to_close_h: 2.2, max_open_to_close_h: 4 },
  { family: "RESEARCH-TERMINAL", owner: "qnfo-ops", closes_7d: 1, avg_open_to_close_h: 4, max_open_to_close_h: 4 },
]);

const trigger = db.prepare("SELECT owner, action, notes FROM analytics_metric_triggers WHERE id = 3464").get();
assert.equal(trigger.owner, "qnfo-fleet-control", "metric trigger owner points to the active issue loop");
assert.match(trigger.action, /v_issue_mttr_by_family_owner_7d/);
assert.match(trigger.notes, /MTTR-CYCLE-ACCOUNTING-1/);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1);

db.exec(runnableMigration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "re-applying the migration is idempotent");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bak_20261101_mttr_cycle_accounting").get().n, 2, "the backup keeps the original metric and trigger");

db.exec(rollback);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'view' AND name = 'v_issue_mttr_by_family_owner_7d'").get().n, 0);
assert.equal(db.prepare("SELECT formula, owner FROM metric_registry WHERE metric = 'mttr_h_7d'").get().owner, "qnfo-kaizen");
assert.equal(db.prepare("SELECT formula FROM metric_registry WHERE metric = 'mttr_h_7d'").get().formula, "old first-open formula");
assert.deepEqual(db.prepare("SELECT owner, action FROM analytics_metric_triggers WHERE id = 3464").get(), { owner: "qnfo-kaizen", action: "old action" });
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = 'doctrine_rev5_tick'").get().n, 1);

console.log("mttr-cycle-accounting: all passed");

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./2026-11-01-issue-sla-scope.sql", import.meta.url), "utf8");
const rollback = migration.match(/^-- Rollback: (.*)$/m)?.[1];
assert.ok(rollback);
assert.match(migration, /^-- APPLY-BY: ci$/m);
assert.match(migration, /^-- DB: qnfo-audit$/m);
assert.match(migration, /^-- BACKUP: bak_20261101_issue_sla_scope$/m);

const db = new DatabaseSync(":memory:");
db.exec(`
  PRAGMA recursive_triggers = ON;
  CREATE TABLE agent_issues (
    id INTEGER PRIMARY KEY, title TEXT, description TEXT, category TEXT, priority TEXT,
    status TEXT, created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE issue_age_bumps (issue_id INTEGER, ts TEXT);
  CREATE VIEW v_issue_age AS
    SELECT i.id, i.priority, i.title,
      CAST(((CAST(strftime('%s', 'now') AS INTEGER) * 1000) - i.created_at) / 60000 AS INTEGER) AS age_min
    FROM agent_issues i WHERE i.status = 'open';
  CREATE TABLE goals (source TEXT);
  CREATE TABLE objective_space (source TEXT);
  CREATE TABLE metric_registry (
    metric TEXT PRIMARY KEY, formula TEXT, source_of_truth TEXT, last_value TEXT,
    last_refreshed TEXT, state TEXT
  );
  INSERT INTO metric_registry VALUES
    ('issues_open_over_120m', 'all open issues over 120 minutes', 'v_issue_age',
     NULL, NULL, 'MEASURED');
  CREATE TABLE analytics_metric_triggers (
    id INTEGER PRIMARY KEY, metric_key TEXT, title TEXT, action TEXT, notes TEXT,
    threshold REAL, enabled INTEGER
  );
  INSERT INTO analytics_metric_triggers VALUES
    (5937, 'issues_open_over_120m', 'SLA breach: open issues older than 120 minutes',
     'Read: SELECT id, priority, age_min, substr(title, 1, 80) FROM v_issue_age WHERE age_min >= 120 ORDER BY age_min DESC.',
     'ratchet floor', 215, 1);
  CREATE TABLE failure_modes (
    fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT,
    probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT
  );
  CREATE TABLE remediation_contracts (
    class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT,
    verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT
  );
  CREATE TABLE decision_log (
    actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT,
    rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
  );
  CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY, source TEXT);
  CREATE TRIGGER antifragile_tick_10m AFTER INSERT ON fleet_tick
  BEGIN
    UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_issue_age WHERE age_min >= 120) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
      WHERE metric = 'issues_open_over_120m';
  END;
  CREATE VIEW v_stuck_summary AS SELECT
    0 AS research_review_error, 0 AS research_head_stalled, 0 AS research_queued_180m,
    0 AS intents_pending, 0 AS outreach_waiting, 0 AS code_tasks_stalled,
    0 AS zenodo_exit_pending_stalled, 0 AS research_held_over_sla, 0 AS triage_gap,
    0 AS contracts_cadence_drift;
  CREATE VIEW v_stuck_summary_kernel AS SELECT 0 AS predictions_unscored_over_sla, 0 AS doctrine_proposals_waiting;
  CREATE VIEW v_sla_overlap_120m AS SELECT 0 AS triage_gap_in_open_120m,
    0 AS code_tasks_stalled_and_queued_120m, 0 AS research_in_content_over_sla;
  CREATE VIEW v_content_pipeline AS SELECT 0 AS over_sla;
  CREATE TABLE code_tasks (status TEXT, created_at TEXT);
  CREATE TABLE research_queue (status TEXT, claimed_at TEXT);
  CREATE VIEW v_cadence_overdue AS SELECT 0 AS over_sla;
  CREATE VIEW v_sla_over_120m AS SELECT 0 AS total_over_120m;
`);

const now = db.prepare("SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS ms").get().ms;
const addIssue = db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?, 'medium', 'open', ?, ?)");
addIssue.run(1, "actual defect", "", "defect", now - 130 * 60000, now);
addIssue.run(2, "incident", "", "incident", now - 140 * 60000, now);
addIssue.run(3, "METRIC-TRIGGER-99-TEST", "", "reliability", now - 150 * 60000, now);
addIssue.run(4, "optimization work", "", "optimization", now - 160 * 60000, now);
addIssue.run(5, "goal-backed issue", "", "reliability", now - 170 * 60000, now);
addIssue.run(6, "objective-backed issue", "", "reliability", now - 180 * 60000, now);
addIssue.run(7, "fresh defect", "", "defect", now - 30 * 60000, now);
addIssue.run(8, "closed defect", "", "defect", now - 190 * 60000, now);
addIssue.run(9, "unmapped reliability work mentioning a goal key", "goal_key in prose", "reliability", now - 200 * 60000, now);
addIssue.run(10, "bug category", "", "bug", now - 210 * 60000, now);
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 8").run();
db.prepare("INSERT INTO goals VALUES ('agent_issues 5 (test goal mapping)')").run();
db.prepare("INSERT INTO objective_space VALUES ('agent_issues:6')").run();

db.exec(migration);
const eligible = db.prepare("SELECT id FROM v_sla_bound_issue_age ORDER BY id").all().map(({ id }) => id);
assert.deepEqual(eligible, [1, 2, 9], "only aged, eligible, unmapped issue work counts");
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'issues_open_over_120m'").get().last_value, "3");
assert.equal(db.prepare("SELECT threshold FROM analytics_metric_triggers WHERE metric_key = 'issues_open_over_120m'").get().threshold, 215);
assert.match(db.prepare("SELECT formula FROM metric_registry WHERE metric = 'issues_open_over_120m'").get().formula, /v_sla_bound_issue_age/);
const trigger = db.prepare("SELECT title, action FROM analytics_metric_triggers WHERE metric_key = 'issues_open_over_120m'").get();
assert.match(trigger.title, /eligible issue work/);
assert.match(trigger.action, /FROM v_sla_bound_issue_age/);
assert.doesNotMatch(trigger.action, /FROM v_issue_age WHERE age_min >= 120/);
const aggregate = db.prepare("SELECT issues_open_over_120m, oldest_open_issue_min FROM v_sla_over_120m").get();
assert.equal(aggregate.issues_open_over_120m, 3);
assert.ok(aggregate.oldest_open_issue_min >= 200);

db.exec("INSERT INTO fleet_tick VALUES (1, 'test')");
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'issues_open_over_120m'").get().last_value, "3",
  "the existing broad metric writer is corrected on every refresh");
const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-issue-sla-scope'").get().verify_probe;
assert.deepEqual(db.prepare(probe).get(), { expected: "0", observed: "0" });

db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "migration replay is idempotent");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n, 1);

db.exec(rollback);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'view' AND name = 'v_sla_bound_issue_age'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name = 'issue_sla_bound_metric_after_write'").get().n, 0);
assert.equal(db.prepare("SELECT formula FROM metric_registry WHERE metric = 'issues_open_over_120m'").get().formula, "all open issues over 120 minutes");
assert.equal(db.prepare("SELECT action FROM analytics_metric_triggers WHERE metric_key = 'issues_open_over_120m'").get().action,
  "Read: SELECT id, priority, age_min, substr(title, 1, 80) FROM v_issue_age WHERE age_min >= 120 ORDER BY age_min DESC.");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback preserves the append-only decision");
db.close();
console.log("issue-sla-scope: all passed");

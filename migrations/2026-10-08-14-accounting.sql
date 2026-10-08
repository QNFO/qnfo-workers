-- NO-SILENT-DROP-2 + CAPABILITY-LEDGER-1 + SCORECARD-2 (2026-10-08, pillar autonomy). Owner directive 2026-10-08: the
-- Autonomous Operation Doctrine revision 2 (docs/AUTONOMOUS-OPERATION-DOCTRINE.md): section 6 accounting invariant
-- (entered = open + closed with disposition + superseded with evidence, every tick), drop detector, section 14 issue
-- lifecycle log, section 5 capability ledger, section 16 failure-mode fields, section 15 scorecard.
--
-- Measured 2026-10-08 by session_01CWLpf5v1NjC9GXbM6rnH4k: sqlite_sequence for agent_issues is 2184 and 2144 rows exist, so
-- 40 issues were deleted with no record (unrecoverable); 1,155 issues are closed, resolved or wontfix with no close evidence
-- (silent drops by the doctrine's definition): 247 of them have a later issue with the same title (superseded, with that
-- issue as evidence), 908 have no evidence at all and none has a passing probe verdict.
-- This file:
--   issue_lifecycle      append-only: every open, status change and delete of an agent_issue, with its evidence state.
--   agent_issues_tombstone  a deleted issue is copied here before it goes (a delete is never silent again).
--   reconciliation       one-time: the 247 superseded issues get close evidence naming their successor. Every fleet_tick
--                        then reopens up to 10 of the remaining no-evidence closures (oldest first, priority low, with a
--                        note), so each is re-verified and closed again with evidence (issue_close_evidence_required).
--   v_issue_accounting   the invariant every tick; metrics silent_drops (new drops since this file) and issues_unaccounted.
--   capability_ledger    what the fleet can do, how it was acquired, what it needs, and when it last ran.
--   failure_modes        gains trigger, symptom, blast radius and status columns (section 16 fields).
--   decision_log         gains capability_gain (section 14).
--   v_doctrine_scorecard_v2 the section 15 scorecard; metrics refreshed on fleet_tick.
-- Re-applied 2026-10-08: the first run stopped at statement 16 (failure_modes did not exist, because
-- 2026-10-08-13-failure-modes.sql had been refused); every statement here is idempotent.
-- Third apply 2026-10-08: the second run stopped at statement 7 (ADD COLUMN deleted_at, added by the first run); the runner
-- now treats a duplicate ADD COLUMN as applied (D1-TRIGGER-DEPTH-1 change), and its trigger-depth canary checks each trigger.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS issue_lifecycle_ai; DROP TRIGGER IF EXISTS issue_lifecycle_au; DROP TRIGGER IF EXISTS issue_lifecycle_bd; DROP TRIGGER IF EXISTS issue_lifecycle_no_update; DROP TRIGGER IF EXISTS issue_lifecycle_no_delete; DROP TRIGGER IF EXISTS reconcile_tick; DROP TRIGGER IF EXISTS scorecard_v2_tick; DROP VIEW IF EXISTS v_doctrine_scorecard_v2; DROP VIEW IF EXISTS v_issue_accounting; DELETE FROM issue_triage WHERE close_evidence LIKE 'NO-SILENT-DROP-2 superseded by #%'; DELETE FROM metric_registry WHERE metric IN ('silent_drops','issues_unaccounted','capabilities_acquired_7d','spofs_total','failure_modes_unprobed_pct'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('silent_drops','issues_unaccounted','spofs_total'); -- reopened issues keep their note; issue_lifecycle, agent_issues_tombstone and capability_ledger are ledgers and stay.

CREATE INDEX IF NOT EXISTS idx_agent_issues_title ON agent_issues (title);

CREATE TABLE IF NOT EXISTS issue_lifecycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  has_evidence INTEGER,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_issue_lifecycle_issue ON issue_lifecycle (issue_id, ts);
CREATE TRIGGER IF NOT EXISTS issue_lifecycle_no_update BEFORE UPDATE ON issue_lifecycle
BEGIN SELECT RAISE(ABORT, 'NO-SILENT-DROP-2: issue_lifecycle is append-only (doctrine section 14)'); END;
CREATE TRIGGER IF NOT EXISTS issue_lifecycle_no_delete BEFORE DELETE ON issue_lifecycle
BEGIN SELECT RAISE(ABORT, 'NO-SILENT-DROP-2: issue_lifecycle is append-only (doctrine section 14)'); END;

CREATE TABLE IF NOT EXISTS agent_issues_tombstone AS SELECT * FROM agent_issues WHERE 0;
ALTER TABLE agent_issues_tombstone ADD COLUMN deleted_at TEXT;

CREATE TRIGGER IF NOT EXISTS issue_lifecycle_ai AFTER INSERT ON agent_issues
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, to_status, has_evidence) VALUES (NEW.id, 'opened', NEW.status, NULL);
END;
CREATE TRIGGER IF NOT EXISTS issue_lifecycle_au AFTER UPDATE OF status ON agent_issues
WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence)
  VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status,
    CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END);
END;
CREATE TRIGGER IF NOT EXISTS issue_lifecycle_bd BEFORE DELETE ON agent_issues
BEGIN
  INSERT INTO agent_issues_tombstone SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM agent_issues WHERE id = OLD.id;
  INSERT INTO issue_lifecycle (issue_id, event, from_status, has_evidence) VALUES (OLD.id, 'deleted', OLD.status, 0);
END;

-- One-time reconciliation, part 1: a no-evidence closure with a later issue of the same title is superseded by it.
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'NO-SILENT-DROP-2', 'closed', 'qnfo-fleet-control', datetime('now'),
  'NO-SILENT-DROP-2 superseded by #' || (SELECT MIN(b.id) FROM agent_issues b WHERE b.title = a.title AND b.id > a.id) || ' (same title, filed later); reconciled 2026-10-08'
FROM agent_issues a
WHERE a.status IN ('closed', 'resolved', 'wontfix')
  AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')
  AND EXISTS (SELECT 1 FROM agent_issues b WHERE b.title = a.title AND b.id > a.id)
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence
  WHERE issue_triage.close_evidence IS NULL OR TRIM(issue_triage.close_evidence) = '';

CREATE VIEW IF NOT EXISTS v_issue_accounting AS
SELECT
  MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered,
  (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition,
  (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded,
  MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone)) AS deleted_unrecorded,
  (SELECT COUNT(*) FROM issue_lifecycle WHERE (event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted') AS silent_drops_since_ledger;

-- One-time reconciliation, part 2: every fleet_tick reopens up to 10 of the remaining no-evidence closures, oldest first.
CREATE TRIGGER IF NOT EXISTS reconcile_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE agent_issues SET status = 'open', priority = 'low', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000,
      description = COALESCE(description, '') || char(10) || 'NO-SILENT-DROP-2 ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': reopened by reconciliation: it was ' || status || ' with no close evidence and no successor (a silent drop by doctrine section 6). Re-verify it and close it with close_evidence, or supersede it with evidence.'
  WHERE id IN (SELECT a.id FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
      AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')
    ORDER BY a.id LIMIT 10);
END;

CREATE TABLE IF NOT EXISTS capability_ledger (
  capability TEXT PRIMARY KEY,
  provenance TEXT NOT NULL,
  prerequisites TEXT,
  reliability TEXT,
  acquired_at TEXT NOT NULL,
  last_exercised_at TEXT,
  evidence TEXT NOT NULL
);
INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('write zone routes and DNS with the repository token', 'found 2026-10-08 by red-teaming card cf-dns-redirect-token', 'CLOUDFLARE_API_TOKEN in Actions; scripts/attach-*.py pattern', 'proven 2026-09-30, 2026-10-02', '2026-10-08', '2026-10-02', 'ci-status/attach-*.json'),
 ('reroute owner cards that are not identity-bound', 'AUTONOMY-FIRST-1 (PR 800)', 'v_human_action_gate', 'card #63 rerouted to #2165', '2026-10-08', '2026-10-08', 'human_actions #63 status rerouted'),
 ('fix stuck queue items every 10 minutes in D1', 'QUEUE-SLA-1 (PR 801)', 'fleet_tick', 'tested in SQLite', '2026-10-08', NULL, 'queue_sla_actions'),
 ('escalate aged issues and red-team blocker claims', 'ANTIFRAGILE-1 (PR 801)', 'fleet_tick', 'tested in SQLite', '2026-10-08', NULL, 'issue_age_bumps, blocker_redteam'),
 ('probe beliefs and failure modes hourly', 'DOCTRINE-1, FAILURE-MODE-PROBES-1 (PR 801)', 'qnfo-fleet-control remediation tick', 'tested in SQLite', '2026-10-08', NULL, 'remediation_verifications classes belief-*, fm-*'),
 ('account for every issue every tick', 'NO-SILENT-DROP-2 (this file)', 'issue_lifecycle', 'tested in SQLite', '2026-10-08', NULL, 'v_issue_accounting'),
 ('merge its own control-plane changes with canary revert', 'CONTROL-PLANE-SELF-MERGE-1 (PR 737)', 'stale-PR lane, canary_revert.py', 'PR 800 merged; revert proven #2138', '2026-10-06', '2026-10-08', 'migration_runs, CONTROL-PLANE-REVERTED-1');

ALTER TABLE failure_modes ADD COLUMN trigger_condition TEXT;
ALTER TABLE failure_modes ADD COLUMN symptom TEXT;
ALTER TABLE failure_modes ADD COLUMN blast_radius TEXT;
ALTER TABLE decision_log ADD COLUMN capability_gain TEXT;
UPDATE failure_modes SET trigger_condition = 'a research row fails at publish', symptom = 'research_queue stalls; chain Research queue -> execution reads stuck', blast_radius = 'every queued paper' WHERE fm_key = 'head-of-line';
UPDATE failure_modes SET trigger_condition = 'a worker VERSION bump', symptom = 'gate fails on a fold suite; code tasks fail CI', blast_radius = 'every change to that worker' WHERE fm_key = 'version-pin-tests';
UPDATE failure_modes SET trigger_condition = 'issues created faster than probes run', symptom = 'issues_unprobed_60m high', blast_radius = 'every open issue''s closure' WHERE fm_key = 'unprobed-issues';
UPDATE failure_modes SET trigger_condition = 'a relapse filed within 24 h of a close', symptom = 'no new issue, no reopen', blast_radius = 'any recurring defect' WHERE fm_key = 'silent-refile-drop';
UPDATE failure_modes SET trigger_condition = 'an issue with an unmapped status or priority', symptom = 'insert refused, worker catches it', blast_radius = 'any loop that files issues' WHERE fm_key = 'enum-abort-drop';
UPDATE failure_modes SET trigger_condition = 'the fleet cron scheduler stops', symptom = 'no fleet_tick, metrics stale', blast_radius = 'every 10-minute fix and metric' WHERE fm_key = 'single-heartbeat';
UPDATE failure_modes SET trigger_condition = 'a hold with no expiry', symptom = 'items wait for a precondition that already shipped', blast_radius = 'the held queue' WHERE fm_key = 'stale-hold';
UPDATE failure_modes SET trigger_condition = 'a loop escalates a technical stall', symptom = 'owner card for a fleet decision', blast_radius = 'the owner queue' WHERE fm_key = 'owner-card-misroute';
UPDATE failure_modes SET trigger_condition = 'a credential written to config', symptom = '32+ hex characters in ops_config', blast_radius = 'whatever the key opens' WHERE fm_key = 'secret-in-config';
UPDATE failure_modes SET trigger_condition = 'a recurring incident after its issue closed', symptom = 'no escalation', blast_radius = 'every recurring high incident' WHERE fm_key = 'observability-escalation-drop';
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('issue-deletion', '40 agent_issues rows were deleted with no record', 'nothing recorded deletes', 'agent_issues_tombstone + issue_lifecycle on every delete', 'v_issue_accounting.deleted_unrecorded does not grow', 'fm-issue-deletion', '2026-10-08', 'a DELETE on agent_issues', 'sqlite_sequence ahead of the row count', 'the issue and its history'),
 ('closure-without-disposition', '1,155 issues closed without close evidence', 'closures before issue_close_evidence_required and paths that bypass it', 'reconciliation (superseded or reopened) + issue_lifecycle', 'no new evidence-less disposition in issue_lifecycle', 'fm-closure-without-disposition', '2026-10-08', 'a status change to closed without evidence', 'v_issue_accounting.closed_without_disposition', 'every closed issue''s truth');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-issue-deletion', NULL, 'NO-SILENT-DROP-2', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM issue_lifecycle WHERE event = ''deleted'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode'),
 ('fm-closure-without-disposition', NULL, 'NO-SILENT-DROP-2', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM issue_lifecycle WHERE event = ''dispositioned'' AND has_evidence = 0 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');
INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('issue history in one table', 'every issue record', 'agent_issues_tombstone and issue_lifecycle keep deletes and transitions', NULL, '40 rows vanished before 2026-10-08 with no copy', NULL);

CREATE VIEW IF NOT EXISTS v_doctrine_scorecard_v2 AS
SELECT
  (SELECT silent_drops_since_ledger FROM v_issue_accounting) AS silent_drops,
  (SELECT closed_without_disposition + deleted_unrecorded FROM v_issue_accounting) AS issues_unaccounted,
  (SELECT COUNT(*) FROM spof_registry WHERE alternate_tested_at IS NULL) AS spofs_on_critical_path,
  (SELECT COUNT(*) FROM spof_registry) AS spofs_total,
  (SELECT COUNT(*) FROM control_registry WHERE critical_path = 1 AND NOT (disposition = 'remove' AND disposition_state = 'applied') AND alternate_tested_at IS NULL) AS controls_on_critical_path_untested,
  (SELECT COUNT(*) FROM v_belief_status WHERE status = 'suspect') AS beliefs_unverified_60m,
  (SELECT CAST(ROUND(100.0 * SUM(CASE WHEN status IN ('unprobed') THEN 1 ELSE 0 END) / MAX(COUNT(*), 1)) AS INTEGER) FROM v_failure_mode_status) AS failure_modes_unprobed_pct,
  (SELECT COUNT(*) FROM v_failure_mode_status WHERE status = 'recurring') AS root_causes_unremediated,
  (SELECT COUNT(*) FROM capability_ledger WHERE acquired_at >= strftime('%Y-%m-%d', 'now', '-7 days')) AS capabilities_acquired_7d,
  (SELECT backlog_age_p95_min FROM v_doctrine_scorecard) AS backlog_age_p95_min,
  (SELECT COUNT(*) FROM v_human_action_gate WHERE status = 'open' AND gate = 'owner') AS stops_justified,
  (SELECT COUNT(*) FROM human_actions WHERE status = 'open') AS stops_total;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('silent_drops', 'operational', 'guard', 'v_doctrine_scorecard_v2.silent_drops: issue_lifecycle events that dispositioned an issue without evidence or deleted one (doctrine section 6).', 'qnfo-audit.issue_lifecycle (2026-10-08-14-accounting.sql)', '0 at the ledger''s start', '0', 'qnfo-fleet-control', 'trigger gt 0 -> one METRIC-TRIGGER issue', '10m', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('issues_unaccounted', 'operational', 'guard', 'v_doctrine_scorecard_v2.issues_unaccounted: closed without disposition plus deleted without a record (doctrine section 6 accounting invariant).', 'qnfo-audit.v_issue_accounting (2026-10-08-14-accounting.sql)', '948 after the superseded backfill (908 + 40) on 2026-10-08', '0', 'qnfo-fleet-control', 'trigger gt 40 -> one METRIC-TRIGGER issue (the 40 unrecorded deletes cannot be recovered)', '10m', '> 40', '> 500', NULL, NULL, 'MEASURED', 'computed'),
 ('spofs_total', 'operational', 'guard', 'v_doctrine_scorecard_v2.spofs_total: every registered single point of failure, tested alternate or not (doctrine section 12 target zero).', 'qnfo-audit.spof_registry', '12 on 2026-10-08', '0', 'qnfo-fleet-control', 'trigger gt 0 -> one METRIC-TRIGGER issue', '10m', '> 0', '> 12', NULL, NULL, 'MEASURED', 'computed'),
 ('capabilities_acquired_7d', 'operational', 'target', 'v_doctrine_scorecard_v2.capabilities_acquired_7d (doctrine section 15 headline: increasing).', 'qnfo-audit.capability_ledger', '7 on 2026-10-08', 'increasing week over week', 'qnfo-fleet-control', 'exempt from a trigger: a growth target with no failing threshold; the doctrine audit (#2181) reads it', '10m', NULL, NULL, NULL, NULL, 'MEASURED', 'computed'),
 ('failure_modes_unprobed_pct', 'operational', 'guard', 'v_doctrine_scorecard_v2.failure_modes_unprobed_pct: failure modes whose detector has not run in 60 minutes (doctrine section 15: probed this cycle -> 100% of register).', 'qnfo-audit.v_failure_mode_status', '100 before the first hourly run', '0', 'qnfo-fleet-control', 'covered by the failure_modes_recurring trigger', '10m', '> 0', '> 50', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS scorecard_v2_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT silent_drops FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'silent_drops';
  UPDATE metric_registry SET last_value = CAST((SELECT issues_unaccounted FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_unaccounted';
  UPDATE metric_registry SET last_value = CAST((SELECT spofs_total FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'spofs_total';
  UPDATE metric_registry SET last_value = CAST((SELECT capabilities_acquired_7d FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'capabilities_acquired_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT failure_modes_unprobed_pct FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'failure_modes_unprobed_pct';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'silent_drops', 'Silent drop: an issue was closed without evidence or deleted', 'registry', 'gt', 0, 1,
  'Pillar autonomy (NO-SILENT-DROP-2, doctrine section 6). Read SELECT * FROM issue_lifecycle WHERE (event = ''dispositioned'' AND has_evidence = 0) OR event = ''deleted'' ORDER BY id DESC. For each: find the writer (the issue''s source and the worker that changed it), reopen or restore the issue (agent_issues_tombstone holds a deleted row), give it a disposition with evidence, and fix the writer so it records evidence before it closes (a failure_modes row and an fm-<key> detector). Definition of done: silent_drops does not grow for 24 hours.',
  'qnfo-fleet-control', 'agent_issues', 1, 1, 'NO-SILENT-DROP-2 (migrations/2026-10-08-14-accounting.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'silent_drops');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issues_unaccounted', 'Accounting invariant: closed issues without a disposition remain', 'registry', 'gt', 40, 3,
  'Pillar autonomy (NO-SILENT-DROP-2). reconcile_tick reopens 10 no-evidence closures per tick; check it is running (issue_lifecycle event reopened in the last 20 minutes) and that reopened issues are re-verified and closed with evidence, not closed again without it. The 40 deletes before 2026-10-08 are unrecoverable and are the floor. Definition of done: issues_unaccounted <= 40.',
  'qnfo-fleet-control', 'agent_issues', 6, 1, 'NO-SILENT-DROP-2 (migrations/2026-10-08-14-accounting.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issues_unaccounted');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'spofs_total', 'Single points of failure remain registered', 'registry', 'gt', 0, 3,
  'Pillar autonomy (doctrine section 12, target zero). Read SELECT * FROM spof_registry ORDER BY alternate_tested_at IS NOT NULL, component. For each without a tested alternate, advance its issue (issue_id) or file one with the second path; for each with a tested alternate, keep it exercised (CHAOS-DRILL-1, #2180) and retire the row once the second path is independent (its own trust root). Definition of done: spofs_total = 0.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'NO-SILENT-DROP-2 (migrations/2026-10-08-14-accounting.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'spofs_total');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a no-evidence closure is a silent drop and must be re-verified, not trusted', '247 superseded by a same-title successor; the remaining 908 reopened 10 per tick at low priority', 'v_issue_accounting on 2026-10-08: 1,155 closures without evidence, 0 with a passing probe', 'applied by this file', 'agent_issues status and priority of up to 908 old issues over about 15 hours', 'the Rollback line removes the superseded evidence; reopened issues carry their prior status in their note', 'every issue accounted for every tick'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action = '247 superseded by a same-title successor; the remaining 908 reopened 10 per tick at low priority');

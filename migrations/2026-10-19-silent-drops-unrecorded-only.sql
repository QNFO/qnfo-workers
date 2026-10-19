-- ISSUE-ACCOUNTING-1 (2026-10-19, pillar autonomy; QNFO D1 issues 3014 and 2960, METRIC-TRIGGER-3075-SILENT-DROPS).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_v_issue_accounting_sd
-- Rollback: DROP VIEW IF EXISTS v_issue_accounting; CREATE VIEW v_issue_accounting AS SELECT MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n, (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix') AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition, (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition, (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded, MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone) - (SELECT COUNT(*) FROM issue_id_gap_ledger g WHERE g.id NOT IN (SELECT id FROM agent_issues) AND g.id NOT IN (SELECT id FROM agent_issues_tombstone) AND NOT EXISTS (SELECT 1 FROM issue_id_gap_ranges r WHERE g.id BETWEEN r.lo AND r.hi)) - COALESCE((SELECT SUM((r.hi - r.lo + 1) - (SELECT COUNT(*) FROM agent_issues a WHERE a.id BETWEEN r.lo AND r.hi) - (SELECT COUNT(DISTINCT t.id) FROM agent_issues_tombstone t WHERE t.id BETWEEN r.lo AND r.hi AND t.id NOT IN (SELECT id FROM agent_issues))) FROM issue_id_gap_ranges r), 0)) AS deleted_unrecorded, (SELECT COUNT(*) FROM issue_lifecycle WHERE (event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted') AS silent_drops_since_ledger; DELETE FROM remediation_contracts WHERE class = 'fm-silent-drop-recorded-delete'; DELETE FROM failure_modes WHERE fm_key = 'silent-drop-recorded-delete'; UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_silent_drops_rc b WHERE b.class = remediation_contracts.class) WHERE class = 'issue-3014' AND EXISTS (SELECT 1 FROM bak_20261019_silent_drops_rc b WHERE b.class = 'issue-3014');
--
-- WHY. v_issue_accounting.silent_drops_since_ledger counted every issue_lifecycle row with event = 'deleted'. The BEFORE DELETE
-- trigger issue_lifecycle_bd writes that row and the agent_issues_tombstone copy in one statement, so a delete that went through
-- it is, by construction, recorded: doctrine sections 6 and 8 call only an UNRECORDED closure or delete a silent drop. Measured
-- 2026-10-19 on qnfo-audit: issue_lifecycle holds 7 'deleted' rows (issue ids 2947, 2948, 2949, 3006, 3007, 99917, 99918, written
-- 2026-10-18 11:48Z to 14:08Z), every one with a tombstone copy; 'deleted' without a tombstone = 0; 'dispositioned' with
-- has_evidence = 0 = 0. v_doctrine_scorecard_v2.silent_drops read 7 and metric_registry silent_drops 7, so trigger 3075
-- (gt 0) stayed in breach for an event the ledger had already recorded, and issues 3014 and 2960 could never recover.
--
-- WHAT. Only the last column changes. A 'deleted' event counts unless agent_issues_tombstone holds a copy of that id; a
-- 'dispositioned' event without evidence still counts. The threshold stays 0 and nothing in issue_lifecycle or
-- agent_issues_tombstone is edited or deleted (both are append-only ledgers). The detector keeps its teeth: a delete that
-- bypasses issue_lifecycle_bd, or a lifecycle row written without its tombstone, still reads 1. Every other column keeps its
-- text and meaning (issues_unaccounted was fixed by ISSUE-ID-GAP-RANGES-1, migrations/2026-10-19-resolve-issue-id-gap-ranges.sql).
-- v_doctrine_scorecard_v2 reads the column unchanged. No hold, filter, cap or kill switch is added, so there is no control_registry row.
--
-- AFTER MERGE. migration_runs holds an ok row; v_doctrine_scorecard_v2 silent_drops = 0 with the 7 deleted events still in
-- issue_lifecycle; trigger 3075 hit 0; TRIGGER-RECOVERY-1 closes 3014 and 2960 with the probe result as close_evidence.

CREATE TABLE IF NOT EXISTS bak_20261019_v_issue_accounting_sd AS SELECT name, sql FROM sqlite_master WHERE name = 'v_issue_accounting';
CREATE TABLE IF NOT EXISTS bak_20261019_silent_drops_rc AS SELECT class, verify_probe FROM remediation_contracts WHERE class = 'issue-3014';

DROP VIEW IF EXISTS v_issue_accounting;
CREATE VIEW v_issue_accounting AS
SELECT
  MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered,
  (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition,
  (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded,
  MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone)
    - (SELECT COUNT(*) FROM issue_id_gap_ledger g WHERE g.id NOT IN (SELECT id FROM agent_issues) AND g.id NOT IN (SELECT id FROM agent_issues_tombstone)
         AND NOT EXISTS (SELECT 1 FROM issue_id_gap_ranges r WHERE g.id BETWEEN r.lo AND r.hi))
    - COALESCE((SELECT SUM((r.hi - r.lo + 1)
         - (SELECT COUNT(*) FROM agent_issues a WHERE a.id BETWEEN r.lo AND r.hi)
         - (SELECT COUNT(DISTINCT t.id) FROM agent_issues_tombstone t WHERE t.id BETWEEN r.lo AND r.hi
              AND t.id NOT IN (SELECT id FROM agent_issues))) FROM issue_id_gap_ranges r), 0)) AS deleted_unrecorded,
  (SELECT COUNT(*) FROM issue_lifecycle l WHERE (l.event = 'dispositioned' AND l.has_evidence = 0)
     OR (l.event = 'deleted' AND NOT EXISTS (SELECT 1 FROM agent_issues_tombstone t WHERE t.id = l.issue_id))) AS silent_drops_since_ledger;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('silent-drop-recorded-delete',
  'the silent_drops metric counts a delete that the ledger recorded, so its trigger stays in breach for an event that is already accounted for',
  'v_issue_accounting.silent_drops_since_ledger counted every issue_lifecycle row with event deleted; issue_lifecycle_bd writes that row together with the agent_issues_tombstone copy, so every delete through the trigger was counted although doctrine sections 6 and 8 call only an unrecorded delete silent',
  'ISSUE-ACCOUNTING-1 (migrations/2026-10-19-silent-drops-unrecorded-only.sql): the column counts a deleted event only when agent_issues_tombstone holds no copy of that id; a dispositioned event without evidence still counts; the threshold stays 0 and the ledgers are untouched',
  'v_doctrine_scorecard_v2.silent_drops = 0 while the deleted events stay in issue_lifecycle',
  'fm-silent-drop-recorded-delete', '2026-10-19', 3014,
  'an issue row is deleted through issue_lifecycle_bd (a tombstone and a deleted lifecycle row are written)',
  'silent_drops reads the number of recorded deletes (7 on 2026-10-19) and trigger 3075 files METRIC-TRIGGER-3075-SILENT-DROPS again',
  'the doctrine scorecard stays red for a recorded event and the owner queue carries a metric issue that no remedy can close');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-silent-drop-recorded-delete', NULL, 'ISSUE-ACCOUNTING-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT silent_drops FROM v_doctrine_scorecard_v2) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- The closing probe of issue 3014 is its own statement and an UPDATE: ORPHAN-GUARD-BIRTH-1 wrote the issue-3014 row at birth,
-- so an INSERT OR IGNORE of that class would be silently ignored. It applies only while the issue is open.
UPDATE remediation_contracts
SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT silent_drops + issues_unaccounted FROM v_doctrine_scorecard_v2) AS TEXT) AS observed'
WHERE class = 'issue-3014'
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 3014 AND status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'doctrine sections 6 and 8 define a silent drop as an unrecorded closure or delete; a delete that left a tombstone copy and a lifecycle row is recorded and must not hold the metric in breach',
  'ISSUE-ACCOUNTING-1: v_issue_accounting.silent_drops_since_ledger counts a deleted lifecycle event only when agent_issues_tombstone has no copy of the id; dispositioned without evidence still counts; threshold 0 unchanged',
  'qnfo-audit 2026-10-19: issue_lifecycle holds 7 deleted rows (2947, 2948, 2949, 3006, 3007, 99917, 99918), all with a tombstone; 0 deleted without tombstone; 0 dispositioned without evidence; v_doctrine_scorecard_v2 silent_drops 7, trigger 3075 hit 1',
  'merged with this migration', 'one view body (last column only) and one contract probe; issue_lifecycle and agent_issues_tombstone are not touched',
  'the Rollback line restores the view and the issue-3014 probe from the BACKUP tables',
  'the silent-drop metric separates recorded deletes from unrecorded ones, so it can recover and still catches a bypass',
  'silent_drops = 0 on the next fleet tick, trigger 3075 hit 0, issues 3014 and 2960 close by TRIGGER-RECOVERY-1 with evidence',
  'none', 'SQLite replay of this file twice against the live DDL (migrations/issue-accounting-20261019.test.mjs)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'ISSUE-ACCOUNTING-1:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:silent-drops-unrecorded-only');

-- AUDIT-REPAIR-RECURRING-FM-1 (2026-10-11, pillar autonomy; owner directive 2026-10-11: "always automatically audit and remediate
-- all issues, failure modes, open items, and root causes"). v_failure_mode_status read four failure modes as recurring at 08:03Z:
--   fm-migration-unapplied (backup-created-later, failed-migration-issue-never-closed): migrations/2026-10-09-04-audit-freshness.sql
--     (PR 835) stopped at statement 11, trigger audit_freshness_from_cron_log, which nests past D1's trigger depth on a cron_fire_log
--     insert (the runner dropped it at once). Statements 1-10 applied (v_audit_freshness, audit_freshness_tick_10m, the gap ledger,
--     the metric); the two after it never ran, so audits_stale is measured every 10 minutes but no trigger files an issue when an
--     audit stops: the alarm half of AUDIT-FRESHNESS-1 was missing. This file runs those two statements, records the file as
--     superseded by this one, and teaches the detector that a superseded file is resolved. The second refresher stays dropped: it
--     cannot exist at that depth, and the 10-minute tick is the sole refresher, recorded in spof_registry with the stale-metric
--     guard as its tested alternate.
--   fm-zenodo-exit-stalled: the owner directive of 2026-10-10 (NO-ZENODO-DOI-0, #2273) removed the Zenodo-exit runner (PR 887), so
--     the detector watches a process that was retired on purpose. Its contract is superseded and #2186 (the mirror it served) is
--     closed as superseded by #2273.
--   fm-unprobed-issues: issues_unprobed_60m 29 > 10 is a real backlog of probes, left to its metric trigger and the hourly
--     remediation tick; nothing here hides it.
-- issues_unaccounted read 3 (ids 2265, 2266, 2299 absent with no tombstone, lifecycle or ledger row). Root cause, reproduced in
-- SQLite: an INSERT OR IGNORE into agent_issues that collides with idx_agent_issues_open_title(_ci) is a correct dedup (the open
-- issue stands) but still consumes an AUTOINCREMENT id; a plain INSERT that collides rolls back and consumes none, and the
-- issue_refile_reopen RAISE(IGNORE) consumes none. Trigger agent_issues_dedup_gap_ledger records the id such an insert consumes,
-- before it is lost, so a dedup never reads as a silent drop. The three ids are recorded as inferred dedups (their titles are not
-- recoverable: the ignored row was never written).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_dedup_gap_ledger; DELETE FROM issue_id_gap_ledger WHERE verdict LIKE 'deduped-insert%'; DELETE FROM failure_modes WHERE fm_key = 'dedup-id-gap'; DELETE FROM remediation_contracts WHERE class = 'fm-dedup-id-gap'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'audits_stale' AND notes LIKE 'AUDIT-REPAIR-RECURRING-FM-1%'; DELETE FROM migration_runs WHERE status = 'superseded' AND applied_by = 'AUDIT-REPAIR-RECURRING-FM-1'; UPDATE remediation_contracts SET status = 'active' WHERE class = 'fm-zenodo-exit-stalled'; DELETE FROM spof_registry WHERE component = 'audits_stale refresher'

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'audits_stale', 'Audit freshness breach: an audit loop stopped running', 'registry', 'gt', 0, 2,
  'Pillar autonomy (AUDIT-FRESHNESS-1). Read SELECT * FROM v_audit_stale: each row is an audit signal past its allowed age, with its owner. Causes in order: (1) a fleet_crons row not firing: check cron_fire_log and the owning worker trigger, redeploy through the canonical path; (2) fleet_tick not advancing: both producers (cron log, worker heartbeats) are down, a platform or deploy fault, read fleet_heartbeat; (3) metric-refresh or the remediation tick erroring: read its latest error and fix in the owning worker. Never silence the metric by widening max_age_min without a recorded reason. Definition of done: audits_stale = 0 at two refreshes 10 minutes apart.',
  'qnfo-fleet-control', 'agent_issues', 1, 1, 'AUDIT-REPAIR-RECURRING-FM-1: statement 13 of migrations/2026-10-09-04-audit-freshness.sql, which never ran'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'audits_stale');

INSERT INTO migration_runs (file, sha256, commit_sha, db, status, statements, error, applied_by)
SELECT 'migrations/2026-10-09-04-audit-freshness.sql', 'superseded', NULL, 'qnfo-audit', 'superseded', 0,
  'statements 1-10 applied 2026-10-09; 11 (audit_freshness_from_cron_log) cannot exist at D1 trigger depth; 12-13 run by migrations/2026-10-11-audit-repair-recurring-fm.sql',
  'AUDIT-REPAIR-RECURRING-FM-1'
WHERE NOT EXISTS (SELECT 1 FROM migration_runs WHERE file = 'migrations/2026-10-09-04-audit-freshness.sql' AND status IN ('ok', 'superseded'));

UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM (SELECT e.file FROM migration_runs e WHERE e.status = ''error'' AND NOT EXISTS (SELECT 1 FROM migration_runs o WHERE o.file = e.file AND o.status IN (''ok'', ''superseded'')) GROUP BY e.file HAVING MAX(e.applied_at) < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours''))) + (SELECT COUNT(*) FROM agent_issues a WHERE a.title LIKE ''MIGRATION-APPLY-FAILED-1: %'' AND a.status NOT IN (''closed'', ''resolved'', ''wontfix'') AND EXISTS (SELECT 1 FROM migration_runs o WHERE o.file = ''migrations/'' || substr(a.title, 27) AND o.status IN (''ok'', ''superseded''))) = 0 THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'fm-migration-unapplied';

UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'fm-zenodo-exit-stalled';
UPDATE failure_modes SET remediation = remediation || ' | 2026-10-11: process retired by NO-ZENODO-DOI-0 (#2273, PR 887); detector superseded (AUDIT-REPAIR-RECURRING-FM-1)', probe_class = NULL
WHERE fm_key = 'zenodo-exit-stalled';

INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('audits_stale refresher', 'trigger audit_freshness_tick_10m on fleet_tick insert is the only refresher of metric audits_stale',
  'the metric tick marks a metric stale when last_refreshed ages, and LOOP-WATCH-1 files CHARTER-TICK-STALE-1 when fleet_tick stops',
  NULL, 'the second refresher audit_freshness_from_cron_log exceeds D1 trigger depth (migration_runs error 2026-10-09T12:01:33Z)', 2240);

CREATE TRIGGER IF NOT EXISTS agent_issues_dedup_gap_ledger BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues x WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title)))
BEGIN
  INSERT OR IGNORE INTO issue_id_gap_ledger (id, verdict, evidence)
  VALUES ((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues') + 1, 'deduped-insert',
    'an insert of an already-open title (unique open-title index) consumed this id; the open issue stands: ' || substr(COALESCE(NEW.title, ''), 1, 160));
END;

INSERT OR IGNORE INTO issue_id_gap_ledger (id, verdict, evidence) VALUES
 (2265, 'deduped-insert (inferred)', 'no row, tombstone or lifecycle event; consumed between 2264 (2026-10-10 05:08Z) and 2267 (07:00Z) by an INSERT OR IGNORE that collided with an open title (mechanism reproduced; title not recoverable). AUDIT-REPAIR-RECURRING-FM-1'),
 (2266, 'deduped-insert (inferred)', 'as 2265, same window. AUDIT-REPAIR-RECURRING-FM-1'),
 (2299, 'deduped-insert (inferred)', 'no row, tombstone or lifecycle event; consumed between 2298 (2026-10-11 05:03Z) and 2300 (07:01Z), same mechanism. AUDIT-REPAIR-RECURRING-FM-1');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('dedup-id-gap', 'a correct dedup of an issue read as a silent drop',
  'INSERT OR IGNORE that collides with the unique open-title index consumes an AUTOINCREMENT id, leaving a gap with no tombstone or lifecycle row',
  'trigger agent_issues_dedup_gap_ledger records the consumed id in issue_id_gap_ledger before the insert is ignored (AUDIT-REPAIR-RECURRING-FM-1)',
  'v_issue_accounting.deleted_unrecorded = 0', 'fm-dedup-id-gap', '2026-10-09', 2213,
  'a loop re-files an open title with INSERT OR IGNORE', 'issues_unaccounted > 0 with no deletion', 'the no-silent-drop audit (doctrine section 6) reports false drops and hides real ones');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-dedup-id-gap', NULL, 'AUDIT-REPAIR-RECURRING-FM-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT deleted_unrecorded FROM v_issue_accounting) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a recurring failure mode is a real defect or a stale detector, and each needs its own fix', 'AUDIT-REPAIR-RECURRING-FM-1: ran the two unapplied statements of the audit-freshness migration, marked it superseded, taught fm-migration-unapplied that superseded is resolved, superseded the retired Zenodo-exit detector', 'v_failure_mode_status 2026-10-11 08:03Z: 4 recurring; migration_runs error 2026-10-09T12:01:33Z; scripts/zenodo_exit_runner.py removed by PR 887', 'audits_stale can file an issue again; failure_modes_recurring falls from 4 to 1 (fm-unprobed-issues, a real backlog)', 'one metric trigger, two contracts, one failure_modes row, one ledger row', 'the Rollback line', 'stale audits raise an issue instead of only a number', 'within two hourly ticks failure_modes_recurring reads 1 and the audits_stale trigger row exists', NULL, 'D1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'AUDIT-REPAIR-RECURRING-FM-1%');

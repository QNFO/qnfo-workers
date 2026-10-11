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
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key = 'audits_stale' AND notes LIKE 'AUDIT-REPAIR-RECURRING-FM-1%'; DELETE FROM migration_runs WHERE status = 'superseded' AND applied_by = 'AUDIT-REPAIR-RECURRING-FM-1'; UPDATE remediation_contracts SET status = 'active' WHERE class = 'fm-zenodo-exit-stalled'; DELETE FROM spof_registry WHERE component = 'audits_stale refresher'

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

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a recurring failure mode is a real defect or a stale detector, and each needs its own fix', 'AUDIT-REPAIR-RECURRING-FM-1: ran the two unapplied statements of the audit-freshness migration, marked it superseded, taught fm-migration-unapplied that superseded is resolved, superseded the retired Zenodo-exit detector', 'v_failure_mode_status 2026-10-11 08:03Z: 4 recurring; migration_runs error 2026-10-09T12:01:33Z; scripts/zenodo_exit_runner.py removed by PR 887', 'audits_stale can file an issue again; failure_modes_recurring falls from 4 to 1 (fm-unprobed-issues, a real backlog)', 'one metric trigger, two contracts, one failure_modes row, one ledger row', 'the Rollback line', 'stale audits raise an issue instead of only a number', 'within two hourly ticks failure_modes_recurring reads 1 and the audits_stale trigger row exists', NULL, 'D1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'AUDIT-REPAIR-RECURRING-FM-1%');

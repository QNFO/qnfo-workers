-- MIGRATION-APPLY-RESOLVE-1 (2026-10-08, pillar autonomy; ANTIFRAGILE-1 failure-mode rule). Two failure modes found when
-- the 2026-10-08 doctrine migrations were merged (PR 801, commit ce21437):
--   backup-created-later: 2026-10-08-12 and -13 named control_registry as their BACKUP; the runner checks a named backup
--     before the file starts unless the file creates it with CREATE TABLE ... AS SELECT ahead of its first DROP, so both
--     were refused with no statement run, and -14 then stopped at statement 16 (no failure_modes). --check passed in the PR
--     because it cannot see the live database. Remedy (PR 807): each file snapshots trigger SQL into its own bak_ table.
--   failed-migration-issue-never-closed: the runner filed MIGRATION-APPLY-FAILED-1 issues (2188-2190) and nothing closed
--     them on a later ok run; their birth probe waits 48h, then reads stale. Remedy: scripts/apply_migrations.py
--     resolve_failure() closes the issue with the ok run as close evidence.
-- Detector: fm-migration-unapplied counts files whose runs are all errors and whose last error is over 3 hours old (the
-- QUEUE-SLA-1 limit), so a refused migration that nobody fixes is caught without a session.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key IN ('backup-created-later', 'failed-migration-issue-never-closed'); DELETE FROM remediation_contracts WHERE class = 'fm-migration-unapplied'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('backup-created-later', 'a migration named a BACKUP table that the same file creates as an ordinary table, and the runner refused it', 'the runner checks the named backup before the file starts unless the file creates it with CREATE TABLE ... AS SELECT; --check cannot see the live database', 'each file creates its own bak_ snapshot ahead of its first DROP (PR 807)', 'no migration file whose runs are all errors for over 3 hours', 'fm-migration-unapplied', '2026-10-08', 2188, 'a BACKUP line naming a table the file itself creates', 'migration_runs error: BACKUP table ... does not exist', 'every statement of the file and of later files that depend on it'),
 ('failed-migration-issue-never-closed', 'MIGRATION-APPLY-FAILED-1 issues stayed open after the file applied', 'the runner filed on failure and never resolved on success', 'resolve_failure() in scripts/apply_migrations.py closes the issue with the ok run as evidence', 'no open MIGRATION-APPLY-FAILED-1 issue whose file has an ok run', 'fm-migration-unapplied', '2026-10-08', 2190, 'a failed migration fixed by a later merge', 'open issue with a pending, then stale, probe', 'the issue queue''s truth');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-migration-unapplied', NULL, 'MIGRATION-APPLY-RESOLVE-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM (SELECT e.file FROM migration_runs e WHERE e.status = ''error'' AND NOT EXISTS (SELECT 1 FROM migration_runs o WHERE o.file = e.file AND o.status = ''ok'') GROUP BY e.file HAVING MAX(e.applied_at) < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours''))) + (SELECT COUNT(*) FROM agent_issues a WHERE a.title LIKE ''MIGRATION-APPLY-FAILED-1: %'' AND a.status NOT IN (''closed'', ''resolved'', ''wontfix'') AND EXISTS (SELECT 1 FROM migration_runs o WHERE o.file = ''migrations/'' || substr(a.title, 27) AND o.status = ''ok'')) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

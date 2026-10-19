-- MIGRATION-SUPERSEDED-RECORD-1 (2026-10-19, pillar autonomy; RESOLVE-ALL-OPEN-1, issue 99963 METRIC-TRIGGER-5190-MIGRATIONS-UNAPPLIED and 99991 LOOP-BREAKER-1).
-- migrations_unapplied reads 1: scripts/remediation_consumer.py migrations_sweep retries migrations/2026-10-18-issue-sla-window-retry.sql
-- every run (cloud_ops_events migration-sweep 02:09Z, 02:50Z, 03:50Z on 2026-10-19, all "failed"), and apply_migrations.py refuses it
-- each time under D1-TRIGGER-DEPTH-RETRY-1 because the same content was refused as migration_runs 296 (2026-10-18 13:12:49Z). The file
-- is superseded, not broken in a way a retry can fix: migrations/2026-10-18-issue-sla-window-applier-2.sql recreates the same trigger
-- (agent_issues_autotriage2_ins with the 120-minute window) and applied ok as migration_runs 298 (13:25:42Z); read 2026-10-19 04:40Z,
-- the live trigger text contains '+120 minutes'. Recording a superseded row (the sweep counts ok or superseded as applied, the precedent
-- is migrations/2026-10-11-audit-repair-recurring-fm.sql) ends the futile retry and brings migrations_unapplied to 0 on the next sweep.
-- The insert runs only while applier-2 still holds its ok row, so it never marks a file superseded without its successor applied.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM migration_runs WHERE file = 'migrations/2026-10-18-issue-sla-window-retry.sql' AND status = 'superseded' AND applied_by = 'RESOLVE-ALL-OPEN-1';

INSERT INTO migration_runs (file, sha256, commit_sha, db, status, statements, error, applied_by)
SELECT 'migrations/2026-10-18-issue-sla-window-retry.sql', 'superseded', NULL, 'qnfo-audit', 'superseded', 0,
  'superseded by migrations/2026-10-18-issue-sla-window-applier-2.sql (migration_runs ok, same trigger agent_issues_autotriage2_ins with +120 minutes); this content was refused by the depth canary as migration_runs 296 and is never replayed (D1-TRIGGER-DEPTH-RETRY-1)',
  'RESOLVE-ALL-OPEN-1'
WHERE EXISTS (SELECT 1 FROM migration_runs WHERE file = 'migrations/2026-10-18-issue-sla-window-applier-2.sql' AND status = 'ok')
  AND NOT EXISTS (SELECT 1 FROM migration_runs WHERE file = 'migrations/2026-10-18-issue-sla-window-retry.sql' AND status IN ('ok', 'superseded'));

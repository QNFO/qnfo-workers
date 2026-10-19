-- MIGRATION-SUPERSEDED-RECORD-1 (2026-10-19, RESOLVE-ALL-OPEN-1, issue 99991; pillar autonomy).
--
-- WHY
-- scripts/remediation_consumer.py (MIGRATION-UNAPPLIED-1) re-reports every opted-in file with no 'ok' or 'superseded'
-- migration_runs row. migrations/2026-10-18-issue-sla-window-retry.sql failed once (migration_runs 296, 13:12:49Z, depth
-- canary refused the zero-row INSERT probe and restored the previous trigger) and its content is sha256-locked, so it is
-- never replayed; the same definition was applied by migrations/2026-10-18-issue-sla-window-applier-2.sql
-- (migration_runs 298, status ok, 13:25:42Z). Measured 2026-10-19 04:3xZ: the live agent_issues_autotriage2_ins contains
-- '+120 minutes'. With no row saying so, the consumer logged "MIGRATION-UNAPPLIED-1 ... failed
-- migrations/2026-10-18-issue-sla-window-retry.sql" 17 times in 24 h (LOOP-BREAKER-1 #99991).
--
-- WHAT
-- Records the retry file as superseded by applier-2, the state the consumer already honours (precedent: migration_runs 82).
-- INSERT ... WHERE NOT EXISTS keeps a re-run a no-op.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM migration_runs WHERE file = 'migrations/2026-10-18-issue-sla-window-retry.sql' AND status = 'superseded' AND applied_by = 'RESOLVE-ALL-OPEN-1';

INSERT INTO migration_runs (file, sha256, db, status, statements, error, applied_by, applied_at)
SELECT 'migrations/2026-10-18-issue-sla-window-retry.sql', 'superseded', 'qnfo-audit', 'superseded', 0,
       'superseded by migrations/2026-10-18-issue-sla-window-applier-2.sql (migration_runs 298 ok): same agent_issues_autotriage2_ins definition; live trigger carries +120 minutes',
       'RESOLVE-ALL-OPEN-1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM migration_runs WHERE file = 'migrations/2026-10-18-issue-sla-window-retry.sql' AND status IN ('ok', 'superseded'));

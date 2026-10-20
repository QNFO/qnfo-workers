-- MIGRATION-HEADERLESS-AUDIT-1 follow-ups (2026-10-20, agent_issues 100056, charter pillar: autonomy).
-- The 92 grandfathered headerless migrations were audited (scripts/headerless_migration_audit.py against qnfo-audit, living-paper and
-- personal-life sqlite_master) and each now declares "APPLY-BY: manual (<reason>)"; migrations/headerless-allowlist.txt is empty.
-- No old file is applied again. Two things in qnfo-audit still needed a decision:
--   1. 2026-10-18-artifacts-canonical-sync.sql was partial: its tables and column exist (artifact_sync_state 180 rows, repo_file_index
--      3265 rows) but its three indexes never got created. The indexes below are the CREATE INDEX IF NOT EXISTS statements of that file,
--      on columns that exist live (artifact_sync_state: in_sync, drift_since; repo_file_index: namespace, repo, blob_sha). They are
--      idempotent and touch no row. The file's two seed rows (failure_modes artifacts-mirror-drift, remediation_contracts
--      artifacts-canonical-sync) are absent live and are not re-created here: the sync runs from artifacts-canonical-sync.yml.
--   2. control_registry 'migration-headerless-allowlist' (filter, demote, planned) is the filter this emptied: its disposition is
--      remove, applied (DOCTRINE-1: a filter's disposition is recorded when it is released). The empty list stays in the repository
--      so --check keeps its refusal rule and apply_migrations_test.py fails when a name is added again.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_artifact_sync_drift; DROP INDEX IF EXISTS idx_repo_file_index_repo; DROP INDEX IF EXISTS idx_repo_file_index_sha; UPDATE control_registry SET disposition = 'demote', disposition_state = 'planned' WHERE control = 'migration-headerless-allowlist'

CREATE INDEX IF NOT EXISTS idx_artifact_sync_drift ON artifact_sync_state(in_sync, drift_since);

CREATE INDEX IF NOT EXISTS idx_repo_file_index_repo ON repo_file_index(namespace, repo);

CREATE INDEX IF NOT EXISTS idx_repo_file_index_sha ON repo_file_index(blob_sha);

UPDATE control_registry
   SET disposition = 'remove', disposition_state = 'applied', reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       evidence = CASE WHEN instr(COALESCE(evidence, ''), 'EMPTIED 2026-10-20') > 0 THEN evidence ELSE COALESCE(evidence, '') || ' | EMPTIED 2026-10-20 (MIGRATION-HEADERLESS-AUDIT-1, agent_issues 100056): the 92 listed files each declare APPLY-BY: manual with their audit result (47 applied live, 39 rows only, 6 decided one by one in their headers: 3 on another database, 2 partial, 1 that targets living-paper); migrations/headerless-allowlist.txt holds no file name.' END
 WHERE control = 'migration-headerless-allowlist' AND (disposition <> 'remove' OR disposition_state <> 'applied');

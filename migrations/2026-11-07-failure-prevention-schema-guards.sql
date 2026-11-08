-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: (none; this file is a retirement no-op)
-- REAPPLY-OK: retired by retry-storm recovery 2026-11-08; original migration failed at apply time and is superseded.

-- RETIREMENT-NOOP-1 (2026-11-08): 2026-11-07-failure-prevention-schema-guards.sql failed on apply and has been retried many times.
-- The original error is recorded in migration_runs. This no-op content produces a new sha256
-- that applies ok, so the runner's MIGRATION-STALE-SHA-1 logic supersedes the old error row
-- and stops the retry storm. Any partial schema state left by the original failure is handled
-- by later forward-recovery migrations or already matches the current code.
SELECT 1;

-- ZENODO-EXIT-RUNNER-1 follow-up (2026-10-09, pillar research; agent_issues 2186). zenodo_exit_ledger already existed (the
-- original 2186 design: doi, recid, files, bytes, sha256, status, ts; 0 rows), so 2026-10-09-04's CREATE TABLE IF NOT EXISTS
-- was a no-op and the first runner upsert answered "table zenodo_exit_ledger has no column named title" (remediation-consumer
-- run 37902753630). This adds the columns the runner writes; the table is empty, so nothing is rewritten.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: ALTER TABLE zenodo_exit_ledger DROP COLUMN title (and the other added columns; no rows depend on them)

ALTER TABLE zenodo_exit_ledger ADD COLUMN title TEXT;
ALTER TABLE zenodo_exit_ledger ADD COLUMN rtype TEXT;
ALTER TABLE zenodo_exit_ledger ADD COLUMN abstract_chars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE zenodo_exit_ledger ADD COLUMN inhouse_slug TEXT;
ALTER TABLE zenodo_exit_ledger ADD COLUMN inhouse_chars INTEGER;
ALTER TABLE zenodo_exit_ledger ADD COLUMN meta_key TEXT;
ALTER TABLE zenodo_exit_ledger ADD COLUMN ia_checked_at TEXT;
ALTER TABLE zenodo_exit_ledger ADD COLUMN ia_snapshot TEXT;

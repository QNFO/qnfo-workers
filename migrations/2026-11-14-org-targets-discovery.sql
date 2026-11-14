-- ORG-OUTREACH-1 producer (2026-11-14): org_targets gains the columns discovery needs (the organisation's own website, attempt count, last error). Seeds come from the employers
-- already in jobsearch_matches; _shared/org-discovery.js verifies the site, reads a public address on that domain and quotes the organisation's own description, then the row moves
-- discovered -> queued (or terminal no-site / no-contact after 3 attempts).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE org_targets SET website = NULL, attempts = 0, error = NULL;

ALTER TABLE org_targets ADD COLUMN website TEXT;
ALTER TABLE org_targets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE org_targets ADD COLUMN error TEXT;

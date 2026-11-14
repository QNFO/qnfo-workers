-- ORG-OUTREACH-1 (2026-11-14): org_outreach_log.checked_at records when the reply write-back last looked for an answer to a live send, so orgReplySync reads the least recently
-- checked rows first and unanswered or auto-replied sends cannot fill its window of 50.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE org_outreach_log SET checked_at = NULL;

ALTER TABLE org_outreach_log ADD COLUMN checked_at TEXT;

-- ORG-OUTREACH-1 (2026-11-14): the reply write-back reads live sends with no outcome in least-recently-checked order; this index serves that read as the log grows.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS ix_org_outreach_log_pending;

CREATE INDEX IF NOT EXISTS ix_org_outreach_log_pending ON org_outreach_log (mode, reply_kind, checked_at, sent_at);

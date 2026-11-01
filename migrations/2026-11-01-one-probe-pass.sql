-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: ALTER TABLE worker_live_audit DROP COLUMN health_error; ALTER TABLE worker_live_audit DROP COLUMN health_probed_at;
ALTER TABLE worker_live_audit ADD COLUMN health_probed_at TEXT;
ALTER TABLE worker_live_audit ADD COLUMN health_error TEXT;

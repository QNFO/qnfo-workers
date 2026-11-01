-- ERRATA-CONFIRM-RETRY-CAP-1 (2026-11-01): persist bounded internal-errata confirmation attempts on the queue row.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: no-op; the additive counter is ignored by the previous worker version.

ALTER TABLE errata_queue ADD COLUMN internal_confirm_tries INTEGER NOT NULL DEFAULT 0;

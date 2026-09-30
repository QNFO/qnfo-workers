-- OUTREACH-ATTEMPT-CAP-1 (issue #1562)
--
-- outreach_queue had no way to bound email-resolution retries. jobOutreach wrote
-- status='needs-email' on lookup failure, and 'needs-email' is INSIDE the drain
-- selector `status IN ('pending','needs-email')`, so a row whose address could never
-- be resolved was re-selected on every run and re-attempted forever. Because the
-- selector is `ORDER BY created_at ASC LIMIT 10`, those dead rows permanently
-- occupied the front of the window and starved every live row behind them.
--
-- This adds the retry counter the drain now increments, and a supporting index for
-- the drain's access pattern.
--
-- APPLIED to qnfo-audit on 2026-09-30 by qnfo-ops.

ALTER TABLE outreach_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_outreach_queue_drain
  ON outreach_queue(status, created_at);

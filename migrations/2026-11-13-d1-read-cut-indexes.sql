-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_fleet_tick_source_ts; DROP INDEX IF EXISTS idx_alerts_source_created; DROP INDEX IF EXISTS idx_bhl_action_pr; DROP INDEX IF EXISTS idx_rs_source_date;
-- D1-READ-CUT-1 (pillar cost; owner 2026-11-13: billions of D1 rows read). Measured with the Cloudflare GraphQL d1QueriesAdaptiveGroups on qnfo-audit, 2026-11-12:
-- 4.5 billion rows read in 3 days over 2 million read queries. The heaviest statements were full scans with no usable index:
--   fleet_tick "NOT EXISTS (... source = ? AND ts > ...)" (only a ts index), alerts "source='sla-breach' AND message LIKE" (no index), branch_hygiene_log
--   "action='merge-refused' AND pr = ?" (no index), reach_signals "source = ? AND date >= ? AND date <= ?" (the unique index starts with date).
-- Indexes only: no row is changed or removed.
-- CAUSE-MAPPED: no metric registered; indexes only.
CREATE INDEX IF NOT EXISTS idx_fleet_tick_source_ts ON fleet_tick (source, ts);
CREATE INDEX IF NOT EXISTS idx_alerts_source_created ON alerts (source, created_at);
CREATE INDEX IF NOT EXISTS idx_bhl_action_pr ON branch_hygiene_log (action, pr, sha);
CREATE INDEX IF NOT EXISTS idx_rs_source_date ON reach_signals (source, date);

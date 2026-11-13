-- D1-ROWS-READ-INDEXES-2 (2026-11-13): billions of rows read a month on qnfo-audit (9.46 B in 7 days of 11.8 B account-wide).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_alerts_source_created; DROP INDEX IF EXISTS idx_errata_target; DROP INDEX IF EXISTS idx_bhl_action_pr; DROP INDEX IF EXISTS idx_code_tasks_repo_path;
-- Measured 2026-11-13 (d1QueriesAdaptiveGroups, 3 days, ranked by rows read): each statement below scans its whole table on every call.
--   alerts WHERE source='sla-breach' ...: 10,519 calls, 91.7 M rows (8.7 K each, table 10 K rows, no index)
--   branch_hygiene_log insert NOT EXISTS (action, pr): 9,111 calls, 64.4 M rows (7 K each, table 8 K rows, no index)
--   internal_errata WHERE target_kind, target_ref: 19,984 calls, 30.4 M rows (only the primary-key autoindex)
--   code_tasks WHERE repo AND path IN (...): 15,433 calls, 34.9 M rows (only a status index)
-- Expected: each call reads tens of rows, about 220 M rows in 3 days removed.
CREATE INDEX IF NOT EXISTS idx_alerts_source_created ON alerts(source, created_at);
CREATE INDEX IF NOT EXISTS idx_errata_target ON internal_errata(target_kind, target_ref, status);
CREATE INDEX IF NOT EXISTS idx_bhl_action_pr ON branch_hygiene_log(action, pr, sha);
CREATE INDEX IF NOT EXISTS idx_code_tasks_repo_path ON code_tasks(repo, path, status);

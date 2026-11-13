-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_code_tasks_goal_nocase; DROP INDEX IF EXISTS idx_sha_status_ts;
-- spof-review: no new component; two indexes.
-- charter-pillar: cost
-- CAUSE-MAPPED: no metric registered.
--
-- D1-READS-COST-5 (owner 2026-11-13). Live d1QueriesAdaptiveGroups, qnfo-audit, one hour on 2026-11-13:
--   `SELECT ... FROM code_tasks WHERE goal LIKE ? OR id = ?` (qnfo-code-orchestrator, 1,484 runs, 3.0 M rows): LIKE 'prefix%' is
--     case-insensitive and seeks only a COLLATE NOCASE index, so every run scanned the table;
--   `UPDATE self_heal_actions SET status = 'no-action' WHERE status IN ('detected', ...)` (72 runs, 1.04 M rows): no index on status.
-- Same answers, fewer rows.
CREATE INDEX IF NOT EXISTS idx_code_tasks_goal_nocase ON code_tasks (goal COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sha_status_ts ON self_heal_actions (status, ts);

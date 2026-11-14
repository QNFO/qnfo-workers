-- D1-ROWS-READ-COST-8 item 3 (written 2026-11-14, charter pillar cost; agent_issues 1003336, code task ct_im1003336, CODE-LOOP-EXHAUSTED-1 1003561 / GitHub #11909; also
-- D1-HOT-STATEMENTS-1 1003559 / #11900, statement "SELECT 1 AS x FROM v_issue_age_ladder WHERE id = ? AND rung = '24h' AND breach = 1": 20.2M rows read in 4780 runs over 24 h).
-- The code loop could not write this file: it edits files that exist, and this path did not (read failed: raw read HTTP 404, three attempts).
-- v_issue_age_ladder materialises live_tasks with status NOT IN (...), which idx_code_tasks_status cannot serve, so every call scanned all of code_tasks (2161 rows on
-- 2026-11-14; 14 of them live). A partial index whose WHERE is that exact NOT IN list holds only the live rows, and SQLite scans it instead of the table
-- (EXPLAIN QUERY PLAN: SCAN code_tasks USING INDEX idx_code_tasks_live). The view is unchanged. migrations/d1-reads-cut-8.test.mjs pins the plan against the view's own text.
-- If the view's NOT IN list changes, the index no longer applies and the test fails; update both together.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_code_tasks_live;
-- CAUSE-MAPPED: registers no metric.

CREATE INDEX IF NOT EXISTS idx_code_tasks_live ON code_tasks (updated_at, lease_until)
  WHERE status NOT IN ('merged', 'closed', 'superseded', 'publish_failed', 'needs_human', 'failed', 'reverted');

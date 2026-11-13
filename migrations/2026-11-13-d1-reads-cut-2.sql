-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261113_d1_reads_cut_2
-- Rollback: UPDATE fleet_crons SET cron_expr = '5,15,25,35,45,55 * * * *', next_fire = NULL WHERE task_id = 'breach-ticket-coverage'; DROP VIEW IF EXISTS v_breaches_without_ticket; then CREATE VIEW v_breaches_without_ticket from the body of bak_20261113_d1_reads_cut_2 where kind = 'view'; DROP INDEX IF EXISTS idx_bhl_pr_ts; DROP INDEX IF EXISTS idx_bhl_refused_dedupe;
-- spof-review: no new component. One cron slows from every 10 minutes to hourly, two indexes are added; no control is removed.
-- charter-pillar: cost
-- CAUSE-MAPPED: no metric registered.
--
-- D1-READS-COST-2 (owner 2026-11-13, "billions and billions of D1 rows"). Live d1QueriesAdaptiveGroups, qnfo-audit, last hour (about 50 M rows):
--   10.5 M  breach-ticket-coverage observe-gaps: 56 runs x 188 K rows (v_metric_trigger_state is read three times a run, six runs an hour)
--    2.4 M  branch_hygiene_log 'merge-refused' dedupe: 365 x 6.5 K (COALESCE(sha,'') stopped idx_bhl_action_pr from seeking)
--    0.9 M  branch_hygiene_log WHERE pr = ? ORDER BY ts: 112 x 8.2 K (no index starts with pr)
-- Fix: the coverage task runs once an hour (the gap must be seen on two runs 110 minutes apart, so the sustained window is unchanged;
-- last_seen tolerates the 60-minute cadence), plus an expression index and a pr-first index. Same answers, fewer rows.
CREATE TABLE IF NOT EXISTS bak_20261113_d1_reads_cut_2 AS
SELECT 'view' AS kind, name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_breaches_without_ticket';

CREATE INDEX IF NOT EXISTS idx_bhl_pr_ts ON branch_hygiene_log (pr, ts);
CREATE INDEX IF NOT EXISTS idx_bhl_refused_dedupe ON branch_hygiene_log (action, pr, COALESCE(sha, ''), why);

DROP VIEW IF EXISTS v_breaches_without_ticket;
CREATE VIEW v_breaches_without_ticket AS
SELECT c.*
FROM v_breach_ticket_coverage_candidates c
JOIN breach_ticket_coverage_gaps g ON g.trigger_id = c.trigger_id
WHERE g.first_seen <= datetime('now', '-110 minutes')
  AND g.last_seen >= datetime('now', '-70 minutes')
  AND NOT EXISTS (
    SELECT 1 FROM agent_issues a JOIN issue_lifecycle l ON l.issue_id = a.id
    WHERE a.title LIKE 'METRIC-TRIGGER-' || c.trigger_id || '-%'
      AND l.to_status = 'open' AND replace(substr(l.ts, 1, 19), 'T', ' ') >= g.first_seen
  );

UPDATE fleet_crons SET cron_expr = '5 * * * *', next_fire = NULL, updated_at = datetime('now') WHERE task_id = 'breach-ticket-coverage';

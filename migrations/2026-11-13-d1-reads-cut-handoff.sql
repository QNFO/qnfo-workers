-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'wontfix', close_channel = 'session:d1-reads-handoff-rollback' WHERE title = 'D1-ROWS-READ-COST-1: qnfo-audit rows read over the daily budget'; (the issue and its contract close through issue_triage; no data is deleted)
-- spof-review: no new component; one open issue with its closing probe on the existing detector's ledger.
-- charter-pillar: cost
-- CAUSE-MAPPED: no metric registered.
--
-- D1-ROWS-READ-COST-1 (owner 2026-11-13: "all loops need to be closed server side"). The rows-read cut is not finished by a session: 2026-11-13 read 675 M rows by
-- 11:28 UTC against a 150 M a day budget (cost_usage_daily d1 rows_read; 2026-11-12 was 1.71 B). One issue holds the rest as a server-side loop:
-- the code loop works the code-task lines, the d1-query probe below closes the issue on the first full UTC day at or under ops_config d1_rows_read_daily_budget,
-- and fm-d1-rows-read-over-budget keeps filing a failure mode while a day is over. Nothing here waits on a session or a person.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'D1-ROWS-READ-COST-1: qnfo-audit rows read over the daily budget',
 'Cost pillar. Live d1QueriesAdaptiveGroups (qnfo-audit, 2026-11-13) still shows these statements as the heaviest after PRs 11418, 11435, 11439, 11449, 11451, 11455 and 11461:'
 || char(10) || '1. fleet_tick insert burst in the first 10 minutes of each hour (about 8 M rows an hour): gate the remaining ungated fleet_tick triggers (wip_self_tune, queue_sla_code_publish_10m, sla_mechanisms_tick_10m, reconcile_tick, agent_issues_normalise_tick) to a cheap precondition or to the hourly window.'
 || char(10) || '2. cron-watch closed-seen insert into cron_watch_actions (migrations/2026-10-19-cron-watch.sql): 19 K rows a call, a watermark or an index on cron_watch_actions(issue_id, action, id).'
 || char(10) || '3. tempo_targets UPDATE from v_backlog_burndown (hourly, 1.9 M rows a run): replace the view reads with a rollup table.'
 || char(10) || '4. qnfo-code-orchestrator code_tasks lease UPDATE and goal LIKE queries (qnfo-code-orchestrator/worker.js): verify idx_code_tasks_goal_nocase is used (EXPLAIN QUERY PLAN) and index the lease claim by status.'
 || char(10) || '5. v_sla_over_120m and v_issue_age_ladder per-call scans; the inbound SLA query in qnfo-email-orchestrator and qnfo-cloud-ops; living-paper scans (the sibling thread owns those).'
 || char(10) || 'Done when cost_usage_daily product d1 metric rows_read for a full UTC day is at or under ops_config d1_rows_read_daily_budget. Measure each change with d1QueriesAdaptiveGroups before and after.'
 || char(10) || 'code-task: repo=qnfo-workers path=migrations/2026-11-13-d1-rows-read-budget.sql',
 'session:d1-reads-handoff', 'optimization', 'high', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = 'D1-ROWS-READ-COST-1: qnfo-audit rows read over the daily budget' AND a.status = 'open');

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT quantity FROM cost_usage_daily WHERE product = ''d1'' AND metric = ''rows_read'' AND date = date(''now'', ''-1 day'')), 1e18) <= COALESCE((SELECT CAST(value AS REAL) FROM ops_config WHERE key = ''d1_rows_read_daily_budget''), 150000000) THEN ''ok'' ELSE ''over'' END AS observed',
  verify_transport = 'd1-query', precondition = 'D1-ROWS-READ-COST-1: the previous UTC day read more rows than the budget', action = 'code loop works the issue code-task lines; the failure-mode detector keeps filing while over',
  module = 'd1-rows-read-cost', status = 'active', expected_cadence_h = 1, attempts = 0, next_due_at = datetime('now')
WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title = 'D1-ROWS-READ-COST-1: qnfo-audit rows read over the daily budget' AND status = 'open');

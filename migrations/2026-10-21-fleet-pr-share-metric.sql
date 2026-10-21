-- FLEET-PR-SHARE-1 (2026-10-21, agent_issues 100420, pillar autonomy).
-- WHY: 392 of 537 pull requests merged into qnfo-workers since 2026-10-17 came from outside sessions (chatbox 182, claude 141); only
--      145 (27%) were authored by the fleet's own GitHub App (app/qnfo-fleet). No metric measured the fleet's share of its own
--      development, so the gap was invisible. qnfo-github-steward 0.7.6 writes fleet_authored_pr_share_7d hourly from two GitHub
--      search counts; this file registers the metric and its trigger (CORE-PROMPT-1 rule 5: a metric ships with its trigger).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key = 'fleet_authored_pr_share_7d'; DELETE FROM metric_registry WHERE metric = 'fleet_authored_pr_share_7d';
-- runtime-probe (D1): SELECT last_value, last_refreshed FROM metric_registry WHERE metric = 'fleet_authored_pr_share_7d' -- expected a number and a refresh within 2 h

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('fleet_authored_pr_share_7d', 'operational', 'leading',
  'merged pull requests into QNFO/qnfo-workers main in the last 7 days authored by app/qnfo-fleet / all merged pull requests in the same window (GitHub search total_count; n/a when none merged)',
  'GitHub search API via qnfo-github-steward (hourly, :15 reconcile fire)', '0.27 (145 of 537, 2026-10-17..21)', '>= 0.5',
  'qnfo-code-orchestrator', 'analytics_metric_triggers -> agent_issues (owner qnfo-code-orchestrator)', 'hourly', '< 0.5', '< 0.2', 'PENDING', 'worker-written');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('fleet_authored_pr_share_7d', 'Autonomy gap: the fleet authors under half of its own merged pull requests', 'registry', 'lt', 0.5, 6,
  'Pillar autonomy. Read why issues did not become fleet code tasks: cloud_ops_events job qnfo-code-orchestrator kind code-task.plan status skip (planner not-code reasons), code-task.intake refusals (untrusted origin, preflight, merge scope), and code_tasks status needs_human/failed in 7 days. Fix the commonest cause in qnfo-code-orchestrator (planner prompt, intake gates, merge scope) or the trust list. Never count session PRs as fleet PRs and never lower the verification bar. Definition of done: fleet_authored_pr_share_7d >= 0.5 in metric_registry; record before and after in issue_triage.close_evidence.',
  'qnfo-code-orchestrator', 'agent_issues', 6, 1, 'FLEET-PR-SHARE-1 2026-10-21 (agent_issues 100420)');

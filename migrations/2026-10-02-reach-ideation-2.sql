-- REACH-IDEATION-2 (2026-10-02, pillars: reach, autonomy). qnfo-fleet-control 0.4.95 grades its own reach ideation end to end:
-- reach_ideas_shipped_30d = REACH-IDEA-1 issues the loop closed with evidence (the live page now passes) in 30 days, from
-- qnfo-audit.reach_idea_outcomes. METRIC-CLOSED-LOOP-1 rule: a change that registers a metric adds its trigger.
-- The tick writes 'n/a' until the oldest outcome row is 14 days old (an idea needs a code task, a PR, a merge and a deploy),
-- so v_metric_trigger_state.hit stays NULL and the trigger cannot fire before the loop has had a fair chance.
-- Idempotent; applied by the session that wrote it.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
VALUES ('reach_ideas_shipped_30d', 'system', 'lagging',
  'count(reach_idea_outcomes WHERE closed_at in the last 30 days): REACH-IDEA-1 issues closed by REACH-IDEATION-1 because the live page now passes the check; n/a until the oldest outcome row is 14 days old',
  'qnfo-audit.reach_idea_outcomes', '0', '>= 4 per 30 days', 'qnfo-fleet-control',
  'REACH-IDEATION-1/2 -> ISSUE-PLANNER-1 -> code loop -> CODE-TASK-MERGE-RUNNER-1', 'daily', '< 1', '< 1 for 30 days', 'n/a', NULL, 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'reach_ideas_shipped_30d', 'Reach gap: the fleet ideated reach work but shipped none of it in 30 days', 'registry', 'lt', 1, 7,
  'Pillar reach. REACH-IDEATION-1 files ideas but none reached a live page in 30 days. Read GET https://qnfo-fleet-control.q08.workers.dev/reach-ideas (open_ideas, outcomes, last_run.state_json wip) and find where ideas stop: (1) open buildable ideas have no code_tasks row: the planner is starved or refusing them (qnfo-code-orchestrator issue_plans, PLAN-WIP-STARVATION-1); fix the planner, never raise IDEA_WIP_MAX to compensate; (2) code tasks exist but no PR merged: the code loop or merge runner is the gap (code_task_success_rate_30d); (3) every open idea is NOT AUTO-BUILDABLE (qnfo-gateway): the largest reach levers have no autonomous doer, which is an owner policy decision on the code loop deny list, so write one human_actions card stating it, once. Definition of done: reach_ideas_shipped_30d >= 1 in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy does not move the metric within 7 days, say so on the issue and try a different lever.',
  'qnfo-fleet-control', 'agent_issues', 168, 1, 'REACH-IDEATION-2 (migrations/2026-10-02-reach-ideation-2.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'reach_ideas_shipped_30d' AND x.enabled = 1);

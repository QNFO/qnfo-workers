-- CODE-GOAL-SUCCESS-1 (2026-10-11, pillar autonomy; owner directive 2026-10-11 "Remediate root causes automatically for future
-- deploy 100% success target"). code_task_success_rate_30d (0.26) counts every task row: a goal re-proposed on a stale base, or
-- fixed by another PR, reads as a failure. The deploy-success target is about goals: did the change the loop was asked for
-- ship. v_code_goal_outcomes groups the last 30 days of code_tasks by goal ("[issue #N]" or the goal text) and calls a goal
--   shipped     when one of its tasks merged,
--   superseded  when it ended closed as superseded, already shipped or withdrawn (the goal landed elsewhere),
--   in_flight   while a task is still queued, proposing, verifying, publishing or open,
--   failed      otherwise.
-- code_goal_success_rate_30d = shipped / (shipped + failed); target 1.0 (the owner's 100%), trigger below 0.9. Refreshed hourly
-- by code_goal_success_tick. The same PR's levers: PUBLISH-SUITE-CHECK-1 (PR 917, suites run before a branch is pushed) and
-- CODE-REPAIR-INTASK-1 (qnfo-fleet-control 0.16.0, review and check refusals repaired inside the task).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS code_goal_success_tick; DROP VIEW IF EXISTS v_code_goal_outcomes; DELETE FROM metric_registry WHERE metric = 'code_goal_success_rate_30d'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'code_goal_success_rate_30d'; DELETE FROM failure_modes WHERE fm_key IN ('code-task-dies-at-ci', 'code-refusal-not-repaired'); DELETE FROM remediation_contracts WHERE class IN ('fm-code-task-dies-at-ci', 'fm-code-refusal-not-repaired')
-- BACKUP: failure_modes

CREATE VIEW IF NOT EXISTS v_code_goal_outcomes AS
SELECT gk,
  CASE WHEN SUM(status = 'merged') > 0 THEN 'shipped'
       WHEN SUM(status IN ('queued', 'proposing', 'verifying', 'ready_to_publish', 'publishing', 'published', 'pr_open', 'branch_pushed')) > 0 THEN 'in_flight'
       WHEN SUM(status = 'closed' AND (lower(COALESCE(last_error, '') || ' ' || COALESCE(merge_note, '')) LIKE '%superseded%'
             OR lower(COALESCE(last_error, '') || ' ' || COALESCE(merge_note, '')) LIKE '%already shipped%'
             OR lower(COALESCE(last_error, '') || ' ' || COALESCE(merge_note, '')) LIKE '%withdrawn%')) > 0 THEN 'superseded'
       ELSE 'failed' END AS outcome,
  COUNT(*) AS tasks, MIN(created_at) AS first_at, MAX(updated_at) AS last_at
FROM (
  SELECT status, last_error, merge_note, created_at, updated_at,
    CASE WHEN instr(goal, '[issue #') = 1 THEN substr(goal, 1, instr(goal, ']')) ELSE substr(goal, 1, 120) END AS gk
  FROM code_tasks WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
)
GROUP BY gk;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('code_goal_success_rate_30d', 'operational', 'target', 'shipped / (shipped + failed) over v_code_goal_outcomes (code_tasks of the last 30 days grouped by goal; superseded and in-flight goals excluded)', 'qnfo-audit.v_code_goal_outcomes', '0.49 on 2026-10-11 (30 shipped, 31 failed, 26 superseded goals in 30 days)', '1.0 (owner: 100% deploy success)', 'qnfo-code-orchestrator', 'trigger lt 0.9', '1h', NULL, NULL, NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS code_goal_success_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT ROUND(1.0 * SUM(outcome = 'shipped') / MAX(1, SUM(outcome IN ('shipped', 'failed'))), 3) FROM v_code_goal_outcomes) AS TEXT)
  WHERE metric = 'code_goal_success_rate_30d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'code_goal_success_rate_30d', 'Deploy success: under 90% of code-loop goals ship', 'registry', 'lt', 0.9, 2,
  'Pillar autonomy (CODE-GOAL-SUCCESS-1). Read SELECT gk, tasks FROM v_code_goal_outcomes WHERE outcome = ''failed'' and the last task of each (code_tasks last_error, merge_note): the last refusal names the cause. Levers by cause: a red suite (PUBLISH-SUITE-CHECK-1 should have caught it: read the code-task-publish log for that task), a goal-review refusal after two CODE-REPAIR-INTASK-1 rounds (sharpen the goal or the anchor on the issue), a dead-on-arrival anchor (ANCHOR-REPAIR-1), a stale base (REBASE-REQUEUE-1). Done: code_goal_success_rate_30d >= 0.9 at two refreshes.',
  'qnfo-code-orchestrator', 'agent_issues', 24, 1, 'CODE-GOAL-SUCCESS-1 (migrations/2026-10-11-code-goal-success.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'code_goal_success_rate_30d');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('code-task-dies-at-ci', 'a code-loop proposal that breaks a worker suite reaches CI and dies there',
  'the orchestrator verifier parses a proposal but runs no suite; the merge runner can only refuse',
  'PUBLISH-SUITE-CHECK-1: code-task-publish runs the touched worker suites after the patch applies and sends new failures back to propose',
  'no code task refused for a red gate in the last 7 days', 'fm-code-task-dies-at-ci', '2026-10-07', 1834,
  'a proposal that breaks a test', 'merge_note required check(s) failed: gate', 'every code-loop goal on that worker'),
 ('code-refusal-not-repaired', 'a reviewer or check refusal ends a code task without a second attempt',
  'cmRefuseTask failed the task at once; the intake retried only after 6 h and stopped after three tasks per issue',
  'CODE-REPAIR-INTASK-1 (qnfo-fleet-control 0.16.0): up to two repair rounds inside the task with the refusal as feedback',
  'every goal-review or check refusal in 7 days is followed by a repair-requeued event or an exhausted round count', 'fm-code-refusal-not-repaired', '2026-10-07', 1834,
  'a refusal on an open PR', 'issues left to a session after three failed tasks', 'the code loop stalls on the issues it was given');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-code-task-dies-at-ci', NULL, 'CODE-GOAL-SUCCESS-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''failed'' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND created_at > ''2026-10-11T12:00:00Z'' AND COALESCE(last_error, '''') LIKE ''%required check(s) failed%gate%'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-refusal-not-repaired', NULL, 'CODE-GOAL-SUCCESS-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''failed'' AND created_at > ''2026-10-11T12:00:00Z'' AND (COALESCE(last_error, '''') LIKE ''%goal review (%'' OR COALESCE(last_error, '''') LIKE ''%required check(s) failed%'') AND COALESCE(json_extract(ctx, ''$.repair_round''), 0) < 2 AND attempts < 8) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'deploy success is measured per goal, and the two removable causes of failed goals are untested proposals and unrepaired refusals', 'CODE-GOAL-SUCCESS-1: per-goal success metric with trigger; PUBLISH-SUITE-CHECK-1 (PR 917) and CODE-REPAIR-INTASK-1 (qnfo-fleet-control 0.16.0)', 'code_tasks 30d to 2026-10-11: 87 goals, 30 shipped, 31 failed, 26 superseded; 15 tasks died on a red gate whose suites pass on main; 15 on the goal review; 5 issues exhausted', 'goals ship or are repaired inside their task', 'scripts/code-task-publish.py, qnfo-fleet-control merge runner, one view and metric', 'the Rollback line and reverts of the two PRs', 'the code loop tests its own proposals before publishing and repairs refusals with feedback', 'within 14 days code_goal_success_rate_30d rises from 0.49 toward 0.9 and no task created after 2026-10-11 12:00Z fails on a red gate', NULL, 'D1, GitHub runner, merge runner'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'CODE-GOAL-SUCCESS-1%');

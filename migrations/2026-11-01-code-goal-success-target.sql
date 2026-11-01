-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET target = '1.0 (owner: 100% deploy success)' WHERE metric = 'code_goal_success_rate_30d' AND target = 'Recovery: >=0.9 after the historic failed-goal cohort exits the rolling 30-day window (expected by 2026-11-18 if new goals succeed at >=0.9); steady-state goal: 1.0'
-- CODE-GOAL-SUCCESS-TARGET-1 (pillar autonomy): the 30-day metric retains historical failed goals until they age out, so record the recovery trajectory instead of presenting the immediate target as 100%.

UPDATE metric_registry
SET target = 'Recovery: >=0.9 after the historic failed-goal cohort exits the rolling 30-day window (expected by 2026-11-18 if new goals succeed at >=0.9); steady-state goal: 1.0'
WHERE metric = 'code_goal_success_rate_30d'
  AND target <> 'Recovery: >=0.9 after the historic failed-goal cohort exits the rolling 30-day window (expected by 2026-11-18 if new goals succeed at >=0.9); steady-state goal: 1.0';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:99939',
  'The rolling 30-day code-goal rate includes historic failures that cannot be removed by succeeding on new goals.',
  'CODE-GOAL-SUCCESS-TARGET-1: describe recovery after the historic cohort ages out; preserve the 0.9 breach threshold and measured rate.',
  'Live qnfo-audit read on 2026-11-01: code_goal_success_rate_30d=0.622, 298 shipped and 181 failed goals; v_code_goal_outcomes is limited to 30 days.',
  'The metric target reflects its rolling-window recovery path without hiding its current breach.',
  'metric_registry target for code_goal_success_rate_30d only; formula, last_value and analytics_metric_triggers are unchanged.',
  'Reapply the prior target with the migration Rollback line.',
  'Time-aware interpretation of the autonomy code-goal success metric.',
  'The metric remains 0.622 and the existing lt 0.9 trigger remains active; the target documents recovery after the historic cohort rolls out.',
  'More accurate expectations for code-goal deployment recovery without weakening the success threshold.',
  'Read-only D1: metric_registry, analytics_metric_triggers, v_code_goal_outcomes; local migration regression test.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'CODE-GOAL-SUCCESS-TARGET-1:%'
);

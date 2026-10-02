-- SELF-REPAIR-1 (qnfo-code-orchestrator 0.3.6, agent_issues #1768, pillar autonomy). Idempotent; apply after the 0.3.6 deploy.
--
-- Owner note on the dashboard card code:ct_qldqse7ngltdth: "this is not a user problem audit and fix yourself". From 0.3.6 a code
-- task whose model attempts are exhausted no longer parks as needs_human (an owner card): it retries in backoff rounds and then
-- ends 'failed' with one agent_issues row for the fleet. code_task_success_rate_30d counted only (merged, needs_human, closed) as
-- finished, so without this change a 'failed' task would drop out of the denominator and the rate would rise by hiding failures,
-- which the metric's own trigger forbids ("Never lower the verification bar to raise the rate").
-- Measured before (2026-10-02 07:2xZ): last_value 0.6 (3 merged of 5 finished); the replaced text occurs exactly once in the
-- metric-refresh definition.

UPDATE fleet_tasks
   SET definition = replace(definition, 'status IN (''merged'', ''needs_human'', ''closed'')', 'status IN (''merged'', ''needs_human'', ''closed'', ''failed'')'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE id = 'metric-refresh'
   AND instr(definition, 'status IN (''merged'', ''needs_human'', ''closed'')') > 0;

UPDATE metric_registry
   SET formula = 'count(status = merged) / count(status IN (merged, needs_human, closed, failed)) over code_tasks created in the last 30d; n/a under 3 finished. failed = the model ladder was exhausted over the SELF-REPAIR-1 retry rounds and the task was handed to the fleet as an agent_issue'
 WHERE metric = 'code_task_success_rate_30d'
   AND instr(formula, 'failed') = 0;

UPDATE analytics_metric_triggers
   SET action = replace(action, 'Read code_tasks WHERE status = ''needs_human''', 'Read code_tasks WHERE status IN (''needs_human'', ''failed'')')
 WHERE metric_key = 'code_task_success_rate_30d'
   AND instr(action, 'Read code_tasks WHERE status = ''needs_human''') > 0;

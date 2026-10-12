-- OPS-BUDGET-BAIL-METRIC-1 (2026-10-12, pillar autonomy; agent_issues 2014 TP-6-DURABLE-EXECUTION-1, lever 1).
-- The closing contract of issue 2014 reads metric_registry.ops_tool_budget_bail_7d and has answered "pending: metric
-- ops_tool_budget_bail_7d not registered yet" since 2026-10-06, so the first half of the TP-6 definition of done
-- (ops_tool_budget_bail 0 in 7 days) was never measured. This file registers the metric and refreshes it hourly.
-- Measured 2026-10-12 05:30Z: 10 cloud_ops_events rows of kind ops_tool_budget_bail in 7 days, the newest at
-- 2026-10-06T07:53:58Z; 5 ops_budget_promote rows since 2026-10-05, the newest at 2026-10-06T07:45:01Z (BUDGET-AUTO-PROMOTE-1
-- hands an owner turn that reaches the interactive budget to the durable job queue). fleet_budget cron_schedules is 50 of 50.
-- Trigger exemption (METRIC-CLOSED-LOOP-1): no analytics_metric_triggers row. The metric is the measure of one umbrella
-- issue that is already open with its probe (contract issue-2014, which also reads fleet_budget cron_schedules <= 40); a
-- trigger would file a second issue for the same state.
-- Idempotent: INSERT OR IGNORE, CREATE TRIGGER IF NOT EXISTS, UPDATE. No DELETE or DROP outside the rollback.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS ops_budget_bail_tick; DELETE FROM metric_registry WHERE metric = 'ops_tool_budget_bail_7d'

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('ops_tool_budget_bail_7d', 'operational', 'target', 'COUNT(*) of cloud_ops_events rows with kind = ops_tool_budget_bail in the last 7 days: ops agent runs that stopped at the interactive tool budget (TP-6 lever 1)', 'qnfo-audit.cloud_ops_events (qnfo-ops TOOLBUDGET-BAIL-RECORD-1)', '28 in 7 days on 2026-10-06; 10 on 2026-10-12', '0', 'qnfo-ops', 'exempt from a trigger: measured for agent_issues 2014, whose contract issue-2014 reads it (OPS-BUDGET-BAIL-METRIC-1)', '1h', NULL, NULL, NULL, NULL, 'UNMEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS ops_budget_bail_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'ops_tool_budget_bail' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT)
  WHERE metric = 'ops_tool_budget_bail_7d';
END;

UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
  last_value = CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'ops_tool_budget_bail' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT)
WHERE metric = 'ops_tool_budget_bail_7d';

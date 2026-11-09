-- CODE-AGENT-UX-1.1 (issue 8241 / agent_issues 1002219): runs never die silently. qnfo-agents 0.16.0 beats a heartbeat per step (runs.last_beat_ms, last_tool) and closes a stale run
-- as failed with 'abandoned: no progress for N minutes (last tool: X)'. This registers the metric that grades it, with its trigger and cause (METRIC-CAUSE-AT-REGISTRATION-1).
-- Baseline 2026-11-06 (cf_agent_runs, 7 days): 2121 runs, 53 failed, 24 abandoned. Prediction: after the heartbeat deploy the metric falls to <= 5 and a failure names its last tool.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS cmd_run_abandoned_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'cmd_run_abandoned_7d'; DELETE FROM metric_breach_cause WHERE metric_key = 'cmd_run_abandoned_7d'; DELETE FROM metric_registry WHERE metric = 'cmd_run_abandoned_7d'

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
VALUES
  ('cmd_run_abandoned_7d', 'operational', 'leading',
   'COUNT(*) FROM cf_agent_runs WHERE status = failed AND error LIKE abandoned% AND created_ms in the last 7 days (cmd_run_abandoned)',
   'qnfo-audit.cf_agent_runs (CODE-AGENT-UX-1.1)',
   '24', '0', 'qnfo-agents',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control)', 'hourly', '> 5', '> 25',
   CAST((SELECT COUNT(*) FROM cf_agent_runs WHERE status = 'failed' AND error LIKE 'abandoned%' AND created_ms > (strftime('%s','now') - 7*86400)*1000) AS TEXT),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('cmd_run_abandoned_7d', 'Command-line agent runs are being abandoned', 'registry', 'gt', 5, 5,
   'CODE-AGENT-UX-1.1: select id, caller, error from cf_agent_runs where status = failed and error like abandoned% order by created_ms desc; the error names the last tool. Group by that tool and fix the step that stalls (a tool without a timeout, a model call that never returns).
code-task: repo=qnfo-workers path=qnfo-agents/src/index.ts
code-anchor: private async executeTurn(turn: number) {',
   'qnfo-agents', 'agent_issues', 2, 1,
   'CODE-AGENT-UX-1.1: the trigger is the closing probe for runs that die without a visible reason.');

INSERT OR REPLACE INTO metric_breach_cause (metric_key, cause_key) VALUES ('cmd_run_abandoned_7d', 'code-loop');

CREATE TRIGGER IF NOT EXISTS cmd_run_abandoned_tick
AFTER INSERT ON fleet_tick
WHEN COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = 'cmd_run_abandoned_7d'), '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')
BEGIN
  UPDATE metric_registry
  SET last_value = CAST((SELECT COUNT(*) FROM cf_agent_runs WHERE status = 'failed' AND error LIKE 'abandoned%' AND created_ms > (strftime('%s','now') - 7*86400)*1000) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'cmd_run_abandoned_7d';
END;

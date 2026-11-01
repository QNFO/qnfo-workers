-- ISSUE-FAMILY-THROUGHPUT-ACTION-1 (2026-11-01, charter pillar autonomy).
-- The existing v_issue_family_throughput view measured the largest family but no trigger consumed it.
-- Live baseline 2026-11-01 09:22Z: RESEARCH-TERMINAL opened 7, closed 0, 13 open, net inflow 7, oldest 121.5 h.
-- Measure the largest positive net inflow with an open backlog on each 10-minute fleet tick. The existing
-- qnfo-fleet-control metric-trigger evaluator files the doer issue and closes it only after the metric recovers.
-- Idempotent: INSERT OR IGNORE, CREATE TRIGGER IF NOT EXISTS, and guarded decision_log insert.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS issue_family_throughput_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'largest_issue_family_net_inflow_24h'; DELETE FROM metric_registry WHERE metric = 'largest_issue_family_net_inflow_24h'; DELETE FROM decision_log WHERE action LIKE 'ISSUE-FAMILY-THROUGHPUT-ACTION-1:%'

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
VALUES
  ('largest_issue_family_net_inflow_24h', 'operational', 'target',
   'Maximum net_inflow_24h among v_issue_family_throughput rows with open_now > 0 and net_inflow_24h > 0; 0 when no open family has positive net inflow',
   'qnfo-audit.v_issue_family_throughput (ISSUE-THROUGHPUT-1)',
   CAST(COALESCE((SELECT MAX(net_inflow_24h) FROM v_issue_family_throughput WHERE net_inflow_24h > 0 AND open_now > 0), 0) AS TEXT),
   '0 (no open family has positive net inflow)', 'qnfo-fleet-control',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control)', '10m', '> 0', '> 0',
   CAST(COALESCE((SELECT MAX(net_inflow_24h) FROM v_issue_family_throughput WHERE net_inflow_24h > 0 AND open_now > 0), 0) AS TEXT),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('largest_issue_family_net_inflow_24h', 'Largest open issue family is gaining backlog', 'registry', 'gt', 0, 7,
   'ISSUE-THROUGHPUT-1: read the top row from v_issue_family_throughput where net_inflow_24h>0 and open_now>0, ordered by net_inflow_24h, open_now, oldest_open_h descending. Add that family a doer or verified close probe. The metric recovers after 60 minutes with no positive open-family net inflow.',
   'qnfo-fleet-control', 'agent_issues', 2, 1,
   'ISSUE-FAMILY-THROUGHPUT-ACTION-1: the trigger is the closing probe for the largest open family with positive net inflow.');

CREATE TRIGGER IF NOT EXISTS issue_family_throughput_tick
AFTER INSERT ON fleet_tick
WHEN COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = 'largest_issue_family_net_inflow_24h'), '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')
BEGIN
  UPDATE metric_registry
  SET last_value = CAST(COALESCE((SELECT MAX(net_inflow_24h) FROM v_issue_family_throughput
                                  WHERE net_inflow_24h > 0 AND open_now > 0), 0) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
      state = 'MEASURED'
  WHERE metric = 'largest_issue_family_net_inflow_24h';
END;

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot-5505',
  'The family-throughput view is not actionable until the fleet control loop monitors and routes its largest positive open backlog.',
  'ISSUE-FAMILY-THROUGHPUT-ACTION-1: register a 10-minute metric and qnfo-fleet-control trigger for the largest open issue-family net inflow.',
  'Live qnfo-audit read 2026-11-01 09:22Z: RESEARCH-TERMINAL opened 7, closed 0, open 13, net inflow 7, oldest open 121.5 h; the existing v_issue_family_throughput view had no consumer.',
  'Migration adds an actionable metric trigger with a 60-minute recovery probe.',
  'One metric row, one metric trigger, one fleet_tick refresh trigger, one decision_log row.',
  'DROP TRIGGER issue_family_throughput_tick and remove the named metric, trigger, and decision_log rows.',
  'qnfo-fleet-control automatically identifies the largest open family with positive net inflow, files one doer issue, and closes it only after the family backlog metric recovers.',
  'The metric reads the live maximum (7 at baseline) and dispatches a doer within the next fleet tick; it returns to 0 only after no open family has positive net inflow for the existing 60-minute recovery window. No spend or output-quality path changes.',
  'Not a reach change; improves evidence-backed issue throughput.',
  'cloudflare-api: read-only qnfo-audit v_issue_family_throughput; node:sqlite fixture; scripts/apply_migrations.py --check'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log WHERE action LIKE 'ISSUE-FAMILY-THROUGHPUT-ACTION-1:%'
);

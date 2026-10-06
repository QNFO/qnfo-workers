-- COST-ATTRIBUTION-GAP-1 (2026-10-06, pillar cost, transformation lever T4.7). Measured 2026-10-06 09:00Z: the AI Gateway
-- metered $33.21 of paid-provider list cost in 7 days (deepseek-flash $19.87 over 12,246 requests, deepseek-v4-pro $9.63;
-- cf-ops-actions gateway-cost run 94) while ai_spend_ledger, the fleet's per-caller spend ledger (qnfo-ai spendRecord,
-- qnfo-ai-search, qnfo-code-orchestrator), carried $0.44 of DeepSeek over the same days: 98.7% of the paid cost has no
-- caller, so no loop, lever or cap can act on it (unified_cost_usd_30d breaches its cap with nobody to charge). The metric
-- is written hourly by qnfo-fleet-control 0.4.139 refreshOwnedMetrics from one 7-day GraphQL read and one ledger read;
-- the per-provider figures are in cloud_ops_events cost-attribution-<day>. Workers AI is excluded here (its attribution
-- is workers_ai_attribution_coverage_pct). Guard metric with its trigger and a contract probe. Idempotent.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'cost_attribution_gap_pct'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'cost_attribution_gap_pct'; DELETE FROM remediation_contracts WHERE class = 'cost-attribution-gap-1';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('cost_attribution_gap_pct', 'fleet', 'guard',
  '100 x (1 - SUM(ai_spend_ledger.usd, provider <> workers-ai, last 7 days) / SUM(aiGatewayRequestsAdaptiveGroups.sum.cost, provider <> workers-ai, last 7 days)), floored at 0 and capped at 100; 0 when the gateway cost is under $0.50 (COST-ATTRIBUTION-GAP-1, qnfo-fleet-control refreshOwnedMetrics, hourly). Per provider in cloud_ops_events cost-attribution-<day>',
  'CF GraphQL aiGatewayRequestsAdaptiveGroups (7d, paid providers) x qnfo-audit.ai_spend_ledger (7d, paid providers); detail cloud_ops_events kind cost-attribution',
  '98.7 on 2026-10-06 (gateway $33.21 vs ledger $0.44 over 7 days, read by hand before the writer landed)',
  '< 25 for 7 consecutive days (every paid request names its caller)',
  'qnfo-ai',
  'trigger gt 25 -> METRIC-TRIGGER issue naming the unattributed provider and model (migrations/2026-10-06-cost-attribution-gap.sql)',
  'hourly', '> 25', '> 50', 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'cost_attribution_gap_pct', 'Cost gap: most paid AI Gateway cost has no caller in ai_spend_ledger', 'registry', 'gt', 25, 5,
  'Pillar cost (COST-ATTRIBUTION-GAP-1, lever T4.7). Over the last 7 days more than a quarter of the paid-provider cost the AI Gateway metered has no ai_spend_ledger row, so no caller, loop or lever can be charged with it and the spend caps breach with nobody to act. Read cloud_ops_events cost-attribution-<day> (kind cost-attribution): by_provider names each provider''s gateway and ledger figures and top_models the models with the largest unattributed cost. Find the caller with cf-ops-actions gateway-logs --model <model> (workflow_dispatch; the rows carry the request metadata and byok flag). Levers, in order: (1) a fleet worker that calls the gateway directly (qnfo-ops model ladder, personal-api, ops-gateway, personal-companion): route it through qnfo-ai over a service binding with props.caller (#1703), or have it write its own ai_spend_ledger rows with caller = its worker name and the SPEND_PRICES rate; (2) the owner''s desktop client or an agent session: tag its requests with cf-aig-metadata caller=owner-client so the ledger can record them as owner spend outside the fleet run rate; (3) a model the ledger prices at 0: add it to SPEND_PRICES in qnfo-ai. Never raise a cap (STRATEGY s4) and never add a paid model call while a fleet_budget cap is breached (HARD LIMITS). Definition of done: cost_attribution_gap_pct under 25 on 7 consecutive days; record the caller found and the before/after figures in issue_triage.close_evidence.',
  'qnfo-ai', 'agent_issues', 168, 1, 'COST-ATTRIBUTION-GAP-1 (migrations/2026-10-06-cost-attribution-gap.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'cost_attribution_gap_pct');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
VALUES ('cost-attribution-gap-1', NULL,
  'qnfo-fleet-control 0.4.139+ deployed with CF_API_TOKEN (GraphQL read)',
  'observe only: refreshOwnedMetrics writes cost_attribution_gap_pct hourly and cloud_ops_events cost-attribution-<day>',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''cost_attribution_gap_pct'') IS NULL THEN ''pending: not measured yet'' WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''cost_attribution_gap_pct'') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'') THEN ''stale: last write older than 3h'' ELSE ''ok'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 24, 'active');

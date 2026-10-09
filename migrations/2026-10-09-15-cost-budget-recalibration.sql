-- COST-BUDGET-RECALIBRATION-1 (2026-10-09, pillar cost; owner request 2026-10-09: "$2.59/day is more realistic than $0.50/day
-- so make sure targets are realistic for actual usage. Also make sure total monthly budget includes actual usage across
-- Cloudflare fleet and all billing ... extrapolate from last 7-10 days rather than last 30 days").
-- Measured by the first ledger run (scripts/cost_ledger.py, remediation-consumer run 37975979833, v_cost_run_rate), 30-day
-- projections from the 7-day mean [10-day mean]:
--   Workers AI 62.09 [67.99] (daily 1.32-3.66 over 10 days); AI Gateway deepseek 12.56 [89.11] (BYOK, the owner's desktop
--   clients; nothing since 10-06), openai 0 [0]; Cloudflare plan 5.00 (subscriptions API: Workers Paid 5.00/monthly; the
--   seeded 200 baseline overstated it); Cloudflare + gateway 79.65 [162.09]; owner-stated direct providers 450 (unverified);
--   all billing 529.65 [612.09].
-- Budgets from that usage, with headroom over the 10-day figure, and the owner's own figure of 2.59/day for Workers AI:
--   Workers AI: target 78/30d (2.59/day), cap 95 (was target 15, cap 25; metric targets 7.50 and 15, triggers at 10 and 15).
--   deepseek: target 25, cap 50; openai: target 20, cap 60; anthropic unchanged (10/15); unified total (the owner's gateway
--     cap) unchanged at 150.
--   Cloudflare + gateway (fleet_cost_run_rate_usd): target 130, trigger over 160 (Workers AI 95 + plan 5 + gateway 60).
--   All billing (monthly_cost_run_rate_usd): target 580, trigger over 650 (160 + the owner-stated 450 + 40).
-- qnfo-fleet-control 0.12.2 (same PR) meters the fleet_budget ai_spend caps on the 7-day run rate, so a cap reads breached
-- only while recent usage is over it; the dashboard's investment verdict reads ai_spend:total and follows.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_budget SET cap = 25, target = 15 WHERE node_class = 'ai_spend:workers-ai'; UPDATE fleet_budget SET target = 40 WHERE node_class IN ('ai_spend:deepseek', 'ai_spend:openai'); UPDATE analytics_metric_triggers SET threshold = 10 WHERE id = 354; UPDATE analytics_metric_triggers SET threshold = 15 WHERE id = 409; DELETE FROM analytics_metric_triggers WHERE notes LIKE 'COST-BUDGET-RECALIBRATION-1%'

UPDATE fleet_budget SET cap = 95, target = 78, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE node_class = 'ai_spend:workers-ai';
UPDATE fleet_budget SET target = 25, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE node_class = 'ai_spend:deepseek';
UPDATE fleet_budget SET target = 20, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE node_class = 'ai_spend:openai';

UPDATE metric_registry SET target = '<= 95 (realistic: 2.59/day = 78/30d, owner 2026-10-09; COST-BUDGET-RECALIBRATION-1)' WHERE metric = 'workers_ai_cost_30d_usd';
UPDATE metric_registry SET target = '<= 95 (Workers AI at 2.59/day plus the qnfo-ai router; COST-BUDGET-RECALIBRATION-1)' WHERE metric = 'fleet_ai_run_rate_30d_usd';
UPDATE metric_registry SET target = '<= 78 (2.59/day, owner 2026-10-09)', disposition_actor = 'trigger gt 95' WHERE metric = 'workers_ai_run_rate_usd';
UPDATE metric_registry SET target = '<= 130 (Workers AI + Cloudflare plan + AI Gateway, 7-day run rate x30)', disposition_actor = 'trigger gt 160' WHERE metric = 'fleet_cost_run_rate_usd';
UPDATE metric_registry SET target = '<= 580 (fleet + gateway + owner-stated direct providers, 7-day run rate x30)', disposition_actor = 'trigger gt 650' WHERE metric = 'monthly_cost_run_rate_usd';

UPDATE analytics_metric_triggers SET threshold = 95, notes = COALESCE(notes, '') || ' | COST-BUDGET-RECALIBRATION-1 2026-10-09: threshold 10 -> 95 (realistic usage)' WHERE id = 354 AND metric_key = 'workers_ai_cost_30d_usd';
UPDATE analytics_metric_triggers SET threshold = 95, notes = COALESCE(notes, '') || ' | COST-BUDGET-RECALIBRATION-1 2026-10-09: threshold 15 -> 95 (realistic usage)' WHERE id = 409 AND metric_key = 'fleet_ai_run_rate_30d_usd';

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.column1, v.column2, 'registry', 'gt', v.column3, 2, v.column4, v.column5, 'agent_issues', 24, 1, 'COST-BUDGET-RECALIBRATION-1 (migrations/2026-10-09-15-cost-budget-recalibration.sql)'
FROM (VALUES
  ('workers_ai_run_rate_usd', 'Cost: Workers AI 7-day run rate over 95/30d', 95, 'Pillar cost. Read cost_daily source workers_ai for the last 7 days and ai_call_counters grouped by worker and purpose: the top neuron consumer is the lever (research-exec stages, q08). Levers in order: the lean ensemble at a breached cap (research-exec 0.11.1), cheaper models with a fallback (OWNER-STANDING-GRANT-1), fewer research slots (ops_config research_parallel). Done: workers_ai_run_rate_usd <= 95 at two refreshes.', 'qnfo-research-exec'),
  ('fleet_cost_run_rate_usd', 'Cost: Cloudflare + AI Gateway 7-day run rate over 160/30d', 160, 'Pillar cost. Read v_cost_run_rate: the source over its share is the lever (workers_ai, ai_gateway:<provider>, cloudflare_plan:daily). Gateway spend by the owner''s own clients is in ai_spend_owner_local and is the owner''s to steer; fleet callers are in ai_spend_ledger. Done: fleet_cost_run_rate_usd <= 160 at two refreshes.', 'qnfo-fleet-control'),
  ('monthly_cost_run_rate_usd', 'Cost: all-billing 7-day run rate over 650/30d', 650, 'Pillar cost. All billing = fleet + gateway + the owner-stated direct providers (450/30d, unverified). Read v_cost_run_rate total:all-billing and the per-source rows; the fleet part has the levers above, the owner-stated part changes only when the owner restates it (cost_daily direct_providers_external). Done: monthly_cost_run_rate_usd <= 650 at two refreshes.', 'qnfo-fleet-control')
) v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.column1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'budgets set from measured recent usage are realistic and stop false breaches from old spend', 'recalibrated AI cost caps, targets and triggers from the 7/10-day run rate of the all-billing ledger; ai_spend caps meter the 7-day run rate (qnfo-fleet-control 0.12.2)', 'run 37975979833: Workers AI 62.09 [67.99], deepseek 12.56 [89.11], plan 5.00, fleet+gateway 79.65 [162.09], all billing 529.65 [612.09] per 30d', 'caps and targets match actual usage; a breach means recent spend is over budget', 'fleet_budget ai_spend rows, five metric triggers, lean-mode callers', 'the Rollback line', 'an all-billing monthly budget projected from recent days', 'within 24 h of deploy, ai_spend:workers-ai reads about 62 (not 59.70 over 30 days) and is under its 95 cap, ai_spend:deepseek reads about 13 (not 169), and research-exec leaves lean mode unless recent spend is over a cap', NULL, 'GraphQL Workers AI and AI Gateway, subscriptions API, D1 ledger'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'recalibrated AI cost caps%');

-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261021c_v_cost_forecast
-- Rollback: DROP VIEW IF EXISTS v_cost_forecast; CREATE VIEW v_cost_forecast AS <sql in bak_20261021c_v_cost_forecast>; DELETE FROM metric_registry WHERE metric IN ('fleet_cost_bound_month_usd', 'research_neurons_per_publication_7d', 'billed_ai_gateway_mtd_usd'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('fleet_cost_bound_month_usd', 'research_neurons_per_publication_7d', 'billed_ai_gateway_mtd_usd');
-- COST-SUSTAIN-3 (2026-10-21, owner: research and publication <= USD 300/month all-in, quality must not drop; realistic use metrics and forecasting).
-- Failure modes this closes:
--   (1) the month-end forecast extrapolated the last 3 days only (USD 47/day -> USD 764 for October, pace USD 1,417/30d) and ignored
--       the hard daily budgets that now bound spend (research_daily_neurons, q08_daily_neurons, code_loop_daily_calls). A forecast that
--       cannot see its own caps overstates the future after a cap lands and understates it if a cap is removed. v_cost_forecast now
--       carries bound_daily_usd (the most the fleet can spend per day under the configured caps plus the measured uncapped remainder)
--       and forecast_bounded_month_usd = month-to-date + remaining days x min(3-day pace, bound).
--   (2) no metric tied spend to output: research_neurons_per_publication_7d (neurons of the research budget group per research_queue
--       publication, 7 complete days) is the unit cost the owner judges sustainability by.
--   (3) every cost figure was a list-price estimate; billed_ai_gateway_mtd_usd is the provider's own draft invoice (AI Gateway billing
--       invoice-preview, cents / 100) written by scripts/cost_ledger.py, the only billed number the API exposes before the 27th.
CREATE TABLE IF NOT EXISTS bak_20261021c_v_cost_forecast AS SELECT name, sql FROM sqlite_master WHERE name = 'v_cost_forecast';
DROP VIEW IF EXISTS v_cost_forecast;
CREATE VIEW v_cost_forecast AS
WITH b AS (
  SELECT date('now', 'start of month') AS m0, date('now') AS d0,
    CAST(julianday(date('now', 'start of month', '+1 month')) - julianday(date('now', 'start of month')) AS INTEGER) AS dim,
    CAST(julianday(date('now')) - julianday(date('now', 'start of month')) AS INTEGER) AS done
), cfg AS (
  SELECT
    COALESCE((SELECT CAST(value AS REAL) FROM ops_config WHERE key = 'research_daily_neurons'), 360000) AS research_n,
    COALESCE((SELECT CAST(value AS REAL) FROM ops_config WHERE key = 'q08_daily_neurons'), 150000) AS q08_n,
    COALESCE((SELECT CAST(value AS REAL) FROM ops_config WHERE key = 'code_loop_daily_calls'), 1500) AS code_calls
), meas AS (
  SELECT
    COALESCE((SELECT SUM(neurons) * 1.0 / NULLIF(SUM(calls), 0) FROM ai_call_counters WHERE worker = 'qnfo-code-orchestrator' AND day >= date('now', '-7 days') AND day < date('now')), 2000) AS code_npc,
    COALESCE((SELECT SUM(neurons) / 7.0 FROM ai_call_counters WHERE worker NOT IN ('qnfo-research-exec', 'errata-hub', 'qnfo-paper-reviser', 'q08-signal-engine', 'qnfo-code-orchestrator') AND day >= date('now', '-7 days') AND day < date('now')), 0) AS other_n
), c AS (
  SELECT date, usd,
    CASE WHEN source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR source = 'cloudflare_plan:daily' THEN 'fleet'
         WHEN instr(source, 'owner_gateway:') = 1 THEN 'owner_clients'
         WHEN source = 'direct_providers_external:daily' THEN 'owner_direct_unverified' END AS scope,
    CASE WHEN source = 'workers_ai' THEN 0 ELSE 1 END AS non_neuron
  FROM cost_daily WHERE date >= date('now', '-40 days')
), g AS (
  SELECT c.scope,
    SUM(CASE WHEN c.date >= b.m0 AND c.date < b.d0 THEN c.usd ELSE 0 END) AS mtd,
    SUM(CASE WHEN c.date = b.d0 THEN c.usd ELSE 0 END) AS today,
    SUM(CASE WHEN c.date >= date('now', '-3 days') AND c.date < b.d0 THEN c.usd ELSE 0 END) / 3.0 AS d3,
    SUM(CASE WHEN c.date >= date('now', '-7 days') AND c.date < b.d0 THEN c.usd ELSE 0 END) / 7.0 AS d7,
    SUM(CASE WHEN c.non_neuron = 1 AND c.date >= date('now', '-3 days') AND c.date < b.d0 THEN c.usd ELSE 0 END) / 3.0 AS d3_non_neuron,
    MAX(b.dim) AS dim, MAX(b.done) AS done
  FROM c, b WHERE c.scope IS NOT NULL GROUP BY c.scope
), bound AS (
  SELECT MAX(0, cfg.research_n + cfg.q08_n + cfg.code_calls * meas.code_npc + meas.other_n - 10000) * 0.011 / 1000 AS neuron_usd,
    cfg.research_n + cfg.q08_n + cfg.code_calls * meas.code_npc + meas.other_n AS neurons
  FROM cfg, meas
)
SELECT g.scope, ROUND(g.mtd, 2) AS mtd_complete_usd, ROUND(g.today, 2) AS today_partial_usd, ROUND(g.d3, 4) AS daily_3d, ROUND(g.d7, 4) AS daily_7d,
  ROUND(g.d3 * 30, 2) AS pace_30d_usd, ROUND(g.mtd + (g.dim - g.done) * g.d3, 2) AS forecast_month_usd, g.dim AS days_in_month, g.done AS complete_days,
  CASE WHEN g.scope = 'fleet' THEN 300 END AS budget_month_usd,
  CASE g.scope WHEN 'fleet' THEN 'measured: GraphQL Workers AI neurons + AI Gateway fleet cost + Cloudflare subscriptions'
             WHEN 'owner_clients' THEN 'measured: owner desktop clients on the gateway (ai_spend_owner_local)'
             ELSE 'UNVERIFIED owner-stated monthly figure / 30; no API sees it' END AS basis,
  CASE WHEN g.scope = 'fleet' THEN ROUND(bound.neuron_usd + g.d3_non_neuron, 4) END AS bound_daily_usd,
  CASE WHEN g.scope = 'fleet' THEN ROUND(bound.neurons) END AS bound_daily_neurons,
  CASE WHEN g.scope = 'fleet' THEN ROUND(g.mtd + (g.dim - g.done) * MIN(g.d3, bound.neuron_usd + g.d3_non_neuron), 2) ELSE ROUND(g.mtd + (g.dim - g.done) * g.d3, 2) END AS forecast_bounded_month_usd,
  CASE WHEN g.scope = 'fleet' THEN ROUND(30 * (bound.neuron_usd + g.d3_non_neuron), 2) END AS bound_30d_usd
FROM g, bound;

INSERT INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('fleet_cost_bound_month_usd', 'fleet', 'guard', '30 x v_cost_forecast.bound_daily_usd (scope fleet): the most the fleet can spend per day under research_daily_neurons + q08_daily_neurons + code_loop_daily_calls x measured neurons per code call + the measured 7-day uncapped remainder, at USD 0.011 per 1k neurons after 10k/day free, plus the 3-day non-neuron cost (gateway fleet traffic, plan). A cap set above the owner budget shows here before it is spent.', 'qnfo-audit.v_cost_forecast (scripts/cost_ledger.py hourly)', 'new 2026-10-21', '<= 300 (owner 2026-10-21, all-in)', 'scripts/cost_ledger.py', 'COST-SUSTAIN-3: ops_config research_daily_neurons / q08_daily_neurons / code_loop_daily_calls', 'hourly', '> 250', '> 300', 'PENDING', 'computed'),
 ('research_neurons_per_publication_7d', 'research', 'leading', 'SUM(ai_call_counters.neurons) of qnfo-research-exec + errata-hub + qnfo-paper-reviser over the 7 complete UTC days before today / COUNT(research_queue rows published in the same window); the unit cost of a published version', 'qnfo-audit.ai_call_counters x research_queue.published_at', '10-09..10-12: ~13.7k; 10-20: ~40k', '<= 20000', 'scripts/cost_ledger.py', 'COST-SUSTAIN-3: qnfo-research-exec (revise waste, context size)', 'hourly', '> 20000', '> 40000', 'PENDING', 'computed'),
 ('billed_ai_gateway_mtd_usd', 'fleet', 'lagging', 'AI Gateway billing invoice-preview amount_due + pretax credits applied, summed over invoice lines (cents / 100) for the current billing period; the provider-billed figure, not a list estimate', 'GET /accounts/{id}/ai-gateway/billing/invoice-preview (scripts/cost_ledger.py hourly)', 'new 2026-10-21', '<= 300', 'scripts/cost_ledger.py', 'COST-SUSTAIN-3', 'hourly', '> 250', '> 300', 'PENDING', 'computed')
 ON CONFLICT(metric) DO UPDATE SET formula = excluded.formula, target = excluded.target, warning_band = excluded.warning_band, kill_band = excluded.kill_band, source_of_truth = excluded.source_of_truth;

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
 ('fleet_cost_bound_month_usd', 'Cost: the configured daily caps allow more than USD 300/month (owner 2026-10-21)', 'registry', 'gt', 300, 9, 'Pillar cost. The caps themselves exceed the owner budget: read v_cost_forecast (bound_daily_neurons) and ops_config research_daily_neurons, q08_daily_neurons, code_loop_daily_calls; lower the largest cap or the uncapped remainder (ai_call_counters by worker, 7 days). Never lower a review, verify or claim gate. Done when fleet_cost_bound_month_usd <= 300.', 'qnfo-fleet-control', 'agent_issues', 24, 1, 'COST-SUSTAIN-3 2026-10-21'),
 ('research_neurons_per_publication_7d', 'Cost: research neurons per published version above 20k (7 days)', 'registry', 'gt', 20000, 7, 'Pillar cost. Unit cost of a publication rose: read cloud_ops_events kinds revise-noop, revise-shrink-refused, rerun-route and the review cycle counts for qnfo-research-exec (7 days); a paid call that produces no edit is the usual cause. Never lower a review, verify or claim gate. Done when research_neurons_per_publication_7d <= 20000 for 3 days.', 'qnfo-research-exec', 'agent_issues', 24, 1, 'COST-SUSTAIN-3 2026-10-21'),
 ('billed_ai_gateway_mtd_usd', 'Cost: AI Gateway billed month-to-date above USD 300', 'registry', 'gt', 300, 9, 'Pillar cost. The provider-billed figure passed the owner budget: compare with fleet_cost_forecast_month_usd and the per-worker counters; the gap is unattributed spend. Done when the billed month-to-date is below the budget at period end.', 'qnfo-fleet-control', 'agent_issues', 24, 1, 'COST-SUSTAIN-3 2026-10-21');

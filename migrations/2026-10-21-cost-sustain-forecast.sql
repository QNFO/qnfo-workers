-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261021_v_cost_forecast
-- Rollback: DROP VIEW IF EXISTS v_cost_forecast; DELETE FROM fleet_budget WHERE node_class = 'cost:fleet_all_in_month'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'fleet_cost_pace_30d_usd'; DELETE FROM metric_registry WHERE metric IN ('fleet_cost_pace_30d_usd', 'fleet_cost_forecast_month_usd'); DELETE FROM ops_config WHERE key IN ('research_daily_neurons', 'code_loop_daily_calls');
-- COST-SUSTAIN-1 (2026-10-21, owner directive: fleet research and publication <= USD 300/month all-in, quality must not drop; pillar cost).
-- Root causes this closes:
--   (1) every cost control was soft: the width governor and model order steer, nothing bounds a day. A throughput raise
--       (research_parallel 96 on 2026-10-18) took qnfo-research-exec from 0.25-0.35M to 3.5-4.2M neurons/day with nothing to stop it.
--       qnfo-research-exec 0.31.0 adds a hard daily neuron budget (research_daily_neurons) paced over the UTC day; work over the pace
--       waits for the next tick. 360,000 neurons = USD 3.96/day: 2026-10-09..12 ran at 252-345k neurons/day and published 22-31/day.
--   (2) the code loop's daily call cap defaulted to 1500 calls (~USD 29/day at the measured USD 0.0196/call); 100/day bounds it at ~USD 2.
--   (3) reporting projected a 7-day mean that mixed the owner's desktop Claude spend and an unverified USD 450/month placeholder into
--       one "all-billing" figure, so the fleet's own pace and the owner's monthly target had no metric. v_cost_forecast splits fleet
--       (Workers AI + AI Gateway fleet traffic + Cloudflare plan), owner clients, and the unverified owner-direct placeholder, with
--       month-to-date actuals, a 3-day pace (reacts to a change within days) and a month-end forecast. scripts/cost_ledger.py writes
--       fleet_cost_pace_30d_usd and fleet_cost_forecast_month_usd hourly; the trigger opens a cost issue when the pace exceeds USD 300.
-- No existing cap is raised (CORE-PROMPT-1 rule 8); a new, owner-set USD 300 fleet cap is added.

INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_daily_neurons', '360000', 'COST-SUSTAIN-1 2026-10-21: hard daily neuron budget for qnfo-research-exec + errata-hub + qnfo-paper-reviser, paced over the UTC day (qnfo-research-exec 0.31.0). 360k = USD 3.96/day. 0 disables (owner override only).', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at;
INSERT INTO ops_config (key, value, note, updated_at) VALUES ('code_loop_daily_calls', '100', 'COST-SUSTAIN-1 2026-10-21: code loop model calls per UTC day (default 1500 ~ USD 29/day at 0.0196/call measured 10-14..10-20). 100 ~ USD 2/day. Revert: delete row.', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at;

CREATE TABLE IF NOT EXISTS bak_20261021_v_cost_forecast AS SELECT name, sql FROM sqlite_master WHERE name = 'v_cost_forecast';
DROP VIEW IF EXISTS v_cost_forecast;
CREATE VIEW v_cost_forecast AS
WITH b AS (
  SELECT date('now', 'start of month') AS m0, date('now') AS d0,
    CAST(julianday(date('now', 'start of month', '+1 month')) - julianday(date('now', 'start of month')) AS INTEGER) AS dim,
    CAST(julianday(date('now')) - julianday(date('now', 'start of month')) AS INTEGER) AS done
), c AS (
  SELECT date, usd,
    CASE WHEN source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR source = 'cloudflare_plan:daily' THEN 'fleet'
         WHEN instr(source, 'owner_gateway:') = 1 THEN 'owner_clients'
         WHEN source = 'direct_providers_external:daily' THEN 'owner_direct_unverified' END AS scope
  FROM cost_daily WHERE date >= date('now', '-40 days')
), g AS (
  SELECT c.scope,
    SUM(CASE WHEN c.date >= b.m0 AND c.date < b.d0 THEN c.usd ELSE 0 END) AS mtd,
    SUM(CASE WHEN c.date = b.d0 THEN c.usd ELSE 0 END) AS today,
    SUM(CASE WHEN c.date >= date('now', '-3 days') AND c.date < b.d0 THEN c.usd ELSE 0 END) / 3.0 AS d3,
    SUM(CASE WHEN c.date >= date('now', '-7 days') AND c.date < b.d0 THEN c.usd ELSE 0 END) / 7.0 AS d7,
    MAX(b.dim) AS dim, MAX(b.done) AS done
  FROM c, b WHERE c.scope IS NOT NULL GROUP BY c.scope
)
SELECT scope, ROUND(mtd, 2) AS mtd_complete_usd, ROUND(today, 2) AS today_partial_usd, ROUND(d3, 4) AS daily_3d, ROUND(d7, 4) AS daily_7d,
  ROUND(d3 * 30, 2) AS pace_30d_usd, ROUND(mtd + (dim - done) * d3, 2) AS forecast_month_usd, dim AS days_in_month, done AS complete_days,
  CASE WHEN scope = 'fleet' THEN 300 END AS budget_month_usd,
  CASE scope WHEN 'fleet' THEN 'measured: GraphQL Workers AI neurons + AI Gateway fleet cost + Cloudflare subscriptions'
             WHEN 'owner_clients' THEN 'measured: owner desktop clients on the gateway (ai_spend_owner_local)'
             ELSE 'UNVERIFIED owner-stated monthly figure / 30; no API sees it' END AS basis
FROM g;

INSERT OR IGNORE INTO fleet_budget (node_class, cap, target, current, unit, updated_at) VALUES ('cost:fleet_all_in_month', 300, 250, 0, 'usd_30d_pace', datetime('now'));

INSERT INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('fleet_cost_pace_30d_usd', 'fleet', 'guard', '30 x mean daily fleet cost of the 3 complete UTC days before today (v_cost_forecast scope fleet): Workers AI billed neurons + AI Gateway fleet traffic + Cloudflare plan; excludes the owner desktop clients and the unverified owner-direct placeholder', 'qnfo-audit.v_cost_forecast (cost_daily, scripts/cost_ledger.py hourly)', 'new 2026-10-21', '<= 300 (owner 2026-10-21, all-in)', 'scripts/cost_ledger.py', 'COST-SUSTAIN-1: qnfo-research-exec research_daily_neurons; code_loop_daily_calls; per-worker ai_call_counters', 'hourly', '> 250', '> 300', 'PENDING', 'computed'),
 ('fleet_cost_forecast_month_usd', 'fleet', 'lagging', 'v_cost_forecast scope fleet: month-to-date complete days + remaining days x 3-day mean', 'qnfo-audit.v_cost_forecast', 'new 2026-10-21', '<= 300', 'scripts/cost_ledger.py', 'COST-SUSTAIN-1', 'hourly', '> 250', '> 300', 'PENDING', 'computed')
 ON CONFLICT(metric) DO UPDATE SET formula = excluded.formula, target = excluded.target, warning_band = excluded.warning_band, kill_band = excluded.kill_band;

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
 ('fleet_cost_pace_30d_usd', 'Cost: fleet 30-day pace above USD 300 all-in (owner 2026-10-21)', 'registry', 'gt', 300, 9,
  'Pillar cost. Read ai_call_counters for the last 3 days grouped by worker and purpose; the top consumer is the lever. Levers that keep quality: lower ops_config research_daily_neurons (paced, nothing skipped), code_loop_daily_calls, revision cadence (revision_loop_min_age_min), stage width (research_parallel_lean). Never lower a review, verify or claim gate. Done when fleet_cost_pace_30d_usd <= 300 for 3 consecutive days; record before and after in issue_triage.close_evidence.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'COST-SUSTAIN-1 2026-10-21');

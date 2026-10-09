-- COST-RUN-RATE-1 (2026-10-09, pillar cost; owner request 2026-10-09: "$2.59/day is more realistic than $0.50/day so make
-- sure targets are realistic for actual usage. Also make sure total monthly budget includes actual usage across Cloudflare
-- fleet and all billing. Since latest usage is moderate may be best to extrapolate from last 7-10 days rather than last 30").
-- cost_daily (one row per date and source) had one seeded row per source from 2026-09-26 and no daily writer since;
-- scripts/cost_ledger.py (remediation-consumer.yml, hourly) now writes the last 10 days for every billing source: Workers AI
-- (account-wide neurons), AI Gateway per provider (unified credit and BYOK), the Cloudflare plan per day, and the owner's
-- stated direct-provider spend per day (unverified). This file adds the projection and its metrics:
--   v_cost_run_rate: per source and two totals, the 7-day and 10-day mean daily cost over complete days x 30. The divisor is
--     the number of days the ledger covers (workers_ai rows), so a provider with no traffic on a day counts that day as 0.
--     total:cloudflare+gateway = Workers AI + AI Gateway + Cloudflare plan; total:all-billing adds the owner's direct spend.
--   metrics monthly_cost_run_rate_usd (all billing), fleet_cost_run_rate_usd (Cloudflare + gateway) and
--     workers_ai_run_rate_usd, refreshed hourly by cost_run_rate_tick. Their triggers and the recalibrated caps are written
--     by 2026-10-09-15-cost-budget-recalibration.sql from the first measured run (exemption until then, recorded here).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS cost_run_rate_tick; DROP VIEW IF EXISTS v_cost_run_rate; DELETE FROM metric_registry WHERE metric IN ('monthly_cost_run_rate_usd','fleet_cost_run_rate_usd','workers_ai_run_rate_usd')

CREATE VIEW IF NOT EXISTS v_cost_run_rate AS
SELECT source_group,
  ROUND(SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 4) AS daily_7d,
  ROUND(SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 4) AS daily_10d,
  ROUND(30 * SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 2) AS run_rate_30d_7d,
  ROUND(30 * SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 2) AS run_rate_30d_10d
FROM (
  SELECT date, source AS source_group, usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR instr(source, ':daily') > 0)
  UNION ALL
  SELECT date, 'total:cloudflare+gateway', usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR source = 'cloudflare_plan:daily')
  UNION ALL
  SELECT date, 'total:all-billing', usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR instr(source, ':daily') > 0)
)
GROUP BY source_group;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('monthly_cost_run_rate_usd', 'operational', 'target', '30 x mean daily cost over the last 7 complete days, all billing: Workers AI + AI Gateway (all providers) + Cloudflare plan + owner-stated direct providers (v_cost_run_rate total:all-billing)', 'qnfo-audit.cost_daily (scripts/cost_ledger.py)', 'measured at first ledger run', 'set from the measured run rate by 2026-10-09-15', 'qnfo-fleet-control', 'trigger written by 2026-10-09-15 (exemption until the first measured run)', '1h', NULL, NULL, NULL, NULL, 'MEASURED', 'computed'),
 ('fleet_cost_run_rate_usd', 'operational', 'target', '30 x mean daily cost over the last 7 complete days: Workers AI + AI Gateway + Cloudflare plan (v_cost_run_rate total:cloudflare+gateway)', 'qnfo-audit.cost_daily (scripts/cost_ledger.py)', 'measured at first ledger run', 'set from the measured run rate by 2026-10-09-15', 'qnfo-fleet-control', 'trigger written by 2026-10-09-15 (exemption until the first measured run)', '1h', NULL, NULL, NULL, NULL, 'MEASURED', 'computed'),
 ('workers_ai_run_rate_usd', 'operational', 'target', '30 x mean daily Workers AI cost over the last 7 complete days, account-wide neurons at $0.011/1k after 10k/day free (v_cost_run_rate workers_ai)', 'qnfo-audit.cost_daily (scripts/cost_ledger.py)', 'measured at first ledger run', 'set from the measured run rate by 2026-10-09-15', 'qnfo-research-exec', 'trigger written by 2026-10-09-15 (exemption until the first measured run)', '1h', NULL, NULL, NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS cost_run_rate_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT run_rate_30d_7d FROM v_cost_run_rate WHERE source_group = 'total:all-billing') AS TEXT)
  WHERE metric = 'monthly_cost_run_rate_usd';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT run_rate_30d_7d FROM v_cost_run_rate WHERE source_group = 'total:cloudflare+gateway') AS TEXT)
  WHERE metric = 'fleet_cost_run_rate_usd';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT run_rate_30d_7d FROM v_cost_run_rate WHERE source_group = 'workers_ai') AS TEXT)
  WHERE metric = 'workers_ai_run_rate_usd';
END;

INSERT INTO cost_source_registry (source, label, scope, payer, observable_via, notes)
SELECT 'cloudflare_plan:daily', 'Cloudflare plan, per day', 'fleet', 'user (Cloudflare billing)', 'GET /accounts/{id}/subscriptions (scripts/cost_ledger.py); seeded baseline when refused', 'monthly / 30 per day; COST-LEDGER-DAILY-1'
WHERE NOT EXISTS (SELECT 1 FROM cost_source_registry WHERE source = 'cloudflare_plan:daily');
INSERT INTO cost_source_registry (source, label, scope, payer, observable_via, notes)
SELECT 'direct_providers_external:daily', 'Owner direct providers outside the fleet, per day', 'owner-direct', 'user (direct)', 'none: owner-stated monthly figure', 'monthly / 30 per day; unverified; COST-LEDGER-DAILY-1'
WHERE NOT EXISTS (SELECT 1 FROM cost_source_registry WHERE source = 'direct_providers_external:daily');

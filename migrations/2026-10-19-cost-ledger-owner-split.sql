-- COST-OWNER-SPLIT-1 (2026-10-19, pillar cost; agent_issues 3015, 99938, 100011 and 2750; scripts/cost_ledger.py, qnfo-fleet-control 0.34.3).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: cost_daily_bak_20261019
-- Rollback: DROP VIEW IF EXISTS v_cost_run_rate; CREATE VIEW v_cost_run_rate AS SELECT source_group, ROUND(SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 4) AS daily_7d, ROUND(SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 4) AS daily_10d, ROUND(30 * SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 2) AS run_rate_30d_7d, ROUND(30 * SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 2) AS run_rate_30d_10d FROM (SELECT date, source AS source_group, usd FROM cost_daily WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR instr(source, ':daily') > 0) UNION ALL SELECT date, 'total:cloudflare+gateway', usd FROM cost_daily WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR source = 'cloudflare_plan:daily') UNION ALL SELECT date, 'total:all-billing', usd FROM cost_daily WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR instr(source, ':daily') > 0)) GROUP BY source_group; DELETE FROM cost_daily WHERE source LIKE 'owner_gateway:%'; INSERT OR REPLACE INTO cost_daily SELECT * FROM cost_daily_bak_20261019; DELETE FROM remediation_contracts WHERE class = 'fm-cost-metric-includes-owner-spend'; DELETE FROM failure_modes WHERE fm_key = 'cost-metric-includes-owner-spend'
-- Rollback note: the CREATE VIEW above is the 2026-10-09-14-cost-run-rate.sql definition (the live text read from sqlite_master on 2026-10-19 matches it);
-- cost_daily_bak_20261019 holds the ai_gateway:* rows as the ledger wrote them before this change. The ledger rewrites 11 days on every run, so both directions heal.
--
-- Measured 2026-10-19 (D1 qnfo-audit): cost_daily ai_gateway:anthropic 2026-10-18 = 97.0266 USD (1141 requests, scope 'fleet+owner-clients') equals
-- ai_spend_owner_local anthropic 97.0266 (1140 calls, the owner's untagged desktop client on the stored key); 2026-10-17 55.0208 = 33.0457 + 21.9749 + 0.0002.
-- v_cost_run_rate then read ai_gateway:anthropic 651.63 and total:cloudflare+gateway 1071.41 (fleet_cost_run_rate_usd), so fleet_budget ai_spend:anthropic
-- (cap 15) read 651.63 and qnfo-ai's BUDGET-SOFT-ROUTE-1 steered every caller to lean models for spend the fleet did not make. ai_spend_ledger holds no
-- anthropic rows at all in 30 days.
-- ROOT CAUSE: scripts/cost_ledger.py wrote the whole gateway total under ai_gateway:<provider> with scope 'fleet+owner-clients' and never subtracted
-- the owner term that qnfo-fleet-control's hourly ingest (OWNER-LOCAL-INGEST-1) already keeps in ai_spend_owner_local.
-- CHANGE: the ledger now writes ai_gateway:<provider> scope 'fleet' = max(0, gateway - owner_local) and owner_gateway:<provider> scope 'owner-clients'
-- = min(owner_local, gateway), per day and provider, rewriting the last 10 days plus today on every hourly run (so no backfill is needed here). This file
-- redefines v_cost_run_rate so the owner term stays MEASURED, never hidden: owner_gateway:<provider> is its own group, total:owner-gateway sums them,
-- total:all-billing keeps them (the owner's total monthly budget includes actual usage, 2026-10-09), and total:cloudflare+gateway and the
-- ai_gateway:<provider> groups (fleet_cost_run_rate_usd, fleet_budget ai_spend caps) exclude them. No fleet_budget cap or metric threshold changes.
-- NOT CLOSED BY THIS FILE: monthly_cost_run_rate_usd stays near its old value until 2026-10-25/26 (the owner term is in all-billing by design);
-- fleet_cost_run_rate_usd still carries Workers AI (410.84), which is the Workers AI cluster's (issue 99937); 3015 and 99938 close on their own triggers.
-- DECISION (belief-owner-gateway-spend-not-fleet): the owner's gateway spend never counts in ai_spend:* caps or the router budgets, as qnfo-fleet-control
-- designed it (OWNER-LOCAL-INGEST-1); it is reported as owner_gateway:* and as cost_usd_30d's owner term (qnfo-fleet-control 0.34.3).
-- No hold, filter, pause or cap is added, so there is no control_registry row: the split classifies rows, and every owner dollar stays in the ledger.

CREATE TABLE IF NOT EXISTS cost_daily_bak_20261019 AS SELECT * FROM cost_daily WHERE source LIKE 'ai_gateway:%';

DROP VIEW IF EXISTS v_cost_run_rate;
CREATE VIEW v_cost_run_rate AS
SELECT source_group,
  ROUND(SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 4) AS daily_7d,
  ROUND(SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 4) AS daily_10d,
  ROUND(30 * SUM(CASE WHEN date >= date('now', '-7 days') THEN usd ELSE 0 END) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-7 days') AND date < date('now'))), 2) AS run_rate_30d_7d,
  ROUND(30 * SUM(usd) / MAX(1, (SELECT COUNT(DISTINCT date) FROM cost_daily WHERE source = 'workers_ai' AND date >= date('now', '-10 days') AND date < date('now'))), 2) AS run_rate_30d_10d
FROM (
  SELECT date, source AS source_group, usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR instr(source, 'owner_gateway:') = 1 OR instr(source, ':daily') > 0)
  UNION ALL
  SELECT date, 'total:cloudflare+gateway', usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR source = 'cloudflare_plan:daily')
  UNION ALL
  SELECT date, 'total:owner-gateway', usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND instr(source, 'owner_gateway:') = 1
  UNION ALL
  SELECT date, 'total:all-billing', usd FROM cost_daily
    WHERE date >= date('now', '-10 days') AND date < date('now') AND (source = 'workers_ai' OR instr(source, 'ai_gateway:') = 1 OR instr(source, 'owner_gateway:') = 1 OR instr(source, ':daily') > 0)
)
GROUP BY source_group;

INSERT INTO cost_source_registry (source, label, scope, payer, observable_via, notes)
SELECT 'owner_gateway:<provider>', 'AI Gateway spend of the owner''s own clients (untagged requests on the stored key), per provider and day', 'owner-clients', 'user (gateway credit or provider)', 'ai_spend_owner_local (qnfo-fleet-control OWNER-LOCAL-INGEST-1) capped at the gateway day total by scripts/cost_ledger.py', 'COST-OWNER-SPLIT-1; measured, in total:all-billing, never in ai_gateway:<provider>, fleet_cost_run_rate_usd or the fleet_budget ai_spend caps'
WHERE NOT EXISTS (SELECT 1 FROM cost_source_registry WHERE source = 'owner_gateway:<provider>');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('cost-metric-includes-owner-spend',
   'fleet cost metrics and ai_spend caps count the owner''s own gateway client spend, so a cap reads breached and the qnfo-ai router downgrades every caller',
   'scripts/cost_ledger.py wrote the whole gateway day total under ai_gateway:<provider> (scope fleet+owner-clients) without subtracting ai_spend_owner_local; cost_usd_30d did the same account-wide',
   'COST-OWNER-SPLIT-1: ai_gateway:<provider> is the fleet part (scope fleet), owner_gateway:<provider> the owner part (scope owner-clients), v_cost_run_rate keeps the owner term out of the fleet groups, cost_usd_30d subtracts the owner-local term (qnfo-fleet-control 0.34.3); scripts/cost_ledger.py --selftest runs the real view SQL',
   'no ai_gateway:* cost_daily row inside the ledger window has scope fleet+owner-clients unless the ledger recorded that ai_spend_owner_local was unreadable (note: owner term not split)',
   'fm-cost-metric-includes-owner-spend', '2026-10-19', 100011,
   'the owner''s desktop client spends on the stored gateway key (untagged requests) in a burst',
   '2026-10-17/18: ai_gateway:anthropic 55.02 and 97.03 USD equal the owner-local term; ai_spend:anthropic read 651.63 against a cap of 15',
   'fleet_budget ai_spend caps, qnfo-ai router budgets (lean mode for every caller), fleet_cost_run_rate_usd, cost_usd_30d');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status) VALUES
  ('fm-cost-metric-includes-owner-spend', NULL, 'COST-OWNER-SPLIT-1', 'failure-mode detector',
   'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cost_daily WHERE instr(source, ''ai_gateway:'') = 1 AND scope = ''fleet+owner-clients'' AND date >= date(''now'', ''-9 days'') AND instr(COALESCE(note, ''''), ''owner term not split'') = 0) AS TEXT) AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766', 'belief-owner-gateway-spend-not-fleet: the owner''s own gateway client spend is not spend the fleet controls, so it must not breach fleet caps or steer fleet callers to lean models', 'split owner-client gateway spend into owner_gateway:<provider> ledger rows and out of the fleet cost groups and ai_spend caps; cost_usd_30d subtracts it (qnfo-fleet-control 0.34.3)', 'cost_daily ai_gateway:anthropic 2026-10-18 97.0266 = ai_spend_owner_local anthropic 97.0266; ai_spend_ledger holds no anthropic rows; fleet_budget ai_spend:anthropic current 651.63 vs cap 15', 'fleet groups carry only fleet spend; the owner term is measured separately and still counted in total:all-billing', 'v_cost_run_rate, fleet_budget ai_spend:*, qnfo-ai router budgets, fleet_cost_run_rate_usd, cost_usd_30d', 'the Rollback line', 'owner-client gateway spend separated from fleet spend in the ledger, the run-rate view and cost_usd_30d', 'within 2 hours of deploy: cost_daily 2026-10-18 ai_gateway:anthropic < 1 and owner_gateway:anthropic 97.03; fleet_budget ai_spend:anthropic current under its cap of 15', NULL, 'sqlite replay of the migration view in scripts/cost_ledger.py --selftest; node qnfo-fleet-control/cost-attribution.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE instr(d.action, 'split owner-client gateway spend into owner_gateway') = 1);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('owner-gateway-cost-split', 'migrations/2026-10-19-cost-ledger-owner-split.sql (COST-OWNER-SPLIT-1, scripts/cost_ledger.py, qnfo-fleet-control 0.34.3)', 'ai_spend_owner_local (OWNER-LOCAL-INGEST-1 hourly), remediation-consumer hourly ledger run',
 'hourly ledger rewrite of 11 days; detector fm-cost-metric-includes-owner-spend',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'owner-client gateway spend is a measured owner_gateway:<provider> ledger row; fleet cost groups, ai_spend caps and cost_usd_30d count only the fleet part');

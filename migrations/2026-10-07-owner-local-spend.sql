-- APPLY-BY: ci
-- DB: qnfo-audit
-- OWNER-LOCAL-INGEST-1 (2026-10-07, pillar cost, agent_issues 2080; qnfo-fleet-control 0.11.0). cost_attribution_gap_pct read 98
-- on 2026-10-07 09:00Z: the AI Gateway metered $22.21 of paid DeepSeek cost in 7 days and ai_spend_ledger carried $0.44, because
-- the owner's desktop clients call the gateway with the stored key and no cf-aig-metadata tag (card gateway-untagged-node-caller,
-- resolved 2026-10-06). The hourly tick now reads each gateway's request log and attributes untagged paid requests to this
-- table, kept apart from ai_spend_ledger so the fleet's spend caps (qnfo-ai router, fleet_budget ai_spend:*), the run rate
-- (fleet_ai_run_rate_30d_usd) and the ledger views never count the owner's own client spend as the fleet's. The gap metric
-- counts both tables as attributed; analytics_dash_meta owner_local_cost_usd_30d shows the owner the figure on the cost card.
-- The trigger's action names the loop that now owns the lever. No DELETE or DROP outside the rollback.
-- Rollback: DROP TABLE IF EXISTS ai_spend_owner_local;

CREATE TABLE IF NOT EXISTS ai_spend_owner_local (
  day TEXT NOT NULL,
  gateway TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  calls INTEGER DEFAULT 0,
  in_tok INTEGER DEFAULT 0,
  out_tok INTEGER DEFAULT 0,
  usd REAL DEFAULT 0,
  PRIMARY KEY (day, gateway, provider, model)
);

UPDATE analytics_metric_triggers
SET action = 'Pillar cost (COST-ATTRIBUTION-GAP-1, lever T4.7; OWNER-LOCAL-INGEST-1 since qnfo-fleet-control 0.11.0). Over the last 7 days more than a quarter of the paid-provider cost the AI Gateway metered has no row in ai_spend_ledger (fleet callers) or ai_spend_owner_local (the owner''s untagged desktop clients, ingested hourly from the gateway request logs by the same tick that measures this). Read cloud_ops_events cost-attribution-<day> (owner_local_usd, by_provider, top_models) and owner-local-ingest-<day> (by_gateway: taken, skipped, cursor, or a logs HTTP error). Levers, in order: (1) the ingest skipped or errored (owner-local-ingest shows error or the cost-attribution event shows owner_local_usd 0 while top_models carry cost): the CF_API_TOKEN of qnfo-fleet-control lacks AI Gateway read, or a gateway stopped collecting logs (gatewayConfigAudit drift); (2) a fleet worker calls the gateway with no cf-aig-metadata tag (its cost lands in owner-local): wrap it with __aiAttrEnv or route it through qnfo-ai over a service binding with props.caller (#1703); (3) a model the ledger prices at 0: add it to SPEND_PRICES in qnfo-ai. Changing a spend cap is the fleet''s own decision since RULE-8-RETIRED-1: attribute the cost first, then record the reason and the measurement in a fleet_budget migration.'
WHERE metric_key = 'cost_attribution_gap_pct';

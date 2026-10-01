-- BUDGET-UNITS-1 (#1699, 2026-10-01): the fleet_budget ai_spend rows hold gateway LIST-cost estimates across every
-- provider (unified billing + BYOK + Workers AI). They are not billed amounts. ai_spend:total's soft budget ($150) is
-- the sum of the per-provider soft caps, not the gateway monthly-150 spend limit, which meters unified-billing traffic
-- only. The unit is relabelled so the two are not compared; the alert text says the same (qnfo-fleet-control 0.4.60).
-- Applied live.
UPDATE fleet_budget SET unit = 'usd_30d_list_estimate', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE node_class LIKE 'ai_spend:%';

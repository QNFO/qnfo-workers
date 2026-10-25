-- COST-RECONCILIATION-EVIDENCE-1 (2026-10-25, pillar cost; US-05).
-- Adds no billing source, estimate, cap, stop or table. The existing hourly cost ledger writes
-- a disjoint 30-day source reconciliation to cloud_ops_events and labels task-cost gaps unmeasured.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE capability_ledger SET reliability = 'retired by rollback' WHERE capability = 'cost-source-reconciliation-evidence';
--
-- Live 2026-10-25: /api/cost reports source-level 30-day run rates, while cost_daily retains daily amounts;
-- analytics_dash_meta has distinct unified/BYOK gateway values; the owner-direct estimate is unverified.
-- Existing cost_per_successful_task_by_class covers successful qnfo-ops model-ladder calls, not all tasks,
-- and no ledger joins spend to a task id plus final outcome. Keep those gaps explicit rather than deriving costs.
-- qnfo-ai/spend-soft.test.mjs verifies router downgrading; it does not verify research-exec continuation.
-- A separate live report still has research-exec /budget ok:false at 423309/360000 (pace 321000); its source
-- is held by production task ct_im100616 and issues 100622/100623 are open. This migration does not claim that
-- executor stop is fixed or duplicate the active source work.

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT '90ad5c48-82ae-40e5-9ae6-c2276df3242f',
  'The current daily ledger is the canonical non-overlapping billing base; its unified/BYOK split is a check, not an extra amount, and missing task linkage must remain unmeasured',
  'COST-RECONCILIATION-EVIDENCE-1: add an hourly disjoint 30-day reconciliation event from existing cost sources and expose missing source/task-outcome coverage without changing spend controls',
  '2026-10-25 live GET /api/cost: 7-day run-rate total:all-billing 1939.88, total:cloudflare+gateway 820.23; workers_ai 787.72; owner_gateway 669.66; direct_providers_external:daily 450.00 (owner-stated, unverified). Existing analytics_dash_meta unified_cost_usd_30d and byok_cost_usd_30d split AI Gateway usage; no task-id/outcome linkage was found in the current cost ledgers. qnfo-ai/spend-soft.test.mjs passes; separate live research-exec /budget remains ok:false at 423309/360000, pace 321000, owned by production task ct_im100616; issues 100622/100623 remain outside this change.',
  'The hourly cost ledger writes one replaceable daily cloud_ops_events reconciliation snapshot; unified/BYOK figures remain informational and are not added a second time; failed-task costs remain NULL. Router soft-routing is tested; research-exec budget continuation remains unresolved.',
  'scripts/cost_ledger.py and one daily cost-reconciliation cloud_ops_events row; no worker, route, binding, cron, spend cap or user data changes',
  'Revert the script change through Git; mark the capability retired while preserving the append-only decision record',
  'A 30-day source-level cost reconciliation with an explicit source basis, owner-direct uncertainty, gateway split delta and task-outcome coverage status',
  'The next hourly cost-ledger run records a 30-day total only when source rows reconcile; unknown or overlapping sources remain visible and failed-task costs are never fabricated',
  'Operators can distinguish measured usage, owner-stated costs and missing task-outcome attribution before acting on spend',
  'Live /api/cost and /api/area/cost, cost_daily, ai_spend_ledger, analytics_dash_meta, cost-per-task formula and repository cost-ledger tests'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log WHERE action LIKE 'COST-RECONCILIATION-EVIDENCE-1:%'
);

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES
  ('cost-source-reconciliation-evidence',
   'scripts/cost_ledger.py COST-RECONCILIATION-EVIDENCE-1',
   'Existing cost_daily, ai_spend_ledger, analytics_dash_meta and metric_registry rows; hourly cost-ledger execution',
   'partial until a successful hourly cost-reconciliation event and complete task-id/outcome instrumentation',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
   'Disjoint 30-day sources; unified/BYOK are a gateway split, never added twice; unverified owner-direct spend and missing failed-task linkage remain explicit');

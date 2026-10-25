-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM capability_ledger WHERE capability = 'q08-run-stage-attribution'
-- Q08-RUN-STAGE-ATTRIBUTION-1 (2026-10-25, charter pillar: cost): split reader-panel and fact-check calls in engine_runs while preserving verify_calls as the total. This is observability only; quality gates, retries, and spend behavior are unchanged.

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('q08-run-stage-attribution',
  'q08-signal-engine 0.35.0: engine_runs.panel_calls and engine_runs.factcheck_calls',
  'q08-signal-engine schema bootstrap; q08-signal-engine/source-sufficiency.test.mjs',
  'The per-run total remains in verify_calls; panel_calls and factcheck_calls are counted at their respective model-call sites',
  '2026-10-25',
  'Live q08.org/api/metrics at 2026-10-25T16:58:29Z: 257 finished runs, 4 published, gate pass rate 0.016, and 344315.398 neurons per published piece. A request to q08.org/api/runs?limit=60 returned 20 rows (IDs 952 through 933), not 60: 13 gate_failed and 7 deferred; those rows report 62 compose_calls and 93 verify_calls without a panel/fact-check split.');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_fc0ad034-092d-43df-8927-d01615e0c231:q08-run-stage-attribution-1',
  'verify_calls combines reader-panel and fact-check calls, so the per-stage cost of a failed run cannot be compared from engine_runs alone',
  'Q08-RUN-STAGE-ATTRIBUTION-1: add panel_calls and factcheck_calls to engine_runs and retain verify_calls as their total; correct the run-sample evidence to the 20 rows actually returned',
  'The q08.org/api/runs?limit=60 probe returned 20 rows, IDs 952 through 933, with 13 gate_failed and 7 deferred; the latest /api/metrics reports a 1.6% 7-day gate pass rate and 344315.398 neurons per published piece. The endpoint response, not the requested limit, defines the sample size.',
  'pending post-deploy measurement',
  'q08-signal-engine run-log schema and attribution only; no quality gate, spend policy, retry limit, or publishing behavior changes',
  'Revert q08-signal-engine and its deployed mirror to 0.34.5 through the canonical deploy path; run this migration rollback for the capability row. decision_log is append-only.',
  'Per-run attribution of model calls to reader-panel and fact-check stages while preserving the existing verify_calls total',
  'q08_stage_call_attribution_coverage_7d >= 0.95 within 168 h',
  'The owner can distinguish reader-panel from fact-check call spend when reviewing failed runs; publication quality and factuality checks remain unchanged.',
  'q08.org/api/metrics and /api/runs (read-only sample); q08-signal-engine/source-sufficiency.test.mjs; migrations/q08-run-cost-observability.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'Q08-RUN-STAGE-ATTRIBUTION-1:%');

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM capability_ledger WHERE capability = 'q08-run-stage-attribution'; DELETE FROM failure_modes WHERE fm_key = 'q08-review-stage-call-attribution'; DELETE FROM belief_registry WHERE belief_key = 'q08-review-stage-call-sites'; DELETE FROM remediation_contracts WHERE class IN ('fm-q08-review-stage-call-attribution', 'belief-q08-review-stage-call-sites')
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
  'New metered generation rows preserve verify_calls = panel_calls + factcheck_calls; the hourly detector must observe a real reviewer-call row before passing.',
  'The owner can distinguish reader-panel from fact-check call spend when reviewing failed runs; publication quality and factuality checks remain unchanged.',
  'q08.org/api/metrics and /api/runs (read-only sample); q08-signal-engine/source-sufficiency.test.mjs; migrations/q08-run-cost-observability.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'Q08-RUN-STAGE-ATTRIBUTION-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_be8ff60b-937b-401a-8803-cfd65793e163:q08-evidence-correction-1',
  'the original run counts were calculated from the response returned by /api/runs?limit=60',
  'Q08-WRITER-YIELD-EVIDENCE-CORRECTION-1: correct the recorded sample size from 60 rows to the 20 rows actually returned',
  'The 11 accuracy failures and averages in 2026-10-25-q08-writer-yield-order.sql were calculated from 20 returned rows, not 60. The handler hard-caps at LIMIT 20. Independent pre-counter baseline at 2026-10-25T16:53:13Z: version 0.34.5, 257 finished runs, 4 published, 0.016 gate pass, 1377261.592764 neurons, 344315.398 neurons per piece, 4 verified votes. These overlapping rolling-7d windows are non-attributable to either writer routing or stage attribution.',
  'sample-size wording corrected append-only; original decision retained; no outcome improvement claimed',
  'audit evidence only',
  'append a later correction if contradicted; never edit the original decision',
  'none; evidence-scope correction only',
  'future readers treat the historical failure counts as a 20-row sample, not 60',
  'none',
  'q08.org/api/runs?limit=60; worker handler LIMIT 20; historical writer-yield migration; independent pre-counter metrics baseline'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'Q08-WRITER-YIELD-EVIDENCE-CORRECTION-1:%');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES ('q08-review-stage-call-attribution',
  'reviewer model calls cannot be assigned to the reader-panel or fact-check stage',
  'readerTest and factCheckOne shared verify_calls without stage counters',
  'Record panel_calls and factcheck_calls while retaining verify_calls as their sum; quality gates and model order are unchanged',
  'hourly remediation_contracts fm-q08-review-stage-call-attribution',
  'fm-q08-review-stage-call-attribution', '2026-10-25',
  'a generation row spends reviewer calls',
  'the combined verify_calls count conceals the stage consuming calls',
  'Q08 run-cost attribution only');

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('q08-review-stage-call-sites',
  'Every metered reviewer attempt increments exactly one stage counter and the aggregate verify counter',
  0.95,
  'readerTest calls meterCall(panel), factCheckOne calls meterCall(factcheck); meterCall also increments verify. Runtime tests exercise failed provider calls and persisted totals.',
  'belief-q08-review-stage-call-sites', 'Q08-RUN-STAGE-ATTRIBUTION-1');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-q08-review-stage-call-attribution', NULL,
  'q08-signal-engine 0.35.0 or later is deployed',
  'Confirm stage totals on real reviewer calls; ignore async placeholder/error rows but detect missing counters on subsequent generation rows',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM engine_runs WHERE panel_calls IS NOT NULL AND factcheck_calls IS NOT NULL AND verify_calls > 0) THEN ''pending: no reviewer-call row yet'' WHEN EXISTS (SELECT 1 FROM engine_runs WHERE id >= (SELECT MIN(id) FROM engine_runs WHERE panel_calls IS NOT NULL AND factcheck_calls IS NOT NULL) AND status IN (''ok'',''gate_failed'',''skipped'',''deferred'') AND (panel_calls IS NULL OR factcheck_calls IS NULL OR verify_calls IS NULL OR panel_calls < 0 OR factcheck_calls < 0 OR panel_calls + factcheck_calls != verify_calls)) THEN ''stage-call totals mismatch'' ELSE ''ok'' END AS observed',
  'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
SELECT 'belief-q08-review-stage-call-sites', NULL,
  'DOCTRINE-1 belief; q08-signal-engine 0.35.0 or later is deployed',
  'belief probe', verify_probe, verify_transport, 3, 'qnfo-fleet-control', 1, 'active', 'belief', datetime('now', '+60 minutes')
FROM remediation_contracts WHERE class = 'fm-q08-review-stage-call-attribution';

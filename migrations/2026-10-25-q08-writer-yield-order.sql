-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-q08-writer-yield-order'; DELETE FROM failure_modes WHERE fm_key = 'q08-writer-yield-order';
-- Q08-WRITER-YIELD-1 (2026-10-25, charter pillar: cost): the normal composer order led with a writer whose measured gate yield was lowest, wasting calls before trying higher-yield writers.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES ('q08-writer-yield-order',
  'q08 spends compose calls on a low-yield writer before trying writers that more often pass the unchanged writer gate',
  'the fixed composer priority was not retuned after its earlier routing evidence diverged from current 30-day writer-gate pass rates',
  'Q08-WRITER-YIELD-1: lead with gpt-oss, then kimi, then nemotron outside a breached spend cap; retain the cheaper nemotron-before-kimi order at the cap, with all quality gates unchanged',
  'remediation_contracts fm-q08-writer-yield-order (code-read of the normal composer order; budget-route.test.mjs covers both routes)',
  'fm-q08-writer-yield-order', '2026-10-25', NULL,
  '30-day q08_reader_tests: gpt-oss passed 66.1% of 342 writer attempts, kimi 60.2% of 108, and nemotron 21.2% of 472; the live 7-day gate pass rate was 1.6% and neurons per published piece were 339,797.85',
  'q08.org publication yield and Workers AI spend; the factual, reader-quality, and publication gates are unchanged');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-q08-writer-yield-order', NULL,
  'q08-signal-engine 0.34.5 or later is present on main',
  'keep the measured writer order while its post-deploy cost and yield are evaluated; if the order regresses, re-read q08_reader_tests and ai_call_counters and change only the order supported by fresh evidence',
  '{"paths":["q08-signal-engine/worker.js"],"contains":"var COMPOSE_MODELS = [\n  \"@cf/openai/gpt-oss-120b\",\n  \"@cf/moonshotai/kimi-k2.6\",\n  \"@cf/nvidia/nemotron-3-120b-a12b\",\n];"}',
  'code-read', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_c10bd494-51e4-4a35-ba47-d8fd9f9623bd:q08-writer-yield-1',
  'recent 30-day writer-gate results supersede older routing evidence for the normal compose order; spend-pressure routing must still prefer lower cost, and quality gates must remain intact',
  'Q08-WRITER-YIELD-1: use gpt-oss, kimi, then nemotron in the normal route and gpt-oss, nemotron, then kimi at a breached cap; retain the existing gates and retry ceilings',
  'Live q08.org/api/metrics at 2026-10-25T15:10Z: 4 published pieces from 258 finished runs (7-day gate pass rate 0.016) and 339,797.85 neurons per published piece. Live 30-day q08_reader_tests: gpt-oss 66.1% pass over 342 attempts, kimi 60.2% over 108, nemotron 21.2% over 472. The latest 60 run rows included 11 accuracy failures averaging 4.18 compose and 6.55 verify calls; verify_calls combines fact-check and panel calls and is not an attribution by itself.',
  'pending post-deploy measurement',
  'q08-signal-engine composer order only; no quality threshold, reviewer pool, retry ceiling, or publishing cadence changes',
  'restore the prior composer arrays and mirror through the canonical path; remove the failure-mode and contract rows using this migration Rollback line; decision_log remains append-only',
  'none; this is a measured routing correction, not a new capability',
  'q08_neurons_per_published_piece_7d < 339797.85 within 168 h',
  'A higher-yield writer is tried earlier, reducing wasted compose calls without weakening accuracy or reader-quality checks.',
  'q08.org/api/metrics and /api/runs (read-only baseline); live 30-day q08_reader_tests; q08-signal-engine/budget-route.test.mjs; post-deploy fm-q08-writer-yield-order code-read probe'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'Q08-WRITER-YIELD-1:%');

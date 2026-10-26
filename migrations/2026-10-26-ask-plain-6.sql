-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-ask-reasoning-model-empty-budget'; DELETE FROM failure_modes WHERE fm_key = 'ask-reasoning-model-empty-budget'
-- spof-review: no new cron, binding, host, credential or critical-path dependency; one failure_modes row, one detector contract and one decision.
-- ASK-PLAIN-6 (2026-10-26, charter pillar reach; qnfo-ai-search 2.11.1). ask_events after 2.10.3: the qwen3.8-27b challenger returned no text in 5 of 5 requests (48 to 63 s, answer_chars 0), among them a real
-- visitor's "What is the main result, in plain language?" (limited NULL, 2026-10-26T18:21:18Z). It is a reasoning model that had the 1800-token budget of a plain one; REASONING_TOKENS lists the others at 8000.
-- The same visitor question was read as an explain question about the wording "the main result"; it is a request about the paper, so it takes the ordinary path with the plain-language rules.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('ask-reasoning-model-empty-budget', 'a model arm returns no text for every question, so one visitor in five (the challenger share) waits about a minute and gets sources only',
  'a reasoning model entered the A/B search space (TUNE_SPACE) and the lean route (LEAN_MODEL) without an entry in REASONING_TOKENS, so its thinking spent the whole 1800-token budget; the error counted against the arm in ASK-TUNE-1, which can only retire the challenger, not tell the visitor',
  'ASK-PLAIN-6 (qnfo-ai-search 2.11.1): qwen3.8-27b is listed at 8000 like the other reasoning models; ASK-PLAIN-4 (2.10.3) already retries an empty reply on the champion; a model added to TUNE_SPACE or LEAN_MODEL is added to REASONING_TOKENS in the same change',
  'code: every reasoning model in TUNE_SPACE and LEAN_MODEL has a REASONING_TOKENS entry', 'fm-ask-reasoning-model-empty-budget', '2026-10-26', NULL,
  'a challenger or lean model that thinks before it answers',
  'ask_events.error starts "empty answer from <model>" with answer_chars 0 and total_ms near 50000',
  'about one question in five while a reasoning challenger runs; every question under a breached spend cap (lean)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-ask-reasoning-model-empty-budget', NULL, 'ASK-PLAIN-6', 'failure-mode detector: qwen3.8-27b has the reasoning output budget',
  '{"paths": ["qnfo-ai-search/worker.js"], "contains": "\"@cf/qwen/qwen3.8-27b\": 8000"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'a visitor is never left waiting a minute for nothing because of a model the fleet chose to try, and a request about the paper is not an explain question about a phrase',
   'ASK-PLAIN-6 (qnfo-ai-search 2.11.1): REASONING_TOKENS entry for qwen3.8-27b (8000); a quoted span is required for an explain question whose text names the paper or its result; answer cache revision r8',
   'ask_events 2026-10-26T18:21Z to 18:39Z: five qwen3.8-27b requests, error "empty answer from @cf/qwen/qwen3.8-27b", answer_chars 0 or answered only after the 2.10.3 retry, total_ms 48719 to 62878; one of them a real visitor asking What is the main result, in plain language?',
   'applies with the canonical deploy of qnfo-ai-search 2.11.1', 'the challenger arm (20% of ordinary questions while one runs) and the lean route; explain-question detection narrowed', 'revert qnfo-ai-search to 2.11.0 through the canonical path; DELETE rows named in the Rollback line of migrations/2026-10-26-ask-plain-6.sql',
   'ask.qwav.tech answers within seconds on every arm',
   'no ask_events row on the qwen3.8-27b model has error "empty answer" over the next 24 hours of challenger traffic, or the challenger is retired by ASK-TUNE-1 on its measured grounded share', 'ask.qwav.tech visitors', 'offline suites (ask-plain.test.mjs 69 checks: budget entry, explain detection); ask_events after the deploy');

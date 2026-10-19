-- BUDGET-PROBE-1 (2026-10-19, pillar cost; agent_issues 2829 path A, qnfo-ai-calibration 1.6.0 and prober member 2.3.16).
-- ai_model_health read status ok from probes that never read the reply a caller gets: the prober's probeOne sent max_tokens 1 and
-- returned ok on any call that did not throw, the sweep's probeCompletion sent max_tokens 16 and accepted reasoning_content as an
-- answer. Both writers now add, for text models only, one request shaped like a caller's (a trivial sum, max_tokens 256, a DONE
-- marker); empty content or no marker is a failed probe on the existing degraded -> failing path. Both send it through the Workers
-- AI binding (probeBudgetDirect): qnfo-ai's small-answer lane (reasoning_effort low or none at max_tokens <= 2048 for glm-5.3-flash,
-- kimi-k2.6 and gpt-oss-120b) would hide the failure on the router, so a sweep verdict is never lane-qualified; only the DeepSeek
-- ids with no Workers AI id (flash, flash-thinking) go through the router.
-- What the evidence shows and does not show (ai_call_counters has no error class; ai_gateway_failures does, but only for gateway
-- failures). Error shares are measured; the cause of each is not, except where a row says so.
--   glm-5.3-flash, 2026-10-18: qnfo-research-exec 3,022 errors of 4,647 calls, q08-signal-engine 96 of 217, qnfo-ai 52 of 437;
--     2026-10-19: q08-signal-engine 29 of 78. ai_gateway_failures holds 34 rows of class rate-capacity (429 "Spend limited") in
--     the last two days. The research-exec errors are the per-minute rate limit under wide slots (the cost-models-quality
--     diagnosis), which an idle 256-token probe cannot see. This probe is NOT expected to change glm-5.3-flash's row; its fix is
--     the research-exec width change and that issue's own metric.
--   qwen3.8-27b: q08-signal-engine direct bindings, 63 errors of 78 calls on 2026-10-18 and 21 of 31 on 2026-10-19; the error class
--     is not recorded, so empty content is the plausible mode and not a measured one. This is the model the probe can flip.
--   nemotron-3-120b-a12b: personal-companion 79 of 303 and q08-signal-engine 14 of 119 on 2026-10-18, class not recorded; the
--     prober covers it, the sweep does not.
-- This file adds what the worker cannot: the switch's config row and its control_registry row (a kill switch needs both), the
-- failure mode "ai_model_health ok while the model fails most real calls" with its fm- detector contract, and the decision. The
-- detector reads the symptom (an ok row with an error share above 0.5 over at least 20 calls since yesterday), whatever the
-- cause, so it can read non-zero for a rate-limited model the probe rightly leaves ok; that case closes on its own cause.
-- Cost (measured 2026-10-19 from ai_call_counters, 2 days): glm-5.3-flash used 2,574,545 neurons for 17.35 M output and 130.6 M
-- input tokens, at most 0.148 neurons per output token. A budget probe returns at most 256 tokens, so at most 38 neurons.
-- Probes per day: the sweep has 10 text models (7 Workers AI, 3 DeepSeek via the router) and a full sweep every 4th 30-minute
-- tick (12 a day) = 120; the prober has 9 unique text ids re-probed every 9 hours when ok (2.67 a day) = 24; 144 calls a day,
-- about 5,500 neurons a day at the upper bound (0.2 percent of glm-5.3-flash's own traffic). Not-ok models are re-probed each
-- tick, which is the cost of a recovery check and ends when they pass. A breached ai_spend cap does not skip the probe
-- (BUDGET-SOFT-ROUTE-1): the probe is already the lean shape, one call of at most 256 tokens per model per run.
-- Closes (with the deploy): no ai_model_health row reads ok while ai_call_counters shows more than 0.5 error share over at least
-- 20 calls since yesterday (the detector below; the model_id is matched as the tail of the counters' qualified id).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-health-ok-but-empty'; DELETE FROM failure_modes WHERE fm_key = 'health-ok-but-empty'; DELETE FROM control_registry WHERE control = 'ai-calibration-budget-probe-switch'; DELETE FROM ai_calibration_config WHERE key = 'budget_probe'; DELETE FROM decision_log WHERE actor = 'session_01QpQv19uh1padRwZ3u1r766:model-health-1'

INSERT OR IGNORE INTO ai_calibration_config (key, value) VALUES ('budget_probe', 'on');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('ai-calibration-budget-probe-switch', 'qnfo-ai-calibration worker.js budgetProbeOn(): ai_calibration_config budget_probe (sweep probeBudgetCompletion and prober member applyBudgetProbe)', 'kill-switch',
  'the budget probe marking a healthy reasoning model degraded because it needs more than 256 tokens for a trivial sum, which would pull a working rung out of the router and the code-loop ladder',
  0, 'keep', 'applied',
  'set budget_probe = off: both writers return to the ping-only verdict of 1.5.6 within one tick, no deploy; budget-probe.test.mjs proves the off path for the prober and the sweep',
  '2026-10-19',
  'MEASURED 2026-10-19 (ai_call_counters, 2026-10-18 and 19): qwen3.8-27b 84 errors of 109 calls and glm-5.3-flash 3,199 of 6,080 while ai_model_health read ok for both. NOT measured: the cause. The glm-5.3-flash errors are mostly qnfo-research-exec calls (3,022 of 4,647 on 2026-10-18) and the 34 ai_gateway_failures rows are rate-capacity 429s, so rate limiting, not empty replies, is the evidenced cause there; empty content is a hypothesis for qwen3.8-27b only (class not recorded). gpt-oss-120b averages 3,047 output tokens per call at 0.3 percent errors, so a reasoning model can be healthy and still not fit 256 tokens on a long prompt; the probe prompt is a one-line sum to keep that case out. If a healthy model is degraded by the probe, the switch is the revert and the prompt or budget is the fix.',
  2829);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('health-ok-but-empty', 'ai_model_health reads ok for a model that fails most real calls (empty content under a token budget)',
  'the only health probes sent max_tokens 1 (probeOne) or 16 and accepted reasoning_content as an answer (probeCompletion), and never read content or finish_reason, so a model that answers a ping and fails real requests (rate limit, or empty content when a reasoning model spends its budget thinking) read ok; the probes could not tell which',
  'BUDGET-PROBE-1 (qnfo-ai-calibration 1.6.0): text models get a second request, through the Workers AI binding so qnfo-ai small-answer lane does not hide it, with max_tokens 256 asking for DONE; empty content or no marker is degraded, then failing at fail_threshold; ai_calibration_config budget_probe = off reverts. A rate-limited model that answers an idle probe stays ok; its cause has its own fix',
  'no ai_model_health row has status ok while ai_call_counters shows an error share above 0.5 over at least 20 calls since yesterday (symptom detector: any cause)', 'fm-health-ok-but-empty', '2026-10-19', 2829,
  'a model change, a provider change or a longer prompt that moves a model into reasoning-only replies', 'empty-reply failures in code_tasks and the goal review while the roster says ok', 'the model router and the code-loop ladder keep choosing a rung that answers nothing');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-health-ok-but-empty', NULL, 'BUDGET-PROBE-1', 'failure mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ai_model_health h JOIN (SELECT model, 1.0 * SUM(errors) / SUM(calls) AS r FROM ai_call_counters WHERE day >= date(''now'', ''-1 day'') GROUP BY model HAVING SUM(calls) >= 20) c ON c.model LIKE ''%/'' || h.model_id WHERE h.status = ''ok'' AND c.r > 0.5) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested) VALUES
 ('session_01QpQv19uh1padRwZ3u1r766:model-health-1',
  'ai_model_health ok is read by the router and the code-loop ladder as "answers real requests"; the probes only proved a one-token ping',
  'BUDGET-PROBE-1: a budget-shaped second probe (max_tokens 256, DONE marker) for text models in the sweep and the prober member, with a config switch and a failure mode detector',
  'D1 2026-10-19: ai_model_health ok with error shares glm-5.3-flash 0.526 over 6,080 calls (3,022 of them qnfo-research-exec on 2026-10-18; 34 ai_gateway_failures rows, all rate-capacity 429) and qwen3.8-27b 0.771 over 109 (q08-signal-engine, class not recorded); probeOne max_tokens 1; probeCompletion accepts reasoning_content; qnfo-ai small-answer lane applies at max_tokens <= 2048 to glm-5.3-flash, kimi-k2.6, gpt-oss-120b',
  'pending', 'ai_model_health status of the text models can now read degraded or failing; a model that needs more than 256 tokens on a one-line sum would be pulled out of routing',
  'ai_calibration_config budget_probe = off (within one tick), or revert the qnfo-ai-calibration commit',
  'ai_model_health stops reporting ok for models that answer empty under a real token budget', 'qwen3.8-27b (and nemotron-3-120b-a12b, if it fails) read degraded within one prober tick of the deploy when their direct 256-token reply is empty or lacks DONE; glm-5.3-flash is expected to stay ok because its errors are rate-limit (not probe-visible), so fm-health-ok-but-empty may keep reading its row until the research-exec width fix lands; outcome_matched is graded on qwen3.8-27b and nemotron only',
  'qnfo-audit D1 ai_model_health and ai_call_counters, qnfo-ai-calibration worker.js on origin/main, ai-health-prober FOLDED marker');

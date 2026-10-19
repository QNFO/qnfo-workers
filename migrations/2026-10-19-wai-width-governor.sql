-- WAI-WIDTH-GOVERNOR-1 data side (2026-10-19, pillar cost; agent_issues 99924 and 2731 (metric 354 workers_ai_cost_30d_usd), 99928 (metric 409
-- fleet_ai_run_rate_30d_usd), 99937 (metric 3687 workers_ai_run_rate_usd), 2930 check 5). qnfo-research-exec 0.25.0 governs how hard the
-- research pipeline leans on Workers AI: (a) the stage width is halved when more than 15% of a tick's stage runs met a 3021/3040 rate limit
-- and grows back by 2 per clean tick, under the LEAN-WIDTH-1 cap (floor 4, never 0); (b) after a 3021/3040 on a model every slot skips it for
-- 20 s; (c) a fallback is never a model whose input rate is above the primary's (glm-5.3-flash used to fall back to gpt-oss-120b, 2.3x), the
-- call waits one gauge window instead; (d) kimi-k2.6 (6.3x the glm-5.3-flash input rate) is the last retry in revise and in the verify text
-- path, after glm-5.3-flash and gpt-oss-120b. BUDGET-SOFT-ROUTE-1: backpressure and a cheaper model, never a stop and never a hold.
--
-- Measured 2026-10-19 13:00Z (qnfo-audit): workers_ai_cost_30d_usd 173.88 and workers_ai_run_rate_usd 410.84 against a cap of 95; cost_daily
-- workers_ai 10-17 15.33, 10-18 39.36, 10-19 30.11 so far; qnfo-research-exec ai_call_counters 10-18: 7720 calls, 3140 errors (glm-5.3-flash
-- 3022 of 4647 rate-limited), 3.77M neurons, 24 papers published; 10-19 so far: 3213 calls, 173 errors, 2.41M neurons, 47 papers published
-- (LEAN-WIDTH-1 0.20.0 holds the width at 24; cloud_ops_events 3021/3040 warnings fell from about 300 an hour to 0 since 10-18T08Z). The
-- remaining waste is kimi-k2.6: 324 calls, 172 failed (3046 timeouts of about 210 s), 705 of the worker's 2409 kneurons (29%) for 10% of its calls.
-- research_parallel (96) and research_ready_cap (192) are left as they are: the lean cap already clamps 96 to 24 while an ai_spend cap is breached,
-- and the governor works under that cap, so no ops_config value changes and no backup row is needed. The one-file markError lever on triggers 3687
-- and 409 is removed: workersAiRunRateUsd, the only function the three code tasks for these issues (ct_im99937, ct_zkd3zj09c43aqf, ct_7i753c8gmtb38z)
-- changed, has no caller in the repository.
--
-- Not done here, on purpose: trigger 354 still fires at 10 USD while metric_registry names the recalibrated target (<= 95, COST-BUDGET-RECALIBRATION-1);
-- the metric reads 173.88, so the breach is real at either number and the threshold is the owner's recalibration to complete, not this change's.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control IN ('research-width-governor', 'research-model-skip-gauge', 'research-fallback-price-guard', 'research-kimi-last-resort'); DELETE FROM failure_modes WHERE fm_key IN ('wai-spend-per-paper', 'wai-rate-limit-spiral'); DELETE FROM remediation_contracts WHERE class IN ('fm-wai-spend-per-paper', 'fm-wai-rate-limit-spiral'); DELETE FROM ops_config WHERE key IN ('research_governor', 'research_kimi_last_resort') AND note LIKE 'WAI-WIDTH-GOVERNOR-1%'; UPDATE analytics_metric_triggers SET action = replace(action, char(10) || 'WAI-WIDTH-GOVERNOR-1 (2026-10-19): the one-file markError lever was dropped here (workersAiRunRateUsd, the only function its code tasks changed, has no caller); qnfo-research-exec 0.25.0 governs the stage width (AIMD under the LEAN-WIDTH-1 cap), skips a rate-limited model for 20 s, never falls back to a dearer model and calls kimi-k2.6 last. Closing signal: cost_daily workers_ai per published paper (fm-wai-spend-per-paper), then this metric converging.', char(10) || 'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) || 'code-anchor: async function markError(env, row, msg) {') WHERE id IN (409, 3687);
-- spof-review: no new single point of failure. The governor reads three indexed event queries per tick and returns the plain cap on any D1 fault; ops_config research_governor = off
-- restores the plain cap, research_kimi_last_resort = off drops the last kimi-k2.6 retry, and the gauge expires by itself after 20 s.

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
  ('research-width-governor', 'qnfo-research-exec widthGovern and researchParallel (WAI-WIDTH-GOVERNOR-1); ops_config research_governor', 'cap',
   'a stage width above what the Workers AI per-minute limit allows: every rate-limited call is retried and re-run, so spend rises while throughput falls', 1, 'keep', 'applied',
   'ops_config research_governor = off restores the plain LEAN-WIDTH-1 cap; the width never goes under 4 (never a stop) and grows back by 2 per clean 10-minute tick; a D1 fault returns the cap',
   NULL, 'ai_call_counters qnfo-research-exec 2026-10-18: 7720 calls, 3140 errors (glm-5.3-flash 3022 of 4647), 3.77M neurons for 24 papers at width 48; 2026-10-19 at width 24: 3213 calls, 173 errors, 2.41M neurons, 47 papers so far', 99924, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-model-skip-gauge', 'qnfo-research-exec aiText (_aiRateSkip, AI_MODEL_SKIP_MS = 20000)', 'pause',
   'every slot of an isolate calling a model that has just answered 3021/3040, which only prolongs the limit', 0, 'keep', 'applied',
   'the pause is 20 s and expires by itself; a model with a cheaper fallback is replaced by it at once, a model without one waits the window once and is called again; a timeout (3046) sets no gauge',
   NULL, 'cloud_ops_events 2026-10-18 05:00-08:00Z: about 30 first-attempt rate limits per 10 minutes against about 47 stage runs; 1645 backoff-exhausted warnings on glm-5.3-flash', 99924, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-fallback-price-guard', 'qnfo-research-exec aiFallbackFor and AI_RATE_FALLBACK', 'guard',
   'a rate-limited call that is re-bought on a dearer model (glm-5.3-flash 13,636 -> gpt-oss-120b 31,818 input rate, 2.3x)', 0, 'keep', 'applied',
   'a fallback is taken only when its __AI_ATTR_RATES input rate is not above the primary''s; otherwise the call waits one gauge window and tries once more, then the stage retries next tick; a fallback table entry that names a dearer model is refused at run time',
   NULL, 'qnfo-research-exec __AI_ATTR_RATES: glm-5.3-flash 13636, gpt-oss-120b 31818, kimi-k2.6 86364 neurons per M input tokens', 99937, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('research-kimi-last-resort', 'qnfo-research-exec stageRevise and the verify text path; ops_config research_kimi_last_resort', 'guard',
   'kimi-k2.6 as the first or second model: 6.3x the glm-5.3-flash input rate, 172 of 324 calls failed on 2026-10-19 (3046 timeouts of about 210 s), 29% of the worker''s neurons', 0, 'keep', 'applied',
   'the chain is gpt-oss-120b, glm-5.3-flash, then one kimi-k2.6 call; ops_config research_kimi_last_resort = off drops that call and the stage fails as revise-noop / verify-unrun as before',
   NULL, 'ai_call_counters qnfo-research-exec 2026-10-19: kimi-k2.6 324 calls, 172 errors, 705 kneurons of 2409', 99928, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
  ('research_governor', 'on', 'WAI-WIDTH-GOVERNOR-1 (2026-10-19, qnfo-research-exec 0.25.0): on = AIMD stage width under the LEAN-WIDTH-1 cap (halve when more than 15% of a tick''s stage runs were rate-limited, +2 per clean tick, floor 4); off = the plain cap. Revert: set off.'),
  ('research_kimi_last_resort', 'on', 'WAI-WIDTH-GOVERNOR-1 (2026-10-19, qnfo-research-exec 0.25.0): on = one kimi-k2.6 call after gpt-oss-120b and glm-5.3-flash in revise and the verify text path; off = no kimi-k2.6 call there. Revert: set off.');

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('wai-spend-per-paper', 'The research pipeline spends more Workers AI neurons per published paper than the cost target allows',
   'a stage width fixed above the Workers AI rate limit (width 48 on 2026-10-18: 3140 of 7720 calls failed and were re-run), a rate-limited call re-bought on a dearer model, and kimi-k2.6 (6.3x the flash input rate, about half its calls failing) as the first or second revise model',
   'qnfo-research-exec 0.25.0 WAI-WIDTH-GOVERNOR-1: AIMD stage width under the LEAN-WIDTH-1 cap, a 20 s per-model skip after a 3021/3040, no fallback to a dearer model, kimi-k2.6 only as the last retry',
   'workers_ai cost per published paper over the last 3 full days above 0.75 USD with at least 15 papers', 'fm-wai-spend-per-paper', '2026-10-19', 99924,
   'a rate-limit episode at a width the account cannot serve, or a pipeline that re-runs stages instead of finishing them',
   'cost_daily workers_ai 15.33, 39.36 and 30.11 USD on 10-17, 10-18 and 10-19; 38 papers for 63.20 USD over 10-16..10-18 (1.66 per paper)',
   'fleet AI spend: the metrics workers_ai_cost_30d_usd, fleet_ai_run_rate_30d_usd and workers_ai_run_rate_usd stay in breach'),
  ('wai-rate-limit-spiral', 'A fixed stage width keeps a rate-limited model under load, so most calls fail and are re-run',
   'the width was a static number (96, clamped to 48) and nothing reduced it when 3021/3040 answered 54-86% of glm-5.3-flash calls; a person lowered it after about six hours',
   'qnfo-research-exec 0.25.0 widthGovern halves the next width within one tick of a rate-limited reading and the model skip gauge stops the other slots hammering the same model',
   'no research-width event in the last 2 hours once the governor has run, or a glm-5.3-flash error share of 0.2 or more today', 'fm-wai-rate-limit-spiral', '2026-10-19', 99924,
   'more than 15% of the tick''s stage runs with a first-attempt 3021/3040', 'research-width events with mode=halve; ai_call_counters glm-5.3-flash errors/calls above 0.2',
   'qnfo-research-exec throughput and the Workers AI spend');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at) VALUES
  ('fm-wai-spend-per-paper', NULL, 'WAI-WIDTH-GOVERNOR-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE published_at >= date(''now'', ''-3 days'') AND published_at < date(''now'')) < 15 OR (SELECT COALESCE(SUM(usd), 0) FROM cost_daily WHERE source = ''workers_ai'' AND date >= date(''now'', ''-3 days'') AND date < date(''now'')) <= 0.75 * (SELECT COUNT(*) FROM research_queue WHERE published_at >= date(''now'', ''-3 days'') AND published_at < date(''now'')) THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 24, 'active', datetime('now')),
  ('fm-wai-rate-limit-spiral', NULL, 'WAI-WIDTH-GOVERNOR-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''research-width'') = 0 THEN ''1'' WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''research-width'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'')) < 6 THEN ''0'' WHEN COALESCE((SELECT 1.0 * SUM(errors) / NULLIF(SUM(calls), 0) FROM ai_call_counters WHERE worker = ''qnfo-research-exec'' AND day = date(''now'') AND model LIKE ''%/glm-5.3-flash''), 0) >= 0.2 THEN ''0'' ELSE ''1'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'));

-- The one-file markError lever of triggers 3687 and 409 asked for a code task that cannot move either metric; the note replaces it.
UPDATE analytics_metric_triggers
SET action = replace(action, char(10) || 'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) || 'code-anchor: async function markError(env, row, msg) {',
  char(10) || 'WAI-WIDTH-GOVERNOR-1 (2026-10-19): the one-file markError lever was dropped here (workersAiRunRateUsd, the only function its code tasks changed, has no caller); qnfo-research-exec 0.25.0 governs the stage width (AIMD under the LEAN-WIDTH-1 cap), skips a rate-limited model for 20 s, never falls back to a dearer model and calls kimi-k2.6 last. Closing signal: cost_daily workers_ai per published paper (fm-wai-spend-per-paper), then this metric converging.')
WHERE id IN (409, 3687) AND instr(action, 'code-anchor: async function markError(env, row, msg) {') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6', 'a width that adapts to the rate limit and a model order that keeps the dear, failing model last cost less per published paper than a fixed width under a cap',
 'WAI-WIDTH-GOVERNOR-1: qnfo-research-exec 0.25.0 AIMD stage width, 20 s model skip gauge, no fallback to a dearer model, kimi-k2.6 last; migrations/2026-10-19-wai-width-governor.sql adds the controls, two failure modes with fm-<key> detectors and the trigger lever correction',
 'ai_call_counters and cost_daily 2026-10-17..19: 10-18 7720 calls, 3140 errors, 3.77M neurons, 24 papers; 10-19 so far 3213 calls, 173 errors (172 on kimi-k2.6), 2.41M neurons, 47 papers; kimi-k2.6 is 29% of the neurons for 10% of the calls; glm-5.3-flash falls back to a model with 2.3x its input rate',
 'applied through the canonical path on merge; the governor runs in the deployed worker', 'qnfo-research-exec stage width and the model order of revise and verify text; no other worker, no table schema, no ops_config value changed',
 'revert qnfo-research-exec; ops_config research_governor = off and research_kimi_last_resort = off; the migration Rollback header',
 'the pipeline slows itself when the model it uses is rate-limited and stops paying for a dearer or failing model',
 'workers_ai_usd_per_paper_3d <= 0.75 within 72 h', 'none',
 'widthGovern, researchParallel, aiText and stageRevise run from the source against node:sqlite and scripted env.AI (width-governor.test.mjs, 10 mutants killed), stageVerify text path (verify-unrun.test.mjs), the migration (width-governor-migration.test.mjs)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'WAI-WIDTH-GOVERNOR-1:') = 1);

-- Q08-YIELD-1 and Q08-REVIEWER-SWAP-1 (pillar research, cost second; agent_issues 99929, 99930, 2606 and 100118; q08-signal-engine 0.31.0). Companion to the worker change.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control IN ('q08-source-sufficiency-pregate', 'q08-repeat-class-repair-stop'); DELETE FROM remediation_contracts WHERE class IN ('fm-q08-thin-source-composed', 'fm-q08-repeat-class-extension'); DELETE FROM failure_modes WHERE fm_key IN ('q08-thin-source-composed', 'q08-repeat-class-extension'); DELETE FROM capability_ledger WHERE capability IN ('q08-run-yield-log', 'q08-reviewer-health-order'); DELETE FROM control_registry WHERE control = 'q08-reviewer-health-order'; DELETE FROM remediation_contracts WHERE class = 'fm-q08-reviewer-error-share'; DELETE FROM failure_modes WHERE fm_key = 'q08-reviewer-error-share';
--
-- Measured 2026-10-19 09:20Z to 10:05Z on q08-signal (D1 10fd74b7), before this change:
--   * 7 days of engine_runs: 311 runs, 266 gate_failed, 17 ok, 14 deferred, 14 skipped (pass rate 0.055); q08_gate_pass_rate_7d 0.06 and
--     q08_neurons_per_published_piece_7d 83,598 against targets 0.5 and 6,000. Ok per day: 7, 4, 1, 3, 1, 1, 0 from 10-13 to 10-19.
--   * engine_runs held no record of what a run read or spent (columns id, ran_at, signals_scraped, signals_scored, piece_published,
--     top_signal, model, ms, status, error). The size of the source material is stored nowhere, so the share of failures that came from
--     thin sources could not be computed. The nearest proxy, signal_log.friction_point, does not separate the outcomes: hn published
--     avg 1587 chars (9 rows) against gate_failed avg 2234 (192); arxiv published 1455 (8) against gate_failed 1409 (58). That is why the
--     worker now logs the whole size the writer saw (source_chars) and derives the floor from it instead of from a constant.
--   * repair cost: 32 of the 266 failed runs extended a pruned draft (average 459 s against 377 s for the others); 19 of those 32 did so in
--     round 2 or later, after an earlier round had already pruned flagged claims, 11 of the 19 wrote the extension and still failed
--     (average 494 s). Runs that ended "too short after pruning": 95; "unsupported claim": 184.
--   * the 2800-character PUBLISH_MIN_CHARS, the FACTS and fabrication rules and every fact-check threshold are not touched by this change.
--
-- What the worker does from 0.31.0:
--   1. every generation row of engine_runs carries source_chars, source_kind (hn|arxiv|github + fulltext|summary, or forecast),
--      compose_calls and verify_calls (nullable columns the worker adds itself: the table is created outside worker.js);
--   2. the thin-source test is the smallest source_chars among the ok runs of the last 30 days once five exist (never above the 2200
--      rich-source threshold); below it the run ends as skipped with no model call, and the measured candidates are marked thin_skipped in
--      signal_log, which the existing 24-hour retry window reads: they are retried after 24 hours, never dropped;
--   3. a repair round that flags only claim classes an earlier round flagged and whose prune leaves the draft under the 2800-character
--      floor stops the repair instead of spending a model revision on an extension.
-- The pre-gate is a filter and the repair stop a guard, so each has its control_registry row below.

--
-- RE-MEASURED before landing, 2026-10-19 14:50Z (read-only): engine_runs 7 days 271 gate_failed, 17 ok, 14 skipped, 14 deferred (last ok 2026-10-18 20:15Z, run 651
-- at 14:05Z gate_failed); v_metric_trigger_state 537 q08_gate_pass_rate_7d 0.059 (hit 1, target 0.5) and 538 q08_neurons_per_published_piece_7d 86,702.773 (hit 1,
-- target 6000); q08_hours_since_last_piece 17.8; q08_panel_unavailable_share_7d 0. Row counts this file touches (all absent before): control_registry 3 inserted
-- (no q08-* control existed, so the former INSERT OR REPLACE is INSERT OR IGNORE and a second apply changes nothing), failure_modes 3, remediation_contracts 3,
-- capability_ledger 2, decision_log 1. No issue, card or contract is closed, reopened or dismissed; 99929, 99930 and 2606 close on their own probes.
--
-- SPEND REVIEW (Workers AI is in breach: cost triggers 354 175.75, 409 474.45, 3687 410.84 against 95). ai_call_counters, worker q08-signal-engine, three days to
-- 2026-10-19, neurons per answered call (errored calls carry no tokens): deepseek-v4-flash-0731 241, gpt-oss-20b 221, glm-5.3-flash 247 (43% of its calls error),
-- gpt-oss-120b 385, nemotron-3-120b 592, kimi-k2.6 731, qwen3.8-27b 1230 (76% error). The first form of the swap put deepseek-v4-flash and kimi first in the
-- fact-check: a verdict pair costs 972 neurons, against about 696 for the order on main (glm answered 57% of the time and kimi took the other 43%), about +40% a
-- round and roughly +6 dollars a month on q08's fact-check, so it would have raised Workers AI spend. The landed order puts the cheaper small judge gpt-oss-20b
-- second (pair 462 neurons, ENSEMBLE-POLICY-1 rule 3: small judges, cheapest capable first at a breached cap); kimi stays next and is the second reviewer when
-- the writer is the openai family; reviewerHealth() moves any reviewer erroring at 30% on 12 calls behind the rest, so kimi is asked when gpt-oss-20b is not
-- answering. The reader panel pair is flat (kimi + deepseek-v4-flash 972 neurons against about 954 for the rotating panel on main). Expected effect on the fact-check
-- spend: about -34% a round when the writer is nemotron (83% of runs) and +40% when it is the openai family, about -21% weighted. Not measured after the deploy:
-- the verdict strictness of gpt-oss-20b against kimi; q08_gate_pass_rate_7d and the share of 'accuracy' failures will show it.
--
-- Q08-REVIEWER-SWAP-1 (same worker change, agent_issues 2606 and 100118; cluster publish-stalls). Measured 2026-10-19 from qnfo-audit
-- ai_call_counters (worker q08-signal-engine, three days): qwen3.8-27b 104 of 134 calls errored at 80 s on average, glm-5.3-flash 175 of 400 at 58 s,
-- nemotron-3-120b-a12b 68 of 376 (writer calls included), against kimi-k2.6 0 of 310 (19 s), gpt-oss-120b 0 of 218, deepseek-v4-flash-0731 4 of 401 (5.7 s).
-- Both failing models sat at the head of the reader panel (PANEL_POOL) and of the fact-check (FACTCHECK_POOL) after MODEL-FLOOR-1 (2026-10-17,
-- a4e91793) removed llama-3.3-70b, qwen3-30b-a3b and gemma-4, the judges that had answered every time. scripts/model-floor-guard.mjs bans those three,
-- so the swap does not bring them back: the working reviewers lead both lists (panel: kimi-k2.6, deepseek-v4-flash-0731; fact-check: deepseek-v4-flash-0731, gpt-oss-20b, kimi-k2.6) and the previous
-- reviewers (glm-5.3-flash, then qwen3.8-27b) stay in both pools as the per-request fallback. The worker also orders by what it measures: a reviewer with
-- 30% errors on 12 or more calls over two days (the same ai_call_counters rows) goes behind the others, so the previous order returns by itself
-- when the new head fails (reviewerHealth). Fail-open: no binding, a failed read or every reviewer flagged leaves the declared order, and no call is refused.
-- The q08 fact-check failed 28 of 44 runs in 24 h at 606 s on average and the reader panel 10 at 305 s (engine_runs), 32 runs in a row (615 to 646) published
-- nothing, and q08_hours_since_last_piece read 16.4 at 2026-10-19T12:40Z; the swap cuts the minutes each of those spends on failed reviewer calls, and the
-- source-sufficiency gate above cuts the runs. Whether either restores publishing is not claimed: the fact-check yield lever is Q08-FACT-LEDGER-1 (separate).
-- ENSEMBLE-POLICY-1 is unchanged (small judges, one per family, never the writer's family); the effect on the panel pass rate is not a lever and is not tuned.

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('q08-source-sufficiency-pregate', 'q08-signal-engine/worker.js generate (thinSourceVerdict, learnedSourceFloor, markThinSkipped)', 'filter',
 'composing, panel-reading and fact-checking a piece from a source too small to ground 2800 characters of reporting (a compose, a reader panel and a two-family fact-check per failed run)',
 0, 'replace', 'applied',
 'before five ok runs carry a logged source_chars, or when the floor cannot be read, the previous flat test applies (600 characters of fetched article, THIN_MIN_ARTICLE); a candidate holding 2200 characters of source material or more never meets this filter; a skipped candidate is marked thin_skipped and retried after 24 hours (Q08-SIGNAL-RETRY-1 window), so nothing is dropped; the floor is the thinnest source that has published in 30 days, so it falls by itself when a thinner source publishes',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
 'Q08-YIELD-1 2026-10-19: replaces the flat 600-character thin test (Q08-FULLTEXT-1) with a floor derived from the ok runs of the last 30 days. Measured before: 266 of 311 runs gate_failed in 7 days, 83,598 neurons per published piece; source size was logged nowhere, and signal_log.friction_point lengths do not separate published from failed (hn 1587 vs 2234, arxiv 1455 vs 1409), so no constant was chosen. Tested in q08-signal-engine/source-sufficiency.test.mjs (floor derivation, skip before any model call, 24-hour retry marking, flat test before five logged ok runs). Review again when five logged ok runs exist: compare the skipped share (status skipped, error like source too thin) with the gate_failed share by source_chars bucket.',
 99929, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('q08-repeat-class-repair-stop', 'q08-signal-engine/worker.js verifyAndRevise (claimClassesOf, recurring)', 'guard',
 'spending a model revision and a two-family re-verification extending a pruned draft when an earlier round already pruned the same classes of unsupported claim',
 0, 'keep', 'applied',
 'the first prune that leaves a draft under the floor still gets its one extension (PRUNE-EXTEND-1 is unchanged for a draft no earlier round flagged); every other failure path (lede block, model revision, tick budget) is unchanged; the stopped run ends with the same failure text and a trail line, and its signal is retried after 24 hours like any gate_failed run',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
 'Q08-YIELD-1 2026-10-19: 19 failed runs in 7 days extended a pruned draft in round 2 or later (11 wrote the extension and still failed, 494 s average). The stop applies only to a recurrence after a prune; it cannot make a publishable draft fail earlier than the extension would have, but it ends a repair whose earlier round already proved the writer restates unsupported claims. Whether any ok run used a later-round extension is not known (ok rows keep no trail); engine_runs.compose_calls now measures it. Review when 20 logged runs exist after the deploy.',
 99929, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('q08-thin-source-composed', 'q08 composes, panel-reads and fact-checks a piece from a source too small to ground it, and the run ends gate_failed', 'the thin-source test was a flat 600 characters of fetched article, and a run recorded neither how much source material the writer saw nor how many model calls it spent', 'q08-signal-engine 0.31.0 logs source_chars on every run and skips, before any model call, a candidate below the thinnest source that has published (30 days, five logged ok runs required); the skipped candidate is retried after 24 hours', 'remediation_contracts fm-q08-thin-source-composed (d1-query@q08-signal, hourly)', 'fm-q08-thin-source-composed', '2026-10-19', 'a hacker news thread or an abstract-only paper whose article text is short, ranked first by volatility', '266 of 311 runs gate_failed in 7 days at 83,598 neurons per published piece; q08_gate_pass_rate_7d 0.06', 'q08.org publishing yield and Workers AI spend'),
 ('q08-repeat-class-extension', 'q08 extends a pruned draft after an earlier repair round already pruned the same classes of unsupported claim', 'verifyAndRevise treated every short prune as new and spent a model revision plus a full re-verification on each, although the writer had shown it restates unsupported claims', 'q08-signal-engine 0.31.0 stops the repair at the first prune round that leaves the draft under the 2800-character floor with the same claim classes recurring, and records the stop in the repair trail', 'remediation_contracts fm-q08-repeat-class-extension (d1-query@q08-signal, hourly)', 'fm-q08-repeat-class-extension', '2026-10-19', 'two consecutive fact-check rounds flag unsupported claims and the second prune leaves under 2800 characters of body', '19 failed runs in 7 days spent an extension in round 2 or later at 494 s average, 11 of them wrote it and failed', 'q08 tick time and Workers AI spend');

-- The two run-log contracts are first due three hours after the file is applied: the worker adds the engine_runs columns they read on its first run after
-- the deploy, and a probe on a column that does not exist yet would read as an error, not as a verdict. The reviewer contract further down waits 30 hours.
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES
 ('fm-q08-thin-source-composed', NULL, 'five or more ok runs of the last 30 days carry a logged source_chars and a gate_failed run in the last 24 hours composed from a source below the thinnest one that published', 'q08-signal-engine skips such a source before any model call on its next tick', 'SELECT ''0'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM engine_runs WHERE status = ''ok'' AND source_chars IS NOT NULL AND ran_at >= datetime(''now'', ''-30 days'')) >= 5 THEN (SELECT COUNT(*) FROM engine_runs e WHERE e.status = ''gate_failed'' AND e.source_chars IS NOT NULL AND e.ran_at >= datetime(''now'', ''-24 hours'') AND e.source_chars < MIN(2200, (SELECT MIN(o.source_chars) FROM engine_runs o WHERE o.status = ''ok'' AND o.source_chars IS NOT NULL AND o.ran_at >= datetime(''now'', ''-30 days'')))) ELSE 0 END AS TEXT) AS observed', 'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+3 hours')),
 ('fm-q08-repeat-class-extension', NULL, 'a gate_failed run written by q08-signal-engine 0.31.0 or later extended a pruned draft after an earlier prune round', 'q08-signal-engine stops the repair at the first recurring short prune', 'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM engine_runs WHERE compose_calls IS NOT NULL AND status = ''gate_failed'' AND ran_at >= datetime(''now'', ''-24 hours'') AND error LIKE ''%prune -%extending the pruned draft%''', 'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+3 hours'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('q08-run-yield-log', 'migrations/2026-10-19-q08-gate-yield-metrics.sql (Q08-YIELD-1, q08-signal-engine 0.31.0)', 'q08-signal-engine 0.31.0 deployed; engine_runs columns source_chars, source_kind, compose_calls, verify_calls added by the worker',
 'every generation row records the source material it read and the model calls it spent; hourly detectors fm-q08-thin-source-composed and fm-q08-repeat-class-extension',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'q08 can state which share of gate_failed runs came from thin or summary-only sources and what each run cost in model calls; the thin-source floor is learned from the ok runs rather than guessed');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('q08-reviewer-health-order', 'q08-signal-engine/worker.js reviewerHealth, healthFirst, pickPanel, factCheckOrder', 'filter',
 'asking a reader-panel judge or a fact-check reviewer that errors on most calls (an 80 s timeout each) before one that answers',
 0, 'keep', 'applied',
 'the declared order is the floor: with no AUDIT binding, a failed ai_call_counters read, or every reviewer flagged, the declared order stands and every call is still made; a flagged reviewer (30% or more errors on 12 or more calls in two days) is moved behind the others and is asked when nothing else is left, never removed; the previous panel (glm-5.3-flash, qwen3.8-27b) stays in PANEL_POOL and in FACTCHECK_POOL as the per-request fallback, so no family leaves either pool and a fresh panel can still reach it; this is an ordering by measured error share (backpressure), not a hold',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
 'Q08-REVIEWER-SWAP-1 2026-10-19: ai_call_counters, worker q08-signal-engine, three days: qwen3.8-27b 104 of 134 errored (80 s), glm-5.3-flash 175 of 400 (58 s), kimi-k2.6 0 of 310, deepseek-v4-flash-0731 4 of 401, gpt-oss-120b 0 of 218. Before this change the two failing models led both reviewer lists; fact-check runs that failed averaged 606 s and reader-panel failures 305 s (engine_runs, 24 h). The judges MODEL-FLOOR-1 removed (llama-3.3-70b, qwen3-30b-a3b, gemma-4) are banned by scripts/model-floor-guard.mjs and are not restored. Tested in q08-signal-engine/reviewer-pool.test.mjs (order, flag thresholds, cache and fail-open read, working reviewers asked first, previous reviewers still reached when the others fail). The effect on the panel pass rate is not measured and is not a lever (ENSEMBLE-POLICY-1 rule 8). Review again after fm-q08-reviewer-error-share has read ok for 7 days.',
 2606, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('q08-reviewer-error-share', 'q08 asks reader-panel and fact-check reviewers that error on most calls before reviewers that answer, so every round waits out 58 to 80 s failures', 'the reviewer lists were fixed orders chosen once and never compared with ai_call_counters; MODEL-FLOOR-1 (2026-10-17) removed the judges that answered every time and left qwen3.8-27b (77% errors) and glm-5.3-flash (44%) at the head of both lists', 'q08-signal-engine 0.31.0 puts the measured working reviewers first and keeps the previous ones as the tail fallback, and orders by the last two days of ai_call_counters (30% errors on 12 or more calls moves a reviewer behind the rest), which restores the previous order by itself if the new head fails', 'remediation_contracts fm-q08-reviewer-error-share (d1-query, hourly)', 'fm-q08-reviewer-error-share', '2026-10-19', 'a model in PANEL_POOL or FACTCHECK_POOL has 30% or more errors on 12 or more calls in two days and is still asked ahead of a reviewer that answers', 'fact-check runs that failed averaged 606 s and reader-panel failures 305 s in 24 h; 32 consecutive runs (615 to 646) published nothing', 'q08.org publishing yield, tick time and Workers AI spend');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES
 ('fm-q08-reviewer-error-share', NULL, 'q08-signal-engine 0.31.0 or later is deployed and a full UTC day of calls has run on its reviewer order; a model with 30% or more errors on 12 or more calls over two days took more than a tenth of the worker calls that day', 'reviewerHealth orders the erroring reviewers behind the working ones on the next panel read or fact-check; if the share stays high, the declared order in PANEL_POOL or FACTCHECK_POOL is reviewed against ai_call_counters', 'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT SUM(calls) FROM ai_call_counters WHERE worker = ''q08-signal-engine'' AND day = date(''now'') AND model IN (SELECT model FROM ai_call_counters WHERE worker = ''q08-signal-engine'' AND day >= date(''now'', ''-2 days'') GROUP BY model HAVING SUM(calls) >= 12 AND SUM(errors) * 10 >= SUM(calls) * 3)), 0) * 10 <= COALESCE((SELECT SUM(calls) FROM ai_call_counters WHERE worker = ''q08-signal-engine'' AND day = date(''now'')), 0) THEN ''ok'' ELSE ''erroring models took '' || COALESCE((SELECT SUM(calls) FROM ai_call_counters WHERE worker = ''q08-signal-engine'' AND day = date(''now'') AND model IN (SELECT model FROM ai_call_counters WHERE worker = ''q08-signal-engine'' AND day >= date(''now'', ''-2 days'') GROUP BY model HAVING SUM(calls) >= 12 AND SUM(errors) * 10 >= SUM(calls) * 3)), 0) || '' of '' || COALESCE((SELECT SUM(calls) FROM ai_call_counters WHERE worker = ''q08-signal-engine'' AND day = date(''now'')), 0) || '' q08 calls today'' END AS observed', 'd1-query', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+30 hours'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('q08-reviewer-health-order', 'migrations/2026-10-19-q08-gate-yield-metrics.sql (Q08-REVIEWER-SWAP-1, q08-signal-engine 0.31.0)', 'q08-signal-engine 0.31.0 deployed; the AUDIT binding it already holds reads ai_call_counters',
 'the reader panel and the fact-check order their reviewers by the last two days of measured errors and fall back to the declared order when the read fails; hourly detector fm-q08-reviewer-error-share',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'q08 stops waiting out the failures of a reviewer that is erroring and returns to the previous reviewers by itself if the new ones start failing; no model the MODEL-FLOOR-1 guard bans is used');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:q08-yield-1',
 'the brief for Q08-REVIEWER-SWAP-1 named qwen3-30b-a3b-fp8 as the replacement reviewer (0 errors in 482 calls); the standing grant allows a cheaper model with a per-request fallback and an automatic revert on errors',
 'Q08-YIELD-1 and Q08-REVIEWER-SWAP-1: landed the handoff patch (source_chars and call logging, source-sufficiency pre-gate, repeat-class repair stop) and moved the working reviewers (kimi-k2.6, deepseek-v4-flash-0731) ahead of glm-5.3-flash and qwen3.8-27b in PANEL_POOL and FACTCHECK_POOL, with ordering by measured error share; qwen3-30b-a3b-fp8 was NOT used',
 'scripts/model-floor-guard.mjs bans qwen3-30b, llama and gemma-4 at code level (MODEL-FLOOR-1, a4e91793, 2026-10-17) and its restored workflow fails CI on a worker.js that selects one, so the named replacement is a refused action and is not worded around; ai_call_counters worker q08-signal-engine three days: qwen3.8-27b 104 of 134 errors (80 s), glm-5.3-flash 175 of 400 (58 s), kimi-k2.6 0 of 310, deepseek-v4-flash-0731 4 of 401, gpt-oss-120b 0 of 218; qnfo-ai routes kimi-k2.6, deepseek-v4-flash and gpt-oss-120b; q08 reviewers run on its own Workers AI binding',
 'pending',
 'q08-signal-engine reader panel and fact-check reviewer order, the engine_runs columns the worker adds, and thin-source runs now end skipped with no model call; the panel may judge more strictly because the lenient judges (zai 61% pass, alibaba 77%) that mostly failed are now asked last; expected after the deploy: reviewer calls to models with 30% or more errors fall under a tenth of q08 calls on the first full UTC day (contract fm-q08-reviewer-error-share); q08 fact-check neurons a round fall (about -21% weighted); q08_hours_since_last_piece and q08_gate_pass_rate_7d are not predicted to recover from this change alone, because the fact-check yield lever (Q08-FACT-LEDGER-1) is separate',
 'revert the q08-signal-engine change through the canonical path, or leave the code and the declared pool order stands without the health read (no AUDIT binding is the same as the floor); the Rollback line of migrations/2026-10-19-q08-gate-yield-metrics.sql removes the registry rows (this row stays: decision_log is append-only)',
 'q08 reviewer order follows measured error share and returns to the previous reviewers by itself; q08 run rows record source size and model calls',
 'q08_panel_unavailable_share_7d <= 0.05 within 168 h',
 NULL,
 'qnfo-audit D1 ai_call_counters (live 2026-10-19), q08.org /health and /api/ensemble, scripts/model-floor-guard.mjs, qnfo-ai MODELS catalog, q08-signal-engine reviewer-pool.test.mjs and source-sufficiency.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'session_01QpQv19uh1padRwZ3u1r766:q08-yield-1' AND action LIKE 'Q08-YIELD-1 and Q08-REVIEWER-SWAP-1:%');

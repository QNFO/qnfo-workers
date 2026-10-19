-- SPEND-DOWNGRADE-INCONCLUSIVE-1 registry rows (2026-10-19, pillar cost; agent_issues 100238 to 100241 and 100262 are the measured cases).
-- Failure mode: a routed calibration ping that the router answered with another model (detail "downgraded to glm-5.3-flash") was scored as a
-- failure of the model that was asked. Measured 2026-10-19 in ai_calibration_results (probe = model): the full sweeps of 18:00:31Z, 20:00:31Z and
-- 22:00:31Z each wrote 10 rows, 4 pass and 6 downgraded (kimi-k2.6, kimi-k2.7-code, gpt-oss-120b, glm-5.3, deepseek-v4-pro-wa,
-- deepseek-v4-flash-wa), 28 downgraded rows in all, the last at 22:00:31Z. The sweep took the swap for a failure: degraded at one full sweep, failing
-- plus an "[ai-cal] model probe failing" issue at the next, while the folded prober member wrote ok from its direct probe in between.
--   * primary fix: qnfo-ai 5.37.0 (MODEL-HEALTH-FLAP-1, #3161, deployed 2026-10-19T22:18:15Z) honours no_downgrade for the caller
--     qnfo-ai-calibration at max_tokens 512 or less, so the 16-token ping reaches the model it names. The lean run of 22:30:30Z passed 6 of 6.
--   * second path: qnfo-ai-calibration 1.6.4 treats a swapped ping as inconclusive and judges the model on the direct env.AI.run probe, or on nothing.
-- What this file adds, because the two code changes leave the mode uncatalogued and make its return silent: with 1.6.4 a swapped ping writes ok (when
-- the direct probe passes), files no issue and leaves the probe = model row at "downgraded", so a router that stops honouring no_downgrade would be
-- reported only by roster_members_degraded, which needs more than 20 percent of the 24 h probe = model rows to be non-pass (hours, beyond the 120
-- minute SLA). The detector reads the row itself.
--   * failure mode calibration-ping-swapped and its detector fm-calibration-ping-swapped: distinct models whose probe = model row reads
--     "downgraded" after the qnfo-ai 5.37.0 deploy and within the last 150 minutes, expected 0. The contract runs every 60 minutes.
--     Lookback: 150 minutes = one full sweep period (120 minutes) plus one 30-minute tick of slack. With 1.6.4 a model whose direct probe passes stays
--     ok, the lean ticks (which re-probe only not-ok models) skip it, and a swapped row appears at the next full sweep (every 120 minutes), so one
--     hourly read always falls inside the window. A model whose direct probe fails goes not-ok and is re-probed every 30 minutes, which is more rows,
--     not fewer.
--     Floor: ts must also be after 1792448295000 (2026-10-19T22:18:15Z, the qnfo-ai 5.37.0 deploy). The rows before it are the defect this file
--     registers, from router 5.36.11, and without the floor the contract fails at birth (read 2026-10-19 23:08Z: 6 with no floor, 0 with it). The
--     floor stops mattering at 00:48:15Z, when the 150-minute lookback passes it. The first full sweep after the deploy is the 00:00Z tick, so until
--     then the detector reads 0 for lack of rows, not from evidence; the lean run of 22:30:30Z (6 of 6 pass) is the only post-deploy measurement.
--   * decision_log: the sweep now decides on its own that a direct pass overrides a swapped ping (it writes ok and closes the open issue).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-calibration-ping-swapped'; DELETE FROM failure_modes WHERE fm_key = 'calibration-ping-swapped';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('calibration-ping-swapped',
  'a routed calibration ping that the router answered with another model is scored as a failure of the model that was asked',
  'the sweep pings each model through qnfo-ai with 16 tokens and the spend governor (spendGovern, spendGovernWA) swapped the request for glm-5.3-flash; probeCompletion returned "downgraded" and the sweep scored it a failed probe: degraded at one full sweep, failing plus an [ai-cal] model probe failing issue at the next, while the prober member wrote ok from its direct probe in between (six models flapped from 12:00Z to 22:00Z on 2026-10-19)',
  'SPEND-DOWNGRADE-INCONCLUSIVE-1: qnfo-ai 5.37.0 (MODEL-HEALTH-FLAP-1, #3161) honours no_downgrade for the caller qnfo-ai-calibration at max_tokens 512 or less, and qnfo-ai-calibration 1.6.4 treats a swapped ping as inconclusive (judged on the direct Workers AI probe, or not written); fm-calibration-ping-swapped reports a return of the swap, which 1.6.4 no longer turns into an issue',
  'the fm-calibration-ping-swapped contract counts distinct models whose probe = model row reads downgraded in ai_calibration_results within the last 150 minutes and after the qnfo-ai 5.37.0 deploy (2026-10-19T22:18:15Z), expected 0, read every 60 minutes',
  'fm-calibration-ping-swapped', '2026-10-19', 100238,
  'the router does not honour no_downgrade for the 16-token ping: an older router, a token ceiling below the ping, or the caller not identified by the props.caller of the QNFO_AI binding',
  'ai_calibration_results probe = model rows with status downgraded and detail "downgraded to glm-5.3-flash"; before 1.6.4 also [ai-cal] model probe failing issues and roster_members_degraded',
  'the model roster and the code-loop ladder (v_executor_roster reads the 24 h probe = model rows), and the model-health issue backlog');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-calibration-ping-swapped', NULL, 'SPEND-DOWNGRADE-INCONCLUSIVE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(DISTINCT target) FROM ai_calibration_results WHERE probe = ''model'' AND status = ''downgraded'' AND ts > MAX((CAST(strftime(''%s'', ''now'') AS INTEGER) - 9000) * 1000, 1792448295000)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-ai-calibration', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:ai-cal-downgraded',
  'a calibration ping that the router answered with another model says nothing about the model that was asked, so it is not a failure; the direct Workers AI probe is the conclusive measurement, and where there is none no verdict is written',
  'SPEND-DOWNGRADE-INCONCLUSIVE-1: qnfo-ai-calibration 1.6.4 judges a model whose ping the router swapped on the direct env.AI.run probe (a pass writes ok with 0 failures and closes the open [ai-cal] issue, a failure takes the degraded then failing path) and writes nothing for a model with no direct probe; registry rows: failure mode calibration-ping-swapped and its detector fm-calibration-ping-swapped, which reports a return of the swap that the sweep no longer files as an issue',
  'qnfo-audit 2026-10-19 read-only: ai_calibration_results probe = model, full sweeps 18:00:31Z, 20:00:31Z and 22:00:31Z each 10 rows with 4 pass and 6 downgraded to glm-5.3-flash (28 downgraded rows, the last 22:00:31Z); the lean run of 22:30:30Z after qnfo-ai 5.37.0 (22:18:15Z) 6 of 6 pass; failure_modes held no row for the mode (nearest: model-health-issue-stale, health-ok-but-empty, cost-metric-includes-owner-spend); the detector read 0 at 23:08Z with the deploy floor and 6 without it; qnfo-ai-calibration/budget-probe.test.mjs section 4c and migrations/calibration-ping-swapped.test.mjs',
  'migration merged',
  'one failure_modes row and one remediation_contracts detector row (a read of ai_calibration_results); no model state is stored and no issue is filed or closed by this file',
  'revert qnfo-ai-calibration to 1.6.3, after which a swapped ping is scored as a failure again; ai_calibration_config budget_probe = off stops the direct verdict, and a swapped ping then writes no health row; the Rollback header removes the failure mode and its detector; decision_log is append-only and keeps this row',
  'a router regression of the no_downgrade path is reported by a detector within the hour and a 150 minute lookback, not by the 24 h roster share',
  'failure_modes_unprobed_pct <= 0 within 2 h',
  'none',
  'd1:qnfo-audit read-only (ai_calibration_results, failure_modes, remediation_contracts, decision_log schema and triggers, v_failure_mode_status), the qnfo-ai-calibration sweep source, node:sqlite fixtures'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SPEND-DOWNGRADE-INCONCLUSIVE-1:') = 1);

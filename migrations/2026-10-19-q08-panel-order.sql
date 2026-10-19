-- Q08-PANEL-CALIBRATION-1 (2026-10-19, pillar research; issues 99929 and 2606; q08-signal-engine 0.31.1)
--
-- WHAT WAS WRONG (read-only, q08-signal q08_reader_tests, role judge, 7 days to 2026-10-19T16:40Z; the finding is session_01QpQv19's independent
-- recheck of the Q08-REVIEWER-SWAP-1 patch, confirmed here on the rows)
--   Per-judge verdicts: deepseek-v4-flash-0731 pass 0.263 (194 verdicts, mean score 2.63), kimi-k2.6 pass 0.35 (60, 2.83), qwen3.8-27b pass 0.303
--   (33, 3.12), glm-5.3-flash pass 0.685 (181, 3.65). The reader panel passes at a mean of 3.5 with every score at least 3 (PANEL_PASS_MEAN).
--   q08-signal-engine 0.31.0 put kimi-k2.6 and deepseek-v4-flash, the two strictest judges, at the head of every round-1 panel (PANEL_PRIMARY_N 2) and
--   the health ordering moved glm and qwen, which err, behind them, so the panel was that strict pair. The share of round-1 pieces on which every
--   judge passed fell from 0.356 over 7 days to 0.258 over 3 days and 0.171 over 1 day. The swap works against the yield (q08_gate_pass_rate_7d 0.059)
--   it was written to raise. Its cost and latency intent is kept where it was measured to help: the fact-check order and the logging stay.
-- WHAT THIS CHANGES
--   ops_config q08_panel_order (new, default rotate): rotate = the reader panel rotates over the whole pool in the pre-0.31.0 order; measured =
--   the 0.31.0 order (revert switch, no deploy). Read by q08-signal-engine 0.31.1 panelRead, five-minute cache, fail open to rotate.
--   failure mode q08-panel-pass-share-low with its detector (d1-query@q08-signal): the round-1 panel pass share over 3 days stays at 0.20 or above
--   (reads 0.258 now; below 20 pieces it reads ok).
--   decision_log row with a scoreable prediction.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-q08-panel-pass-share-low'; DELETE FROM failure_modes WHERE fm_key = 'q08-panel-pass-share-low'; DELETE FROM ops_config WHERE key = 'q08_panel_order'
-- spof-review: no single point of failure added or removed; the switch fails open to the rotating order and the detector is a second, independent read.

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('q08_panel_order', 'rotate', 'Q08-PANEL-CALIBRATION-1 (q08-signal-engine 0.31.1): rotate = the reader panel rotates over the whole pool in the pre-0.31.0 order; measured = the 0.31.0 order (kimi-k2.6 and deepseek-v4-flash lead every round-1 panel, flagged reviewers behind). Measured 2026-10-19: those two judges pass 0.35 and 0.263 of their verdicts against 0.685 for glm-5.3-flash.');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('q08-panel-pass-share-low',
  'the q08 reader panel is so strict that few drafts clear it, so published pieces fall',
  'a reviewer order or pool that puts the strictest judges (kimi-k2.6 pass 0.35, deepseek-v4-flash pass 0.263 in q08_reader_tests) in every panel; the panel needs a mean of 3.5 and every score at least 3',
  'Q08-PANEL-CALIBRATION-1 (migrations/2026-10-19-q08-panel-order.sql, q08-signal-engine 0.31.1): the reader panel rotates over the whole pool; ops_config q08_panel_order = measured restores the 0.31.0 order; the detector reads the round-1 panel pass share',
  'the share of round-1 pieces on which every judge passed, over 3 days, is at least 0.20 (reads ok below 20 pieces)',
  'fm-q08-panel-pass-share-low', '2026-10-19', 99929,
  'a change of the reader panel order or pool',
  'q08_gate_pass_rate_7d stays under its floor and the round-1 panel pass share falls (0.356 over 7 days, 0.258 over 3 days and 0.171 over 1 day on 2026-10-19)',
  'q08.org and reading.q08.org publication rate; q08_gate_pass_rate_7d, q08_neurons_per_published_piece_7d');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-q08-panel-pass-share-low', NULL, 'Q08-PANEL-CALIBRATION-1', 'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM (SELECT piece_key FROM q08_reader_tests WHERE role = ''judge'' AND round = 1 AND created_at >= datetime(''now'', ''-3 days'') GROUP BY piece_key)) < 20 THEN ''ok'' WHEN 1.0 * (SELECT SUM(a) FROM (SELECT MIN(pass) AS a FROM q08_reader_tests WHERE role = ''judge'' AND round = 1 AND created_at >= datetime(''now'', ''-3 days'') GROUP BY piece_key)) / (SELECT COUNT(*) FROM (SELECT piece_key FROM q08_reader_tests WHERE role = ''judge'' AND round = 1 AND created_at >= datetime(''now'', ''-3 days'') GROUP BY piece_key)) >= 0.2 THEN ''ok'' ELSE ''low round-1 panel pass share'' END AS observed',
  'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a reader panel is a quality gate, not a filter to be made as strict as possible: its judges must be calibrated across the pool, and a swap that fixes latency must not halve the pass chance',
  'Q08-PANEL-CALIBRATION-1: q08-signal-engine 0.31.1 rotates the reader panel over the whole pool in the pre-0.31.0 order (switch ops_config q08_panel_order = measured restores 0.31.0); the fact-check order, the logging and the essay-only thin-source floor of 0.31.0 stay; failure mode q08-panel-pass-share-low with a detector on the q08-signal reader tests',
  'q08-signal q08_reader_tests 7 days to 2026-10-19: judge pass rates deepseek-v4-flash 0.263 (194), kimi-k2.6 0.35 (60), qwen3.8-27b 0.303 (33), glm-5.3-flash 0.685 (181); round-1 all-judges-pass share 0.356 (7 d), 0.258 (3 d), 0.171 (1 d); independent recheck by session_01QpQv19 of the 0.31.0 swap (major finding)',
  'worker deploy plus migration merged', 'the q08 reader panel only (q08.org and reading.q08.org drafts); no spend change (the panel makes the same number of calls)',
  'ops_config q08_panel_order = measured (no deploy) or revert q08-signal-engine to 0.31.0',
  'the reader panel keeps a spread of judges, so the pass rate reflects the draft and not a strict pair',
  'q08_gate_pass_rate_7d >= 0.1 within 168 h',
  'none',
  'd1:q08-signal q08_reader_tests (SELECT only); offline suite q08-signal-engine/reviewer-pool.test.mjs (74 checks including the rotation, the switch, its cache and fail-open)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'Q08-PANEL-CALIBRATION-1:') = 1);

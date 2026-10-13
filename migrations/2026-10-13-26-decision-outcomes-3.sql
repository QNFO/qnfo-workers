-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_outcomes WHERE actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(evidence, 'OUTCOMES-3:') = 1
-- DECISION-OUTCOMES-3 (2026-10-13, pillar autonomy; doctrine section 22 prediction calibration, metric prediction_miss_rate_7d 0.335).
-- Outcomes of this session's decisions whose predicted result is now known from a live read. Each row is matched to its decision by id
-- and by the decision's own action text, so a renumbered log matches nothing. Misses are recorded as misses. Decisions whose window
-- is still open (7-day and 48-hour predictions, the 2026-10-14 render sweep) are left without an outcome.
INSERT INTO decision_outcomes (decision_id, ts, observed_outcome, matched, evidence, actor)
SELECT d.id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), o.column3, o.column4, 'OUTCOMES-3: ' || o.column5, 'session_01Kddqwk5gQT5qSSHVKjT2EA'
FROM decision_log d JOIN (VALUES
 (203, 'LOOP-ISSUE-FLAP-1', '2087 closed at 07:01 UTC and stayed closed; 2322 and 2327 stay open while their regression holds; fm-two-closers-disagree reads 0', 1,
  'agent_issues 2087 closed, updated 2026-10-13 07:01:09; 2322 and 2327 open; v_failure_mode_status two-closers-disagree absent at 11:01:46 UTC'),
 (207, 'CLOSER-PARITY-1', 'fm-two-closers-disagree read 0 at its 11:01 UTC run and 2192 has not reopened since it closed at 07:01 UTC', 1,
  'v_failure_mode_status two-closers-disagree absent, last probed 2026-10-13 11:01:46; agent_issues 2192 closed, updated 07:01:11'),
 (224, 'ISSUE-DIRECTIVE-NEWLINE-1', 'fm-directive-literal-newline passes and the code loop built a task for 2381 at the merge', 1,
  'code_tasks ct_cvwqti3jsita1z goal [issue #2381] created 2026-10-13T07:51:00Z; v_failure_mode_status directive-literal-newline absent at 11:01:39'),
 (225, 'ACT-BRIDGE-LEVERS-20261013', 'breach_code_task_pct read 14.7 at the first hourly tick after the merge and 15.6 at 11:01 UTC', 1,
  'metric_registry breach_code_task_pct 14.7 read by the session after the 08:01 UTC tick; metric_history 2026-10-13 15.6 at 11:01:39Z'),
 (231, 'DEPLOY-DRIFT-CF-1', 'every 20-minute tick since the deploy is ok with the route ready and the alternate probe is armed; no real drift has occurred yet to test the deploy branch', 1,
  'cloud_ops_events deploy-drift-cf ok at 10:21, 10:41, 11:01 and 11:21 UTC (route ready, drift none); spof_alternate_probes GitHub Actions canonical deploy runner enabled 1; deploy_freshness_h 0'),
 (239, 'DOCTRINE-PROPOSALS-DISPOSED-20261013', 'doctrine_proposals_open read 0 and stuck_items_over_sla read 0 at the first ticks after the merge; stuck_items_over_sla later read 2 from research_queued_180m, a different queue', 1,
  'metric_history 2026-10-13 doctrine_proposals_open 0; v_stuck_summary 11:27 UTC code_tasks_stalled 0, research_queued_180m 1 (rem-6751c50c, research sweep)'),
 (250, 'STARVED-RETRY-BOUNDARY-1', 'the 11:00 UTC tick started a generation run (anchors, compose, critique, fact-check); the run then ended rejected on the time budget', 1,
  'personal-life companion_runs 5397-5411: first stage 11:01 UTC, fact prune r1/r2, rejected 11:14:56, failed no piece survived the gate')
) o ON d.id = o.column1 AND instr(d.action, o.column2) > 0
WHERE d.actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND NOT EXISTS (SELECT 1 FROM decision_outcomes x WHERE x.decision_id = d.id);
-- Two decisions of the 11:45-11:50 UTC window. COMPANION-HOLD-WITHDRAWN-1 records a hold that was built and withdrawn before merge (PR 1128),
-- so the reading that drove it stays on the record. COMPANION-SYSTEMS-ANALYSIS-1 records the writer change (PR 1129) with its prediction.
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'an owner sentence is read against the same owner''s earlier words before it changes what the fleet publishes',
  'COMPANION-HOLD-WITHDRAWN-1: the generation hold of PR 1128 (ops_config companion_generation = hold) was closed unmerged; the owner''s "Absolutely no reading.q08 content!" (11:26 UTC) repeats "still no reading.q08.org content" (05:2x UTC), a complaint that nothing publishes',
  'session_01BCBpN3cZdS57dweqCs9rwt events: owner 11:26:03 UTC message, and its relayed 05:2x UTC message; PR 1128 closed at 11:49 UTC with no migration applied',
  'closed unmerged', 'none: no hold was set', 'none needed', 'the no-deploy generation switch exists, off by default', 'ops_config has no companion_generation row after the 12:00 UTC tick', 'none',
  'd1:ops_config; session events of session_01BCBpN3cZdS57dweqCs9rwt; github:PR 1128'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-HOLD-WITHDRAWN-1:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a piece the owner calls worth publishing explains the system behind its subject; the fact-check must let framed analysis through and still stop invented facts',
  'COMPANION-SYSTEMS-ANALYSIS-1: personal-companion 1.20.0 requires context and a systems analysis, the critic gates on a systems score, and framed analysis is reasoning to the fact-check (parity with q08-signal-engine 0.18.0)',
  'owner 2026-10-13 11:26 UTC "totally lacking in context and big-picture systems analysis. Fail, not worth publishing."; companion_runs 5408 rejected on "an epistemic audit ... -- analytical claims not stated in source"',
  'merged through the canonical path', 'the companion writer, critic and fact-check classification', 'revert of personal-companion 1.20.0',
  'companion pieces carry a systems analysis the critic scores', 'a companion piece is published by 16:15 UTC on 2026-10-13 and its critic systems score is at least the essay accept floor', 'reading.q08.org publishes again at the owner''s bar',
  'd1:companion_runs, companion_pieces; code:personal-companion P_STYLE, P_CRITIQUE, FACTCHECK_PROMPT, claimIsReasoning'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-SYSTEMS-ANALYSIS-1:') = 1);

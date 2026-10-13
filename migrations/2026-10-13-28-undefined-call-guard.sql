-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-patch-calls-undefined-helper'; DELETE FROM failure_modes WHERE fm_key = 'patch-calls-undefined-helper'; DELETE FROM decision_outcomes WHERE actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(evidence, 'OUTCOMES-4:') = 1; DELETE FROM decision_log WHERE instr(action, 'UNDEFINED-CALL-GUARD-1:') = 1 OR instr(action, 'CRITIC-REASONING-1:') = 1 OR instr(action, 'CRITIC-NOTHINK-1:') = 1
-- UNDEFINED-CALL-GUARD-1 (2026-10-13, pillar autonomy; metrics code_review_refusals_7d 14, code_task_success_rate_30d 0.25,
-- code_goal_success_rate_30d 0.486). Of the code-loop tasks that ended on a goal-review refusal in the last 7 days, five were refused for
-- calling a helper the patch never defined: parseRefLine (ct_7xtqmvrmppmoxw, ct_2yk2wih2zivbf9), checkCondition (ct_9ep1i6a57obg7l,
-- ct_x4tr2srzgf5p7h, ct_xlpr8iojg9fpip) and parseGa4Report (ct_x2dockm698uue3). scripts/workers_standards_guard.py (same pull request)
-- now fails an added line that calls a bare name the file never defines, declares, imports or receives; scripts/code-task-publish.py
-- already sends a guard violation back to the model with its lines, so the task is repaired before any pull request or review.
-- Also recorded: the companion decisions CRITIC-REASONING-1 (1.20.1, PR 1131) and CRITIC-NOTHINK-1 (1.20.2, PR 1133), and the
-- outcome of FACT-WORDING-1 (a piece by 12:15 UTC), which missed.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('patch-calls-undefined-helper', 'a code-loop patch calls a helper function it never defines, so the line throws a ReferenceError the first time it runs',
  'the patch model writes a call to a helper it means to add and adds only the call; no deterministic check before the goal review saw it, so the task spent its rounds and ended on the reviewers'' refusal',
  'UNDEFINED-CALL-GUARD-1: workers_standards_guard.py rule undefined-call (tokenised file, method definitions and globals excluded; 0 hits on the 28 live worker.js files at 2026-10-13) fails the added line in CI and in code-task-publish.py, which returns it to the model',
  'scripts/workers_standards_guard.py on main carries the undefined-call rule', 'fm-patch-calls-undefined-helper', '2026-10-07', NULL,
  'a patch that introduces a call to a new helper', 'merge-runner: goal review ... "is not defined, causing a runtime ReferenceError"', 'every code-loop task and every session pull request that touches a worker.js');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-patch-calls-undefined-helper', NULL, 'UNDEFINED-CALL-GUARD-1', 'failure-mode detector',
  '{"paths": ["scripts/workers_standards_guard.py"], "contains": "bad += undefined_call_findings(lines, full)"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a defect a parser can see should be refused by the parser, before a model reviewer spends a round on it',
  'UNDEFINED-CALL-GUARD-1: the Workers standards guard fails an added call to a function the file never defines; the code-task publisher returns it to the model',
  'code_tasks failed in 7 days with last_error "merge-runner: goal review": 5 of the refusals name an undefined helper (parseRefLine, checkCondition, parseGa4Report); prototype over all 28 live worker.js files: 0 hits',
  'merged through the canonical path', 'the CI standards gate and the code-task publisher for worker.js changes', 'revert of the guard change; `// standards-ok:` on a line',
  'patches that call undefined helpers are repaired before review', 'no code task fails with a goal review naming an undefined function in the 7 days after the merge, and the guard raises no false positive on a session pull request in that time', 'none',
  'd1:code_tasks; code:scripts/workers_standards_guard.py, scripts/code-task-publish.py standards_check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'UNDEFINED-CALL-GUARD-1:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'the critic must judge framed reasoning as argument, not as an unsourced fact, or the required systems analysis can never pass',
  'CRITIC-REASONING-1: personal-companion 1.20.1 (PR 1131) scores grounding only on reported facts; framed reasoning that adds no name, date, number, event or quotation is judged under argument and systems',
  'companion_runs 5421 and 5427 (2026-10-13 12:04 and 12:06 UTC): critique grounding=0 and 3 on "assertions about incentives, funding, and community behavior" and "speculative institutional analysis"',
  'merged through the canonical path', 'the companion critic prompt', 'revert of personal-companion 1.20.1',
  'systems analysis can pass the critic', 'no companion critique after the 1.20.1 deploy rejects a draft on grounding for framed reasoning alone', 'reading.q08.org publishes again at the owner''s bar',
  'd1:companion_runs; code:personal-companion P_CRITIQUE'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CRITIC-REASONING-1:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a reviewer that thinks until its timeout costs the run its attempts; the measured no-think switch gives the same verdict in seconds',
  'CRITIC-NOTHINK-1: personal-companion 1.20.2 (PR 1133) runs Workers AI critic calls with the fact-check reasoning switch and puts deepseek-v4-pro second in the critic chain',
  'companion_runs 5420-5444 (12:00 UTC run): critiques 70-125 s, one critic unavailable; ai_call_counters 2026-10-13 compose-fallback kimi-k2.6 15 calls 9 errors avg 86 s, gpt-oss-120b 57 calls 0 errors avg 23 s',
  'merged through the canonical path', 'the companion critic call', 'revert of personal-companion 1.20.2',
  'the critic no longer spends the run', 'the 13:00 UTC companion run logs each critique within 45 s of its compose stage and reaches the fact-check at least once', 'none',
  'd1:companion_runs, ai_call_counters; code:personal-companion callWorkersAI, CF_FALLBACK.critic'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CRITIC-NOTHINK-1:') = 1);
INSERT INTO decision_outcomes (decision_id, ts, observed_outcome, matched, evidence, actor)
SELECT d.id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'no companion piece was published by 12:15 UTC: the 11:00 run ran out of time in the fact-check (fixed by 1.19.6) and the 12:00 run was rejected by the critic on every attempt', 0,
  'OUTCOMES-4: personal-life companion_runs 5408-5411 (11:14 UTC, rejected, time budget) and 5421-5444 (12:13 UTC, failed: no piece survived the gate, critic unavailable); companion_pieces has no row after 2026-10-10',
  'session_01Kddqwk5gQT5qSSHVKjT2EA'
FROM decision_log d
WHERE instr(d.action, 'SESSION-20261013-B: FACT-WORDING-1') = 1 AND NOT EXISTS (SELECT 1 FROM decision_outcomes x WHERE x.decision_id = d.id);

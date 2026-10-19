-- EDIT-RELIABILITY-1 (2026-10-19, charter pillar: autonomy; agent_issues 99925, 2111, 2857, 100077, 100141, 100078, 100092). qnfo-code-orchestrator 0.23.0
-- takes four decisions on its own: PLAN-TRUSTED-FIRST-1 (the planner cuts its window by origin in SQL before LIMIT), REFUSAL-RELOCATE-1 (a reply
-- that says the shown content lacks a name the file holds elsewhere moves the window there, no attempt spent), REASONING-LOW-1 (glm-5.3 is called
-- with reasoning_effort low) and NEEDS-ANCHOR-ROUTE-1 (an unplaceable large-file task turns its issue's code-task line into a session-task line).
-- This file records them: one failure mode and one detector contract each, one decision_log row each, and the control_registry row of the one
-- switch added (ops_config code_reasoning_low = off). Measured 2026-10-19 12:55Z-13:25Z in qnfo-audit:
--   cloud_ops_events kind code-task.fail since 2026-10-18T13Z (propose): kimi-k2.7-code 20 prose replies ("The shown snippet ends before the
--   `learnerRecordPost` call sites", the name sits once at offset 169,881 of a 273,763-char file, window 0-24,318) and 14 empty ones; glm-5.3 28 empty
--   ones; gpt-oss-120b 35 "occurs 0 times" (it is the last rung, reached after the first two fail), 24 "returned no ```file block" (whole-file mode,
--   fixed by WHOLE-FILE-PATCH-1 0.18.24, last seen 08:24Z, no stored task still in that mode);
--   ai_call_counters 2026-10-19: glm-5.3 24 calls, 363,084 output tokens (15.1k of its 16,384 budget a call), 4,635 s, for 2 merged tasks in 2 days;
--   issue_plans 2026-10-19: 130 untrusted rows recorded in 13 h (PLAN-UNTRUSTED-RECORD-1) against 27 model-planned; 1 trusted issue older than 120 min
--   without a row (agent_issues 100119, its file in flight).
-- Not changed here because already fixed on main and live: EDIT-INDENT-TOLERANT-1 (0.8.0), SEARCH-FUZZY-1 (0.11.0), SEARCH-NEAREST-1 (0.21.0), the
-- scope guard of MERGE-SCOPE-AT-READ-1 (0.22.0 reads PLAN_CONTROL_PLANE minus PLAN_LOOP_CANARIED; last refusal of a canaried worker 09:58Z) and
-- the repo-slug normalisation behind "repo name refused for raw read" (0.18.13, 0.18.24; last event 05:00Z, all 325 code_tasks rows read repo qnfo-workers).
-- The detectors are regression guards at the worst day measured, counted from the deploy (2026-10-19T15:00Z), not claims that the misses stop;
-- the gain is read from the audit events named in each row. No hold, filter or cap is added; the one switch is a rollback lever (control_registry below).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-code-task-refusal-window-miss', 'fm-code-task-empty-reply-glm', 'fm-code-plan-trusted-behind-untrusted', 'fm-code-task-unplaceable-large-file'); DELETE FROM failure_modes WHERE fm_key IN ('code-task-refusal-window-miss', 'code-task-empty-reply-glm', 'code-plan-trusted-behind-untrusted', 'code-task-unplaceable-large-file'); DELETE FROM control_registry WHERE control = 'code_reasoning_low'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('code-task-refusal-window-miss', 'a code task fails because the model says the content it was shown lacks the code it must change', 'the anchor window is 24k chars of a file of 160k to 630k and the model is shown no other part, so a change whose target sits outside it ends in a prose reply ("I cannot produce a valid block because the shown snippet ends before X"); WINDOW-RELOCATE-1 moves the window only for a SEARCH that was written, and these replies hold none', 'qnfo-code-orchestrator 0.23.0 REFUSAL-RELOCATE-1: a name the reply puts in backticks that is not in the window but occurs 1 to 3 times in the file becomes the anchor (its unique line), the window moves there and the propose runs again with no attempt spent, at most WINDOW_RELOCATE_MAX times; audited as code-task.window-relocated with by=refusal', 'fm-code-task-refusal-window-miss: code-task.fail events "no SEARCH/REPLACE block found in the reply (N chars; it began: ...)" in 24 h, at most 10 (the day before the fix read 17 and 14)', 'fm-code-task-refusal-window-miss', '2026-10-18T13:00:00Z', 2111, 'a task on a file over 24k chars whose goal names code outside the anchor window', 'ct_im2381, ct_im100041, ct_9w103x6wxfzs7s: 3 to 6 attempts each spent on replies that name the missing code', 'code loop: attempts and neurons on large-file tasks (qnfo-social, personal-api companion, qnfo-gateway)'),
 ('code-task-empty-reply-glm', 'the second ladder rung answers nothing because its reasoning uses the whole output budget', 'glm-5.3 is a reasoning model that cannot disable reasoning; at reasoning_effort high (the default) its thought filled the 16,384-token budget (15.1k a call on average, 193 s of the 240 s ceiling) and the content came back empty (finish_reason length), so the rung cost a call and an attempt and produced nothing', 'qnfo-code-orchestrator 0.23.0 REASONING-LOW-1: glm-5.3 is called with reasoning_effort low (the documented lowest level); a call the platform rejects because of it is made once more without it (code-task.model-opt-refused); ops_config code_reasoning_low = off removes the option without a deploy', 'fm-code-task-empty-reply-glm: code-task.fail events "@cf/zai-org/glm-5.3: no SEARCH/REPLACE block found in the reply: the reply was empty" in 24 h, at most 14 (the day before the fix read 28)', 'fm-code-task-empty-reply-glm', '2026-10-18T13:00:00Z', 2857, 'a propose attempt on the glm-5.3 rung with a 7k-token prompt', 'the rung returns no content; the third rung (gpt-oss-120b) does the work and invents SEARCH text (35 "occurs 0 times" in 24 h)', 'code loop: one attempt in three on every task, about 145k output neurons a day on a rung that merged 2 tasks in 2 days'),
 ('code-plan-trusted-behind-untrusted', 'trusted open issues are never planned because untrusted ones outrank them in the planner window', 'planIssues read LIMIT 40 candidates in SQL and dropped the untrusted ones in JS afterwards, so 39 of 40 rows were untrusted at 2026-10-19 09:05Z and the first trusted issue ranked 44; 0.18.28 records the untrusted rows (kept) and empties the window ten rows a tick, but a deferred trusted issue spent the cheap-decision budget that the recording needed', 'qnfo-code-orchestrator 0.23.0 PLAN-TRUSTED-FIRST-1: the trusted window (40 rows) is cut by origin in SQL before LIMIT (planTrustedSql = PLAN_TRUSTED), the untrusted rows are read after it and recorded within their own budget', 'fm-code-plan-trusted-behind-untrusted: open trusted issues without a code-task line, older than 120 minutes, with no issue_plans row, at most 3 (a trusted issue whose file is in flight waits; the starvation read 42)', 'fm-code-plan-trusted-behind-untrusted', '2026-10-19T09:05:00Z', 99925, '40 or more untrusted open issues rank above a trusted one', 'issue_plans gains rows only for untrusted issues; trusted issues sit unplanned', 'code loop: every trusted open issue below the window (42 on 2026-10-19)'),
 ('code-task-unplaceable-large-file', 'the same issue gets up to three code tasks that cannot place the file, each ending needs_human at the read step', 'a goal with no code keyword (a stack trace) on a file over 60k chars has no anchor and nothing for the locator to find: it was shown a list of function names; the task ended needs_human and the intake opened the next one (ct_im99981, ct_im99982, ct_im99989 at 06:17Z)', 'qnfo-code-orchestrator 0.23.0 NEEDS-ANCHOR-ROUTE-1: when the locator finds nothing, no anchor was given and no keyword of the goal occurs in the file, the issue keeps its target as a session-task line with the reason (code-task.anchor-routed), so the intake opens no further task on it', 'fm-code-task-unplaceable-large-file: code-task.fail events "needs an anchor" in 7 days, at most 3 (the 8 days before the fix read 7)', 'fm-code-task-unplaceable-large-file', '2026-10-14T00:31:00Z', 2007, 'a task on a file over 60k chars, no anchor, no keyword of the goal in the file', 'needs_human at the read step, then a retry task on the same issue', 'code loop: three tasks per issue and the 2007 probe, which counts these events');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-code-task-refusal-window-miss', NULL, 'REFUSAL-RELOCATE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN COUNT(*) <= 10 THEN 0 ELSE COUNT(*) END FROM cloud_ops_events WHERE job = ''qnfo-code-orchestrator'' AND kind = ''code-task.fail'' AND text LIKE ''%no SEARCH/REPLACE block found in the reply (%'' AND ts >= max(''2026-10-19T15:00:00Z'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours''))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-code-orchestrator', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0),
 ('fm-code-task-empty-reply-glm', NULL, 'REASONING-LOW-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN COUNT(*) <= 14 THEN 0 ELSE COUNT(*) END FROM cloud_ops_events WHERE job = ''qnfo-code-orchestrator'' AND kind = ''code-task.fail'' AND text LIKE ''%@cf/zai-org/glm-5.3: no SEARCH/REPLACE block found in the reply: the reply was empty%'' AND ts >= max(''2026-10-19T15:00:00Z'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours''))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-code-orchestrator', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0),
 ('fm-code-plan-trusted-behind-untrusted', NULL, 'PLAN-TRUSTED-FIRST-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN COUNT(*) <= 3 THEN 0 ELSE COUNT(*) END FROM agent_issues a WHERE a.status = ''open'' AND COALESCE(a.description, '''') NOT LIKE ''%code-task:%'' AND a.created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND NOT EXISTS (SELECT 1 FROM issue_plans p WHERE p.issue_id = a.id) AND ((a.source = ''qnfo-fleet-dashboard:owner-request'' AND (a.title LIKE ''OWNER-TASK-%'' OR a.title LIKE ''OWNER-NOTE-%'')) OR (a.source = ''qnfo-fleet-control'' AND (a.title LIKE ''METRIC-TRIGGER-%'' OR a.title LIKE ''REACH-IDEA-%'')) OR a.source LIKE ''claude-session%'' OR a.source LIKE ''claude-code-session%'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-code-orchestrator', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0),
 ('fm-code-task-unplaceable-large-file', NULL, 'NEEDS-ANCHOR-ROUTE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN COUNT(*) <= 3 THEN 0 ELSE COUNT(*) END FROM cloud_ops_events WHERE job = ''qnfo-code-orchestrator'' AND kind = ''code-task.fail'' AND text LIKE ''%needs an anchor%'' AND ts >= max(''2026-10-19T15:00:00Z'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-code-orchestrator', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id)
VALUES ('code_reasoning_low', 'ops_config code_reasoning_low (read by qnfo-code-orchestrator ai() for @cf/zai-org/glm-5.3 only)', 'kill-switch',
 'the reasoning_effort low option on the glm-5.3 rung turning out to lower the quality of its edits or to be rejected by the platform', 0, 'keep', 'applied',
 'ai() calls glm-5.3 once more without the option when the platform rejects it (code-task.model-opt-refused), and the ladder has two other rungs; setting the key to off removes the option at the next call with no deploy; no work is held, only a request parameter',
 'REASONING-LOW-1 (qnfo-code-orchestrator 0.23.0): glm-5.3 averaged 15.1k output tokens of its 16,384 budget on 2026-10-19 (24 calls, 4,635 s) and 28 of its replies in 24 h were empty. reasoning_effort (max, high, low) is documented on its model page; reasoning-low.test.mjs (17 checks) replays the option, the off switch, the rejection fallback and a 3046 timeout.', 2857);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'the planner may read as many trusted candidates as the window allows, and a prose reply that names code absent from the shown content is a window miss the loop can repair by showing that code, as WINDOW-RELOCATE-1 already does for a written SEARCH',
  'REFUSAL-RELOCATE-1: a reply with no block that puts a name in backticks which is outside the window but occurs 1 to 3 times in the file moves the window to the name (anchor = its unique line) and runs the propose again with no attempt spent, bounded by WINDOW_RELOCATE_MAX',
  'qnfo-audit 2026-10-19: 20 kimi-k2.7-code prose replies since 2026-10-18T13Z; ct_im2381 names learnerRecordPost, which occurs once at offset 169,881 of qnfo-social/worker.js (273,763 chars) while the window was 0-24,318 (raw read of main); refusal-relocate.test.mjs 42 checks, 14 of them fail on the 0.22.0 worker',
  'implemented in qnfo-code-orchestrator 0.23.0; live when the canonical deploy reports the version',
  'one more audited window move per task, at most two per task together with WINDOW-RELOCATE-1; a name that is absent, in the window, a file name or in more than three places never moves it',
  'revert qnfo-code-orchestrator worker.js and its mirror to 0.22.0 (the canary reverts the push on a failed /health); the Rollback header removes the detector rows',
  'the loop recovers from "the model could not see the code" replies that cost an attempt each',
  'code_task_success_rate_30d >= 0.4 within 168 h',
  'none', 'offline suites refusal-relocate, window-relocate, search-nearest, anchor-locator, planner'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REFUSAL-RELOCATE-1:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a SEARCH/REPLACE edit needs the lowest reasoning a reasoning model offers, and the model page documents the parameter for glm-5.3 (reasoning_effort max, high, low; reasoning cannot be disabled)',
  'REASONING-LOW-1: ai() sends reasoning_effort low to @cf/zai-org/glm-5.3 only; a call the platform rejects because of it is repeated once without it; ops_config code_reasoning_low = off removes it',
  'qnfo-audit ai_call_counters 2026-10-19: glm-5.3 24 calls, 363,084 output tokens, 4,635 s; 28 empty replies in 24 h; merged tasks by model since 2026-10-18: gpt-oss-120b 33, kimi-k2.7-code 20, glm-5.3 2; reasoning-low.test.mjs 17 checks, 9 of them fail on the 0.22.0 worker',
  'implemented in qnfo-code-orchestrator 0.23.0; live when the canonical deploy reports the version',
  'the glm-5.3 rung of the code ladder only (kimi-k2.7-code and gpt-oss-120b are called exactly as before); one extra call only when the platform rejects the option',
  'ops_config code_reasoning_low = off (no deploy), or revert the worker; the Rollback header removes the detector and the control_registry row',
  'the second rung answers within its budget instead of spending it on thought',
  'code_task_success_rate_30d >= 0.4 within 168 h',
  'none', 'offline suites reasoning-low, timeout-retry, loop-quality, model-attribution'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REASONING-LOW-1:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'an issue whose goal has no code keyword in a file over 60k chars cannot be placed by the loop, so another task on it is spent for nothing; the existing pattern (CODE-TASK-PREFLIGHT-1, MERGE-SCOPE-INTAKE-1) is to keep the target as a session-task line with the reason',
  'NEEDS-ANCHOR-ROUTE-1: a read step that ends needs-an-anchor with no anchor given and no keyword of the goal in the file turns the issue''s code-task line into a session-task line (code-task.anchor-routed); the task still ends as before',
  'qnfo-audit 2026-10-19 06:17Z: ct_im99981, ct_im99982, ct_im99989 on qnfo-gateway/worker.js (628k chars), a stack-trace goal; 7 such failures in 8 days; needs-anchor-route.test.mjs 20 checks, 6 of them fail on the 0.22.0 worker',
  'implemented in qnfo-code-orchestrator 0.23.0; live when the canonical deploy reports the version',
  'one agent_issues row per routed task (its code-task line becomes a session-task line plus one note); an issue that is closed, has no code-task line or whose goal names no issue is untouched',
  'revert the worker; to put an issue back, replace session-task: repo= by code-task: repo= in its description',
  'the intake stops opening tasks on an issue the loop cannot place',
  'code_task_success_rate_30d >= 0.4 within 168 h',
  'none', 'offline suites needs-anchor-route, anchor-locator, intake-preflight, scope-intake'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'NEEDS-ANCHOR-ROUTE-1:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'the planner''s window should hold only issues it may turn into code, and recording an untrusted issue (PLAN-UNTRUSTED-RECORD-1, kept) costs no model call, so it needs no share of the cheap-decision budget',
  'PLAN-TRUSTED-FIRST-1: planIssues reads 40 trusted candidates (planTrustedSql = PLAN_TRUSTED, cut before LIMIT) and then up to 10 untrusted ones to record, each with its own counter',
  'qnfo-audit 2026-10-19: 130 untrusted rows recorded by 0.18.28 against 27 model-planned; the first trusted issue ranked 44 at 09:05Z; plan-window-trusted.test.mjs 16 checks, 8 of them fail on the 0.22.0 worker (60 untrusted issues above 3 trusted ones: the parent plans none of the three in its first call)',
  'implemented in qnfo-code-orchestrator 0.23.0; live when the canonical deploy reports the version',
  'the planner tick: same model calls and daily cap, a different read order; 10 untrusted recordings a tick at most, as before',
  'revert the worker; the Rollback header removes the detector row',
  'a trusted issue is planned on the first tick however many untrusted issues outrank it',
  'fm-code-plan-trusted-behind-untrusted reads ok within 2 hours of the deploy and stays ok',
  'none', 'offline suites plan-window-trusted, planner, plan-deny-negation'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PLAN-TRUSTED-FIRST-1:') = 1);

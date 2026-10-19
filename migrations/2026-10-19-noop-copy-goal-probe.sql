-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''4'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT ''%IDEAS-CAP-GENERATED-RELEASE-1%'' k UNION ALL SELECT ''%PLAIN-LANGUAGE-1%'' UNION ALL SELECT ''%ABOUT-STATUS-FUNDING-1%'' UNION ALL SELECT ''%ABOUT-LABEL-TRUNC-1%'') g WHERE EXISTS (SELECT 1 FROM code_tasks t WHERE t.goal LIKE g.k AND t.status=''merged'')) AS TEXT) AS observed', action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.' WHERE class = 'issue-100181' AND instr(action, 'NOOP-COPY-GOAL-PROBE-1') > 0;
-- NOOP-COPY-GOAL-PROBE-1 (2026-10-19, charter pillar: autonomy; agent_issues 100181, the owner task "fix the code loop's verification path ... then re-dispatch those 4 tasks").
-- The fix is live: qnfo-code-orchestrator 0.24.1 (PR 3163, /health read 22:46Z) stops refusing a literal-only edit when the goal asks for wording. The contract that closes the issue could not
-- pass: it counted merged code tasks whose goal names IDEAS-CAP-GENERATED-RELEASE-1, PLAIN-LANGUAGE-1, ABOUT-STATUS-FUNDING-1 and ABOUT-LABEL-TRUNC-1 and expected 4, but PLAIN-LANGUAGE-1 was delivered
-- outside the code loop (qnfo-gateway 3.25.0-plain-language-1, agent_issues 100029) and ABOUT-LABEL-TRUNC-1 closed on a session change, so no merged task will ever carry those goals (read 2026-10-19 22:5xZ:
-- ct_plain_language_1 superseded, ct_im100158 superseded, 100142 and 100047 each have a merged task). It also carried the VACUOUS-PROBE-V3-1 note: born superseded, "a doer replaces this probe with one that measures it".
-- What the owner named as the defect is the parked set: code tasks rejected as noop-proposals or no-change by the verifying models and left needs_human. The probe counts exactly that set (read 3 on
-- 2026-10-19 22:5xZ: ct_ginug5wzstevhn, ct_js7ifnnmq03kn4, ct_agpn0vekiunr2f) and reads 0 once the loop has re-dispatched, superseded or closed them. LIKE literals are 15 and 19 bytes (D1 limit 50).
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''needs_human'' AND (last_error LIKE ''%noop-proposal%'' OR last_error LIKE ''%proposed no change%'')) AS TEXT) AS observed',
  verify_transport = 'd1-query',
  action = 'NOOP-COPY-GOAL-PROBE-1: probe counts code tasks left needs_human on a noop-proposal or no-change verdict; qnfo-code-orchestrator 0.24.1 no longer refuses copy goals, the loop re-dispatches or supersedes the parked ones',
  status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100181' AND instr(action, 'NOOP-COPY-GOAL-PROBE-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a closing probe measures the defect the owner named; one that counts merged tasks for goals delivered by other means can never pass',
  'NOOP-COPY-GOAL-PROBE-1: the closing probe of issue 100181 counts needs_human code tasks parked on a noop or no-change verdict',
  'qnfo-audit read-only 2026-10-19: 3 needs_human tasks with a noop or no-change error; ct_plain_language_1 and ct_im100158 superseded, not merged; qnfo-code-orchestrator /health 0.24.1-noop-copy-goal',
  'migration merged',
  'one remediation_contracts row',
  'the Rollback header of migrations/2026-10-19-noop-copy-goal-probe.sql',
  'a closing probe that can reach its expected value',
  'issue 100181 closes within 120 minutes of the parked tasks leaving needs_human',
  'none',
  'd1:qnfo-audit read-only probe run live, node:sqlite fixtures in migrations/noop-copy-goal-probe.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'NOOP-COPY-GOAL-PROBE-1:%');

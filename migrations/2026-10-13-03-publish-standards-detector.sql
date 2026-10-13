-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''failed'' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND created_at > ''2026-10-11T12:00:00Z'' AND COALESCE(last_error, '''') LIKE ''%required check(s) failed%gate%'') AS TEXT) AS observed' WHERE class = 'fm-code-task-dies-at-ci'
-- PUBLISH-STANDARDS-CHECK-1 (2026-10-13, failure mode code-task-dies-at-ci, pillar autonomy). The one recurrence after
-- PUBLISH-SUITE-CHECK-1 (ct_j25aciskebfq1f, qnfo-fleet-dashboard, GA4-READ-1, failed 2026-10-13 01:41 UTC) passed the
-- publisher's parse, migration and suite checks and died at CI on the Workers standards guard ("[swallowed-catch]"): the
-- publisher ran every deploy-gate check except that guard. scripts/code-task-publish.py now runs it on the patched tree and
-- sends a violation back to propose (same pull request). The detector counts gate deaths of tasks created after this remedy
-- went live, so it shows a recurrence of the mode as it now stands rather than a week-old death the remedy answers.
UPDATE failure_modes SET
  root_cause = root_cause || ' | 2026-10-13: ct_j25aciskebfq1f died on the standards guard, the one deploy-gate check the publisher did not run',
  remediation = remediation || ' | PUBLISH-STANDARDS-CHECK-1 (2026-10-13): the publisher also runs scripts/workers_standards_guard.py against the base and sends a violation the change added back to propose',
  detector = 'no code task created after 2026-10-13 07:00 UTC (PUBLISH-STANDARDS-CHECK-1) refused for a red gate in the last 7 days'
WHERE fm_key = 'code-task-dies-at-ci';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''failed'' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND created_at > ''2026-10-13T07:00:00Z'' AND COALESCE(last_error, '''') LIKE ''%required check(s) failed%gate%'') AS TEXT) AS observed',
  next_due_at = datetime('now')
WHERE class = 'fm-code-task-dies-at-ci';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'every check deploy-gate runs on a code-loop pull request must already have run in the publisher, or the task dies at CI',
   'PUBLISH-STANDARDS-CHECK-1: the code-task publisher runs the Workers standards guard on the patched tree before pushing; fm-code-task-dies-at-ci counts deaths after the remedy',
   'ct_j25aciskebfq1f gate job 115087790274: WORKERS-STANDARDS-GUARD-1 1 violation (qnfo-fleet-dashboard/worker.js:4000 [swallowed-catch]); parse, migration and suite checks had passed in the publisher',
   'merged through the canonical path', 'code-loop tasks that add a standards violation go back to propose instead of to a pull request', 'revert scripts/code-task-publish.py and the Rollback line of this file',
   'the code loop fixes its own standards violations before CI', 'code_check_failures_7d falls below 3 within 7 days; no code task created after the remedy dies on the standards guard', 'none', 'github:check-runs, d1:code_tasks');

-- PATCH-CAP-VERSION-LINE-1 (2026-10-19, charter pillar: autonomy; agent_issues 100169, 100172, 100173, 100175 and the dashboard code tasks
-- 100170/100171). scripts/code-task-publish.py refused every patch over 200,000 chars. qnfo-fleet-dashboard/worker.js carries its release
-- notes on the `var VERSION` line (202,642 chars on main) and qnfo-fleet-control/worker.js on a 199,469-char one, so a version bump
-- (required by version-bump-guard) is the line removed and added in the worker and again in the mirror: ct_d5z3pztl2s5ynh holds an
-- 816,888-char patch of 4 hunks and 84 lines, ct_uzuc85ezvcyach 815,974. Measured 2026-10-19 15:20Z: 5 of 5 code tasks on
-- qnfo-fleet-dashboard/worker.js ended publish_failed "patch larger than 200000 chars" (last 15:16:14Z), so the loop could not change the
-- dashboard at all. The cap is now 1,000,000 (RULE-8-RETIRED-1: a guard change is a migration with its rollback line and its measurement);
-- a whole-file fallback of a 1.2 MB worker (2.4 MB) and a runaway patch stay refused. This file records the control, the failure mode with
-- its detector, the decision and the follow-up that removes the cause (the release notes belong on their own lines, not on the VERSION line).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE control_registry SET disposition = 'replace', disposition_state = 'reverted' WHERE control = 'code-task-publish-patch-cap'
-- spof-review: no new single point of failure; the cap is one constant in the publish script, reverted by the Rollback line plus a one-line code revert.

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
  ('code-task-publish-patch-cap', 'scripts/code-task-publish.py MAX_PATCH (PATCH-CAP-VERSION-LINE-1)', 'cap',
   'a runaway or whole-file patch of a large worker being stored in a code_tasks row and pushed as a branch', 1, 'keep', 'applied',
   'a session edits the file in a pull request (no patch cap); a whole-file patch of a 1.2 MB worker (2.4 MB) is still refused; the Rollback line marks the control reverted and the constant goes back to 200000',
   NULL, 'code_tasks 2026-10-19: 5 of 5 tasks on qnfo-fleet-dashboard/worker.js publish_failed "patch larger than 200000 chars"; ctx.patch lengths 816888 and 815974 for a 4-hunk, 84-line change; the VERSION line is 202642 chars', 100172, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('code-patch-version-line-over-cap', 'A version bump on a worker whose VERSION line carries its release notes is a patch larger than the publish cap, so the code loop cannot change that worker',
   'qnfo-fleet-dashboard/worker.js and qnfo-fleet-control/worker.js keep every release note on the one `var VERSION` line (202,642 and 199,469 chars); a bump removes and adds that line in the worker and in deployed-current.worker.js, about 4 x the line, over the 200,000-char MAX_PATCH of code-task-publish.py',
   'scripts/code-task-publish.py MAX_PATCH 1,000,000 (PATCH-CAP-VERSION-LINE-1); follow-up VERSION-LINE-SPLIT-1 moves the notes onto their own lines so a bump is a one-line patch',
   'no code_tasks row with last_error "patch larger than" in 24 h', 'fm-code-patch-version-line-over-cap', '2026-10-19', 100172,
   'a code task whose edit includes the VERSION bump on a worker with a VERSION line over 50,000 chars', 'publish_failed, last_error "publish: patch larger than 200000 chars", step done, attempts 0',
   'every code task on qnfo-fleet-dashboard/worker.js (5 on 2026-10-19: issues 100170, 100171, 100172, 100173, 100097) and on qnfo-fleet-control/worker.js');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at) VALUES
  ('fm-code-patch-version-line-over-cap', NULL, 'PATCH-CAP-VERSION-LINE-1', 'failure-mode detector',
   'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''publish_failed'' AND instr(COALESCE(last_error, ''''), ''patch larger than'') > 0 AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AS TEXT) AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6', 'the 200,000-char patch cap protects D1 and the branch from whole-file rewrites; a four-hunk version bump on a 202k line is not one',
 'PATCH-CAP-VERSION-LINE-1: scripts/code-task-publish.py MAX_PATCH 200000 -> 1000000, with its control_registry row, failure mode and detector',
 'code_tasks ct_d5z3pztl2s5ynh ctx.patch 816888 chars, 4 hunks, 84 lines; qnfo-fleet-dashboard/worker.js line 12 is 202642 chars; 5 of 5 dashboard code tasks publish_failed with "patch larger than 200000 chars" on 2026-10-19',
 'applied through the canonical path on merge; the publish script runs from the repository checkout of the code-task publish runner', 'code tasks that publish patches; a patch up to 1 MB is stored in one code_tasks row (D1 row limit 2 MB)',
 'revert scripts/code-task-publish.py MAX_PATCH to 200000; the migration Rollback line marks the control reverted', 'the code loop can change qnfo-fleet-dashboard and qnfo-fleet-control again',
 'code_tasks rows with last_error "patch larger than" in 24 h = 0 within 24 h', 'none',
 'the real publish_one against an 816,888-char and a 2.4 MB patch (scripts/code_task_publish_patch_size_test.py)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PATCH-CAP-VERSION-LINE-1:') = 1);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'VERSION-LINE-SPLIT-1: qnfo-fleet-dashboard and qnfo-fleet-control keep ~200,000 chars of release notes on the VERSION line, so every bump is an 800 KB patch',
 'Charter pillar: autonomy. Child of PATCH-CAP-VERSION-LINE-1 (migrations/2026-10-19-code-task-patch-cap.sql). qnfo-fleet-dashboard/worker.js line 12 is 202,642 chars and qnfo-fleet-control/worker.js line 1083 is 199,469: `var VERSION = "x"; /* release notes ... */`. A line-based diff cannot split a line, so each bump removes and adds it in the worker and in deployed-current.worker.js (about 816 KB); the 200,000-char cap refused 5 of 5 dashboard code tasks on 2026-10-19 and the 1,000,000 cap only moves the limit while the line grows with every release.\nEDIT (a session, one pull request per worker, claim file:<path> first; a script is better than a model for a 200 KB line): break each of the two lines after the statement `var VERSION = "...";` so the release notes sit on the lines below it as comment lines (split the comment at the "*/ /*" boundaries so each release note is its own line), put the text VERSION-LINE-SPLIT-1 in a comment above the statement, keep `var VERSION = "x.y.z-tag";` on one short line (version-bump-guard, VERSION-AHEAD-1 and the merge runner read it), copy worker.js to deployed-current.worker.js, and bump VERSION (patch). Then a bump is a one-line patch.\nDEFINITION OF DONE: both workers carry the VERSION-LINE-SPLIT-1 marker and no line over 50,000 chars.\ncode-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "VERSION-LINE-SPLIT-1"}\nsession-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js',
 'session', 'pipeline', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'VERSION-LINE-SPLIT-1:%' AND status = 'open');

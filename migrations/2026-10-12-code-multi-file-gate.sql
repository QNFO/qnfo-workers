-- MULTI-FILE-CODE-TASKS-1 (agent_issues 2074, transformation lever T1.24, 2026-10-12, pillar autonomy), qnfo-code-orchestrator 0.12.0
-- and scripts/code-task-publish.py.
-- The code loop can now build one task over several files: the worker, up to three companions (its tests, a file of its
-- directory, a migrations/<name>.sql), one patch, one branch (ctx.paths lists the companions the patch changes). The merge
-- runner (qnfo-fleet-control cmTaskGates) still refuses a branch that changes anything but the task path and its mirror, so a
-- multi-file task built today would be proposed, verified, pushed and then refused: a model call and a failed row in
-- code_task_success_rate_30d each time. Intake therefore takes a multi-path "code-task: repo=.. path=a path=b" line only while
-- this key reads 'on'. It is filed 'off' with the reason; the qnfo-fleet-control change that makes cmTaskGates accept
-- ctx.paths sets it 'on' in its own migration. POST /v1/tasks with "extras" is not gated (a session's explicit call).
-- Measured 2026-10-12T05:00Z: 0 open agent_issues carry a multi-path code-task line (the regex did not exist), so nothing
-- waits behind the key today; the watch is the event code-task.intake-waiting ("multi-file tasks wait for the merge runner").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'off', updated_at = datetime('now') WHERE key = 'code_merge_multi_file'; -- the control_registry, capability_ledger and failure_modes rows are records and stay.

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES ('code_merge_multi_file', 'off',
  'MULTI-FILE-CODE-TASKS-1 (qnfo-code-orchestrator 0.12.0, agent_issues 2074, migrations/2026-10-12-code-multi-file-gate.sql): on = code-task intake takes a line with two to four path= entries (the task path and its companions). Off until qnfo-fleet-control cmTaskGates allows the paths in code_tasks.ctx.paths; that change turns it on. Read per multi-path issue at intake; a missing row or a failed read means off.',
  datetime('now'));

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('code_merge_multi_file', 'qnfo-audit.ops_config code_merge_multi_file read by qnfo-code-orchestrator multiFileOn (0.12.0, intakeIssues)', 'gate',
  'multi-file code tasks that are built and pushed and then refused by the merge runner, which allows only the task path and its mirror (qnfo-fleet-control cmTaskGates): a model call and a failed code_tasks row each', 0, 'remove', 'planned',
  'POST /v1/tasks with extras builds a multi-file task whatever the key says; a multi-path issue keeps its code-task line while it waits and is taken on the first tick after the key reads on; single-path lines are never affected',
  '2026-10-12T06:00:00Z',
  'qnfo-code-orchestrator/multi-file.test.mjs E1 to E4: key off leaves the line alone and audits code-task.intake-waiting once, key on files the task with its companions and anchors, a single-path line is taken either way. Removal: when cmTaskGates reads ctx.paths the key goes on and this row becomes disposition remove / applied.',
  2074);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
  ('code-loop-multi-file-task', 'qnfo-code-orchestrator 0.12.0 MULTI-FILE-CODE-TASKS-1 + scripts/code-task-publish.py companion_paths (agent_issues 2074)',
   'merge: qnfo-fleet-control cmTaskGates must allow code_tasks.ctx.paths (then ops_config code_merge_multi_file = on)', 'offline suites only until the first live task',
   '2026-10-12T06:00:00Z', NULL,
   'qnfo-code-orchestrator/multi-file.test.mjs (25 checks: a worker, its test and a new migration parked as one patch that git applies); scripts/code-task-publish.py --selftest section 7d (one branch carries all files; a stale multi-file patch is rebuilt per file)'),
  ('code-loop-dangling-reference-gate', 'qnfo-code-orchestrator 0.12.0 DANGLING-REF-GATE-1 (issues 1834, 2313, 2168)',
   NULL, 'offline suites only until the first live refusal (event code-task.dangling-refused)',
   '2026-10-12T06:00:00Z', NULL,
   'qnfo-code-orchestrator/loop-quality.test.mjs sections 3 and 4; replays ct_7xtqmvrmppmoxw (parseRefLine called, never defined) and ct_kxidt9fse2j7yu (WRITER_PROMPT removed, still used)'),
  ('code-loop-verify-deferred-to-publisher', 'qnfo-code-orchestrator 0.12.0 VERIFY-DEFER-PUBLISHER-1 (agent_issues 2008)',
   'code-task-publish.yml installs Node 22 (it does since PUBLISH-SUITE-CHECK-1)', 'offline suites only until the first live deferral (event code-task.verify-deferred)',
   '2026-10-12T06:00:00Z', NULL,
   'qnfo-code-orchestrator/loop-quality.test.mjs section 5, test-loop.mjs js auto cases; scripts/code-task-publish.py --selftest "deferred verify" cases');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('code-window-long-line', 'A code task on a file with very long lines gets a window several times WINDOW_CHARS',
   'windowFor aligned both window edges to line boundaries with no bound, so one 100k-char line on either side of the anchor became part of the window (ct_i03tgmilanmuzk, qnfo-ipatent: 128,767 chars for a 24,000-char window)',
   'qnfo-code-orchestrator 0.12.0 WINDOW-LONG-LINE-1: an edge whose alignment would add more than 4,000 chars is cut at the raw offset and the prompt says the edge line is cut',
   'qnfo-audit code_tasks: a non-terminal or recently failed task whose ctx.win spans more than 40,000 chars on a file that is not small enough to be shown whole', 'fm-code-window-long-line', '2026-10-12', 2329,
   'the anchor of a patch-mode task sits next to a line longer than the window', 'Workers AI 5021 (input tokens over the context), 3046 timeouts on the reasoning rungs, SEARCH text occurs 0 times on every rung', 'the task and its issue; three rounds of model calls'),
  ('code-proposal-dangling-reference', 'A code-loop proposal calls a function that exists nowhere, or deletes a declaration the file still uses, and still verifies',
   'the verifier proves the module parses; an undefined callee or a missing top-level const is a runtime ReferenceError, which only the merge runner''s goal review caught, after the branch was pushed (6 of the 12 goal-review refusals among the last 40 failed tasks on 2026-10-12)',
   'qnfo-code-orchestrator 0.12.0 DANGLING-REF-GATE-1: such a proposal goes back to the next rung once, with the names and the previous edits in the prompt',
   'qnfo-audit code_tasks: merge_note of a task created after the deploy that says a function is called but not defined, or a variable was removed causing an undefined reference', 'fm-code-proposal-dangling-reference', '2026-10-07', 1834,
   'a model invents a helper name or drops a constant while rewriting a block', 'merge-runner: goal review: "<name> is called but not defined" or "variable removed causing undefined reference"', 'one code task per occurrence: its model calls, a closed pull request, and a failed row in code_task_success_rate_30d');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-code-window-long-line', NULL, 'WINDOW-LONG-LINE-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE created_at >= ''2026-10-13T00:00:00'' AND created_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND json_extract(ctx, ''$.anchor'') IS NOT NULL AND (json_extract(ctx, ''$.win.we'') - json_extract(ctx, ''$.win.ws'')) > 40000) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-proposal-dangling-reference', NULL, 'DANGLING-REF-GATE-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM code_tasks WHERE created_at >= ''2026-10-13T00:00:00'' AND created_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND (instr(COALESCE(merge_note, ''''), ''is called but not defined'') > 0 OR instr(COALESCE(merge_note, ''''), ''causing undefined reference'') > 0 OR instr(COALESCE(merge_note, ''''), ''Uses undefined function'') > 0)) <= 1 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

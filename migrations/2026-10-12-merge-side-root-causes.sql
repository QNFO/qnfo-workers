-- MERGE-SIDE-ROOT-CAUSES-1 (2026-10-12, pillar autonomy; owner directive 2026-10-12 "Audit and remediate all failure modes and
-- root causes: ... The fleet's code loop is the bottleneck"; agent_issues 2074). Ships with qnfo-fleet-control 0.18.0.
-- Measured in qnfo-audit on 2026-10-12T10:00Z, the 7 days before (code_tasks by updated_at; cloud_ops_events code-merge.*):
--   15 tasks merged, 42 ended failed or publish_failed.
--   12 failed on the goal review. All 12 were refused at the open step (pr_url is still the compare URL), by one model
--      (@cf/openai/gpt-oss-120b), before any required check had run, and none got a repair round (CODE-REPAIR-INTASK-1 needed
--      an open pull request). Read against code_tasks.ctx.patch, 12 of the 13 recorded refusals (one more is now closed) were
--      right about the diff; 1 (ct_tm74cz0fyuo6wp) refused a correct edit for a stale comment; 4 led with the VERSION string.
--   7 failed on a red required check (the planner side, PR 960, and PUBLISH-SUITE-CHECK-1 own that cause).
--   11 failed because a patch did not apply: 8 are hand-filed patch rows of issues 2134 and 2135 with no parked edits (not the
--      loop's), 2 were refused by the integrity check because the mirror lagged the source at the merge base, 1
--      (ct_55k6tphrr4dlr0) was left publish_failed by the publisher after waiting 8 hours for a push to main.
--   1 green merge (PR 986) was answered "405 Base branch was modified" and the runner moved the head with update-branch.
-- This file: (1) turns the multi-file gate on, now that the merge runner reads ctx.paths; (2) records each root cause in
-- failure_modes with an fm- detector; (3) registers one metric per cause the owner named (per 7 days) with its trigger and an
-- hourly refresh; (4) control_registry rows for the switches and the one-tick hold the worker gains; (5) the capability and
-- decision records. Idempotent.
-- Not done here on purpose: the three metrics breach on the day they are registered (their window still holds the rows above);
-- the triggers file their issues, and the detectors below count only rows written after the deploy.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'off', updated_at = datetime('now') WHERE key = 'code_merge_multi_file'; UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key IN ('code_review_refusals_7d', 'code_patch_stale_failures_7d', 'code_check_failures_7d'); UPDATE remediation_contracts SET status = 'retired' WHERE class IN ('fm-code-review-single-model', 'fm-code-review-dead-end-at-open', 'fm-code-review-noise-defect', 'fm-code-patch-stale-dead-end', 'fm-code-multi-file-refused', 'fm-code-publish-waits-for-push', 'fm-code-merge-race-moved-head', 'fm-lane-null-first-read-nudge'); -- the trigger code_loop_cause_metrics_tick only refreshes three metric_registry rows and may stay; failure_modes, control_registry, capability_ledger and decision_log rows are records and stay.

-- 1. MERGE-MULTI-FILE-1: cmTaskGates, cmIntegrity and cmParsePatch accept ctx.paths (qnfo-fleet-control 0.18.0), so the key that
--    opens the orchestrator's multi-path intake (qnfo-code-orchestrator MULTI-FILE-CODE-TASKS-1, PR 960) and the merge of
--    companions goes on. PR 960's own migration files the key 'off' with INSERT OR IGNORE, so either order of the two ends 'on'.
INSERT INTO ops_config (key, value, note, updated_at) VALUES ('code_merge_multi_file', 'on',
  'MERGE-MULTI-FILE-1 (qnfo-fleet-control 0.18.0, agent_issues 2074, migrations/2026-10-12-merge-side-root-causes.sql): on = code-task intake takes a line with two to four path= entries, and the merge runner lets the companions listed in code_tasks.ctx.paths (the worker''s tests, a file of its directory, a migrations/<name>.sql) merge with the task path. off = companions wait (never refused) and intake leaves multi-path lines alone.',
  datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = 'on', note = excluded.note, updated_at = excluded.updated_at;

UPDATE control_registry SET disposition = 'keep', disposition_state = 'applied',
  evidence = COALESCE(evidence, '') || ' | 2026-10-12 qnfo-fleet-control 0.18.0 MERGE-MULTI-FILE-1 reads ctx.paths; the key is on and stays as the kill switch of both halves (code-merge.test.mjs: key on merges, key off waits).'
WHERE control = 'code_merge_multi_file' AND COALESCE(evidence, '') NOT LIKE '%MERGE-MULTI-FILE-1 reads ctx.paths%';

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('code-merge-multi-file-switch', 'ops_config code_merge_multi_file (on since 2026-10-12), read by qnfo-fleet-control cmConfig and by qnfo-code-orchestrator multiFileOn', 'kill-switch',
  'tests and migrations written by the code loop merging when that is not wanted (a migration is applied by CI at merge)', 0, 'keep', 'applied',
  'off makes a multi-file branch wait with the reason in merge_note (never a refusal); single-file tasks are untouched; a session pull request carries the same change through STALE-PR-MERGE-FIRST-1',
  '2026-10-12', 'qnfo-fleet-control/code-merge.test.mjs "multi-file end to end with the key off: the branch waits" and "merged on green required checks"', 2074),
 ('code-goal-review-two-reviewers', 'qnfo-fleet-control cmGoalReview / cmReviewScreen / cmReviewCombine (ops_config code_goal_review_enabled, code_goal_review_models)', 'gate',
  'a code-loop diff that does not do what its goal asks, or carries an error in a changed line, reaching main on green checks alone', 0, 'replace', 'applied',
  'the required checks (gate, guard, mirror-guard, comparator) decide when the two reviewers disagree, when the second is unavailable after three tries, or when ops_config code_goal_review_enabled is off; a refusal both agree on is a repair round, not a stop',
  '2026-10-12', 'replaced the one-model gate of 0.9.0: 12 tasks failed on it in 7 days with no repair round. code-merge.test.mjs replays the 13 recorded refusals and the split, agree and unavailable cases', 2074),
 ('code-publish-dispatch-switch', 'ops_config code_publish_dispatch_enabled (absent = on), read by qnfo-fleet-control cmConfig', 'kill-switch',
  'workflow_dispatch runs of code-task-publish.yml started by the worker when that is not wanted', 0, 'keep', 'applied',
  'off leaves the publisher to its workflow_run triggers (mirror-sync, fleet-autodeploy), as before 0.18.0',
  '2026-10-12', 'qnfo-fleet-control/code-merge.test.mjs PUBLISH-DISPATCH-1: switch off, no dispatch', NULL),
 ('stale-pr-null-requery-hold', 'qnfo-fleet-control bhNudge (MERGEABILITY-REQUERY-1): update-branch is not asked on the first lane tick that reads mergeable null for a head', 'hold',
  'an update-branch (every check reruns, the quiet clock restarts) for a pull request GitHub would report clean a few seconds later', 0, 'keep', 'applied',
  'expires by itself on the next lane tick (20 minutes): the same head reading null again is nudged; the held refusal is a merge-refused row; a branch that is behind main is nudged at once',
  '2026-10-12', 'qnfo-fleet-control/branch-hygiene.test.mjs "requery: the first null answer is not nudged" and "a head that reads null on a second tick is nudged"; measured 2026-10-12 08:00Z and 09:00Z on PRs 941, 943, 944, 946, 960', 2230);

-- 2. Root causes and their detectors. Each detector counts rows written after the deploy (2026-10-13T00:00Z) in a rolling window.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('code-review-single-model', 'one reviewer model ends a code task on its own opinion, before any required check has run',
  'GOAL-REVIEW-1 asked one model from another family than the proposer and treated its "no" (or "harm") as final at the open step; docs/ENSEMBLE-POLICY.md says model errors are correlated and a layer must not stand alone',
  'qnfo-fleet-control 0.18.0 GOAL-REVIEW-2: a refusal needs a second reviewer of a third family to refuse too; otherwise the pull request opens and the required checks decide, with the disagreement in the note',
  'no code task ends with last_error "merge-runner: goal review (<one model>)" after the deploy', 'fm-code-review-single-model', '2026-10-07', 2074,
  'the first reviewer answers no or harm', 'merge-runner: goal review (@cf/openai/gpt-oss-120b): ...', 'one code task per refusal: its model calls and a failed row'),
 ('code-review-dead-end-at-open', 'a goal-review refusal at the open step ends the task with no repair round',
  'CODE-REPAIR-INTASK-1 (0.16.0) ran only for an open pull request; all 12 goal-review failures of the 7 days to 2026-10-12 were refused before a pull request existed, so cmOpenHandle called cmRefuseTask',
  'qnfo-fleet-control 0.18.0 REPAIR-AT-OPEN-1 + REFUSAL-REASON-1: a refusal at the open step goes back to the orchestrator (ctx.refusal, ctx.lastError with the quoted lines) while a round and an attempt are left',
  'no failed code task refused by the goal review at the open step (compare URL) with a repair round and an attempt left', 'fm-code-review-dead-end-at-open', '2026-10-07', 2074,
  'both reviewers refuse a pushed branch', 'status failed, pr_url .../compare/main...codeagent-..., repair_round absent', 'the task, and its issue waits out the intake cooldown'),
 ('code-review-noise-defect', 'a reviewer''s refusal rests on, or leads with, something the loop does not control or a matter of style',
  'the prompt did not say that the loop sets VERSION itself, the reviewer saw hunks only (a name defined elsewhere reads as undefined), 1,800 of 2,000 goal chars and long lines cut at 400 chars, and no defect had to quote a line',
  'qnfo-fleet-control 0.18.0 GOAL-REVIEW-2: the reviewer quotes the changed line; cmReviewScreen drops VERSION, comment and style remarks, "not defined" claims the head file refutes, and unquoted defects on a cut diff; harm needs a quoted line',
  'no refused goal-review event after the deploy whose text names the version string or a comment as a defect', 'fm-code-review-noise-defect', '2026-10-07', 2074,
  'a goal that names a VERSION; an edit next to a comment', 'defects "Version string does not match required ..." (4 of 13), harm for a stale comment (ct_tm74cz0fyuo6wp)', 'the repair round is told to fix the wrong thing'),
 ('code-patch-stale-dead-end', 'a verified change that no longer fits its base ends the task',
  'cmIntegrity judged the mirror by its own hunks (the mirror lagged the source at the merge base on 2026-10-07: ct_yghmskhqci2vv1, ct_h7lmh3yuwbv3wv) and refused; a publisher rebuild whose SEARCH text was gone from main left the task publish_failed (ct_55k6tphrr4dlr0); neither was retried',
  'qnfo-fleet-control 0.18.0 MIRROR-FOLLOWS-SOURCE-1 (the mirror must equal the verified source) and PATCH-REBUILD-1 (stale -> publisher rebuild from the parked edits once, then a repair round at step read; publish_failed conflicts of open issues are swept back to the orchestrator)',
  'no loop-built task ends failed or publish_failed on "does not apply" or "do not re-apply" with an attempt left', 'fm-code-patch-stale-dead-end', '2026-10-07', 2074,
  'main changes the file or its mirror between the proposal and the merge', 'merge-runner: the verified patch does not apply to ...; publish: patch does not apply to main ...', 'the task; its issue waits for a session'),
 ('code-multi-file-refused', 'a multi-file code task is built and pushed and then refused by the merge runner',
  'cmTaskGates allowed only the task path and its mirror as modifications, cmIntegrity read every file at the merge base (a new migration is absent there) and cmParsePatch did not mark a new-file section',
  'qnfo-fleet-control 0.18.0 MERGE-MULTI-FILE-1: ctx.paths companions (modified or new), ctx.x[].edits on a rebuilt branch, ops_config code_merge_multi_file',
  'no task that lists ctx.paths ends failed on "only ... may change, as modifications"', 'fm-code-multi-file-refused', '2026-10-12', 2074,
  'a task with companions reaches the open step', 'merge-runner: the branch changes a, b, c; only a and b may change', 'every multi-file task'),
 ('code-publish-waits-for-push', 'a verified task waits in ready_to_publish until something else pushes to main',
  'code-task-publish.yml has no schedule (schedule events do not fire on this repository) and runs only after mirror-sync or fleet-autodeploy, that is after a push to main',
  'qnfo-fleet-control 0.18.0 PUBLISH-DISPATCH-1: the hourly and the */20 tick dispatch the workflow when a task has been ready for 10 minutes (at most once per 20 minutes; the HTTP status is recorded)',
  'no task has been ready_to_publish for more than 60 minutes', 'fm-code-publish-waits-for-push', '2026-10-11', 2074,
  'a quiet main', 'ct_55k6tphrr4dlr0 ready_to_publish for 8 hours on 2026-10-11/12', 'every verified task of that period'),
 ('code-merge-race-moved-head', 'a green merge answered "405 Base branch was modified" moves the pull request head instead of merging',
  'evMergePr answered every 405 with update-branch; that 405 is a race with a push to main, and update-branch makes a new head, so every check and the goal review start again',
  'qnfo-fleet-control 0.18.0 MERGE-RACE-RETRY-1: the same pinned merge is retried twice a few seconds apart before any update-branch',
  'no code-merge.merge-failed event after the deploy says "Base branch was modified" more than twice in 24 hours', 'fm-code-merge-race-moved-head', '2026-10-12', 2074,
  'main moves while the runner merges', 'cloud_ops_events code-merge.merge-failed: merge HTTP 405 Base branch was modified (PR 986, 2026-10-12T09:00Z)', 'one tick of delay and a second review per occurrence'),
 ('lane-null-first-read-nudge', 'the stale-PR lane passes over (or needlessly updates) a green pull request because GitHub answers mergeable null on the first read',
  'GitHub computes mergeability lazily after main moves; the lane read it three times within 4 seconds, hourly, and 0.17.0 would then ask for update-branch at once, which reruns every check',
  'qnfo-fleet-control 0.18.0 MERGEABILITY-REQUERY-1 + LANE-TICK-20-1: pre-warm read of every candidate, five reads with a growing wait, update-branch only for a head that read null on an earlier tick, and the lane runs every 20 minutes',
  'no merge-nudge row for a null answer without an earlier merge-refused row for the same head', 'fm-lane-null-first-read-nudge', '2026-10-12', 2230,
  'main moved shortly before the lane tick', 'PRs 941, 943, 944, 946 and 960 skipped at 08:00Z and 09:00Z on 2026-10-12 with no row', 'every green quiet session pull request for an hour or more');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-code-review-single-model', NULL, 'GOAL-REVIEW-2', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE updated_at > ''2026-10-13T00:00:00Z'' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND COALESCE(last_error, '''') LIKE ''merge-runner: goal review (%'' AND COALESCE(last_error, '''') NOT LIKE ''merge-runner: goal review (% + %)%'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-review-dead-end-at-open', NULL, 'REPAIR-AT-OPEN-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''failed'' AND updated_at > ''2026-10-13T00:00:00Z'' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND COALESCE(last_error, '''') LIKE ''merge-runner: goal review (%'' AND COALESCE(pr_url, '''') LIKE ''%/compare/%'' AND COALESCE(json_extract(ctx, ''$.repair_round''), 0) < 2 AND attempts < 8) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-review-noise-defect', NULL, 'GOAL-REVIEW-2', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''code-merge.goal-review'' AND status = ''refused'' AND ts > ''2026-10-13T00:00:00Z'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND (text LIKE ''%ersion string%'' OR text LIKE ''%VERSION variable%'' OR text LIKE ''%: The comment %'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-patch-stale-dead-end', NULL, 'PATCH-REBUILD-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status IN (''failed'', ''publish_failed'') AND updated_at > ''2026-10-13T00:00:00Z'' AND updated_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'') AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND json_array_length(COALESCE(json_extract(ctx, ''$.edits''), ''[]'')) > 0 AND (COALESCE(last_error, '''') LIKE ''%does not apply%'' OR COALESCE(last_error, '''') LIKE ''%do not re-apply%'') AND attempts < 8) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-multi-file-refused', NULL, 'MERGE-MULTI-FILE-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''failed'' AND updated_at > ''2026-10-13T00:00:00Z'' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND json_array_length(COALESCE(json_extract(ctx, ''$.paths''), ''[]'')) > 0 AND COALESCE(last_error, '''') LIKE ''%may change, as modifications%'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-publish-waits-for-push', NULL, 'PUBLISH-DISPATCH-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE repo = ''qnfo-workers'' AND status = ''ready_to_publish'' AND updated_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-code-merge-race-moved-head', NULL, 'MERGE-RACE-RETRY-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''code-merge.merge-failed'' AND ts > ''2026-10-13T00:00:00Z'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') AND text LIKE ''%Base branch was modified%'') <= 2 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-lane-null-first-read-nudge', NULL, 'MERGEABILITY-REQUERY-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM branch_hygiene_log n WHERE n.action = ''merge-nudge'' AND n.why LIKE ''%mergeable null%'' AND n.ts > ''2026-10-13T00:00:00Z'' AND n.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'') AND NOT EXISTS (SELECT 1 FROM branch_hygiene_log r WHERE r.action = ''merge-refused'' AND r.pr = n.pr AND COALESCE(r.sha, '''') = COALESCE(n.sha, '''') AND r.ts < n.ts AND r.why LIKE ''%mergeable null%'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

-- 3. One metric per cause the owner named, per 7 days, refreshed hourly off the fleet tick, each with its trigger.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('code_review_refusals_7d', 'operational', 'leading', 'count of code_tasks with status failed, updated in the last 7 days, whose last_error starts "merge-runner: goal review" (the task ended on the reviewers'' refusal; a refusal that was repaired inside the task is not counted)', 'qnfo-audit.code_tasks', '12 on 2026-10-12 (all refused at the open step by one model)', '<= 3', 'qnfo-fleet-control', 'trigger gt 3', '1h', '> 3', '> 8', NULL, NULL, 'MEASURED', 'computed'),
 ('code_patch_stale_failures_7d', 'operational', 'leading', 'count of loop-built code_tasks (ctx.edits parked) with status failed or publish_failed, updated in the last 7 days, whose last_error says the patch does not apply or the edits do not re-apply (hand-filed patch rows with no parked edits are not counted: 8 on 2026-10-12)', 'qnfo-audit.code_tasks', '3 on 2026-10-12 (2 mirror lag at the merge base, 1 publisher rebuild conflict)', '<= 1', 'qnfo-fleet-control', 'trigger gt 1', '1h', '> 1', '> 4', NULL, NULL, 'MEASURED', 'computed'),
 ('code_check_failures_7d', 'operational', 'leading', 'count of code_tasks with status failed, updated in the last 7 days, whose last_error starts "merge-runner: required check(s) failed" (a red required check ended the task after its repair rounds)', 'qnfo-audit.code_tasks', '7 on 2026-10-12', '<= 3', 'qnfo-code-orchestrator', 'trigger gt 3', '1h', '> 3', '> 8', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS code_loop_cause_metrics_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM code_tasks WHERE status = 'failed' AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND COALESCE(last_error, '') LIKE 'merge-runner: goal review%') AS TEXT)
  WHERE metric = 'code_review_refusals_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM code_tasks WHERE status IN ('failed', 'publish_failed') AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND json_array_length(COALESCE(json_extract(ctx, '$.edits'), '[]')) > 0 AND (COALESCE(last_error, '') LIKE '%does not apply%' OR COALESCE(last_error, '') LIKE '%do not re-apply%')) AS TEXT)
  WHERE metric = 'code_patch_stale_failures_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM code_tasks WHERE status = 'failed' AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND COALESCE(last_error, '') LIKE 'merge-runner: required check(s) failed%') AS TEXT)
  WHERE metric = 'code_check_failures_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'code_review_refusals_7d', 'Code loop: more than 3 tasks in 7 days ended on a goal-review refusal', 'registry', 'gt', 3, 3,
  'Pillar autonomy (MERGE-SIDE-ROOT-CAUSES-1). Read the refusals: SELECT id, ts, status, text, meta FROM cloud_ops_events WHERE kind = ''code-merge.goal-review'' AND status IN (''refused'', ''split'') AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''), and the tasks: SELECT id, attempts, json_extract(ctx, ''$.repair_round''), json_extract(ctx, ''$.refusal'') , last_error FROM code_tasks WHERE status = ''failed'' AND last_error LIKE ''merge-runner: goal review%''. For each, compare the defects with code_tasks.ctx.patch. Levers by what the comparison shows: the defects are right and the repair rounds repeat them (the planner: qnfo-code-orchestrator prompt, ladder or the goal on the issue); the defects are wrong and both reviewers agree (cmReviewScreen in qnfo-fleet-control: add the deterministic check that refutes that class, with the recorded reply as a test in code-merge.test.mjs); rows from before 2026-10-13 only (the window has not rolled yet: record that and close). Never switch the review off to lower the count. Done: code_review_refusals_7d <= 3 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'MERGE-SIDE-ROOT-CAUSES-1 (migrations/2026-10-12-merge-side-root-causes.sql); baseline 12 on 2026-10-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'code_review_refusals_7d');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'code_patch_stale_failures_7d', 'Code loop: more than 1 loop-built task in 7 days ended because its patch no longer applied', 'registry', 'gt', 1, 3,
  'Pillar autonomy (MERGE-SIDE-ROOT-CAUSES-1). Read SELECT id, status, attempts, branch, last_error, json_extract(ctx, ''$.rebase_round''), json_extract(ctx, ''$.rebased'') FROM code_tasks WHERE status IN (''failed'', ''publish_failed'') AND (last_error LIKE ''%does not apply%'' OR last_error LIKE ''%do not re-apply%'') AND json_array_length(COALESCE(json_extract(ctx, ''$.edits''), ''[]'')) > 0 AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''), and the events code-merge.rebase-requeued and code-merge.repair-requeued for the same ids. A row with an attempt left (attempts < 8) that was neither rebuilt nor re-proposed is a gap in PATCH-REBUILD-1 (qnfo-fleet-control cmRebuildStale, cmRepairInTask, cmSweepPublishFailed): fix that path with the row as a test. A row that used every attempt is a goal that conflicts with a busy file: split the goal or raise the file''s claim on the issue. Rows from before 2026-10-13 only: record that and close. Done: code_patch_stale_failures_7d <= 1 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'MERGE-SIDE-ROOT-CAUSES-1 (migrations/2026-10-12-merge-side-root-causes.sql); baseline 3 on 2026-10-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'code_patch_stale_failures_7d');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'code_check_failures_7d', 'Code loop: more than 3 tasks in 7 days ended on a red required check', 'registry', 'gt', 3, 3,
  'Pillar autonomy (MERGE-SIDE-ROOT-CAUSES-1). Read SELECT id, path, attempts, json_extract(ctx, ''$.repair_round''), last_error FROM code_tasks WHERE status = ''failed'' AND last_error LIKE ''merge-runner: required check(s) failed%'' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''): last_error names the failing suite and assertion (CI-FEEDBACK-1). Levers by cause: the suite pins the behaviour the goal changes (the task needs the test as a companion: file the issue''s code-task line with a second path= for the test, MULTI-FILE-CODE-TASKS-1); the suite was already red on main (fix main first: the same suite fails for every task of that worker); the publisher did not run the suite before the push (scripts/code-task-publish.py PUBLISH-SUITE-CHECK-1: read the run log for that task). Rows from before 2026-10-13 only: record that and close. Done: code_check_failures_7d <= 3 at two refreshes.',
  'qnfo-code-orchestrator', 'agent_issues', 24, 1, 'MERGE-SIDE-ROOT-CAUSES-1 (migrations/2026-10-12-merge-side-root-causes.sql); baseline 7 on 2026-10-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'code_check_failures_7d');

-- 4. Capabilities the fleet gains, and the decision.
INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('code-loop-two-reviewer-goal-review', 'qnfo-fleet-control 0.18.0 GOAL-REVIEW-2 (agent_issues 2074)', 'Workers AI binding; ops_config code_goal_review_models lists at least three model families', 'offline suite until the first live split or agreed refusal (cloud_ops_events code-merge.goal-review status split / refused with two models)', '2026-10-12T12:00:00Z', NULL, 'qnfo-fleet-control/code-merge.test.mjs: replay of the 13 recorded refusals, quoted-line screening, split / agree / unavailable'),
 ('code-loop-multi-file-merge', 'qnfo-fleet-control 0.18.0 MERGE-MULTI-FILE-1 (agent_issues 2074)', 'qnfo-code-orchestrator MULTI-FILE-CODE-TASKS-1 (PR 960) builds the tasks; ops_config code_merge_multi_file = on', 'offline suite until the first live multi-file merge', '2026-10-12T12:00:00Z', NULL, 'qnfo-fleet-control/code-merge.test.mjs MERGE-MULTI-FILE-1: gates, integrity (patch and rebuilt branch), end to end'),
 ('code-loop-stale-patch-rebuild', 'qnfo-fleet-control 0.18.0 PATCH-REBUILD-1 + MIRROR-FOLLOWS-SOURCE-1', 'scripts/code-task-publish.py REBASE-BEFORE-PUBLISH-1', 'offline suite until the first live event code-merge.rebase-requeued with stage open', '2026-10-12T12:00:00Z', NULL, 'qnfo-fleet-control/code-merge.test.mjs PATCH-REBUILD-1'),
 ('code-publisher-dispatch-from-worker', 'qnfo-fleet-control 0.18.0 PUBLISH-DISPATCH-1', 'the fleet GitHub token may dispatch workflows (the first live event code-merge.publish-dispatch records the HTTP status either way)', 'unproven live until that event reads HTTP 204', '2026-10-12T12:00:00Z', NULL, 'qnfo-fleet-control/code-merge.test.mjs PUBLISH-DISPATCH-1'),
 ('stale-pr-lane-every-20-minutes', 'qnfo-fleet-control 0.18.0 LANE-TICK-20-1 + MERGEABILITY-REQUERY-1 (agent_issues 2230)', NULL, 'offline suite until the first merge-stale-pr row written outside minute 0', '2026-10-12T12:00:00Z', NULL, 'qnfo-fleet-control/branch-hygiene.test.mjs lane tick and requery cases');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji',
  'the reviewer was mostly right about the diffs it refused (12 of 13), so the loss was not the review but what followed it: one model deciding alone before the checks, no repair round at the open step, and reasons the planner could not act on',
  'MERGE-SIDE-ROOT-CAUSES-1: qnfo-fleet-control 0.18.0 (GOAL-REVIEW-2, REFUSAL-REASON-1, REPAIR-AT-OPEN-1, PATCH-REBUILD-1, MIRROR-FOLLOWS-SOURCE-1, MERGE-MULTI-FILE-1, MERGE-RACE-RETRY-1, MERGEABILITY-REQUERY-1, LANE-TICK-20-1, PUBLISH-DISPATCH-1); ops_config code_merge_multi_file on; three per-cause metrics with triggers; eight failure modes with detectors',
  'qnfo-audit 2026-10-12T10:00Z, 7 days: 15 merged, 42 failed or publish_failed; 12 goal-review failures, all at the open step, all by one model, none repaired; 7 red-check failures; 11 does-not-apply failures (8 hand-filed, 2 mirror lag, 1 publisher conflict after an 8 hour wait); PR 986 merge 405 moved the head; five green PRs skipped by the lane at 08:00Z and 09:00Z',
  'refusals become repair rounds or are settled by the required checks; stale patches are rebuilt; multi-file tasks can merge; the lane and the publisher no longer wait for an hour or a push',
  'the code loop''s merge runner and the stale-PR lane (qnfo-fleet-control); tests and migrations written by the loop can now merge as companions',
  'ops_config code_merge_multi_file off, code_goal_review_enabled off, code_publish_dispatch_enabled off, stale_pr_nudge_enabled off; revert the pull request (CONTROL-PLANE-SELF-MERGE-1 canary covers the deploy)',
  'two-reviewer goal review, multi-file merges, stale-patch rebuild, worker-side publisher dispatch, a 20-minute merge lane',
  'code_review_refusals_7d falls from 12 to at most 3 and code_patch_stale_failures_7d from 3 to at most 1 once the 7-day window has rolled past 2026-10-12 (by 2026-10-20); code_goal_success_rate_30d rises',
  'none (internal throughput)', 'surfaces: merge runner open step, merge step, publisher hand-back, stale-PR lane, workflow dispatch'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'MERGE-SIDE-ROOT-CAUSES-1%');

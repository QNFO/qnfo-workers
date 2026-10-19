-- CONFLICT-REPAIR-INPLACE-1 (2026-10-19, charter pillar: autonomy; owner directive 2026-10-19: "pull requests need to squash, merge and close faster as they are holding up code loops and CI pipelines").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-pr-conflict-sits-unrepaired'; DELETE FROM failure_modes WHERE fm_key = 'pr-conflict-sits-unrepaired';
--
-- WHY (measured 2026-10-19 on QNFO/qnfo-workers)
-- Five open pull requests conflicted with main and waited: 2301 (code task INTEG-MASTODON-VERIFY-1) 1091 minutes, 2568 (GA4-PROPERTY-MISMATCH-1) 407,
-- 2589 (TRAVEL-PLANNER-1) 209, 2629 (FLEET-GRAPH-1) 156, 2665 (COMPANION-PUBLISH-STALL-AUTO-1) 75. Every one was a VERSION-line collision, the
-- commonest conflict here (two changes to one worker each bump the same line). The repair path did not reach them:
--   * STALE-PR-CONFLICT-REPAIR-1 (qnfo-fleet-control bhConflictDecide) refuses a code-loop branch (codeagent-*) outright, and files an issue only for a
--     quiet session pull request;
--   * conflict_repair.py (the doer) ran only after a remediation-consumer run, which qnfo-cloud-ops dispatches when it has been idle 60 minutes, and only
--     for a pull request that had an open repair issue;
--   * REBASE-REQUEUE-1 rebuilds a code-loop patch once; a second stale base re-proposes it with a model, a full round per conflict.
-- Fix (scripts/conflict_repair.py, .github/workflows/conflict-repair.yml): every push to main now looks for open pull requests GitHub reports as
-- conflicting (mergeable_state dirty) whose newest commit is 10 minutes old, any author and branch, and merges main into the pull request's own branch
-- (never forced; VERSION-line and mirror conflicts only; both sides' release notes kept; VERSION raised above main and the other claims; suites and guards
-- first), then dispatches the check workflows on it. The detector below reads the code loop's own record of a stale pull request.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('pr-conflict-sits-unrepaired',
   'an open pull request that conflicts with main only on the VERSION line and its mirror waits hours for a repair that nothing starts',
   'the stale-PR conflict lane refuses code-loop branches and needs a repair issue; the doer ran only after an idle-60-minute consumer dispatch; two changes to one worker each bump the same VERSION line, so main moving makes every other open pull request on that worker conflict',
   'CONFLICT-REPAIR-INPLACE-1: conflict-repair.yml runs on every push to main, probes for conflicting pull requests first, and merges main into each quiet one (any branch) with VERSION and mirror conflicts resolved, release notes of both sides kept',
   'GET open pulls: no pull request with mergeable_state dirty and a newest commit older than 30 minutes; the code loop''s record: no unmerged code task whose merge note says it conflicts with main for 30 minutes',
   'fm-pr-conflict-sits-unrepaired', '2026-10-19', NULL,
   'main moves while a pull request that changes the same worker is open',
   'five pull requests waited 75 to 1091 minutes on 2026-10-19 while the code loop and CI queued behind them',
   'the code loop (a task cannot finish until its pull request merges), every worker with two open changes, the deploy of each');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-pr-conflict-sits-unrepaired', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status IN (''published'', ''pr_open'', ''branch_pushed'') AND (merge_note LIKE ''%conflicts with main%'' OR merge_note LIKE ''%does not apply%'') AND COALESCE(merge_checked_at, updated_at) < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'CONFLICT-REPAIR-INPLACE-1', 'failure-mode detector', 'qnfo-fleet-control');

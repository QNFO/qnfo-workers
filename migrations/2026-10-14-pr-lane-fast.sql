-- PR-LANE-FAST-1 (2026-10-14, pillar autonomy). Owner directive, verbatim: "Merge all changes and deploy. The system shall process PRs
-- more rapidly and push to production." qnfo-fleet-control 0.29.0: the stale-PR lane merges a green, clean session pull request after
-- ops_config stale_pr_merge_idle_min of quiet (default 20 minutes, floor 10) instead of a fixed 2 hours, and the code loop decides
-- merges on every 10-minute tick instead of at minute 30 and on the hour. The quiet window is a hold: recorded here, demoted, with the
-- alternate path (the gates that remain) and its evidence. ops_config stale_pr_merge_idle_min = 120 restores the old window without a
-- deploy.
-- spof-review: no new dependency; the lane keeps both runners (the 10-minute laneOnly tick and the hourly branch hygiene tick).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control = 'stale-pr-merge-idle-window'; DELETE FROM ops_config WHERE key = 'stale_pr_merge_idle_min'

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('stale-pr-merge-idle-window', 'qnfo-fleet-control bhConfig / branchHygieneTick (ops_config stale_pr_merge_idle_min)', 'hold',
  'merging a pull request while its author or a reviewer is still changing it',
  'every session pull request waits this long on main after its checks go green', 'demote', 'applied',
  'the remaining merge gates: required checks green on the head, mergeable_state clean, no HOLD: comment newer than the head (STALE-PR-LANE-READS-HOLDS-1), no .github/ change, no draft or WIP, any new push resets the clock; after the deploy the canary reverts a VERSION that does not arrive (CONTROL-PLANE-CANARY-2)',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'qnfo-fleet-control/pr-lane-fast.test.mjs and branch-hygiene.test.mjs (a PR quiet 6 minutes is left alone, a green clean PR quiet past the window is merged); 2 h -> 20 min on the owner directive of 2026-10-14',
  NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at)
VALUES ('stale_pr_merge_idle_min', '20', 'PR-LANE-FAST-1: minutes of quiet before the stale-PR lane merges a green clean PR (floor 10; 120 = the old window)', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01AEEBcczeW1o2nKSUBtXnUL', 'a green, clean pull request gains no safety from sitting 2 hours: holds, checks and the canary carry the risk, the wait only delays production',
  'PR-LANE-FAST-1: lane quiet window 2 h -> ops_config stale_pr_merge_idle_min (20 min); code-loop merges every 10 minutes',
  'owner directive 2026-10-14; the lane already ran every 10 minutes (LANE-TICK-20-1) but waited 2 hours of quiet',
  'migration merged', 'session pull requests reach main sooner; every merge gate unchanged', 'ops_config stale_pr_merge_idle_min = 120 (no deploy); the Rollback header',
  'green work reaches production within about 30 minutes of its last push instead of 2 hours or more',
  'the next green session pull request is merged by the lane within 40 minutes of its last push (branch_hygiene_log merge-stale-pr row vs the head commit time)', 'none', 'branch_hygiene_log, ops_config, GitHub pull requests'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PR-LANE-FAST-1:%');

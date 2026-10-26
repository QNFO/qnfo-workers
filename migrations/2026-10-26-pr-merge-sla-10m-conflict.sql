-- PR-MERGE-SLA-10M-1, conflict half (2026-10-26, charter pillar autonomy; agent_issues 1000291). Owner directive 2026-10-26, verbatim: "MERGE ALL PRS AND MAKE SURE
-- THEY ALWAYS MERGE WITHIN 10 MINUTES OF OPENING. THE SYSTEM SHALL AUTOMATICALLY ADDRESS ANY CHECK FAILURES AND MERGE CONFLICTS TO MEET 10-MINUTE SLA AND MERGE/CLOSE
-- AUTOMATICALLY". The lane half is migrations/2026-10-26-pr-merge-sla-10m-lane.sql (#4355); this file records the conflict-repair changes that go with it.
-- WHAT WAS MEASURED (2026-10-26, GitHub API and .github/workflows/conflict-repair.yml): the push probe and scripts/conflict_repair.py dirty_prs both skipped a draft, and the
--   harness opens every session pull request as a draft, so a conflicting session pull request was never repaired; a pull request whose `mergeable` GitHub left null
--   (main moves every 1 to 5 minutes, so it stays null) was counted as clean after three reads and skipped; a person's branch waited 10 minutes of quiet, the whole SLA.
-- WHAT CHANGED (same PR): conflict_repair.py takes a draft that does not ask to wait (WIP, hold, do-not-merge in title, labels or body), waits 3 minutes of quiet, and
--   decides a pull request GitHub has not computed with `git merge-tree --write-tree` (merge_tree_conflicts); the workflow probe counts an unknown pull request as a reason to run;
--   the repository variable CONFLICT_REPAIR_DRAFTS = off restores the skip of drafts without a deploy.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-conflict-draft-skipped', 'fm-conflict-probe-skips-unknown'); DELETE FROM failure_modes WHERE fm_key IN ('conflict-draft-skipped', 'conflict-probe-skips-unknown'); DELETE FROM control_registry WHERE control IN ('conflict-repair-draft-skip', 'conflict-repair-quiet-window');
-- Rollback note: the decision row is append-only and stays. The repository variable CONFLICT_REPAIR_DRAFTS = off, or reverting the PR, restores the old behaviour.
-- spof-review: no new cron, binding or credential; the repair still runs on a push to main and on the remediation-consumer completion, as before.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('conflict-draft-skipped',
  'a session pull request that conflicts with main is never repaired because it is a draft',
  'conflict_repair.py (dirty_prs, eligible) and the push probe in conflict-repair.yml skipped every draft as work in progress, but the harness opens every session pull request as a draft, so the conflicting ones waited for their author; the quiet window was also 10 minutes, the whole SLA',
  'PR-MERGE-SLA-10M-1: a draft is taken unless asks_to_wait finds WIP, hold or do-not-merge in its title, labels or body; quiet window 3 minutes; CONFLICT_REPAIR_DRAFTS = off restores the skip',
  'fm-conflict-draft-skipped: scripts/conflict_repair.py no longer skips a draft unconditionally (the line `if not n or p.get("draft") or ref.startswith` is absent) and defines DRAFTS',
  'fm-conflict-draft-skipped', '2026-10-26', 1000291,
  'a session pull request opens as a draft and main moves under it',
  'draft pull requests conflicting with main for longer than 10 minutes with no repair row in branch_hygiene_log or cloud_ops_events kind conflict-repair-reapplied',
  'every session pull request that conflicts with main'),
 ('conflict-probe-skips-unknown',
  'a pull request GitHub never computes mergeability for is counted as clean and never repaired',
  'GitHub leaves `mergeable` null while main keeps moving (every 1 to 5 minutes on this repository); the push probe retried three times, then counted the pull request as not conflicting, so the repair job was skipped and dirty_prs never saw it',
  'PR-MERGE-SLA-10M-1: the probe counts an unknown pull request as a reason to run and scripts/conflict_repair.py decides it with git merge-tree (merge_tree_conflicts) instead of skipping it',
  'fm-conflict-probe-skips-unknown: conflict-repair.yml adds the unknown count to dirty (`dirty=$((dirty+unknown))`) and conflict_repair.py defines merge_tree_conflicts',
  'fm-conflict-probe-skips-unknown', '2026-10-26', 1000291,
  'main moves faster than GitHub computes mergeability for an open pull request',
  'pull requests with mergeable null and mergeable_state unknown for longer than 10 minutes',
  'every pull request opened while main is busy');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
 ('fm-conflict-draft-skipped', NULL,
  '{"paths": ["scripts/conflict_repair.py"], "contains": "DRAFTS = (os.environ.get(", "absent": "if not n or p.get(\"draft\") or ref.startswith"}',
  'code-read', 3, 1, 'active', 'PR-MERGE-SLA-10M-1', 'failure-mode detector', 'qnfo-fleet-control'),
 ('fm-conflict-probe-skips-unknown', NULL,
  '{"paths": [".github/workflows/conflict-repair.yml"], "contains": "dirty=$((dirty+unknown))"}',
  'code-read', 3, 1, 'active', 'PR-MERGE-SLA-10M-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('conflict-repair-draft-skip',
        'scripts/conflict_repair.py eligible and dirty_prs (DRAFTS, env CONFLICT_REPAIR_DRAFTS from the repository variable of that name); the push probe in .github/workflows/conflict-repair.yml',
        'filter',
        'merging main into a branch its author has not finished: a draft titled, labelled or described as WIP, hold or do-not-merge, or one committed to in the last 3 minutes',
        1, 'replace', 'applied',
        'asks_to_wait keeps a held draft out and the 3-minute quiet window keeps a branch someone is still pushing to out; the merge is a fast-forward of main into the branch, never forced, so an author push wins; the repository variable CONFLICT_REPAIR_DRAFTS = off restores the blanket skip',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'python3 scripts/conflict_repair.py --selftest (a draft is taken, a held draft is left, DRAFTS off leaves a draft, merge_tree_conflicts on a real remote); 2026-10-26 every conflicting session pull request was a draft the doer skipped',
        1000291, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
       ('conflict-repair-quiet-window',
        'scripts/conflict_repair.py DIRTY_QUIET_MIN and BOT_QUIET_MIN (--quiet-min)',
        'hold',
        'repairing a branch while its author is mid-push',
        0, 'demote', 'applied',
        'the repair is never forced and re-reads the head before pushing; --quiet-min 10 restores the old window',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'python3 scripts/conflict_repair.py --selftest (a person''s branch committed 4 minutes ago is taken, 2 minutes ago is left); the window was 10 minutes for a person and 3 for the code loop',
        1000291, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_011iUExz3dr2XK5PGm4gwBjs',
  'a pull request that conflicts with main cannot meet a 10-minute SLA if the repair skips drafts (every session pull request is one), waits 10 minutes of quiet, or cannot tell a conflict when GitHub has not computed mergeability',
  'PR-MERGE-SLA-10M-1 conflict half: conflict_repair.py takes an unheld draft, waits 3 minutes of quiet and decides a null mergeability with git merge-tree; the conflict-repair.yml probe counts an unknown pull request as a reason to run; CONFLICT_REPAIR_DRAFTS = off restores the skip',
  '2026-10-26: every open conflicting session pull request was a draft the doer skipped; mergeable stayed null on pull requests while main moved every 1 to 5 minutes; the quiet window equalled the SLA',
  'merged with conflict_repair.py and conflict-repair.yml through the canonical path',
  'the doer may merge main into an unheld draft that has been quiet for 3 minutes (a fast-forward, never forced; VERSION-line and mirror conflicts only, anything else is refused with a comment); a job run costs one checkout per main push while a pull request stays unknown',
  'the repository variable CONFLICT_REPAIR_DRAFTS = off, python3 scripts/conflict_repair.py --quiet-min 10, or reverting the pull request; the Rollback header removes the registry rows',
  'a conflicting session pull request is repaired within about 3 minutes of its last commit and of the next push to main',
  NULL,
  NULL,
  'scripts/conflict_repair.py --selftest; migrations/pr-merge-sla-conflict.test.mjs; the probe filter run through jq on a fixture list'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PR-MERGE-SLA-10M-1 conflict half:%');

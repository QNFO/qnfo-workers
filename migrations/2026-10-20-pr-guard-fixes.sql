-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-version-bump-guard-reads-comment', 'fm-push-guard-cancelled-on-main', 'fm-conflict-repair-skips-required-check', 'fm-model-floor-guard-read-failure-as-finding'); DELETE FROM failure_modes WHERE fm_key IN ('version-bump-guard-reads-comment', 'push-guard-cancelled-on-main', 'conflict-repair-skips-required-check', 'model-floor-guard-read-failure-as-finding');
-- PR-GUARD-FIXES-1 (2026-10-20, charter pillar: autonomy; agent_issues 100295, the workflow failure audit of 2026-10-20; owner directive "Audit and resolve all GitHub
-- workflow failures and workflow/action error notifications and their root causes"). Four defects of the pull-request guards, each with its detector. The change itself is
-- scripts and one workflow (no worker bundle, so no VERSION to bump); this file registers the failure modes so a recurrence reads as one, and a decision row for the autonomy log.
--   1. version-bump-guard-reads-comment: scripts/version-bump-guard.py took the first `var VERSION = "..."` anywhere in a bundle, comments included. qnfo-model-eval/worker.js
--      line 50 quoted the form, so both sides read "..." and two real bumps (1.2.0 -> 1.3.0, 1.3.0 -> 1.4.0) failed as "unchanged VERSION after a byte change" (runs 39126065745,
--      39126418865, 39125992400, 39126349048). qnfo-ops reads a VERSION the same way (unanchored first match, qnfo-ops/worker.js lines 3487, 3767, 8344) and wrote version_id '...'
--      into deployment_history rows 1597, 1598 and 1600 of qnfo-model-eval; that is a control-plane change for a later pull request and is not part of this file.
--   2. push-guard-cancelled-on-main: version-bump-guard.yml grouped a push to main by ref with cancel-in-progress true, so a burst of pushes cancelled the earlier runs: 35 of 277
--      push-to-main runs from 2026-10-18 (read from the runs API on 2026-10-20), 9 in the 07:00Z hour of 2026-10-19. Three stale-file commits (4f20a3e9, 4343df37, 26e89a17: qnfo-code-
--      orchestrator VERSION 0.18.23, 0.18.22, 0.18.23 after 0.18.24, three fixes absent) were never validated.
--   3. conflict-repair-skips-required-check: a CONFLICT-REPAIR-INPLACE-1 push with GITHUB_TOKEN creates pull_request runs that start no job (run 39318576612: 0 jobs, failed the second PR
--      3106 merged), and the workflow_dispatch list lacked mirror-guard.yml, a check the merge lane requires, so a repaired head had no mirror-guard result until a person re-ran it.
--   4. model-floor-guard-read-failure-as-finding: scripts/model-floor-guard.mjs defaulted its repo root to the owner's laptop path, counted "(repo unreadable)", "(no CF token)" and
--      "(live list failed)" as violations (exit 1), and skipped a live bundle that answered an error, so a partial live sweep could pass. Reproduced on origin/main:
--      `env -u QNFO_WORKERS node scripts/model-floor-guard.mjs` printed "(repo unreadable)" and exited 1.
-- The detectors are code-read contracts on the fixed text (remediation_contracts, run by scripts/remediation_consumer.py against its checkout of main). decision_log is append-only,
-- so the Rollback leaves the decision row. Replaying the file is a no-op (INSERT OR IGNORE, and the decision row is guarded).

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('version-bump-guard-reads-comment',
   'the version-bump guard reads a VERSION quoted in a comment, so a real bump is refused as unchanged (or an unbumped change passes on a quoted number)',
   'VERSION_RE searched the whole bundle for var VERSION = "..." and took the first hit, which can be a comment line that quotes the form (qnfo-model-eval/worker.js line 50)',
   'PR-GUARD-FIXES-1: VERSION_RE starts at the beginning of a line (re.M, indentation allowed); scripts/version-bump-guard.test.mjs replays the model-eval case and checks every worker bundle and mirror on main reads the same VERSION as before',
   'code-read of scripts/version-bump-guard.py for the line-anchored VERSION_RE',
   'fm-version-bump-guard-reads-comment', '2026-10-20', 100295,
   'a worker bundle carries a comment that quotes var VERSION = "..." above (or instead of) its declaration, and a change to it is checked',
   'the guard prints [VERSION=...] unchanged VERSION after a byte change on a change that bumped; a pull request or a push run goes red for a number that is right',
   'every pull request and push to main that changes the bundle; PRs 2010, 2012 and 2016 were merged on 2026-10-18 while the audit read their guard check as red');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('push-guard-cancelled-on-main',
   'a push to main is never checked by the version-bump guard because the next push cancelled its run',
   'the concurrency group was the ref with cancel-in-progress true, so every push to main shared one group and a burst cancelled all but the last',
   'PR-GUARD-FIXES-1: a push to main has a group per commit and is never cancelled; a branch or pull request keeps the per-ref group and the cancel',
   'code-read of .github/workflows/version-bump-guard.yml for the per-sha group on main and the cancel only off main',
   'fm-push-guard-cancelled-on-main', '2026-10-20', 100295,
   'two or more pushes to main land within the minutes a guard run takes',
   'version-bump-guard push runs on main end cancelled (35 of 277 from 2026-10-18); a stale whole-file snapshot or a kept VERSION reaches main with no verdict',
   'every commit of a burst on main; the VERSION-AHEAD-1 check that would have flagged the stale qnfo-code-orchestrator copies of 2026-10-19 07:35Z never ran');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('conflict-repair-skips-required-check',
   'a pull request head repaired by conflict-repair has no result for a check the merge lane requires',
   'the pull_request runs created by the GITHUB_TOKEN push start no job (they fail when the pull request closes), and the list of workflows the script dispatches instead omitted mirror-guard.yml',
   'PR-GUARD-FIXES-1: mirror-guard.yml joins DISPATCHABLE in scripts/conflict_repair.py (in-place and replacement paths); scripts/conflict_repair_test.py drives both paths and pins that every entry declares workflow_dispatch; the comments say what the run history shows',
   'code-read of scripts/conflict_repair.py for mirror-guard.yml in DISPATCHABLE',
   'fm-conflict-repair-skips-required-check', '2026-10-20', 100295,
   'conflict-repair pushes main into a conflicting pull request branch, or opens a repair branch, with GITHUB_TOKEN',
   'the repaired head shows no mirror-guard check (PR 3106 waited four hours for a person to re-run it); 36 zero-job pull_request runs fail at the second their pull request closes',
   'every repaired pull request, and the failed-run counts that include the zero-job bot runs');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('model-floor-guard-read-failure-as-finding',
   'the model floor guard cannot read its input and reports it as a violation, or skips an unreadable live bundle and passes',
   'the repo root defaulted to a path on the owner''s laptop; the sentinel rows for an unreadable root, a missing token and a failed worker list were counted as findings, and a live bundle that answered an error was skipped without a trace',
   'PR-GUARD-FIXES-1: the root defaults to the directory above the script; an unreadable or empty root, an unreadable worker.js, a missing token, a failed or empty worker list and an unreadable live bundle exit 2 as "cannot read"; a finding stays exit 1; scripts/model-floor-guard.test.mjs covers each path',
   'code-read of scripts/model-floor-guard.mjs for GuardReadError and the absence of the laptop path',
   'fm-model-floor-guard-read-failure-as-finding', '2026-10-20', 100295,
   'the guard runs without QNFO_WORKERS, with a revoked token, or while Cloudflare answers errors for some worker scripts',
   'exit 1 with "(repo unreadable)" on a clean tree, or exit 0 over a live sweep that read only part of the account',
   'the model floor gate: a failure to read looks like a banned model, and an unread bundle looks like a clean one');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
  ('fm-version-bump-guard-reads-comment', NULL,
   '{"paths": ["scripts/version-bump-guard.py"], "contains": "^[ \\t]*var\\s+VERSION\\s*=\\s*\"([^\"\\n]*)\""}',
   'code-read', 3, 1, 'active', 'PR-GUARD-FIXES-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
  ('fm-push-guard-cancelled-on-main', NULL,
   '{"paths": [".github/workflows/version-bump-guard.yml"], "contains": "cancel-in-progress: ${{ github.ref != ''refs/heads/main'' }}"}',
   'code-read', 3, 1, 'active', 'PR-GUARD-FIXES-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
  ('fm-conflict-repair-skips-required-check', NULL,
   '{"paths": ["scripts/conflict_repair.py"], "contains": "\"version-bump-guard.yml\", \"mirror-guard.yml\""}',
   'code-read', 3, 1, 'active', 'PR-GUARD-FIXES-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
  ('fm-model-floor-guard-read-failure-as-finding', NULL,
   '{"paths": ["scripts/model-floor-guard.mjs"], "contains": "class GuardReadError", "absent": "LENOVO"}',
   'code-read', 3, 1, 'active', 'PR-GUARD-FIXES-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a guard is only as good as what it reads: a comment read as the VERSION, a run cancelled by the next push, a repaired head with no result for a required check and a read failure counted as a finding each give a verdict that is wrong or missing; repairing the reader costs less than adding a second guard',
  'PR-GUARD-FIXES-1: version-bump-guard.py reads VERSION from a declaration at the start of a line; version-bump-guard.yml never cancels a push to main; conflict_repair.py dispatches mirror-guard.yml; model-floor-guard.mjs takes its root from its own location and exits 2 on an input it cannot read',
  'agent_issues 100295 audit 2026-10-20: runs 39126065745 and 39126418865 (VERSION read as "..."); 35 of 277 version-bump-guard push runs on main cancelled; run 39318576612 (0 jobs, PR 3106); `env -u QNFO_WORKERS node scripts/model-floor-guard.mjs` exited 1 with "(repo unreadable)"',
  'migration merged; scripts and one workflow changed through the canonical path, no worker bundle',
  'four CI guard scripts and one workflow file; no worker, no route, no table other than failure_modes and remediation_contracts rows',
  'the Rollback header removes the failure modes and their contracts; the script and workflow changes revert with the pull request',
  'a push to main is always validated, a repaired pull request head gets mirror-guard, and the model floor guard separates cannot-read from found',
  'no version-bump-guard push run on main ends cancelled and no run reads a placeholder as the VERSION; a clean tree no longer exits 1 from model-floor-guard',
  'none',
  'offline suites scripts/version-bump-guard.test.mjs, scripts/model-floor-guard.test.mjs and scripts/conflict_repair_test.py (each fails on the old files); replay of commits 67cdb948 and 28fba36e through the new guard; GitHub runs API reads (read-only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PR-GUARD-FIXES-1:%');

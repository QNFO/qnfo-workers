-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"paths": [".github/workflows/version-bump-guard.yml"], "contains": "cancel-in-progress: ${{ github.ref != ''refs/heads/main'' }}"}' WHERE class = 'fm-push-guard-cancelled-on-main';
-- PR-GUARD-DETECTOR-COALESCE-1 (2026-11-04, charter pillar: autonomy; the full-suite sweep of main was red on migrations/pr-guard-fixes.test.mjs, ci-watchdog issue 7070).
-- The detector fm-push-guard-cancelled-on-main (migrations/2026-10-20-pr-guard-fixes.sql, PR-GUARD-FIXES-1) read `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` in
-- version-bump-guard.yml, i.e. "a push to main is never cancelled". PUSH-COALESCE-1 (PR 7001, 2026-11-04) reversed that on purpose and with a measurement: a burst of merges queued one
-- run of the guard per pushed sha (66 of 100 queued runs at 15:54Z were push runs, 38 merges an hour), only the newest main matters, and the same guard already ran on the pull
-- request before the merge (PR-CHECK-CAP-5-1: the `versions` job). The workflow now groups every push to main as `main-push` and cancels the older run. The old probe therefore read
-- missing-marker for good and the suite that replays it failed on main. This file points the same detector at the decision that holds now, so a regression of the coalescing
-- (a per-sha group on main, which brings back the queue) reads as a recurrence, as the old one did for the opposite regression. The contract row is the only thing changed;
-- the failure_modes row keeps its 2026-10-20 history. An old merged migration is never edited (the runner re-applies an edited file), so this is a later file.
UPDATE remediation_contracts SET verify_probe = '{"paths": [".github/workflows/version-bump-guard.yml"], "contains": "group: version-bump-guard-${{ github.ref == ''refs/heads/main'' && ''main-push'' || github.ref }}"}' WHERE class = 'fm-push-guard-cancelled-on-main';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_max5_checks_2026_11_04',
  'a detector that probes a decision the owner has since reversed on purpose can only fail for good; re-pointing it at the decision that holds keeps the guard and removes a red suite from main',
  'PR-GUARD-DETECTOR-COALESCE-1: remediation_contracts fm-push-guard-cancelled-on-main probes the main-push concurrency group of version-bump-guard.yml (PUSH-COALESCE-1) instead of the retired never-cancel line',
  'run 41875824963 (full sweep, 17:20Z): migrations/pr-guard-fixes.test.mjs FAIL detector fm-push-guard-cancelled-on-main reads ok on the files of this repository, observed missing-marker:.github/workflows/version-bump-guard.yml; PR 7001 changed the line at 17:49Z',
  'migration merged; one contract row updated, no worker, no workflow',
  'one remediation_contracts row (class fm-push-guard-cancelled-on-main)',
  'the Rollback header restores the previous probe text; the decision row stays (append-only)',
  'the detector for the version-bump-guard concurrency group reads the design that holds, so its recurrence signal is meaningful again',
  'migrations/pr-guard-fixes.test.mjs passes on main and issue 7070 loses one of its red suites',
  'none',
  'offline suite migrations/pr-guard-fixes.test.mjs (reads ok on the repository, red when main-push is taken out); scripts/apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PR-GUARD-DETECTOR-COALESCE-1:%');

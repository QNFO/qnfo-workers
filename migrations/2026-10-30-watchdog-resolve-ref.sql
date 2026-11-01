-- RESOLVE-REF-1 (2026-10-30, pillar autonomy; owner: "AUDIT AND REMEDIATE ALL FAILURE MODES AND THEIR ROOT CAUSES"). The ci-watchdog reaper closed a finding about main on a green run of
-- another branch. scripts/ci_watchdog.py files findings only about main (MAIN-ONLY-FINDINGS-1) and its own superseded_by_green() requires the same head_branch, but
-- scripts/ci_watchdog_resolve.py asked only for "a successful run of the same workflow newer than the failure", from any branch and any event. Since MERGE-STREAMLINE-1 the
-- deploy-gate steps are continue-on-error on pull_request, so a PR run is green while its suites are red.
-- Measured on 2026-10-01..10-30 from the reaper's own close comments: 177 of 259 close-on-green closures (68%) cited a run that was not on main (suite-red: deploy-gate 79 of 80,
-- build-gate 33 of 36, model-floor-guard 25 of 30, version-bump-guard 20 of 27, gate-step-red 9 of 9). ci-watchdog #5281 (suite-red) was closed at 05:12Z on 2026-10-30 by a PR run while
-- main stayed red until 09:07Z; main's deploy-gate was red for 146.7 of 265.3 hours (47 episodes, the longest 20.5 h, ended by PR 5369), yet the findings were closed within minutes, so
-- the 120-minute SLA clock (SLA-120M-2) restarted each time and issues_open_over_120m never showed the outage. #5013, the issue the two quarantined suites named as owner of their open
-- root cause, was closed by the green run of the pull request that only added the quarantine lines.
-- Fix: a close needs the newest decided run of that workflow on the failing run's own branch (pull-request runs excluded unless the failing run was one) to be a success newer than the
-- failure; a newer failed run keeps the finding open; cancelled, skipped, neutral, stale, action_required and unfinished runs are no verdict. It is the rule qnfo-fleet-control already applies
-- in WFI-GREEN-STREAK-1, so the issue and the D1 contract cannot disagree. Suite: scripts/ci_watchdog_action_test.py (in deploy-gate), which fails on the old reaper.
-- The detector is a code-read contract on main: it fails if the fix is removed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-watchdog-green-on-wrong-ref'; DELETE FROM failure_modes WHERE fm_key = 'watchdog-green-on-wrong-ref'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('watchdog-green-on-wrong-ref', 'a ci-watchdog finding about a red main is closed by a green run of another branch, so a red main is invisible to the issue-age metrics', 'ci_watchdog_resolve.py latest_green() took any successful run of the workflow newer than the failure, from any branch and event; deploy-gate pull_request runs are continue-on-error (MERGE-STREAMLINE-1) and conclude success while their suites are red', 'latest_green() reads the newest decided run on the failing run''s own branch, pull-request runs excluded unless the failing run was one; a newer failed run keeps the finding open; no-verdict conclusions are skipped (scripts/ci_watchdog_action_test.py)', 'code-read: scripts/ci_watchdog_resolve.py contains def comparable_run(', 'fm-watchdog-green-on-wrong-ref', '2026-10-01', NULL, 'main is red while a pull request branch gets a green run of the same workflow', 'a suite-red, build-gate or gate-step-red finding closed within minutes with a green run on a pull request branch while the next main push is red again; one new finding per red push; open-issue age far below the red duration of main', 'every ci-watchdog finding about main: 177 of 259 close-on-green closures in 30 days, and the SLA-120M-2 issue-age metrics that read them');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-watchdog-green-on-wrong-ref', NULL, 'RESOLVE-REF-1', 'failure-mode detector', '{"paths": ["scripts/ci_watchdog_resolve.py"], "contains": "def comparable_run("}', 'code-read', 3, 'qnfo-ops', 24, 'holding', 'failure-mode', 45000, 5, 0);

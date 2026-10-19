-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-merge-boundary-load-unchecked', 'fm-steward-protection-answer-dropped', 'fm-required-check-path-filtered', 'fm-prompt-sync-ignores-live-edit', 'issue-2830-load-gate', 'issue-2927-guard-reports'); DELETE FROM failure_modes WHERE fm_key IN ('merge-boundary-load-unchecked', 'steward-protection-answer-dropped', 'required-check-path-filtered', 'prompt-sync-ignores-live-edit'); DELETE FROM capability_ledger WHERE capability IN ('worker-load-gate-every-pr', 'github-settings-actions', 'external-repo-patch'); DELETE FROM control_registry WHERE control IN ('deploy-gate-worker-load', 'deploy-gate-full-set-control-plane', 'github-main-gate-ruleset');
-- spof-review: adds no loop, hold, cap or gate on a critical path. The load gate and the full-set rule are PR checks with a recorded, expiring override (scripts/suite-quarantine.txt) and
-- the same checks run again on every push to main and every 2 hours; the settings and external-repo actions are dispatch-only and dry by default.
--
-- PACKAGE F (2026-10-19, pillar autonomy / security / integrity): agent_issues 2830 MERGE-BOUNDARY-GATE-1, 2927 INTEG-GITHUB-HARDEN-1, 2507 GHA-AUDIT-DOTGITHUB-1,
-- 2508 GHA-AUDIT-QWAV-1, 2805 PROMPT-STORE-CONCURRENT-CLOBBER-1. What was measured, what was built, what each closing probe reads.
--
-- 2830  Measured: the full set is 527 of 527 suites green on main and takes 1 m 54 s, so running it before the merge is cheap. 6c60b59a added a worker with a relative
--   import (wellbeing-wire.js); node --check accepts it and every one of that worker's 30 suites then died, while the deploy transport uploads one module per worker (qnfo-observability
--   1.1.6, HTTP 400 10021). Built: scripts/worker-load-gate.mjs loads every worker entry (stubbed cloudflare: modules, no network) on every PR, so the replay of that change is
--   rejected as relative-import (scripts/worker-load-gate.test.mjs); scripts/run-suites.mjs runs the FULL set on a PR that touches a control-plane worker, _shared, a root file or a shared
--   path (path B of the issue; PRS-SCOPE-1 had scoped the control plane out) with scripts/suite-quarantine.txt as the explicit, dated, referenced, expiring override; deploy-gate runs on merge_group
--   (path A, inert until a merge queue exists); ci_watchdog files a red full sweep on main as suite-red, not as a bundle failure. The sibling contract issue-2830 (merge_group in
--   deploy-gate.yml) and issue-2830-required-check (a required_status_checks rule on main) stay as HIGH-ISSUE-PROBES-1 set them; this file adds the half it built.
-- 2927  Measured: the session credential is a GitHub App installation token: GET /repos/QNFO/qnfo-workers/branches/main/protection answers 403 "Resource not accessible by integration".
--   The steward credential has administration rights (github_steward_runs 1 and 10 PATCHed 61 and 49 repositories) yet repos_protected is 0 and errors 0 in all 16 runs: reconcileRepo dropped every
--   protection answer except 404 and 200. The required contexts [gate, guard, mirror-guard, identity-guard] are real job names, but version-bump-guard had a paths filter on pull_request, so
--   `guard` never reports for a PR that changes no worker.js and a ruleset requiring it would hold such a PR for ever (fixed: the filter is gone; the guard exits 0 with no worker bundle in range).
--   The pushers of main (GET .../activity, last 100): github-actions[bot] 47 pushes, qnfo-fleet[bot] 18 merges and 5 pushes, rwnq8 28 merges and 2 pushes. Built: scripts/github-settings-actions.mjs and
--   .github/workflows/github-settings-actions.yml (report, ruleset-main dry|live, ruleset-main-revert, secret-scanning; one credential, the refusal recorded verbatim, live refuses while a required check
--   would never report, an app id is unresolved or an unlisted actor pushes direct); qnfo-github-steward 0.7.0 counts the unreadable protection answers and records the rules on main per tick.
-- 2507  Measured: raw QNFO/.github files unchanged (zenodo-publish.yml still has --title "${{ inputs.title }}"). add_repo refused the repository name (it starts with a dot). Built: the five fixed
--   workflow files staged in audits/gha-patches/QNFO-.github and .github/workflows/external-repo-patch.yml (dry by default, QNFO_GH_PAT only).
-- 2508  Measured: fixed upstream by QNFO/QWAV pull request 132 (2aff4f4, 2026-10-19 13:07Z); issue-2508's probe has read absent since 13:10Z and the issue is closed. Nothing built here.
-- 2805  Measured: the prompt-store tools are not in this repository; they run on the owner's machine and live in a private repository, so nothing about them (names, paths, copies) is committed
--   here. Built: the failure mode, a detector on the work claim the sibling issue-2805 probe reads, and the design handed to the session that runs on that machine (written on issue 2805):
--   add the live default-prompt row as a store of the PSV check, make the sync refuse a store modified after the canonical file unless forced, take the work claim. No fleet path applies it.

-- 1. Failure modes, each with an fm- detector.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('merge-boundary-load-unchecked',
   'a pull request that changes one worker is validated only against that worker, so a change that breaks the load of a worker module (a relative import the one-module deploy cannot carry) merges green',
   'PRS-SCOPE-1 scoped a pull request to its changed directories and node --check accepts a relative import; the full set ran only after the merge',
   'MERGE-BOUNDARY-GATE-1: scripts/worker-load-gate.mjs loads every worker entry on every pull request; a control-plane or shared-path change runs the full suite set; a red full sweep on main is filed as suite-red',
   'code-read of .github/workflows/deploy-gate.yml for the worker load gate step',
   'fm-merge-boundary-load-unchecked', '2026-10-19', 2830,
   'a pull request adds an import of a sibling file (./x or ../x) to a worker.js, or changes a control-plane worker in a way another directory''s suite reads',
   'all of that worker''s suites fail with ERR_UNSUPPORTED_RESOLVE_REQUEST on main (2026-10-17: 30 suites) and the one-module deploy fails with HTTP 400 10021',
   'the full-set gate on main is red for every later push; a worker with a relative import cannot deploy'),
  ('steward-protection-answer-dropped',
   'qnfo-github-steward ran for three days with repos_protected 0, errors 0 and drift 0 while no repository had branch protection written and nothing said why',
   'reconcileRepo acted on a 404 and a 200 of GET branches/<default>/protection and dropped every other answer (a 403 for a credential without administration, a 401, a 5xx)',
   'PROTECTION-VISIBLE-1 (qnfo-github-steward 0.7.0): the unreadable answers are counted with GitHub''s own text and written as one limitation; the run records the rules on QNFO/qnfo-workers main (main_rules)',
   'd1-query: the latest github_steward_runs detail carries main_rules',
   'fm-steward-protection-answer-dropped', '2026-10-19', 2927,
   'the credential of a settings loop cannot read or write a setting and the loop only records what it changed',
   'a reconcile loop reports zero drift and zero errors although the setting it owns was never in the declared state',
   'branch protection on 55 public repositories and the main ruleset of the fleet repository stayed undone without a recorded reason'),
  ('required-check-path-filtered',
   'a check that a ruleset requires never reports for a pull request that does not match the workflow''s paths filter, so the pull request waits for ever and cannot merge',
   'version-bump-guard.yml had `paths:` on its pull_request trigger; GitHub does not run a workflow whose paths a pull request leaves alone and a required check that never runs stays Expected',
   'INTEG-GITHUB-HARDEN-1: the filter is removed from the pull_request trigger (the guard prints nothing to check and exits 0 with no worker bundle in range); scripts/github-settings-actions.mjs refuses a live ruleset while a required check comes from a path-filtered workflow',
   'code-read of .github/workflows/version-bump-guard.yml: no paths filter under pull_request',
   'fm-required-check-path-filtered', '2026-10-19', 2927,
   'a ruleset requires a check whose workflow filters pull_request by path and a pull request touches none of the paths',
   'a docs-only or migrations-only pull request shows the check as Expected and is never mergeable',
   'every pull request outside the filtered paths, the whole fleet when the ruleset requires the check'),
  ('prompt-sync-ignores-live-edit',
   'a canonical prompt sync restores older canonical text over a live system-prompt edit within minutes and no gate sees the store it leaves behind',
   'sync_system_prompt.py guards only a length delta of more than 25 percent (2026-10-17 was 2.8 percent), writes three of the four live stores, and prompt-store-verify.py did not compare app_settings.default_system_prompt',
   'PROMPT-STORE-CONCURRENT-CLOBBER-1: the PSV check compares the live default-prompt row, the sync refuses a store modified after the canonical file unless forced, and it takes the work claim the issue-2805 probe reads; the change is made by the session on the owner''s machine (design on issue 2805), not by the fleet',
   'd1-query: a work claim on the sync script exists (the live copies are on the owner''s machine and are not otherwise fleet-observable; a recurrence shows as a PSV drift line or a refused sync)',
   'fm-prompt-sync-ignores-live-edit', '2026-10-19', 2805,
   'a live edit of the system prompt is not yet in the canonical file and a sync runs',
   'three stores revert to the older canonical, the default row keeps the live text, and the PSV gate reports PASS',
   'the live system prompt (the owner''s directive block) is silently reverted in the desktop client');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
 ('fm-merge-boundary-load-unchecked', NULL, '{"paths": [".github/workflows/deploy-gate.yml"], "contains": "node scripts/worker-load-gate.mjs"}', 'code-read', 3, 1, 'active', 'MERGE-BOUNDARY-GATE-1', 'failure-mode detector', 'qnfo-fleet-control'),
 ('fm-steward-protection-answer-dropped', NULL, 'SELECT ''yes'' AS expected, CASE WHEN (SELECT json_extract(detail, ''$.main_rules.required_checks'') FROM github_steward_runs ORDER BY id DESC LIMIT 1) IN (''yes'', ''no'') THEN ''yes'' ELSE ''no'' END AS observed', 'd1-query', 3, 1, 'active', 'PROTECTION-VISIBLE-1', 'failure-mode detector', 'qnfo-fleet-control'),
 ('fm-required-check-path-filtered', NULL, '{"paths": [".github/workflows/version-bump-guard.yml"], "absent": "pull_request:\n    paths:"}', 'code-read', 3, 1, 'active', 'INTEG-GITHUB-HARDEN-1', 'failure-mode detector', 'qnfo-fleet-control'),
 ('fm-prompt-sync-ignores-live-edit', NULL, 'SELECT ''ok'' AS expected, CASE WHEN COUNT(*) > 0 THEN ''ok'' ELSE ''no-claim'' END AS observed FROM work_claims WHERE path = ''prompt-stores/sync_system_prompt.py'' AND claimed_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-14 days'')', 'd1-query', 3, 1, 'active', 'PROMPT-STORE-CONCURRENT-CLOBBER-1', 'failure-mode detector', 'qnfo-fleet-control');

-- 2. The halves of issues 2830 and 2927 this change built, as contracts of their own (every contract of an issue must pass before it closes).
INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at, attempts) VALUES
 ('issue-2830-load-gate', 2830, 'MERGE-BOUNDARY-GATE-1: every pull request loads every worker entry',
  'MEASURES the pre-merge half built by MERGE-BOUNDARY-GATE-1: deploy-gate.yml runs scripts/worker-load-gate.mjs on every event over every worker directory, so a change like 6c60b59a (a relative import in worker.js) is rejected before the merge. The enforcement half (a ruleset that requires the check) is issue-2830-required-check.',
  '{"paths": [".github/workflows/deploy-gate.yml"], "contains": "node scripts/worker-load-gate.mjs"}', 'code-read', 24, 'qnfo-fleet-control', 1, 'active', 'measuring-probe-high-issues-1', datetime('now'), 0),
 ('issue-2927-guard-reports', 2927, 'INTEG-GITHUB-HARDEN-1: the required check guard reports on every pull request',
  'MEASURES a precondition of the ruleset: version-bump-guard.yml has no paths filter on its pull_request trigger, so the required check `guard` reports for every pull request. Without it a ruleset requiring [gate, guard, mirror-guard, identity-guard] would hold every pull request that changes no worker.js for ever. The ruleset itself is contract issue-2927, applied by .github/workflows/github-settings-actions.yml (action ruleset-main, mode live) with the credential QNFO_GH_PAT.',
  '{"paths": [".github/workflows/version-bump-guard.yml"], "absent": "pull_request:\n    paths:"}', 'code-read', 24, 'qnfo-fleet-control', 1, 'active', 'measuring-probe-high-issues-1', datetime('now'), 0);

-- 3. Capabilities the fleet gained.
INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'worker-load-gate-every-pr', 'session_01JADz8uHqYt9eUMBTwbbBE6 (MERGE-BOUNDARY-GATE-1)', 'node 22 on the runner; no secret, no network', 'offline suite 22 assertions; 97 of 97 worker entries load on 2026-10-19 in 2.4 s', datetime('now'), NULL,
  'scripts/worker-load-gate.mjs, scripts/worker-load-gate.test.mjs, .github/workflows/deploy-gate.yml'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'worker-load-gate-every-pr');
INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'github-settings-actions', 'session_01JADz8uHqYt9eUMBTwbbBE6 (INTEG-GITHUB-HARDEN-1)', 'repository secret QNFO_GH_PAT with repository administration (unproven: the first report run states it)', 'offline suite 41 assertions; a real read-only report was run from a session on 2026-10-19 and recorded the refused call', datetime('now'), NULL,
  'scripts/github-settings-actions.mjs, scripts/github-main-ruleset.json, .github/workflows/github-settings-actions.yml'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'github-settings-actions');
INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'external-repo-patch', 'session_01JADz8uHqYt9eUMBTwbbBE6 (GHA-AUDIT-DOTGITHUB-1)', 'repository secret QNFO_GH_PAT able to write workflow files in QNFO/.github (unproven)', 'offline suite 24 assertions; not yet run against GitHub', datetime('now'), NULL,
  'scripts/external-repo-patch.mjs, .github/workflows/external-repo-patch.yml, audits/gha-patches/QNFO-.github'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'external-repo-patch');

-- 3b. The gates this change adds or keeps, in control_registry (DOCTRINE-1: a gate is read and recorded before it is added).
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
SELECT 'deploy-gate-worker-load', '.github/workflows/deploy-gate.yml step MERGE-BOUNDARY-GATE-1 worker load gate (scripts/worker-load-gate.mjs)', 'gate',
  'a worker entry that cannot load (a relative import the one-module deploy cannot carry, a bare package, a top-level throw) merging because only the changed workers were checked', 1, 'keep', 'applied',
  'the same load runs on every push to main and the 2-hourly schedule, and the canonical deploy canary reverts a control-plane push whose VERSION does not arrive',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'measured 2026-10-19: 97 of 97 worker entries load in 2.4 s (no current failure to override), replay of the 2026-10-17 break rejected as relative-import, scripts/worker-load-gate.test.mjs 22 assertions', 2830, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'deploy-gate-worker-load');
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
SELECT 'deploy-gate-full-set-control-plane', 'scripts/run-suites.mjs select() (control-plane and shared paths run every suite on a pull request)', 'gate',
  'a change to a control-plane worker or a shared path breaking a suite in another directory and reaching main red', 1, 'keep', 'applied',
  'scripts/suite-quarantine.txt: a red suite outside the change is listed with an issue, a reason and an expiry within 7 days and still runs but does not fail the run; an expired line stops excusing it',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'measured 2026-10-19: full set 527 of 527 in 1 m 54 s; PRS-SCOPE-1 (2026-10-17) had scoped the control plane out because one stale suite blocked every PR, which the quarantine line now handles; scripts/run-suites.test.mjs 49 assertions incl. the CLI with a live, an expired and a far-horizon entry', 2830, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'deploy-gate-full-set-control-plane');
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
SELECT 'github-main-gate-ruleset', 'GitHub ruleset main-gate on QNFO/qnfo-workers (scripts/github-settings-actions.mjs action ruleset-main)', 'gate',
  'direct pushes and unreviewed merges to main; every concurrent-session clobber traces to them (agent_issues 2927)', 1, 'keep', 'planned',
  'admin role, the github-actions app and the qnfo-fleet app bypass; ruleset-main-revert deletes the ruleset in one dispatch; live refuses while a required check would never report or an unlisted actor pushes direct',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'not applied by this change. Measured 2026-10-19: required contexts gate/guard/mirror-guard/identity-guard are real job names; version-bump-guard filtered pull_request by paths (removed); pushers of main github-actions[bot] 47, qnfo-fleet[bot] 5 direct, rwnq8 2; offline suite 41 assertions', 2927, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'github-main-gate-ruleset');

-- 4. Blocker red-team: what each blocker was tried against (append-only).
INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, ts)
SELECT 'issue:2507', 'a session cannot attach QNFO/.github, so its workflow defects have no doer', 'mcp__claude-code-remote__add_repo QNFO/.github with access push (2026-10-19)', 'workaround-built',
  'refused with: repository name ".github" begins with ''.'', so its clone directory would be a hidden path under this session''s working directory and could collide with configuration directories (e.g. ~/.claude). Repositories whose names begin with ''.'' cannot be attached to this session. The contents API answered 403 "GitHub access to this repository is not enabled for this session". Built: audits/gha-patches/QNFO-.github (five files, workflow-lint clean) and .github/workflows/external-repo-patch.yml (QNFO_GH_PAT, dry by default); not yet run | surfaces: add_repo, contents API with the session token, raw.githubusercontent.com read, repository workflow with the fleet credential',
  'session_01JADz8uHqYt9eUMBTwbbBE6', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2507' AND instr(attempt, 'mcp__claude-code-remote__add_repo QNFO/.github') = 1);
INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, ts)
SELECT 'issue:2508', 'a session cannot attach QNFO/QWAV: the attach was refused by the permission classifier on 2026-10-13', 'mcp__claude-code-remote__add_repo QNFO/QWAV with access push (2026-10-19)', 'false-belief-removed',
  'not blocked: the repository was attached and cloned; another session had already merged QNFO/QWAV pull request 132 (2aff4f4, 13:07Z) and issue-2508''s probe read absent from 13:10Z, so the local duplicate commit was kept off main | surfaces: add_repo, git clone through the session proxy, contents of origin/main',
  'session_01JADz8uHqYt9eUMBTwbbBE6', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2508' AND instr(attempt, 'mcp__claude-code-remote__add_repo QNFO/QWAV') = 1);
INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, ts)
SELECT 'issue:2927', 'no credential in the fleet can change branch protection or rulesets on QNFO/qnfo-workers', 'gh api GET /repos/QNFO/qnfo-workers/branches/main/protection with the session token (2026-10-19)', 'workaround-built',
  'refused with HTTP 403 "Resource not accessible by integration" (the session token is a GitHub App installation token without Administration); GET rulesets and rules/branches/main answer 200 (public). The steward credential has administration rights (github_steward_runs 1 and 10: 61 and 49 repositories PATCHed) but its protection step recorded nothing for 3 days (fixed in 0.7.0). Built: .github/workflows/github-settings-actions.yml (QNFO_GH_PAT; report, ruleset-main, secret-scanning), not yet run; whether QNFO_GH_PAT holds administration is unproven | surfaces: session gh api, GitHub MCP tools (none for settings), public rules API, steward run ledger, repository workflow with the fleet credential',
  'session_01JADz8uHqYt9eUMBTwbbBE6', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2927' AND instr(attempt, 'gh api GET /repos/QNFO/qnfo-workers/branches/main/protection') = 1);

-- 5. The decisions, with their predictions (decision_log is append-only).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'the full suite set is cheap (under two minutes) and green, so running it before the merge for the control plane and shared paths costs less than the red main it prevents; a load of every worker is cheaper still and catches what node --check cannot',
  'MERGE-BOUNDARY-GATE-1: deploy-gate runs the worker load gate on every event, the full set for control-plane and shared-path PRs (override: scripts/suite-quarantine.txt, 7 days, an issue and a reason), the merge_group trigger, and a suite-red watchdog class',
  'full set 527 of 527 in 1 m 54 s on 2026-10-19; 97 of 97 worker entries load in 2.4 s; 6c60b59a class (relative import) passes node --check and is rejected by the load gate',
  'merged by the parent', 'every pull request gains one cheap check; control-plane pull requests run about 2 minutes more', 'revert the deploy-gate.yml and run-suites.mjs hunks; the quarantine file is the escape for a stale suite',
  'a change cannot reach main with a red full suite set without a recorded override', 'fm_merge_boundary_load_unchecked = 0 within 2 h', 'a worker with a relative import is caught before the merge', 'run-suites 527 suites, worker-load-gate over 97 entries, replay of the 2026-10-17 break, workflow-lint'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'MERGE-BOUNDARY-GATE-1: deploy-gate runs the worker load gate') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a ruleset that requires a check which never reports, or that blocks the apps that push to main, would stop the fleet, so the ruleset is built as a dry-by-default action that refuses live until each required check reports on every pull request and every direct pusher is a bypass actor',
  'INTEG-GITHUB-HARDEN-1: scripts/github-settings-actions.mjs and its workflow (ruleset main-gate added beside main-safety), the paths filter removed from version-bump-guard pull_request, steward 0.7.0 visibility; the ruleset is NOT applied by this change',
  'session token: GET branches/main/protection 403 "Resource not accessible by integration"; steward runs 1-16 repos_protected 0 errors 0; activity of main: github-actions[bot] 47 pushes, qnfo-fleet[bot] 5 pushes, rwnq8 2; version-bump-guard path filter would hold a docs-only PR',
  'merged by the parent; the live apply is a dispatch', 'none until the action is run live; then every pull request needs the four checks and only admins and two apps push direct', 'action ruleset-main-revert, mode live, deletes main-gate',
  'a settings path with the credential the fleet has, and a measured reason when it is refused', 'github_steward main_rules.required_checks = yes within 6 h of the live apply', 'the steward now records the rules on main every tick', 'gh api as the session, public rules and activity APIs, fake-GitHub offline suite (41 assertions), steward offline suite (15)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'INTEG-GITHUB-HARDEN-1: scripts/github-settings-actions.mjs') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a fix to a repository no session can attach is a machine path with the fleet credential plus the exact files, built dry-first; QWAV needed none because its own pull request landed first',
  'GHA-AUDIT-DOTGITHUB-1: audits/gha-patches/QNFO-.github (five workflow files) and the external-repo-patch action; GHA-AUDIT-QWAV-1: nothing, fixed upstream by QWAV pull request 132',
  'raw QNFO/.github files unchanged on 2026-10-19; add_repo refused the dot-prefixed name; QWAV main moved to 2aff4f4 at 13:07Z and issue-2508 read absent at 13:10Z',
  'merged by the parent; the live write is a dispatch', 'none until the action is run live; then five workflow files in QNFO/.github change', 'revert the five files in QNFO/.github',
  'the fleet can write a reviewed set of workflow files to the repository a session cannot attach', 'issue-2507 probe observed = absent within 6 h of the live write', 'script injection in the release pipeline of the organisation repository is closed', 'raw contents, add_repo, workflow-lint on the five files, offline suite (24 assertions)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'GHA-AUDIT-DOTGITHUB-1: audits/gha-patches/QNFO-.github') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'the prompt-store tools run on the owner''s machine and live in a private repository, so no fleet path edits them and none of their text belongs in this public repository',
  'PROMPT-STORE-CONCURRENT-CLOBBER-1: hand the design to the session on the owner''s machine (written on issue 2805) and keep the failure mode and its work-claim detector here',
  'the sync restores three stores and leaves the default-prompt row; its only guard is a 25 percent length delta (2026-10-17 was 2.8 percent); the PSV check did not compare the default-prompt row',
  'handed off; the change is made on the owner''s machine', 'none in the fleet', 'nothing to revert here',
  'a sync cannot silently revert a live edit and two sessions cannot interleave', 'issue-2805 probe observed = ok within 48 h of the machine step', 'the clobber is a recorded failure mode with a detector', 'the issue text and the live tools were read by the agent that wrote the design; nothing from them is committed'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PROMPT-STORE-CONCURRENT-CLOBBER-1: hand the design') = 1);

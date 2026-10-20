-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-runner-label-drift', 'fm-selftest-fixture-annotations', 'fm-skipped-run-evicts-pending', 'fm-selfheal-cancels-in-flight') AND module = 'failure-mode' AND precondition = 'RUNNER-PIN-ANNOTATIONS-1'; DELETE FROM failure_modes WHERE fm_key IN ('runner-label-drift', 'selftest-fixture-annotations', 'skipped-run-evicts-pending', 'selfheal-cancels-in-flight') AND issue_id = 100295; DELETE FROM control_alternate_probes WHERE control IN ('runner-label-pin-guard', 'selftest-annotation-quiet'); DELETE FROM control_registry WHERE control IN ('runner-label-pin-guard', 'selftest-annotation-quiet') AND issue_id = 100295;
--
-- RUNNER-PIN-ANNOTATIONS-1 (2026-10-20, charter pillar autonomy; agent_issues 100295, workflow failure audit).
-- Companion to the .github/workflows changes in the same pull request: the failure modes the audit found in the run annotations, each with the
-- code-read detector that keeps its fix on main. decision_log is append-only, so the Rollback line above leaves the decision row.
--
-- WHAT THE AUDIT FOUND (read 2026-10-20 from the Actions API: check-run annotations of the newest main commits)
--   1. runner-label-drift: 55 jobs in 52 workflows ran on `ubuntu-latest`, which GitHub moves to Ubuntu 26 from 2026-10-19 until 2026-11-19. Every
--      job carried the migration notice, and a job could land on an image nobody had tried. Pinned to ubuntu-24.04 (the image they ran on).
--   2. selftest-fixture-annotations: offline self-tests print `::warning::` / `::error::` / `::notice::` lines on purpose, and the runner turns each into
--      an annotation on the check run: five SECRET-LOCK-UNAVAILABLE warnings on workflow-lint, eight rate-limit warnings on fleet-autodeploy, a notice on
--      code-task-publish, an error per leg on windows-suite-parity. They read as live outages. scripts/stop-commands.sh switches commands off around those steps.
--   3. skipped-run-evicts-pending: ci-watchdog's concurrency group was constant, but its job `if:` skips most workflow_run triggers; the run took the
--      one waiting slot before the condition was read and cancelled the waiting sweep. The group now follows the condition.
--   4. selfheal-cancels-in-flight: container-config-selfheal-cron used cancel-in-progress: true and killed a running self-heal that holds contents:
--      write; now false (the single waiting run is still replaced, so no queue builds).
--   Not changed: the ARTIFACTS_TOKEN warning (truthful, an owner-minted secret), PILOT_TOKEN (measured: not provisioned in Actions secrets, probe_rc
--   skipped-no-pilot-token; the audit left it unprovisioned rather than copy the pilot shell's static token there, and only turned the AMBER verdict into
--   a notice; restore-container-config-1485 and deploy-containers-pilot still read the secret if it is present), the cancelled runs of fleet-autodeploy,
--   conflict-repair, remediation-* and code-task-publish (the platform's one-running-one-waiting rule on idempotent reconcilers is the intended debounce).
--
-- The detectors read the workflow files on main (code-read, the consumer's checkout). The runner-label detector names the 20 busiest workflows (the consumer
-- takes at most 20 paths); scripts/runner-pin-annotations.test.mjs, which runs on every pull request and every push to main, covers all of them.
-- Limits that stay: a detector shows that the fix is still on main, not that the runner behaved; the closing evidence is the annotation list of a newer run.
-- spof-review (DOCTRINE-1): two controls registered in control_registry (runner-label-pin-guard, a guard; selftest-annotation-quiet, a filter), both
-- kept, off the critical path, each with its alternate; no new loop, cap or hold. Four failure-mode rows, four detector contracts, two
-- control_alternate_probes rows, one decision row; no table is dropped, no data deleted.
-- Tested alternate (repair after review): a control row with an alternate_path, no alternate_tested_at, no ALTERNATE-NOT-EXERCISABLE marker and no
-- control_alternate_probes row is what the detector fm-control-alternate-undrilled counts (v_control_alternate_untested.controls_untested_without_probe, read 0 on
-- 2026-10-20 07:0xZ, SELECT only; the view counts every control, not only critical_path = 1), so two rows born that way would have turned a passing hourly contract red.
-- This file gives each control its probe in the same change, in the shape of migrations/2026-10-19-ensure-live-path-controls.sql and 2026-10-19-ops-job-prompt-cap.sql:
-- a read-only expected/observed state check on the alternate's own detector contract (present, active, code-read, still reading its marker). Each alternate is the
-- code-read detector contract this file inserts, so the probe asks the contract row and not the workflow files; the files are read by the consumer, and by the suite
-- migrations/runner-pin-annotations.test.mjs on a clean tree and on a copy that lost its fix. The chaos drill (qnfo-fleet-control CHAOS-DRILL-1, every 360 minutes)
-- runs the probes and stamps alternate_tested_at on a pass; this file never does. Until that first pass v_control_alternate_status reads the two rows probe-never-run and
-- v_path_coverage_gaps reads them alternate-untested, as it does for every control born with a probe. Read 2026-10-20 (D1 SELECT): nothing live counts that state for a control off the
-- critical path (fm-control-alternate-undrilled reads controls_untested_without_probe, which stays 0; belief-no-untested-control-on-critical-path and v_doctrine_scorecard
-- count critical_path = 1 only; no metric_registry formula, view or remediation contract reads v_path_coverage_violations), and v_path_coverage_violations itself reads 0 rows today.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('runner-label-drift',
  'a workflow job runs on a moving runner label, so the image under it changes without a commit and every job carries a migration notice',
  'GitHub moves ubuntu-latest to Ubuntu 26 from 2026-10-19 until 2026-11-19; 55 jobs in 52 workflows used the label. Jobs of the repository still ran ubuntu-24.04 on 2026-10-20, so a job could land on either image during the rollout. The three workflows pinned first (PR 3215) lost their notice, which shows the pin is the remedy.',
  'RUNNER-PIN-ANNOTATIONS-1: every job names ubuntu-24.04 with a comment that says why and when to unpin (after a green ubuntu-26.04 trial run). scripts/runner-pin-annotations.test.mjs fails a pull request that brings the label back.',
  'the code-read contract fm-runner-label-drift reads the 20 busiest workflow files on main for the absence of `runs-on: ubuntu-latest`; the suite scripts/runner-pin-annotations.test.mjs reads all of them',
  'fm-runner-label-drift', '2026-10-20', 100295,
  'a workflow job names runs-on: ubuntu-latest (or another moving label)',
  'check-run annotation "The ubuntu-latest label will migrate to Ubuntu 26" on 139 of 189 jobs of seven main commits',
  'every ubuntu workflow job: an untried image mid-rollout would fail the deploy gate and the guards that need it');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('selftest-fixture-annotations',
  'an offline self-test prints workflow commands as fixture output and the runner turns them into annotations that read as live outages',
  'scripts/secret-mutation-guard_test.py feeds fake lock responses to scripts/secret_lock.py (a real ::warning::), scripts/fleet-autoaudit-selftest.py replays HTTP 403 rate limits through scripts/fleet-autoaudit.py, code-task-publish.py --selftest builds a repository with a red suite, and the Windows parity step echoes a suite report that holds an ::error:: line. The runner acts on any line that starts with ::name::.',
  'RUNNER-PIN-ANNOTATIONS-1: scripts/stop-commands.sh wraps those steps in the runner''s ::stop-commands::<token> pair and keeps the exit code; the real audit, apply and publish steps are not wrapped.',
  'the code-read contract fm-selftest-fixture-annotations reads the four workflow files on main for scripts/stop-commands.sh; scripts/runner-pin-annotations.test.mjs replays the real fixtures through a model of the runner''s command parser',
  'fm-selftest-fixture-annotations', '2026-10-20', 100295,
  'a green step prints a line that starts with ::warning::, ::error:: or ::notice:: because a test fed the code a fake failure',
  'workflow-lint: five SECRET-LOCK-UNAVAILABLE warnings, fleet-autodeploy: eight GitHub API rate-limited warnings, code-task-publish: a PUBLISH-SUITE-CHECK-1 notice, windows-suite-parity: an error per leg, on runs that passed',
  'whoever scans annotations for an outage: a lock outage or a quota exhaustion that never happened is reported on every run, and a real one hides among them');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('skipped-run-evicts-pending',
  'a workflow run whose only job is skipped by its own if: still takes the single waiting slot of a constant concurrency group and cancels the waiting run that had work',
  'Concurrency is decided when a run is created, before a job condition is read. ci-watchdog kept one group for all its triggers while the job `if:` skips every green workflow_run except mirror-sync, so a no-op run replaced a waiting sweep.',
  'RUNNER-PIN-ANNOTATIONS-1: the group expression is the job predicate term for term; a run that will be skipped gets the group ci-watchdog-skip-<run id>. cancel-in-progress stays false. scripts/runner-pin-annotations.test.mjs evaluates both expressions for every trigger.',
  'the code-read contract fm-skipped-run-evicts-pending reads .github/workflows/ci-watchdog.yml on main for the skip group; the suite evaluates the group against the condition',
  'fm-skipped-run-evicts-pending', '2026-10-20', 100295,
  'a workflow has a constant concurrency group and a job-level if: that skips some of its triggers',
  'a large share of ci-watchdog runs end cancelled (82 of 263 runs in the audit sample) and a sweep that had work is replaced by a run that does none',
  'ci-watchdog sweeps: a failure is still found by the next sweep of the newest 100 runs, so the cost is delay and noise, not loss');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('selfheal-cancels-in-flight',
  'a cancel-in-progress group kills a run that is executing a write, and the cancelled run is shown as a red annotation',
  'container-config-selfheal-cron declared cancel-in-progress: true. A trigger that arrived while a self-heal ran (its job holds contents: write and can be inside the /content PUT) cancelled it; 6 of 14 sampled jobs ended that way. The kill bought nothing because the waiting run starts when the running one ends.',
  'RUNNER-PIN-ANNOTATIONS-1: cancel-in-progress: false. GitHub still keeps one running and one waiting run per group and replaces the waiting one, so no queue builds.',
  'the code-read contract fm-selfheal-cancels-in-flight reads .github/workflows/container-config-selfheal-cron.yml on main for cancel-in-progress: false',
  'fm-selfheal-cancels-in-flight', '2026-10-20', 100295,
  'a workflow that writes (contents: write or a Cloudflare API call) sets cancel-in-progress: true',
  'annotation "Canceling since a higher priority waiting request for container-config-selfheal-cron exists" on a job that was running',
  'the container-config self-heal: a restore killed between its PUT and its read-back leaves the outcome artifact unwritten');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-runner-label-drift', NULL, 'RUNNER-PIN-ANNOTATIONS-1', 'failure-mode detector',
  '{"paths":[".github/workflows/deploy-gate.yml",".github/workflows/mirror-guard.yml",".github/workflows/version-bump-guard.yml",".github/workflows/version-compare.yml",".github/workflows/workflow-lint.yml",".github/workflows/adversarial-workers-guard.yml",".github/workflows/canonical-deploy.yml",".github/workflows/mirror-sync.yml",".github/workflows/ci-watchdog.yml",".github/workflows/fleet-autodeploy.yml",".github/workflows/conflict-repair.yml",".github/workflows/remediation-consumer.yml",".github/workflows/remediation-bridge.yml",".github/workflows/code-task-publish.yml",".github/workflows/container-config-selfheal-cron.yml",".github/workflows/fleet-graph.yml",".github/workflows/apply-migrations.yml",".github/workflows/codeql.yml",".github/workflows/charter-guard.yml",".github/workflows/identity-guard.yml"],"absent":"runs-on: ubuntu-latest"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-selftest-fixture-annotations', NULL, 'RUNNER-PIN-ANNOTATIONS-1', 'failure-mode detector',
  '{"paths":[".github/workflows/workflow-lint.yml",".github/workflows/fleet-autodeploy.yml",".github/workflows/code-task-publish.yml",".github/workflows/windows-suite-parity.yml"],"contains":"bash scripts/stop-commands.sh "}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-skipped-run-evicts-pending', NULL, 'RUNNER-PIN-ANNOTATIONS-1', 'failure-mode detector',
  '{"paths":[".github/workflows/ci-watchdog.yml"],"contains":"format(''ci-watchdog-skip-{0}'', github.run_id)"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-selfheal-cancels-in-flight', NULL, 'RUNNER-PIN-ANNOTATIONS-1', 'failure-mode detector',
  '{"paths":[".github/workflows/container-config-selfheal-cron.yml"],"contains":"group: container-config-selfheal-cron\n  cancel-in-progress: false"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- The two controls this change adds (DOCTRINE-1: control_registry before a filter or guard). Neither is on the critical path, both are kept, and a replay adds none.
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id)
VALUES ('runner-label-pin-guard',
  'scripts/runner-pin-annotations.test.mjs (full suite set, deploy-gate)',
  'guard',
  'a workflow job returning to a moving runner label (runs-on: ubuntu-latest), so the image under it changes without a commit and every job carries the migration notice',
  0, 'keep', 'applied',
  'the code-read contract fm-runner-label-drift reads the 20 busiest workflow files on main for the absent label, so a drift that reached main is still found without the suite; release condition: the pin comment on each job (pinned to ubuntu-24.04 until an ubuntu-26.04 trial run is green, GitHub finishes the migration on 2026-11-19), when the pins and this guard are reviewed together',
  'RUNNER-PIN-ANNOTATIONS-1 (2026-10-20): 139 of 189 jobs of seven main commits carried the ubuntu-latest migration notice; 55 runs-on lines in 52 workflow files named the label and the three workflows pinned first (PR 3215) lost the notice. The suite fails a pull request that brings the label back; it blocks nothing else. Tested alternate: control_alternate_probes row runner-label-pin-guard (state check on the contract fm-runner-label-drift: present, active, code-read, still reading the runs-on: ubuntu-latest marker); the chaos drill runs it and stamps alternate_tested_at on a pass.',
  100295);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id)
VALUES ('selftest-annotation-quiet',
  'scripts/stop-commands.sh (4 steps: workflow-lint, fleet-autodeploy, code-task-publish, windows-suite-parity)',
  'filter',
  'offline self-tests printing workflow commands as fixture output that the runner turns into annotations reading as live outages',
  0, 'keep', 'applied',
  'the code-read contract fm-selftest-fixture-annotations reads the four workflow files on main for the wrapper; the wrapper keeps the exit code of the command it runs, so a failing self-test still fails its step, and the real audit, apply and publish steps are not wrapped, so a live annotation is still shown',
  'RUNNER-PIN-ANNOTATIONS-1 (2026-10-20): the self-tests print 5 (workflow-lint), 8 (fleet-autodeploy), 1 (code-task-publish) and 1 (windows-suite-parity report tail) workflow commands on runs that passed. It hides only those annotations, between the runner''s ::stop-commands:: pair, for the one command it wraps. Tested alternate: control_alternate_probes row selftest-annotation-quiet (state check on the contract fm-selftest-fixture-annotations: present, active, code-read, still reading the scripts/stop-commands.sh marker); the chaos drill runs it and stamps alternate_tested_at on a pass.',
  100295);

-- The tested alternate of each control (CONTROL-ALT-PROBES-1): a read-only expected/observed state check, run by the chaos drill. Guarded on the control row and on the key,
-- so a replay adds none. The observed text names what is wrong when the check fails, and holds none of the words a write-keyword scan looks for.
INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-runner-label-drift'' AND status = ''active'' AND verify_transport = ''code-read'' AND instr(verify_probe, ''runs-on: ubuntu-latest'') > 0) THEN ''the detector fm-runner-label-drift is missing, not active, not code-read or no longer reads the runs-on: ubuntu-latest label'' ELSE ''ok'' END AS observed',
  '60 minutes: the detector contract is read every 60 minutes (cadence 1), so a drift that reached main is found within one cycle; the probe is a state check on the contract row and holds at any time, with no rolling window',
  1
FROM control_registry c WHERE c.control = 'runner-label-pin-guard';

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-selftest-fixture-annotations'' AND status = ''active'' AND verify_transport = ''code-read'' AND instr(verify_probe, ''scripts/stop-commands.sh'') > 0) THEN ''the detector fm-selftest-fixture-annotations is missing, not active, not code-read or no longer reads the scripts/stop-commands.sh wrapper'' ELSE ''ok'' END AS observed',
  '60 minutes: the detector contract is read every 60 minutes (cadence 1), so a wrapper that left main is found within one cycle; the probe is a state check on the contract row and holds at any time, with no rolling window',
  1
FROM control_registry c WHERE c.control = 'selftest-annotation-quiet';

-- The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'annotations that cannot clear (a migration notice on a moving label, fixture output read as an outage, a permanent AMBER warning) hide the ones that matter, and a concurrency setting that cancels a running write or lets a no-op run evict a waiting sweep costs work for nothing',
  'RUNNER-PIN-ANNOTATIONS-1: 55 runs-on lines in 52 workflow files pinned from ubuntu-latest to ubuntu-24.04; scripts/stop-commands.sh around the four fixture-printing steps (workflow-lint, fleet-autodeploy, code-task-publish, windows-suite-parity); container-config-selfheal-cron cancel-in-progress false and its AMBER verdict a notice; the ci-watchdog concurrency group follows the job condition; qnfo-fleet-advisor (folded) overrides undici to ^7.29.1; migrations/2026-10-20-runner-pin-annotations.sql adds four failure modes with code-read detectors, two control_registry rows and their control_alternate_probes rows',
  'read 2026-10-20: the newest workflow-lint run on main (39379743326) lists one migration notice and five SECRET-LOCK-UNAVAILABLE warnings on a green run; the three workflows pinned by PR 3215 carry no notice; the self-tests run locally print 5, 8, 1 and 1 workflow commands; the ci-watchdog group was the constant ci-watchdog while its job condition skips most workflow_run triggers',
  'applied through the canonical path on merge: the workflow files take effect on the next run of each workflow, the detectors are probed at the next remediation tick',
  'workflow files only (no worker, no secret, no trigger, schedule or permission); jobs keep the image they ran on; four failure-mode rows and four detector contracts added; a run of the stop-commands wrapper keeps the exit code, so no step fails or passes differently',
  'revert the pull request through the canonical path, or run the migration Rollback header: it removes the four detector contracts, the four failure-mode rows, the two control probes and the two control rows (decision_log is append-only and keeps this row)',
  'the annotation list of a run reflects the run: a notice, warning or error there is no longer fixture output or a rollout notice, and a cancelled sweep no longer hides a waiting one',
  'the newest main run of workflow-lint, fleet-autodeploy and code-task-publish lists none of SECRET-LOCK-UNAVAILABLE for w, rate-limited (HTTP 403) on PATCH /issues/52 and PUBLISH-SUITE-CHECK-1: failing suites are red on main too; no job lists the ubuntu-latest migration notice; the newest selfheal job lists no AMBER warning',
  'none',
  'the repository suites (scripts/runner-pin-annotations.test.mjs and the full set), scripts/workflow-lint.py over the 56 workflow files, the real self-test fixtures replayed through a model of the runner''s workflow-command parser, the consumer''s parse_code_probe and run_code_probe on the four detectors'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'RUNNER-PIN-ANNOTATIONS-1:') = 1);

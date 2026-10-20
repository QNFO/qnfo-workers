-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET ts = (SELECT b.ts FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), max_attempts = (SELECT b.max_attempts FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class), deferred_since = (SELECT b.deferred_since FROM bak_20261019_windows_parity_probe b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_windows_parity_probe) AND module = 'windows-parity-probe-1'; DELETE FROM remediation_contracts WHERE class = 'fm-windows-parity-green-by-construction'; DELETE FROM failure_modes WHERE fm_key = 'windows-parity-green-by-construction'; DELETE FROM capability_ledger WHERE capability = 'windows-parity-measured';
--
-- WINDOWS-PARITY-PROBE-1 (2026-10-19, charter pillar core; agent_issues 2832 WINDOWS-SUITE-PARITY-1 and its PROBE-NEEDED-1 issue 100266).
-- Companion to .github/workflows/windows-suite-parity.yml in the same pull request. decision_log is append-only, so the Rollback line above leaves the decision row.
--
-- WHAT WAS WRONG (read 2026-10-20 from api.github.com, the job logs of the run and live qnfo-audit)
--   WINDOWS-SUITE-PARITY-1 (PR 3006) runs `node scripts/run-suites.mjs --all` on windows-latest under node 22 and node 24. Its run step was
--   continue-on-error and the job always ended green, with the failing list only in the job summary. The REST runs API therefore reports conclusion
--   success for a run whose suites failed. The workflow has two runs, not none: run 1 (push, 3e2e1427) was cancelled by run 2 (workflow_dispatch,
--   id 39285893274, 2026-10-19T16:29:55Z, main 3e2e1427), which concluded success, and the job logs of that run read, on BOTH legs (node 22.23.3 and
--   node 24.21.0), "SUITE-RUNNER-1: 576 passed, 4 failed", with the tail naming scripts/direct-content-deploy-ledger ("skipped workers write no
--   deployment_history row" and the direct_content_deploy.py --selftest). The only contract of issue 2832, issue-2832, is superseded
--   (superseded:probe-unusable, 32 attempts): its probe reads the status of its own issue and cannot pass while the issue is open, so the issue
--   stands in v_issue_dead_end and in fm-open-issue-no-doer, and PROBE-NEEDED-1 issue 100266 asks a doer for a probe that measures the defect.
--
-- WHAT THIS CHANGES
--   1. The workflow (not this file) gains a last step, `if: always()`, that exits 1 when the runner exit code was not 0 or any suite failed, so the run
--      conclusion reports parity: success means both node legs ran every suite with an empty failing list, failure means a Windows-only red. The run
--      step and the job summary are unchanged, and the workflow stays advisory for merging (it is not a required check and deploy-gate.yml keeps the gate).
--   2. Contract issue-2832 is re-pointed at that conclusion: transport external-https, run each hour by the qnfo-fleet-control remediation tick (the same
--      transport as issue-100168), a public GET of the latest completed run of the workflow on main, check json:workflow_runs.0.conclusion, expected
--      success. Public GitHub, no credential. The probe is read by the executor as follows (qnfo-fleet-control rtHttpSpec and rtHttpObserve, read from
--      source): api.github.com is on the host allowlist, the check matches json:[A-Za-z0-9_.-]+, and the dotted path walks an array by index because an
--      array is an object, so workflow_runs.0.conclusion is the conclusion of the first run. An empty list, a rate-limited answer (403 with a message
--      body) and a non-JSON body observe (absent) or (not json), never success, so the probe fails closed. A run that finished cancelled observes
--      cancelled until the next run completes. The shape was read live on 2026-10-20 from this URL and from deploy-gate.yml
--      ("conclusion":"success", "status":"completed", array under workflow_runs).
--      json: is chosen over body-contains because it names what it read: a red run reads failure, an empty list (absent), where body-contains reads
--      absent for all of them and would also match a "conclusion":"success" in any other part of the body.
--   3. The probe carries a creation date, created=2026-10-20T00:00:00Z or later (the GitHub runs filter, encoded %3E%3D in the URL). Without it the probe
--      would pass at once on run 2, the green-by-construction run above, between this merge and the first run of the changed workflow, and the
--      autoclose path would read a second pass an interval later. With it the live read on 2026-10-20 is {"total_count":0,"workflow_runs":[]}, so the probe
--      observes (absent) and fails until a run of the new workflow completes. The filter drops nothing that ever measured anything: both earlier runs are
--      from 2026-10-19 and no run exists on or after 2026-10-20 at the read. branch=main keeps a dispatch on a branch out, status=completed leaves a run
--      that is still going out.
--   4. max_attempts 24 (was 3) on the hourly contract, because a real defect fails for a long time and a park after 3 reads would put the issue back on the
--      dead-end list. attempts 0, last_verdict NULL, deferred_since NULL, due now, status active, module windows-parity-probe-1.
--   5. failure mode windows-parity-green-by-construction and its code-read detector fm-windows-parity-green-by-construction (the failing step is in the
--      workflow file on main), a capability_ledger row and one decision_log row. migrations/windows-parity-probe.test.mjs also fails a pull request that
--      removes the step.
--   Not touched: agent_issues, issue_triage (the issue stays open and closes only on a green run), the PROBE-NEEDED-1 issue 100266 (its own contract reads
--   ok once issue 2832 holds an active contract with a probe that is neither needs-machine-probe nor a read of the issue's own status; the autoclose path
--   then closes it).
--
-- THE MEASURED REMAINING WORK (not changed here: the probe measures it)
--   Four suites were still red on Windows on 2026-10-18 (issue 2832 text): qnfo-code-orchestrator multi-file B5 (CRLF), no-eol, self-repair A4 and
--   scripts/direct-content-deploy-ledger (a live fetch). The 2026-10-19 run above counts 4 failed of 580 on each leg. This file fixes none of them: the
--   issue is done when a run of the workflow is green on both legs, and a fix to a suite is seen once the workflow runs again (dispatch it).
--
-- Limits that stay: a probe that cannot read the API reads as a failure and never as a pass, and a pass needs a run of the changed workflow.
-- One executor on one public API is the path (qnfo-fleet-control tick). The same fact is on the Actions page and in the job summary.
-- spof-review: no new loop, cap, hold or gate. One contract re-pointed, one detector added, one backup table (bak_20261019_windows_parity_probe).

-- 0. Backup of the contract this file changes (BACKUP-CREATES-1). A replay finds the table and leaves it as it is.
CREATE TABLE IF NOT EXISTS bak_20261019_windows_parity_probe AS
  SELECT class, issue_id, ts, status, verify_probe, verify_transport, last_verdict, module, action, precondition, attempts, max_attempts, next_due_at, deferred_since
  FROM remediation_contracts
  WHERE class = 'issue-2832';

-- 1. The contract of issue 2832: a probe of the workflow's latest completed run on main, active and due now. Guarded on the retired row, so a replay or a
--    probe a doer wrote by hand is left alone (UPDATE on the class, ORPHAN-GUARD-BIRTH-1).
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'external-https',
  verify_probe = '{"url": "https://api.github.com/repos/QNFO/qnfo-workers/actions/workflows/windows-suite-parity.yml/runs?per_page=1&status=completed&branch=main&created=%3E%3D2026-10-20T00:00:00Z", "method": "GET", "check": "json:workflow_runs.0.conclusion", "expected": "success"}',
  last_verdict = NULL, attempts = 0, max_attempts = 24, deferred_since = NULL, next_due_at = datetime('now'),
  module = 'windows-parity-probe-1', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1,
  precondition = 'WINDOWS-PARITY-PROBE-1: issue 2832 defect (the offline suite set is red on Windows) measured from the latest completed windows-suite-parity run on main, never from the status of the issue',
  action = 'MEASURES the defect: GET /repos/QNFO/qnfo-workers/actions/workflows/windows-suite-parity.yml/runs (public GitHub API, no credential, run by the qnfo-fleet-control remediation tick) lists the latest completed run on main created on or after 2026-10-20T00:00:00Z, and its conclusion must be success. Since WINDOWS-PARITY-PROBE-1 the workflow ends red when the runner exit code was not 0 or any suite failed on either leg (windows-latest, node 22 and node 24), so success means both legs ran every suite with an empty failing list. The probe reads (absent) until a run of the changed workflow completes, then failure while a suite is red on Windows (4 failed of 580 on both legs on 2026-10-19), and passes only after the suites are fixed and the workflow has run again (dispatch it). Runs before 2026-10-20 are left out on purpose: the old workflow ended green whatever happened. The remaining work it measures: qnfo-code-orchestrator multi-file B5 CRLF, no-eol, self-repair A4 and scripts/direct-content-deploy-ledger (a live fetch).'
WHERE class = 'issue-2832' AND issue_id = 2832 AND status = 'superseded' AND instr(verify_probe, 'FROM agent_issues WHERE id = 2832') > 0;

-- 2. The failure mode and its detector: the workflow file on main keeps the step that turns a red suite into a red run.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('windows-parity-green-by-construction',
  'an advisory CI job reports its result only in the job summary and always ends green, so the run conclusion carries no information and no probe can read the result',
  'WINDOWS-SUITE-PARITY-1 (PR 3006) made the measuring step continue-on-error and the job always green so that a Windows-only red would never block a merge. The REST runs API then reports conclusion success for a run whose suites failed: run 2 of 2026-10-19 (workflow_dispatch, main 3e2e1427) concluded success while both legs logged "576 passed, 4 failed". The only contract of issue 2832 was the circular status-of-itself probe (superseded:probe-unusable), so the issue stood in v_issue_dead_end for lack of any probe that measures it, and PROBE-NEEDED-1 issue 100266 asked for one',
  'WINDOWS-PARITY-PROBE-1: the workflow keeps the continue-on-error run step and the summary and gains a last step with if: always() that exits 1 when the runner exit code was not 0 or any suite failed, so the run conclusion is the parity signal (the workflow stays advisory for merging, deploy-gate.yml keeps the gate). Contract issue-2832 reads the conclusion of the latest completed run on main created on or after 2026-10-20T00:00:00Z through the public GitHub API each hour, so a run of the old workflow cannot pass it. migrations/windows-parity-probe.test.mjs fails a pull request that removes the step',
  'the code-read contract fm-windows-parity-green-by-construction reads .github/workflows/windows-suite-parity.yml on main for the failing step (the consumer reads it from its checkout of main), and migrations/windows-parity-probe.test.mjs in CI',
  'fm-windows-parity-green-by-construction', '2026-10-19', 2832,
  'an advisory workflow sets continue-on-error on its measuring step and nothing after it turns the result into a failed job',
  'the runs API reports conclusion success for a run whose job summary lists failing suites (run 2 of windows-suite-parity: 576 passed, 4 failed on both node legs, conclusion success); a probe built on the conclusion passes on a red result',
  'issue 2832 and any probe built on the conclusion of an advisory workflow: a false pass would close the issue on a result nobody read');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-windows-parity-green-by-construction', NULL, 'WINDOWS-PARITY-PROBE-1', 'failure-mode detector',
  '{"paths":[".github/workflows/windows-suite-parity.yml"],"contains":"- name: Fail the run when a suite is red on Windows\n        if: always()"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 3. The capability the fleet gains: the Windows parity of the suite set is measured by a probe and no longer read by a person from a job summary.
INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('windows-parity-measured', 'migrations/2026-10-19-windows-parity-probe.sql (WINDOWS-PARITY-PROBE-1)',
  'the windows-suite-parity workflow on windows-latest (a run on main on or after 2026-10-20T00:00:00Z) and the qnfo-fleet-control remediation tick reading the public GitHub runs API; no secret, no new binding, no worker change',
  'measured each hour by contract issue-2832 (the conclusion of the latest completed run on main) and by the code-read detector fm-windows-parity-green-by-construction; an unreadable API or an empty run list reads as a failure',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'run 39285893274 (workflow_dispatch, 2026-10-19T16:29:55Z) concluded success with 576 passed and 4 failed on both node legs, which is the false green this removes; migrations/windows-parity-probe.test.mjs');

-- 4. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a run conclusion that is green whatever happens cannot be probed, and a probe on it that also reads the runs made before the change would pass on a false green, so the workflow is made to report parity and the probe is bounded to runs of the changed workflow',
  'WINDOWS-PARITY-PROBE-1: .github/workflows/windows-suite-parity.yml gains a last step (if: always(), exit 1 when the runner exit code was not 0 or any suite failed), and migrations/2026-10-19-windows-parity-probe.sql re-points contract issue-2832 at an external-https probe of the latest completed run on main (json:workflow_runs.0.conclusion, expected success, created on or after 2026-10-20T00:00:00Z, max_attempts 24), adds the failure mode windows-parity-green-by-construction with its code-read detector fm-windows-parity-green-by-construction, and the capability row windows-parity-measured',
  'read 2026-10-20: the workflow has 2 runs (run 1 push cancelled, run 2 workflow_dispatch 2026-10-19T16:29:55Z concluded success), the job logs of run 2 read "SUITE-RUNNER-1: 576 passed, 4 failed" on node 22.23.3 and node 24.21.0; the runs URL with the creation filter returns total_count 0 and without it the conclusion success of run 2; issue-2832 was superseded (probe-unusable, 32 attempts) and issue 2832 stood in v_issue_dead_end; the executor accepts the probe (rtHttpSpec) and observes (absent) on an empty list',
  'applied through the canonical path on merge: the workflow change starts a push-triggered run on windows-latest, and the contract is probed at the next remediation tick',
  'one contract row re-pointed, one failure mode, one detector contract and one capability row added, one backup table; the workflow conclusion changes from green to the parity result but it is not a required check, so no merge is blocked; no worker, no agent_issues or issue_triage change, no secret',
  'revert the workflow change through the canonical path, or run the migration Rollback header: it restores contract issue-2832 from bak_20261019_windows_parity_probe (only while its module is still windows-parity-probe-1) and removes the detector contract, the failure mode and the capability row (decision_log is append-only and keeps this row)',
  'the Windows parity of the offline suite set is read from a run conclusion by a probe, so issue 2832 closes on a green run on both node legs and never on a status',
  'contract issue-2832 observes (absent) at its first read, then failure while a suite is red on Windows (4 failed of 580 on both legs on 2026-10-19), and reads success only after a run of the changed workflow is green on both legs; issue 2832 leaves v_issue_dead_end at the next read because it holds an active contract that measures it',
  'none',
  'the executor functions rtHttpSpec and rtHttpObserve read from qnfo-fleet-control/worker.js against the live JSON shape, the REOPEN-LIVE-PATH-1 closing probe of PROBE-NEEDED-1 issue 100266 run against the new contract, the consumer parse_code_probe and run_code_probe on the detector, the workflow YAML parsed (migrations/windows-parity-probe.test.mjs), and a live read of the runs API with and without the creation filter'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'WINDOWS-PARITY-PROBE-1:') = 1);

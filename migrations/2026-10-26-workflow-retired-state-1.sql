-- WORKFLOW-RETIRED-STATE-1 (2026-10-26, charter pillar autonomy; owner directive 2026-10-26: "PERMANENTLY REMEDIATE ALL FAILING GITHUB WORKFLOWS").
-- Two defects, each measured on 2026-10-26 ~08:00Z.
--
-- 1. Issue 1000020 (WORKFLOW-FAILED-1: fix-fold-pair-and-model-floor) could never close. Its contract reads workflow_main_state for a workflow whose file
--    no longer exists: .github/workflows/fix-fold-pair-and-model-floor.yml was deleted in 83056c9 (#4302) as a retired one-shot repair, so no later run
--    can write the 'success' the probe waits for. The contract had failed 82 times against its limit of 3. The same holds for mind-q08-patch (deleted in
--    the same commit; failure row 2026-10-21). The two stale rows are saved in bak_20261026_workflow_main_state and removed, the probe of 1000020 is
--    replaced by one that measures the defect (no failing state for that workflow) and the issue closes with its evidence. The cause is the intake:
--    workflowFailureIntake never retires the state of a workflow that no longer exists, so any retired workflow files a WORKFLOW-FAILED-1 issue that
--    stays open for ever. That fix is a code task filed below with its own probe (WORKFLOW-RETIRED-STATE-CODE-1).
-- 2. Issue 1000055 (MERGE-BOUNDARY-GATE-1: worker-load-gate flake rate unmeasured) asked for the flake rate of the worker load gate over repeated full runs.
--    It is measured: the step ran in 99 of the last 100 completed deploy-gate runs and passed all 99 (see the evidence below), so the issue closes.
--
-- Revert: the Rollback line restores the two state rows and the saved probe; the two issues are reopened by hand if the evidence is disputed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: INSERT OR IGNORE INTO workflow_main_state SELECT * FROM bak_20261026_workflow_main_state; UPDATE remediation_contracts SET verify_probe = (SELECT old_probe FROM bak_20261026_wms_contract WHERE class = 'issue-1000020') WHERE class = 'issue-1000020'; DELETE FROM agent_issues WHERE title LIKE 'WORKFLOW-RETIRED-STATE-CODE-1:%'; DELETE FROM remediation_contracts WHERE class = 'fm-workflow-state-retired'; DELETE FROM failure_modes WHERE fm_key = 'workflow-state-retired'
-- BACKUP: bak_20261026_workflow_main_state
-- spof-review: no new cron, trigger, binding, host or credential; one-time data changes and one filed issue.

CREATE TABLE IF NOT EXISTS bak_20261026_workflow_main_state AS
  SELECT * FROM workflow_main_state WHERE workflow IN ('fix-fold-pair-and-model-floor', 'mind-q08-patch');

CREATE TABLE IF NOT EXISTS bak_20261026_wms_contract AS
  SELECT class, verify_probe AS old_probe, datetime('now') AS saved_at FROM remediation_contracts WHERE class = 'issue-1000020';

DELETE FROM workflow_main_state WHERE workflow IN ('fix-fold-pair-and-model-floor', 'mind-q08-patch');

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM workflow_main_state WHERE workflow = ''fix-fold-pair-and-model-floor'' AND conclusion IN (''failure'', ''timed_out'', ''startup_failure'')) AS TEXT) AS observed',
       last_verdict = NULL, attempts = 0
 WHERE class = 'issue-1000020';

UPDATE issue_triage
   SET close_evidence = 'RETIRED WITH PROOF 2026-10-26 (WORKFLOW-RETIRED-STATE-1): the workflow file .github/workflows/fix-fold-pair-and-model-floor.yml no longer exists (deleted in 83056c9, #4302; git log --diff-filter=D shows it), so no later run can replace the failure that run 40103601310 recorded. Its workflow_main_state row (conclusion failure, 2026-10-24) was saved in bak_20261026_workflow_main_state and removed; the contract probe now counts failing state rows for the workflow and reads 0. The same removal covers mind-q08-patch (deleted in the same commit). Root cause, the intake never retiring the state of a workflow that no longer exists, is filed as WORKFLOW-RETIRED-STATE-CODE-1 with a code-read probe.',
       triage_state = 'closed'
 WHERE issue_id = 1000020;

UPDATE issue_triage
   SET close_evidence = 'MEASURED 2026-10-26 ~08:00Z from the GitHub runs API (the definition of done asked for three full gate runs on main with per-entry timing; this is 99): of the last 100 completed deploy-gate runs (2026-10-26T04:46Z to 07:52Z: 89 success, 4 failure, 7 cancelled) the MERGE-BOUNDARY-GATE-1 worker load gate step ran in 99 and concluded success in all 99, 0 failure. Step duration over the whole step (all worker entries): min 1 s, median 3 s, p95 4 s, max 4 s, so no entry can have waited out the 20 s per-entry timeout and the step cannot hang after its summary. Flake rate 0 of 99. The 97/98 and 20 s timeout of 2026-10-24 were measured in a 180-270 s container budget, not on the CI runner. The four deploy-gate failures in the window were other steps (not this one).',
       triage_state = 'closed'
 WHERE issue_id = 1000055;

UPDATE agent_issues
   SET description = COALESCE(description, '') || char(10) || 'PROGRESS 2026-10-26 (session_01LJNL3LGHVnU6qhuvNbAjDw): item 1 (GATE-FLAKE-RATE) is measured in issue 1000055, 0 of 99 deploy-gate runs failed the worker load gate step, steps take 1 to 4 s on the runner. Item 2 (CI-ZERO-RUNS) is resolved: deploy-gate.yml has run on every pull request and push to main (100 completed runs between 04:46Z and 07:52Z 2026-10-26) and model-floor-guard.yml has 940 runs, the latest 07:58Z. Items 3 to 5 are unchanged and still unowned here.'
 WHERE id = 1000063 AND status = 'open' AND COALESCE(description, '') NOT LIKE '%GATE-FLAKE-RATE) is measured in issue 1000055%';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'WORKFLOW-RETIRED-STATE-CODE-1: workflowFailureIntake retires the state of a workflow that no longer exists',
  'Charter pillar: autonomy. Root cause of issue 1000020: workflowFailureIntake (qnfo-fleet-control) writes workflow_main_state for every workflow seen in the newest 100 main runs and files WORKFLOW-FAILED-1: <workflow> when the latest decided run failed, but nothing retires the row of a workflow whose file was deleted. A retired workflow whose last run failed therefore keeps a failing row, an open issue and a contract that can never read success (82 failed attempts on 1000020).' || char(10) ||
  'Edit: after the latest-by-name map is built, read the repository workflow list (GET /actions/workflows?per_page=100) and keep the names whose state is active or disabled_manually; a workflow_main_state row whose workflow is not in that set and whose conclusion is not already retired gets conclusion retired (the row is kept, never deleted: no silent drop) and its open WORKFLOW-FAILED-1 issue is closed with close_evidence naming the deletion, after setting its contract to superseded so issue_close_evidence_required does not refuse the close. Skip the whole step when the list is unreadable (fail closed: never retire on a failed read). Mark the code WFI-RETIRED-1. Add a case to the intake test with a deleted workflow and one with an unreadable list.' || char(10) ||
  'Definition of done: the next retired workflow with a failing last run files no issue that stays open, and a case in the intake test fails on the old code.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
  'code-anchor: var latest = wfiLatest(res.j.workflow_runs), names = Object.keys(latest).sort();' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "WFI-RETIRED-1"}',
  'session_01LJNL3LGHVnU6qhuvNbAjDw', 'reliability', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'WORKFLOW-RETIRED-STATE-CODE-1:%' AND status = 'open');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('workflow-state-retired', 'a workflow that no longer exists keeps a failing row in workflow_main_state, an open WORKFLOW-FAILED-1 issue and a contract that can never read success',
  'workflowFailureIntake records the latest decided main run of each workflow seen in the newest 100 runs and never retires the row of a workflow whose file was deleted, so a retired workflow whose last run failed is red for ever (issue 1000020: 82 failed contract attempts)',
  'WORKFLOW-RETIRED-STATE-1 removes the two stale rows with a backup; WORKFLOW-RETIRED-STATE-CODE-1 makes the intake retire the state itself (code-read probe on the marker WFI-RETIRED-1)',
  'no failing workflow_main_state row has gone 3 days without a later decided run', 'fm-workflow-state-retired', '2026-10-26', NULL,
  'a workflow file is deleted while its last main run is a failure', 'workflow_main_state holds a failing row whose run_at is older than 3 days; an open WORKFLOW-FAILED-1 issue for a workflow the repository no longer has', 'a retired one-shot workflow files an issue that nothing can close, counted in open_agent_issues and the issue SLAs');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-workflow-state-retired', NULL, 'WORKFLOW-RETIRED-STATE-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM workflow_main_state WHERE conclusion IN (''failure'', ''timed_out'', ''startup_failure'') AND replace(replace(run_at, ''T'', '' ''), ''Z'', '''') < datetime(''now'', ''-3 days'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

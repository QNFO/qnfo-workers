-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-workflow-failure-unrecorded'; DELETE FROM failure_modes WHERE fm_key = 'workflow-failure-unrecorded'; DELETE FROM ops_config WHERE key = 'workflow_failure_intake'; DROP TABLE IF EXISTS workflow_failures; DROP TABLE IF EXISTS workflow_main_state;
-- WORKFLOW-FAILURE-INTAKE-1 (qnfo-fleet-control 0.43.0, agent_issues 100295, pillar autonomy). Owner directive 2026-10-20: "The system
-- shall always fix and redeploy all merge failures automatically." The audit in 100295 counted 2500+ failed workflow runs and none
-- recorded with a cause. The 10-minute tick now keeps each workflow's latest decided conclusion on main (workflow_main_state), records a
-- failing run with its failed job and step (workflow_failures), files one WORKFLOW-FAILED-1: <workflow> issue with a d1-query probe and
-- closes it when a later main run succeeds. The worker also creates both tables if absent; this file makes them exist before the deploy.

CREATE TABLE IF NOT EXISTS workflow_main_state (workflow TEXT PRIMARY KEY, run_id INTEGER, conclusion TEXT, run_at TEXT, html_url TEXT, seen_at TEXT);
CREATE TABLE IF NOT EXISTS workflow_failures (run_id INTEGER PRIMARY KEY, workflow TEXT, conclusion TEXT, run_at TEXT, html_url TEXT, head_sha TEXT, failed_job TEXT, failed_step TEXT, issue_id INTEGER, recorded_at TEXT);

INSERT OR IGNORE INTO ops_config (key, value) VALUES ('workflow_failure_intake', 'on');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('workflow-failure-unrecorded',
  'a workflow on main fails and nothing records the cause or files the fix',
  'no loop read GitHub Actions results: a red deploy-gate, mirror-guard or sync run on main waited for a session to read the Actions page, and the job logs need sign-in',
  'WORKFLOW-FAILURE-INTAKE-1 (qnfo-fleet-control 0.43.0): the 10-minute tick records the failing run with its failed job and step, files WORKFLOW-FAILED-1: <workflow> with a probe on workflow_main_state, and closes it when main is green again',
  'fm-workflow-failure-unrecorded: every workflow whose latest decided main run failed has an open WORKFLOW-FAILED-1 issue, and the intake state is no older than 60 minutes',
  'fm-workflow-failure-unrecorded', '2026-10-20', 100295,
  'a workflow run on main ends failure, timed_out or startup_failure',
  'audit 2026-10-20 (agent_issues 100295): 2500+ failed runs listed, none recorded with a cause; artifacts-canonical-sync #285 and deploy-gate #4786 found by hand',
  'every merge to main and the deploys that follow it');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
 ('fm-workflow-failure-unrecorded', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM workflow_main_state s WHERE s.conclusion IN (''failure'', ''timed_out'', ''startup_failure'') AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = ''open'' AND a.title = ''WORKFLOW-FAILED-1: '' || s.workflow)) + CASE WHEN COALESCE((SELECT MAX(seen_at) FROM workflow_main_state), '''') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'') THEN 1 ELSE 0 END AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'WORKFLOW-FAILURE-INTAKE-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01PzViV5mKHujgukcPrHsfAE',
  'a merge failure is fixed automatically only when a loop sees it; the qnfo-fleet-control GitHub token already reads Actions runs and jobs, so the intake needs no new credential and no workflow change',
  'WORKFLOW-FAILURE-INTAKE-1: the 10-minute tick records failing main runs with their failed job and step, files one WORKFLOW-FAILED-1 issue per red workflow with a probe, and closes it when main is green',
  'agent_issues 100295 audit 2026-10-20: 2500+ failed runs, none recorded with a cause; the latest main runs of deploy-gate, mirror-guard and artifacts-canonical-sync were green on ubuntu-24.04 at 05:38Z',
  'migration merged; qnfo-fleet-control 0.43.0 deployed through the canonical path',
  'one GitHub runs read and at most 4 job reads per 10-minute tick; at most one open issue per workflow',
  'the Rollback header; ops_config workflow_failure_intake = off stops it without a deploy',
  'every red workflow on main is recorded with its cause and has an issue that closes itself on recovery',
  'workflow_main_state holds a row per workflow within 30 minutes of the deploy; fm-workflow-failure-unrecorded reads 0',
  'none', 'GitHub Actions runs and jobs API (read-only); workflow-failure-intake.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'WORKFLOW-FAILURE-INTAKE-1:%');

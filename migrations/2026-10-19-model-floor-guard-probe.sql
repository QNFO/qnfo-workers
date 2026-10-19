-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_alternate_probes WHERE control = 'model_floor_pr_check' AND instr(window_note, 'MODEL-FLOOR-GUARD-OBSERVABLE-1') > 0;
-- BACKUP: control_alternate_probes
-- MODEL-FLOOR-GUARD-OBSERVABLE-1 step 2 (2026-10-19, charter pillar: autonomy; agent_issues 100258, CONTROL-ALT-PROBES-3 2826 and 2880).
-- Step 1 landed as PR 3140 (qnfo-github-steward 0.7.2, modelFloorGuardVisibility) and wrote a model_floor_guard key into github_steward_runs.detail, but it never read a run:
-- the workflow-runs endpoint answers an object and paginate() keeps arrays only, and the repository name was built from DESIRED_REPO (the settings object), so the path was
-- QNFO/[object Object]; every run read status "empty", runs 0 (github_steward_runs 26, 2026-10-19T22:15Z) while the workflow has 407 runs on main. qnfo-github-steward 0.7.3
-- (this change) reads the object and names qnfo-workers.
-- This file adds the probe row that retires the ALTERNATE-NOT-EXERCISABLE reason of model_floor_pr_check. The alternate is the post-merge push run of the same workflow; the probe reads
-- the newest steward run (started inside 120 minutes) and passes when its model_floor_guard key reads status ok, that is, the steward saw at least one completed success, failure or
-- timed_out run on main. Read live 2026-10-19 22:3xZ it fails with "the steward reads the model-floor-guard workflow as empty", which is true until 0.7.3 is live; the next hourly
-- steward run after the deploy turns it ok, and only a passing drill stamps alternate_tested_at. Nothing is stamped here.
INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('model_floor_pr_check',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM github_steward_runs WHERE started_at > strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-120 minutes'')) THEN ''the steward recorded no run in 120 minutes'' WHEN json_extract((SELECT detail FROM github_steward_runs ORDER BY id DESC LIMIT 1), ''$.model_floor_guard.status'') IS NULL THEN ''the newest steward run carries no model_floor_guard key'' WHEN json_extract((SELECT detail FROM github_steward_runs ORDER BY id DESC LIMIT 1), ''$.model_floor_guard.status'') <> ''ok'' THEN ''the steward reads the model-floor-guard workflow as '' || json_extract((SELECT detail FROM github_steward_runs ORDER BY id DESC LIMIT 1), ''$.model_floor_guard.status'') ELSE ''ok'' END AS observed',
  '120 minutes: the steward reconciles hourly and keeps the model_floor_guard key of the last ten completed runs of the workflow on main (MODEL-FLOOR-GUARD-OBSERVABLE-1, qnfo-github-steward 0.7.3); the scan itself is pinned by scripts/model-floor-guard.test.mjs',
  1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a control whose alternate leaves no record is judged by a record the observer writes; an observer that reads zero runs where 407 exist records nothing',
  'MODEL-FLOOR-GUARD-OBSERVABLE-1: qnfo-github-steward 0.7.3 reads body.workflow_runs and the right repository, and model_floor_pr_check gets its control_alternate_probes row',
  'github_steward_runs 26 read status empty, runs 0 at 22:15Z; the table model_floor_guard_runs does not exist in qnfo-audit; GitHub lists 407 runs of model-floor-guard.yml; DESIRED_REPO is an object in worker.js',
  'migration merged',
  'one control_alternate_probes row; qnfo-github-steward patch',
  'the Rollback header of migrations/2026-10-19-model-floor-guard-probe.sql',
  'a steward observer that reads a workflow it could not read before',
  'controls_untested_without_probe falls by 1 after the next drill that passes',
  'none',
  'd1:qnfo-audit read-only probe run live, github actions list of the workflow, node:sqlite fixtures in migrations/model-floor-guard-probe.test.mjs and qnfo-github-steward/model-floor-guard-visibility.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'MODEL-FLOOR-GUARD-OBSERVABLE-1:%');

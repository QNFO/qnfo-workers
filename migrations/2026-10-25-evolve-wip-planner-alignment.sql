-- EVOLVE-WIP-PLANNER-ALIGNMENT-1 (2026-10-25, charter pillar autonomy): recovery must use the planner's
-- shared code_plan_wip threshold and its unfinished-task set, not a queued-only count and private ceiling.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', next_due_at = NULL WHERE class IN ('fm-evolve-wip-planner-mismatch', 'belief-evolve-wip-planner-alignment')

INSERT OR IGNORE INTO control_registry
  (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES
  ('evolve-wip-recovery', 'qnfo-evolve recoverWip: code_tasks active WIP and code_plan_wip', 'gate',
   'parking queued tasks before the planner reaches its actual WIP ceiling',
   0, 'replace', 'applied',
   'the normal code planner continues to plan and drain tasks independently of recovery', NULL,
   'EVOLVE-WIP-PLANNER-ALIGNMENT-1 replaces queued-only measurement and evolve_wip_ceiling with the planner active-task status set and shared code_plan_wip setting; stale queued candidates still require 6 attempts and 10 minutes idle, are backed up first, and are capped at 2 per tick',
   NULL);

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('evolve-wip-planner-alignment',
  'qnfo-evolve reports the same active code-task count and WIP ceiling used by the planner before it parks queued tasks',
  0.95,
  'qnfo-evolve recoverWip counts code_tasks excluding planner terminal and handoff statuses, reads ops_config.code_plan_wip, and logs both alongside queued count and oldest age',
  'belief-evolve-wip-planner-alignment', 'EVOLVE-WIP-PLANNER-ALIGNMENT-1');

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('evolve-wip-planner-mismatch',
  'WIP recovery parks tasks using a queue count or ceiling that differs from the planner',
  'recovery counted only queued tasks and read evolve_wip_ceiling while the planner counted all unfinished tasks and read code_plan_wip',
  'EVOLVE-WIP-PLANNER-ALIGNMENT-1: share the planner ceiling and active-task status definition; retain queued-only eligibility for parking',
  'the latest qnfo-evolve run records the same active WIP count and code_plan_wip ceiling as the live D1 state',
  'fm-evolve-wip-planner-mismatch', '2026-10-25', NULL,
  'the latest qnfo-evolve run has no active-WIP count, has a stale ceiling, or disagrees with the active code_tasks count',
  'recovery can park queued tasks before the planner reaches its threshold or remain inert after the planner stops planning',
  'qnfo-code-orchestrator planning throughput and qnfo-evolve WIP recovery');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES
  ('fm-evolve-wip-planner-mismatch', NULL, 'EVOLVE-WIP-PLANNER-ALIGNMENT-1', 'planner-aligned WIP detector',
   'SELECT ''1'' AS expected, CASE WHEN json_extract((SELECT detail FROM evolve_runs ORDER BY id DESC LIMIT 1), ''$.wip'') = (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN (''merged'', ''closed'', ''publish_failed'', ''needs_human'', ''failed'', ''reverted'', ''superseded'', ''branch_pushed'', ''published'', ''pr_open'')) AND json_extract((SELECT detail FROM evolve_runs ORDER BY id DESC LIMIT 1), ''$.wip_ceiling'') = COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''code_plan_wip''), 12) THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'fm-evolve-wip-planner-mismatch'),
  ('belief-evolve-wip-planner-alignment', NULL, 'DOCTRINE-1 belief', 'belief probe',
   'SELECT ''1'' AS expected, CASE WHEN json_extract((SELECT detail FROM evolve_runs ORDER BY id DESC LIMIT 1), ''$.wip'') = (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN (''merged'', ''closed'', ''publish_failed'', ''needs_human'', ''failed'', ''reverted'', ''superseded'', ''branch_pushed'', ''published'', ''pr_open'')) AND json_extract((SELECT detail FROM evolve_runs ORDER BY id DESC LIMIT 1), ''$.wip_ceiling'') = COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''code_plan_wip''), 12) THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief');

INSERT OR IGNORE INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
VALUES
  ('cfde3500-8753-44c4-900f-dfe24591b0d1',
   'Recovery should use the planner''s active-task definition and shared threshold; queued tasks remain only the parkable subset.',
   'EVOLVE-WIP-PLANNER-ALIGNMENT-1: align qnfo-evolve WIP recovery with code_plan_wip and the planner active-task set; record active WIP, queued candidates and oldest age.',
   'The planner gate is configured through ops_config.code_plan_wip (default 12, bounds 1-48; current migration sets 40). qnfo-evolve previously counted only queued tasks and read evolve_wip_ceiling. The existing safeguards remain: 6 attempts, 10 minutes idle, backup before status change, at most 2 tasks per tick.',
   'implementation pending CI and canonical deployment; the D1 detector verifies the first post-deploy run against current code_tasks and code_plan_wip',
   'qnfo-evolve recovery decisions and their planner-WIP telemetry',
   'revert qnfo-evolve worker.js and deployed-current.worker.js to the previous version; mark these detector contracts superseded while preserving append-only doctrine ledgers',
   'planner-aligned WIP recovery telemetry and parking',
   'recovery remains inert below the planner ceiling and parks only stale exhausted queued tasks after the shared threshold is reached',
   'internal reliability; no external audience change',
   'qnfo-evolve offline suite, qnfo-evolve source/mirror guard, migration validation, and post-deploy D1 detector');

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('planner-aligned-wip-recovery',
   'EVOLVE-WIP-PLANNER-ALIGNMENT-1',
   'qnfo-evolve, qnfo-code-orchestrator active-task status set, ops_config.code_plan_wip',
   'D1 detector compares the latest evolve run with live active code_tasks and the shared planner ceiling; offline tests cover parking and backup order',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
   'qnfo-evolve/evolve.test.mjs; qnfo-evolve/worker.js; fm-evolve-wip-planner-mismatch');

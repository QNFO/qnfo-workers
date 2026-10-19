-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261019_red_drain_scope_task b WHERE b.id = 'red-drain'), version = (SELECT b.version FROM bak_20261019_red_drain_scope_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain'; UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261019_red_drain_scope_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain'; DELETE FROM remediation_contracts WHERE class = 'fm-red-drain-dispatch-out-of-scope'; DELETE FROM failure_modes WHERE fm_key = 'red-drain-dispatch-out-of-scope'
-- spof-review: none added; the code loop's read-step refusal (MERGE-SCOPE-AT-READ-1) stays as the second path
--
-- RED-DRAIN-SCOPE-1 (2026-10-19, pillar autonomy; LOOP-BREAKER issue 100092). red-drain step 3 queues a code task (ct_im<issue>) for
-- every open issue with a code-task line, including lines that name a control-plane or code-loop worker the merge runner never opens
-- or merges (qnfo-fleet-control CM_DENY, mirrored by qnfo-code-orchestrator PLAN_DENY_WORKERS). The loop then refuses each one at
-- its read step (MERGE-SCOPE-AT-READ-1, needs_human, no model call): ct_im100009, ct_im100072, ct_im100073, ct_im100075 and
-- ct_im100091 between 2026-10-19 08:36Z and 09:58Z, which the loop breaker counts as one recurring failure. Step 3 now skips an
-- issue whose description names a path in one of those workers; the issue stays open with its probe, and a session carries it
-- under CODE-LOOP-CONTROL-PLANE-1 (issue 100103). qnfo-ai and qnfo-gateway are left out of the list: they are canaried
-- (PLAN_LOOP_CANARIED) and the loop may change them. The list must follow PLAN_DENY_WORKERS when that list changes.

CREATE TABLE IF NOT EXISTS bak_20261019_red_drain_scope_task AS SELECT * FROM fleet_tasks WHERE id = 'red-drain';

UPDATE fleet_tasks SET
  definition = json_set(definition, '$.steps[3].sql', replace(json_extract(definition, '$.steps[3].sql'),
      char(10) || '       LIMIT 5',
      char(10) || '         AND NOT EXISTS (SELECT 1 FROM json_each(''["qnfo-fleet-control","qnfo-ops","qnfo-deploy-guard","qnfo-containers-pilot","qnfo-autonomy-scorer","qnfo-observability","qnfo-code-orchestrator","qnfo-code-agent"]'') d WHERE instr(a.description, ''path='' || d.value || ''/'') > 0) /* RED-DRAIN-SCOPE-1 */' ||
      char(10) || '       LIMIT 5')),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'red-drain' AND json_array_length(definition, '$.steps') = 7
  AND instr(definition, 'RED-DRAIN-SCOPE-1') = 0
  AND instr(json_extract(definition, '$.steps[3].sql'), 'INSERT OR IGNORE INTO code_tasks') > 0
  AND instr(json_extract(definition, '$.steps[3].sql'), char(10) || '       LIMIT 5') > 0;

UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'),
  repo_path = 'migrations/2026-10-19-red-drain-merge-scope.sql',
  exported_at = datetime('now')
WHERE id = 'red-drain'
  AND definition = (SELECT b.definition FROM bak_20261019_red_drain_scope_task b WHERE b.id = 'red-drain')
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'), 'RED-DRAIN-SCOPE-1') > 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('red-drain-dispatch-out-of-scope',
   'red-drain queues code tasks on control-plane worker paths that the merge runner never merges',
   'step 3 of fleet task red-drain turned every code-task line into a code_tasks row without the merge-scope rule the planner and the code loop apply (PLAN_DENY_WORKERS / CM_DENY)',
   'RED-DRAIN-SCOPE-1: step 3 skips an issue whose description names a path in a CM_DENY worker; MERGE-SCOPE-AT-READ-1 in the code loop stays as the second path',
   'd1-query: code tasks red-drain created in the last 120 minutes that the code loop refused with MERGE-SCOPE-AT-READ-1',
   'fm-red-drain-dispatch-out-of-scope', '2026-10-19', 100092,
   'an open issue carries a code-task line whose path is in qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard, qnfo-observability, qnfo-code-orchestrator or another CM_DENY worker',
   'ct_im tasks end needs_human at the read step and the LOOP-BREAKER-1 signature "MERGE-SCOPE-AT-READ" recurs every hour',
   'code loop lanes and red_snapshots counts; no merge happens, so production is not reached');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-red-drain-dispatch-out-of-scope', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE id LIKE ''ct_im%'' AND COALESCE(last_error, '''') LIKE ''MERGE-SCOPE-AT-READ-1%'' AND created_at >= datetime(''now'', ''-120 minutes'')) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'RED-DRAIN-SCOPE-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-session-01SistijJP68ZVkReXcmRhyg', 'a code task on a CM_DENY worker can never merge, so queueing it only spends a lane and trips the loop breaker',
  'RED-DRAIN-SCOPE-1: red-drain step 3 no longer queues code tasks for issues whose code-task path is in a CM_DENY worker',
  'ct_im100009, ct_im100072, ct_im100073, ct_im100075, ct_im100091 refused at read 2026-10-19 08:36Z-09:58Z; LOOP-BREAKER issue 100092',
  'migration merged', 'red-drain step 3 only', 'the Rollback header',
  'the dispatcher applies the same merge scope as the planner and the code loop', 'fm-red-drain-dispatch-out-of-scope observed = 0 within 120 minutes of the apply', 'none',
  'd1:qnfo-audit fleet_tasks, code_tasks, cloud_ops_events'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'RED-DRAIN-SCOPE-1:') = 1);

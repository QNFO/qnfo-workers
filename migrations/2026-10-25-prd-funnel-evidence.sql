-- PRD-FUNNEL-EVIDENCE-1, pillar reach, US-09 / RM-FUNNEL-E2E-MONITOR-1.
-- Live fleet_runs 31133 succeeded, but its event metadata was scrubbed: explanatory
-- "throughput" matches the existing ghp_ LIKE marker. Keep all secret guards unchanged.
-- Emit only typed stage names/counts/timestamps; retain explanations in the stage view.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition=(SELECT definition FROM bak_20261025_prd_funnel_task),version=(SELECT version FROM bak_20261025_prd_funnel_task) WHERE id='prd-funnel-monitor'; UPDATE remediation_contracts SET status='superseded' WHERE class='fm-prd-funnel-evidence';

CREATE TABLE IF NOT EXISTS bak_20261025_prd_funnel_task AS
SELECT * FROM fleet_tasks WHERE id='prd-funnel-monitor';

UPDATE fleet_tasks
SET definition=json_set(definition,'$.steps[1].sql',
  'INSERT INTO cloud_ops_events(id,ts,kind,text,meta,job,status) SELECT lower(hex(randomblob(16))),datetime(''now''),''prd-funnel-monitor'',''Publication funnel evidence measured; missing input remains unmeasured'',json_object(''missing_transitions'',missing_transitions,''attention_state'',attention_state,''stages'',json((SELECT json_group_array(json_object(''stage'',stage,''value'',value,''latest_at'',latest_at)) FROM v_prd_funnel_stages))),''prd-funnel-monitor'',''ok'' FROM v_prd_funnel_health'),
  version=2,updated_at=datetime('now')
WHERE id='prd-funnel-monitor' AND version=1;

INSERT OR IGNORE INTO remediation_contracts
  (class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module)
VALUES ('fm-prd-funnel-evidence','The PRD funnel observer is deployed',
  'Inspect the observer task and preserve six structured numeric stage records under the unchanged event secret guards',
  'SELECT 0 AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind=''prd-funnel-monitor'' AND julianday(ts)>=julianday(''now'',''-120 minutes'') AND json_valid(meta) AND json_array_length(CASE WHEN json_valid(meta) THEN meta END,''$.stages'')=6 AND COALESCE(json_extract(CASE WHEN json_valid(meta) THEN meta END,''$._truncated''),0)=0) THEN 0 ELSE 1 END AS observed',
  'd1-query',3,'qnfo-fleet-control',1,'active','prd-funnel-monitor-v1');

INSERT OR IGNORE INTO failure_modes
  (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,trigger_condition,symptom,blast_radius)
VALUES ('prd-funnel-evidence','Successful funnel observer loses stage metadata',
  'Freeform explanatory text in event metadata matches the existing secret-marker scrubber',
  'Record typed numeric stages and dates; keep explanations in the read-only view and leave secret guards intact',
  'fm-prd-funnel-evidence closing probe on cloud_ops_events','fm-prd-funnel-evidence',datetime('now'),
  'No six-stage event in the preceding 120 minutes','Successful fleet_run with scrubbed event','Funnel evidence only');

INSERT INTO decision_log
  (actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
SELECT 'copilot-af0ed947-quniverse-prd',
  'A successful observer needs readable evidence; event payloads need only aggregate typed values, not explanatory prose',
  'PRD-FUNNEL-EVIDENCE-1: preserve typed stage evidence without modifying secret controls',
  'fleet_run 31133 ok; cloud_ops_events stage metadata scrubbed; generated metadata matches ghp_ LIKE through the ordinary word throughput',
  'Task v2 registered; a new successful event must satisfy fm-prd-funnel-evidence',
  'One existing observer task, no secret-guard or permission changes',
  'Restore the task definition from bak_20261025_prd_funnel_task',
  'Readable stage history verified under production scrubbing',
  'Six stage records survive existing guards on the next observer run',
  'Publication coverage can be independently inspected over time',
  'Production task run, event metadata, secret trigger predicates and SQLite replay'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action='PRD-FUNNEL-EVIDENCE-1: preserve typed stage evidence without modifying secret controls');

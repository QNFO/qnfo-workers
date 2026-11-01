-- HA-DEGRADED-READ-1 (2026-11-01, issue 2607, charter pillar: reach).
-- Historical successful RUM responses returned only 5–7 groups instead of the usual 23–24, publishing false referral zeros and repeatedly reopening the metric issue. The current external referrals value is genuinely below target (30 versus 50); this guard protects measurement integrity and does not claim to increase traffic.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_rum_degraded_read_guard
-- Rollback: UPDATE remediation_contracts SET verify_probe=json_extract((SELECT state FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'),'$.verify_probe'),verify_transport=json_extract((SELECT state FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'),'$.verify_transport'),status=json_extract((SELECT state FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'),'$.status'),module=json_extract((SELECT state FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'),'$.module'),attempts=json_extract((SELECT state FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'),'$.attempts'),last_verdict=json_extract((SELECT state FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'),'$.last_verdict'),next_due_at=json_extract((SELECT state FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'),'$.next_due_at') WHERE class='issue-2607' AND EXISTS (SELECT 1 FROM bak_20261101_rum_degraded_read_guard WHERE kind='issue-contract' AND item_key='issue-2607'); DELETE FROM remediation_contracts WHERE class='fm-rum-degraded-read' AND NOT EXISTS (SELECT 1 FROM bak_20261101_rum_degraded_read_guard WHERE kind='failure-contract'); INSERT OR REPLACE INTO remediation_contracts (class,issue_id,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module,budget_ms,next_due_at,max_items,requires_container,attempts,last_verdict,deferred_since,last_attempt_at) SELECT json_extract(state,'$.class'),json_extract(state,'$.issue_id'),json_extract(state,'$.precondition'),json_extract(state,'$.action'),json_extract(state,'$.verify_probe'),json_extract(state,'$.verify_transport'),json_extract(state,'$.max_attempts'),json_extract(state,'$.escalate_to'),json_extract(state,'$.expected_cadence_h'),json_extract(state,'$.status'),json_extract(state,'$.module'),json_extract(state,'$.budget_ms'),json_extract(state,'$.next_due_at'),json_extract(state,'$.max_items'),json_extract(state,'$.requires_container'),json_extract(state,'$.attempts'),json_extract(state,'$.last_verdict'),json_extract(state,'$.deferred_since'),json_extract(state,'$.last_attempt_at') FROM bak_20261101_rum_degraded_read_guard WHERE kind='failure-contract'; DELETE FROM control_registry WHERE control='rum-degraded-read-guard' AND NOT EXISTS (SELECT 1 FROM bak_20261101_rum_degraded_read_guard WHERE kind='control'); INSERT OR REPLACE INTO control_registry (control,location,kind,guards_against,critical_path,disposition,disposition_state,alternate_path,alternate_tested_at,evidence,issue_id,reviewed_at) SELECT json_extract(state,'$.control'),json_extract(state,'$.location'),json_extract(state,'$.kind'),json_extract(state,'$.guards_against'),json_extract(state,'$.critical_path'),json_extract(state,'$.disposition'),json_extract(state,'$.disposition_state'),json_extract(state,'$.alternate_path'),json_extract(state,'$.alternate_tested_at'),json_extract(state,'$.evidence'),json_extract(state,'$.issue_id'),json_extract(state,'$.reviewed_at') FROM bak_20261101_rum_degraded_read_guard WHERE kind='control'; DELETE FROM failure_modes WHERE fm_key='rum-degraded-read' AND NOT EXISTS (SELECT 1 FROM bak_20261101_rum_degraded_read_guard WHERE kind='failure-mode'); INSERT OR REPLACE INTO failure_modes (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,issue_id,trigger_condition,symptom,blast_radius) SELECT json_extract(state,'$.fm_key'),json_extract(state,'$.failure_mode'),json_extract(state,'$.root_cause'),json_extract(state,'$.remediation'),json_extract(state,'$.detector'),json_extract(state,'$.probe_class'),json_extract(state,'$.first_seen'),json_extract(state,'$.issue_id'),json_extract(state,'$.trigger_condition'),json_extract(state,'$.symptom'),json_extract(state,'$.blast_radius') FROM bak_20261101_rum_degraded_read_guard WHERE kind='failure-mode'; DELETE FROM capability_ledger WHERE capability='guard anomalous bot-filtered human-audience RUM reads' AND NOT EXISTS (SELECT 1 FROM bak_20261101_rum_degraded_read_guard WHERE kind='capability'); INSERT OR REPLACE INTO capability_ledger (capability,provenance,prerequisites,reliability,acquired_at,last_exercised_at,evidence) SELECT json_extract(state,'$.capability'),json_extract(state,'$.provenance'),json_extract(state,'$.prerequisites'),json_extract(state,'$.reliability'),json_extract(state,'$.acquired_at'),json_extract(state,'$.last_exercised_at'),json_extract(state,'$.evidence') FROM bak_20261101_rum_degraded_read_guard WHERE kind='capability'

CREATE TABLE IF NOT EXISTS bak_20261101_rum_degraded_read_guard AS
SELECT 'issue-contract' AS kind, class AS item_key,
  json_object('verify_probe',verify_probe,'verify_transport',verify_transport,'status',status,'module',module,'attempts',attempts,'last_verdict',last_verdict,'next_due_at',next_due_at) AS state
FROM remediation_contracts WHERE class='issue-2607'
UNION ALL
SELECT 'failure-contract', class,
  json_object('class',class,'issue_id',issue_id,'precondition',precondition,'action',action,'verify_probe',verify_probe,'verify_transport',verify_transport,'max_attempts',max_attempts,'escalate_to',escalate_to,'expected_cadence_h',expected_cadence_h,'status',status,'module',module,'budget_ms',budget_ms,'next_due_at',next_due_at,'max_items',max_items,'requires_container',requires_container,'attempts',attempts,'last_verdict',last_verdict,'deferred_since',deferred_since,'last_attempt_at',last_attempt_at)
FROM remediation_contracts WHERE class='fm-rum-degraded-read'
UNION ALL
SELECT 'control', control,
  json_object('control',control,'location',location,'kind',kind,'guards_against',guards_against,'critical_path',critical_path,'disposition',disposition,'disposition_state',disposition_state,'alternate_path',alternate_path,'alternate_tested_at',alternate_tested_at,'evidence',evidence,'issue_id',issue_id,'reviewed_at',reviewed_at)
FROM control_registry WHERE control='rum-degraded-read-guard'
UNION ALL
SELECT 'failure-mode', fm_key,
  json_object('fm_key',fm_key,'failure_mode',failure_mode,'root_cause',root_cause,'remediation',remediation,'detector',detector,'probe_class',probe_class,'first_seen',first_seen,'issue_id',issue_id,'trigger_condition',trigger_condition,'symptom',symptom,'blast_radius',blast_radius)
FROM failure_modes WHERE fm_key='rum-degraded-read'
UNION ALL
SELECT 'capability', capability,
  json_object('capability',capability,'provenance',provenance,'prerequisites',prerequisites,'reliability',reliability,'acquired_at',acquired_at,'last_exercised_at',last_exercised_at,'evidence',evidence)
FROM capability_ledger WHERE capability='guard anomalous bot-filtered human-audience RUM reads';

INSERT OR IGNORE INTO control_registry
  (control,location,kind,guards_against,critical_path,disposition,disposition_state,alternate_path,alternate_tested_at,evidence,issue_id)
VALUES
  ('rum-degraded-read-guard','qnfo-fleet-dashboard refreshHumanAudience','guard','a successful but incomplete RUM response overwriting an accepted human-referral metric',0,'keep','applied','On unreadable guard state or an unwritable degraded-read ledger, retain the existing RUM measurement path and mark the accepted row when possible.','2026-11-01','Historical RUM reads returned 5–7 groups instead of the usual 23–24; one anomalous response is held, then accepted on the next read. Worker test exercises the hold and expiry; D1 lookup failure is fail-open.',2607);

INSERT OR IGNORE INTO failure_modes
  (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,issue_id,trigger_condition,symptom,blast_radius)
VALUES
  ('rum-degraded-read','an incomplete successful bot-filtered RUM read overwrites human-audience metrics','Web Analytics has returned partial group sets that passed the existing error and group-limit checks','HA-DEGRADED-READ-1 compares against accepted history, records a corroborated anomaly separately, and accepts the next read','a current metric value has a matching human-audience ledger row with guard=ok','fm-rum-degraded-read','2026-11-01',2607,'RUM group coverage and referral totals collapse against accepted data','a false zero or false breach in external referrals','HUMAN-AUDIENCE-1 metric history and issue recovery');

INSERT OR IGNORE INTO remediation_contracts
  (class,issue_id,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module)
VALUES
  ('fm-rum-degraded-read',NULL,'HA-DEGRADED-READ-1','failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events e JOIN metric_registry m ON m.metric = ''external_referred_pageviews_7d'' WHERE e.kind = ''human-audience'' AND json_extract(e.meta, ''$.guard'') = ''ok'' AND e.ts = m.last_refreshed AND datetime(e.ts) >= datetime(''now'', ''-2 hours'')) THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query',3,'qnfo-fleet-control',1,'active','failure-mode');

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = 1820) = 0 AND CAST((SELECT val FROM v_metric_trigger_state WHERE id = 1820) AS REAL) >= 50 AND datetime((SELECT last_refreshed FROM metric_registry WHERE metric = ''external_referred_pageviews_7d'')) >= datetime(''now'', ''-2 hours'') AND EXISTS (SELECT 1 FROM cloud_ops_events e WHERE e.kind = ''human-audience'' AND json_extract(e.meta, ''$.guard'') = ''ok'' AND e.ts = (SELECT last_refreshed FROM metric_registry WHERE metric = ''external_referred_pageviews_7d'')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events d WHERE d.kind = ''human-audience-degraded'' AND d.ts > (SELECT ts FROM cloud_ops_events WHERE kind = ''human-audience'' ORDER BY ts DESC LIMIT 1)) THEN ''1'' ELSE ''0'' END AS observed',
    verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0,
    next_due_at = datetime('now'), module = 'ha-degraded-read-1'
WHERE class = 'issue-2607' AND issue_id = 2607;

INSERT OR IGNORE INTO capability_ledger
  (capability,provenance,prerequisites,reliability,acquired_at,last_exercised_at,evidence)
VALUES
  ('guard anomalous bot-filtered human-audience RUM reads','HA-DEGRADED-READ-1 (issue 2607)','accepted RUM event history and cloud_ops_events','one anomalous read held; next read accepted; state lookup and ledger write fail open','2026-11-01',NULL,'qnfo-fleet-dashboard/human-audience.test.mjs; runtime marker in cloud_ops_events human-audience meta.guard');

INSERT INTO decision_log
  (actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
SELECT 'github-copilot',
  'partial RUM groups can publish a false zero, but low external traffic can also be genuine and must remain visible',
  'HA-DEGRADED-READ-1: hold a corroborated anomalous read once, preserve the prior metric, then accept the next result with provenance',
  'Historical successful reads returned 5–7 groups versus the usual 23–24; live qnfo-audit read on 2026-11-01 shows external_referred_pageviews_7d=30 against target 50',
  'branch change; verify after CI migration and canonical deployment',
  'human-audience metric writes and issue 2607 probe',
  'Rollback in migrations/2026-11-01-rum-degraded-read-guard.sql restores the probe and prior guard records; decision_log is append-only',
  'a one-read-expiring RUM integrity guard with a separate degraded-read ledger',
  'partial reads no longer immediately overwrite accepted referral metrics; genuine low referral values remain visible, so this does not itself increase traffic',
  'preserves trustworthy reach measurement; no immediate pageview increase predicted',
  'live D1 issue/metric/schema reads; offline human-audience and migration SQLite tests; live deployment not yet verified'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'HA-DEGRADED-READ-1:%');

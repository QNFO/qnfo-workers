-- PRD-FUNNEL-MONITOR-1, pillar reach, RM-FUNNEL-E2E-MONITOR-1, US-04/US-09.
-- Live reconciliation 2026-10-25: roadmap status not-built; no funnel fleet_task or metric.
-- Adds read-only stage evidence and a ten-minute observer on the existing fleet executor.
-- No conversion rate is inferred from unrelated totals, no public mutation or new Worker.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled=0 WHERE name='prd-funnel-monitor-10m'; UPDATE fleet_tasks SET enabled=0 WHERE id='prd-funnel-monitor'; UPDATE analytics_metric_triggers SET enabled=0 WHERE metric_key IN ('prd_funnel_missing_transitions','prd_funnel_monitor_stale'); UPDATE metric_registry SET state='RETIRED' WHERE metric IN ('prd_funnel_missing_transitions','prd_funnel_monitor_stale'); UPDATE remediation_contracts SET status='superseded' WHERE class='fm-prd-funnel-monitor'; views are additive and can remain.

CREATE VIEW IF NOT EXISTS v_prd_funnel_publications AS
SELECT q.id, q.paper_slug, q.published_at,
  CASE WHEN COALESCE(NULLIF(trim(q.doi),''),NULLIF(trim(e.doi),'')) IS NOT NULL THEN 1 ELSE 0 END AS has_deposit,
  CASE WHEN trim(COALESCE(e.page_url,''))<>'' THEN 1 ELSE 0 END AS has_page_mapping,
  CASE WHEN EXISTS (
    SELECT 1 FROM social_media_posts p
    WHERE p.status='published' AND trim(COALESCE(NULLIF(trim(p.post_id),''),p.buffer_id,''))<>''
      AND p.paper_doi=COALESCE(NULLIF(trim(q.doi),''),NULLIF(trim(e.doi),''))
  ) THEN 1 ELSE 0 END AS has_distribution,
  MAX(0, CAST((julianday('now')-julianday(q.published_at))*1440 AS INTEGER)) AS age_min
FROM research_queue q LEFT JOIN entity_map e ON e.slug=q.paper_slug
WHERE q.status='published' AND julianday(q.published_at)>=julianday('now','-30 days');

CREATE VIEW IF NOT EXISTS v_prd_funnel_publication_stages AS
SELECT 'publication' AS stage, 'research_queue' AS source, COUNT(*) AS value,
  MAX(published_at) AS latest_at, 'recorded publications, not publication throughput targets' AS limitation
FROM v_prd_funnel_publications
UNION ALL
SELECT 'deposit','research_queue.doi',SUM(has_deposit),MAX(published_at),
  'DOI presence only; external deposit availability requires a runtime probe'
FROM v_prd_funnel_publications
UNION ALL
SELECT 'page','research_queue + entity_map',SUM(has_page_mapping),MAX(published_at),
  'URL mapping only; page and PDF content require runtime probes'
FROM v_prd_funnel_publications
UNION ALL
SELECT 'distribution','social_media_posts',SUM(has_distribution),MAX(published_at),
  'published platform identifier joined by DOI; unmatched posts do not prove delivery'
FROM v_prd_funnel_publications;

CREATE VIEW IF NOT EXISTS v_prd_funnel_stages AS
SELECT * FROM v_prd_funnel_publication_stages
UNION ALL
SELECT 'human_pageviews','reach_signals:cf-rum-human',SUM(value),MAX(date),
  'complete UTC days; human-labeled pageviews are not engaged sessions or per-publication conversions'
FROM reach_signals
WHERE source='cf-rum-human' AND entity_type='site' AND metric='pageviews' AND quality='human'
  AND date>=date('now','-30 days') AND date<date('now')
UNION ALL
SELECT 'confirmed_subscribers','subscribers',COUNT(*),MAX(confirmed_at),
  'current confirmed subscribed stock across this ledger; not attributable conversions or merged brand audiences'
FROM subscribers WHERE status='subscribed' AND confirmed_at IS NOT NULL;

CREATE VIEW IF NOT EXISTS v_prd_funnel_health AS
SELECT
  (SELECT COUNT(*) FROM v_prd_funnel_publications
    WHERE age_min>120 AND (has_deposit=0 OR has_page_mapping=0 OR has_distribution=0)) AS missing_transitions,
  CASE WHEN EXISTS (
    SELECT 1 FROM fleet_runs WHERE task_id='prd-funnel-monitor' AND status='ok'
      AND julianday(finished_at)>=julianday('now','-120 minutes')
  ) THEN 0 ELSE 1 END AS monitor_stale,
  CASE WHEN EXISTS (
    SELECT 1 FROM v_prd_funnel_stages WHERE stage='human_pageviews'
      AND latest_at>=date('now','-1 day') AND value IS NOT NULL
  ) THEN 'measured' ELSE 'unmeasured' END AS attention_state;

INSERT OR IGNORE INTO metric_registry
  (metric,layer,kind,formula,source_of_truth,target,owner,disposition_actor,refresh_cadence,state)
VALUES
  ('prd_funnel_missing_transitions','operational','guard',
   'Published research_queue items in the last 30 days older than 120 minutes missing a DOI, page mapping or published platform identifier; count papers, not missing fields',
   'v_prd_funnel_publications','0','qnfo-fleet-control','fleet:prd-funnel-monitor','10m','UNMEASURED'),
  ('prd_funnel_monitor_stale','operational','guard',
   '1 unless a successful prd-funnel-monitor fleet_run finished in the last 120 minutes',
   'fleet_runs','0','qnfo-fleet-control','fleet:prd-funnel-monitor','10m','UNMEASURED');

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key,title,source_table,operator,threshold,priority,action,owner,queue_target,cooldown_hours,enabled,notes)
VALUES
  ('prd_funnel_missing_transitions','PRD-FUNNEL-TRANSITION-1: publication evidence missing','v_prd_funnel_health','>',0,2,
   'Inspect v_prd_funnel_publications for items older than 120 minutes with missing deposit, page or distribution evidence. The owning publication/distribution loop repairs the missing transition; do not manufacture platform IDs or count unmatched posts. Close only when missing_transitions=0 with recorded evidence.',
   'qnfo-fleet-control','agent_issues',1,1,'RM-FUNNEL-E2E-MONITOR-1; reach; no conversion inferred from totals'),
  ('prd_funnel_monitor_stale','PRD-FUNNEL-STALE-1: observer has no fresh successful run','v_prd_funnel_health','>',0,2,
   'Inspect fleet_runs error and fleet_crons prd-funnel-monitor-10m; restore the existing fleet executor task. Close on a successful run newer than 120 minutes and monitor_stale=0.',
   'qnfo-fleet-control','agent_issues',1,1,'Ten-minute observer, 120-minute freshness ceiling');

INSERT OR IGNORE INTO fleet_tasks (id,name,type,definition,timeout_ms,retries,version,enabled,updated_at)
VALUES ('prd-funnel-monitor','PRD publication funnel evidence observer','workflow',
  json_object('steps',json_array(
    json_object('name','measure','type','sql','db','AUDIT','sql',
      'UPDATE metric_registry SET last_value=CAST(CASE metric WHEN ''prd_funnel_missing_transitions'' THEN (SELECT missing_transitions FROM v_prd_funnel_health) ELSE (SELECT monitor_stale FROM v_prd_funnel_health) END AS TEXT),last_refreshed=datetime(''now''),state=''MEASURED'' WHERE metric IN (''prd_funnel_missing_transitions'',''prd_funnel_monitor_stale'')'),
    json_object('name','evidence','type','sql','db','AUDIT','sql',
      'INSERT INTO cloud_ops_events(id,ts,kind,text,meta,job,status) SELECT lower(hex(randomblob(16))),datetime(''now''),''prd-funnel-monitor'',''Publication funnel evidence measured; missing input remains unmeasured'',json_object(''missing_transitions'',missing_transitions,''attention_state'',attention_state,''stages'',json((SELECT json_group_array(json_object(''stage'',stage,''value'',value,''latest_at'',latest_at,''limitation'',limitation)) FROM v_prd_funnel_stages))),''prd-funnel-monitor'',''ok'' FROM v_prd_funnel_health;')
  )),30000,1,1,1,datetime('now'));

INSERT OR IGNORE INTO fleet_crons (name,cron_expr,task_id,enabled,timezone,updated_at)
VALUES ('prd-funnel-monitor-10m','*/10 * * * *','prd-funnel-monitor',1,'UTC',datetime('now'));

INSERT OR IGNORE INTO remediation_contracts
  (class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module)
VALUES ('fm-prd-funnel-monitor','PRD funnel observer is registered',
  'Restore prd-funnel-monitor task execution on fleet-exec; inspect fleet_runs errors',
  'SELECT 0 AS expected, monitor_stale AS observed FROM v_prd_funnel_health',
  'd1-query',3,'qnfo-fleet-control',1,'active','prd-funnel-monitor-v1');

INSERT OR IGNORE INTO failure_modes
  (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,trigger_condition,symptom,blast_radius)
VALUES ('prd-funnel-monitor','Publication funnel has no recurring stage observer',
  'RM-FUNNEL-E2E-MONITOR-1 remained not-built with no fleet task or registered metric',
  'Run the evidence-only observer every ten minutes and alert on missing transitions and stale execution',
  'SELECT monitor_stale FROM v_prd_funnel_health','fm-prd-funnel-monitor',datetime('now'),
  'No successful observer run in 120 minutes','Missing transitions are not accounted for','Reach measurement only; no publication or outreach is sent');

INSERT OR IGNORE INTO capability_ledger (capability,provenance,prerequisites,reliability,acquired_at,evidence)
VALUES ('prd-funnel-monitor','RM-FUNNEL-E2E-MONITOR-1; US-04/US-09',
  'Existing research_queue, entity_map, social_media_posts, reach_signals and fleet executor',
  'Fresh successful fleet_runs evidence required',datetime('now'),
  'Stage views distinguish recorded publications, DOI/page mappings, DOI-joined platform IDs, human pageviews and confirmed subscriber stock; missing attention remains unmeasured');

INSERT INTO decision_log
  (actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
SELECT 'copilot-af0ed947-quniverse-prd',
  'The PRD requires funnel evidence, not an inferred conversion rate or a duplicate subscription feature',
  'PRD-FUNNEL-MONITOR-1: register additive views and a ten-minute evidence-only observer',
  'Live 2026-10-25: RM-SUBSCRIBE-CTA-1 built; RM-FUNNEL-E2E-MONITOR-1 not-built; no funnel fleet_task or metric',
  'Registered; runtime success still requires a fresh successful fleet_run',
  'Existing D1 telemetry and fleet executor; no new Worker, external messages, data deletion or access changes',
  'Disable prd-funnel-monitor task/cron/triggers and retire its metrics',
  'Machine-checkable stage coverage and observer freshness',
  'A successful observer run and stage evidence become visible through existing D1 ledgers',
  'Missing publication transitions become actionable without treating aggregate audience totals as conversions',
  'Live charter, D1 schemas/tasks/metrics, code, work claims and dependency graph'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action='PRD-FUNNEL-MONITOR-1: register additive views and a ten-minute evidence-only observer');

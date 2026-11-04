-- OUTCOME-NORTHSTAR-2 (2026-11-04, pillar reach). Fixes OUTCOME-NORTHSTAR-1: v_outcome_northstar failed on read
-- ("no such column: created_at": ask_feedback has ts, not created_at), so its hourly trigger refreshed nothing.
-- Also adds the visitor outcomes that already live in reach_signals (the earlier note that no visitor data existed was
-- wrong: analytics_events is empty but reach_signals holds cf-rum-human pageviews and ga4 sessions).
-- Live read 2026-11-04: human pageviews 15129 (7d) vs 20761 (prior 7d); ga4 sessions 6512 vs 3540.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261104_outcome_northstar_view
-- Rollback: DROP VIEW IF EXISTS v_outcome_northstar; DELETE FROM metric_breach_cause WHERE metric_key IN ('human_pageviews_7d','ga4_sessions_7d'); DELETE FROM metric_registry WHERE metric IN ('human_pageviews_7d','ga4_sessions_7d'); CREATE VIEW v_outcome_northstar AS SELECT 1 AS metric, 1 AS value;

CREATE TABLE IF NOT EXISTS bak_20261104_outcome_northstar_view AS
SELECT name, sql FROM sqlite_master WHERE name='v_outcome_northstar';

DROP VIEW IF EXISTS v_outcome_northstar;
CREATE VIEW v_outcome_northstar AS
SELECT 'product_task_share_7d' AS metric,
  ROUND(1.0*SUM(NOT (path LIKE 'qnfo-fleet-control/%' OR path LIKE 'qnfo-ops/%' OR path LIKE 'qnfo-deploy-guard/%' OR path LIKE 'qnfo-code-orchestrator/%' OR path LIKE 'qnfo-cloud-ops/%' OR path LIKE 'qnfo-observability/%' OR path LIKE 'qnfo-github-steward/%' OR path LIKE 'scripts/%' OR path LIKE 'migrations/%' OR path LIKE '.github/%' OR goal LIKE '%probe%' OR goal LIKE '%METRIC-TRIGGER%' OR goal LIKE '%LOOP-%'))/COUNT(*),3) AS value
FROM code_tasks WHERE created_at>=datetime('now','-7 day')
UNION ALL
SELECT 'outreach_human_clicks_7d', COALESCE(SUM(human_clicks_7d),0) FROM v_channel_impact_7d
UNION ALL
SELECT 'reader_signal_7d', (SELECT count(*) FROM reader_reports WHERE created_at>=datetime('now','-7 day'))+(SELECT count(*) FROM ask_feedback WHERE ts>=datetime('now','-7 day'))
UNION ALL
SELECT 'human_pageviews_7d', COALESCE(SUM(value),0) FROM reach_signals WHERE source='cf-rum-human' AND metric='pageviews' AND date>=date('now','-7 day')
UNION ALL
SELECT 'ga4_sessions_7d', COALESCE(SUM(value),0) FROM reach_signals WHERE source='ga4' AND metric='sessions' AND date>=date('now','-7 day');

INSERT OR IGNORE INTO metric_registry(metric,layer,kind,formula,source_of_truth,target,owner,disposition_actor,refresh_cadence,state) VALUES
('human_pageviews_7d','outcome','target','sum of cf-rum-human pageviews over 7 days','reach_signals','non-decreasing','qnfo-social','managers','hourly','MEASURED'),
('ga4_sessions_7d','outcome','target','sum of ga4 sessions over 7 days','reach_signals','non-decreasing','qnfo-social','managers','hourly','MEASURED');

INSERT OR IGNORE INTO metric_breach_cause(metric_key,cause_key,note) VALUES
('human_pageviews_7d','code-loop','outcome north star: visitors'),
('ga4_sessions_7d','code-loop','outcome north star: visitors');

UPDATE metric_registry SET last_refreshed=strftime('%Y-%m-%dT%H:%M:%SZ','now'), state='MEASURED',
  last_value=CAST((SELECT value FROM v_outcome_northstar v WHERE v.metric=metric_registry.metric) AS TEXT)
WHERE metric IN ('product_task_share_7d','outreach_human_clicks_7d','reader_signal_7d','human_pageviews_7d','ga4_sessions_7d');

DROP TRIGGER IF EXISTS outcome_northstar_tick;
CREATE TRIGGER outcome_northstar_tick AFTER INSERT ON fleet_tick WHEN strftime('%M','now')<'10'
BEGIN
  UPDATE metric_registry SET last_refreshed=strftime('%Y-%m-%dT%H:%M:%SZ','now'), state='MEASURED',
    last_value=CAST((SELECT value FROM v_outcome_northstar v WHERE v.metric=metric_registry.metric) AS TEXT)
  WHERE metric IN ('product_task_share_7d','outreach_human_clicks_7d','reader_signal_7d','human_pageviews_7d','ga4_sessions_7d');
END;

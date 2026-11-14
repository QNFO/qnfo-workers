-- ANALYTICS-LOOP-1 (2026-11-14, charter pillar reach, autonomy; owner directive 2026-11-14: "I cannot rely on Google Analytics anymore because of opt-in procedures ... lean on Cloudflare to tell me and act on the
-- most important information that it knows ... Analytics are being way underutilized ... build those loops."). Cloudflare RUM (reach_signals source cf-rum-human) already records per-paper page views, external-referred
-- page views and referrers with no cookie and no consent gate; nothing acted on them. This loop reads 7 days against the 7 before for every published paper (SENSE), classifies rising, external_pull and fading (DIAGNOSE),
-- queues at most two demand-led follow-up research items a day to research_queue at score 0.95 (ACT, consumer: the research pipeline), settles every finding after 8 days against what the paper really got (VERIFY), and
-- raises or lowers its own rising threshold from the last 20 settled findings (WRITE-BACK, ops_config analytics_rise_min_views). Deterministic SQL, zero AI calls, hourly at :35.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'analytics-loop-hourly'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'analytics-loop'; UPDATE metric_registry SET state = 'RETIRED' WHERE metric IN ('analytics_trend_precision_28d', 'analytics_actions_7d'); UPDATE research_queue SET status = 'cancelled' WHERE source = 'analytics' AND status = 'queued';

CREATE TABLE IF NOT EXISTS analytics_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  entity TEXT NOT NULL,
  window_end TEXT NOT NULL,
  v7 REAL,
  v_prev7 REAL,
  ext7 REAL,
  predicted TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  action TEXT,
  action_ref TEXT,
  observed REAL,
  outcome TEXT,
  created_at TEXT,
  settled_at TEXT,
  UNIQUE (kind, entity, window_end)
);
CREATE INDEX IF NOT EXISTS idx_analytics_findings_status ON analytics_findings (status, created_at);

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES ('analytics_rise_min_views', '20', 'ANALYTICS-LOOP-1: the minimum 7-day views that make a paper rising; tuned by the loop from settled outcomes', datetime('now'));

CREATE VIEW IF NOT EXISTS v_analytics_paper_trend AS
WITH agg AS (
  SELECT entity_id AS slug,
    SUM(CASE WHEN metric = 'pageviews' AND date >= date('now','-7 days') THEN value ELSE 0 END) AS v7,
    SUM(CASE WHEN metric = 'pageviews' AND date < date('now','-7 days') THEN value ELSE 0 END) AS v_prev7,
    SUM(CASE WHEN metric = 'external_pageviews' AND date >= date('now','-7 days') THEN value ELSE 0 END) AS ext7
  FROM reach_signals
  WHERE source = 'cf-rum-human' AND entity_type = 'paper' AND metric IN ('pageviews','external_pageviews') AND date >= date('now','-14 days')
  GROUP BY entity_id)
SELECT a.slug, a.v7, a.v_prev7, a.ext7, pr.published_at,
  CASE
    WHEN a.ext7 >= 3 THEN 'external_pull'
    WHEN a.v7 >= CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'analytics_rise_min_views'), '20') AS REAL) AND a.v7 >= 2.0 * MAX(a.v_prev7, 1) THEN 'rising'
    WHEN a.v_prev7 >= CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'analytics_rise_min_views'), '20') AS REAL) AND a.v7 < 0.4 * a.v_prev7 THEN 'fading'
  END AS kind
FROM agg a JOIN paper_readership pr ON pr.slug = a.slug AND pr.published_at IS NOT NULL;

-- CAUSE-MAPPED: analytics_trend_precision_28d and analytics_actions_7d are informational with no trigger; the loop settles and tunes itself, and a loop that stops is caught by the fleet_crons heartbeat (LOOP-WATCH-1).
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES ('analytics_trend_precision_28d', 'external', 'target', 'share of settled analytics_findings (28 days) whose prediction held', 'qnfo-audit.analytics_findings (ANALYTICS-LOOP-1)', '>= 0.5', 'manager:reach', 'agent:analytics-loop', 'hourly', 'MEASURED', NULL, NULL),
('analytics_actions_7d', 'operational', 'target', 'COUNT(analytics_findings acted with a research_queue follow-up, 7 days)', 'qnfo-audit.analytics_findings (ANALYTICS-LOOP-1)', '>= 1', 'manager:reach', 'agent:analytics-loop', 'hourly', 'MEASURED', NULL, NULL);

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('analytics-loop', 'ANALYTICS-LOOP-1: Cloudflare analytics to findings, actions, settle and tune (SQL only)', 'workflow', '{"steps": [{"type": "sql", "name": "findings", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO analytics_findings (kind, entity, window_end, v7, v_prev7, ext7, predicted, status, created_at) SELECT t.kind, t.slug, date(''now''), t.v7, t.v_prev7, t.ext7, CASE WHEN t.kind = ''fading'' THEN ''next7 <= 1.5 * v7'' ELSE ''next7 >= 0.5 * v7'' END, ''open'', datetime(''now'') FROM v_analytics_paper_trend t WHERE t.kind IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analytics_findings f WHERE f.entity = t.slug AND f.kind = t.kind AND f.created_at >= datetime(''now'',''-7 days''))"}, {"type": "sql", "name": "act_research", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) SELECT ''an-'' || f.id, ''analytics'', f.entity || ''@'' || f.window_end, ''Demand-led follow-up to the published paper \"'' || f.entity || ''\": readers are arriving now ('' || CAST(f.v7 AS INTEGER) || '' views in 7 days, '' || CAST(f.ext7 AS INTEGER) || '' from outside the fleet). Extend it with the next question a reader of this paper would ask.'', ''analytics-loop '' || f.kind || '': '' || CAST(f.v7 AS INTEGER) || '' views in 7 days against '' || CAST(f.v_prev7 AS INTEGER) || '' before.'', 0.95, ''ACCEPT'', ''queued'', datetime(''now'') FROM analytics_findings f WHERE f.status = ''open'' AND f.kind IN (''rising'',''external_pull'') AND NOT EXISTS (SELECT 1 FROM analytics_findings g WHERE g.entity = f.entity AND g.status = ''acted'' AND g.created_at >= datetime(''now'',''-14 days'')) ORDER BY (f.ext7 * 3 + f.v7) DESC LIMIT MAX(0, 2 - (SELECT COUNT(*) FROM analytics_findings h WHERE h.status = ''acted'' AND h.action LIKE ''research_queue%'' AND date(h.created_at) = date(''now'')))"}, {"type": "sql", "name": "mark_acted", "db": "AUDIT", "sql": "UPDATE analytics_findings SET status = ''acted'', action = ''research_queue follow-up'', action_ref = ''an-'' || id WHERE status = ''open'' AND EXISTS (SELECT 1 FROM research_queue r WHERE r.id = ''an-'' || analytics_findings.id)"}, {"type": "sql", "name": "mark_fading", "db": "AUDIT", "sql": "UPDATE analytics_findings SET status = ''acted'', action = ''decay recorded; settles in 8 days and tunes the thresholds'', action_ref = NULL WHERE status = ''open'' AND kind = ''fading''"}, {"type": "sql", "name": "settle_observe", "db": "AUDIT", "sql": "UPDATE analytics_findings SET observed = (SELECT COALESCE(SUM(s.value), 0) FROM reach_signals s WHERE s.source = ''cf-rum-human'' AND s.entity_type = ''paper'' AND s.metric = ''pageviews'' AND s.entity_id = analytics_findings.entity AND s.date >= date(analytics_findings.created_at) AND s.date < date(analytics_findings.created_at, ''+7 days'')), status = ''settled'', settled_at = datetime(''now'') WHERE status IN (''open'',''acted'') AND created_at <= datetime(''now'',''-8 days'')"}, {"type": "sql", "name": "settle_outcome", "db": "AUDIT", "sql": "UPDATE analytics_findings SET outcome = CASE WHEN (kind = ''fading'' AND observed <= 1.5 * v7) OR (kind <> ''fading'' AND observed >= 0.5 * v7) THEN ''held'' ELSE ''missed'' END WHERE status = ''settled'' AND outcome IS NULL"}, {"type": "sql", "name": "tune_threshold", "db": "AUDIT", "sql": "UPDATE ops_config SET value = CAST(CASE WHEN (SELECT COUNT(*) FROM (SELECT outcome FROM analytics_findings WHERE kind = ''rising'' AND status = ''settled'' ORDER BY settled_at DESC LIMIT 20)) >= 10 AND (SELECT AVG(outcome = ''held'') FROM (SELECT outcome FROM analytics_findings WHERE kind = ''rising'' AND status = ''settled'' ORDER BY settled_at DESC LIMIT 20)) < 0.5 THEN ROUND(CAST(value AS REAL) * 1.25) WHEN (SELECT COUNT(*) FROM (SELECT outcome FROM analytics_findings WHERE kind = ''rising'' AND status = ''settled'' ORDER BY settled_at DESC LIMIT 20)) >= 10 AND (SELECT AVG(outcome = ''held'') FROM (SELECT outcome FROM analytics_findings WHERE kind = ''rising'' AND status = ''settled'' ORDER BY settled_at DESC LIMIT 20)) > 0.8 THEN MAX(5, ROUND(CAST(value AS REAL) * 0.9)) ELSE CAST(value AS REAL) END AS INTEGER), note = ''ANALYTICS-LOOP-1: the minimum 7-day views that make a paper rising; raised 25 percent when under half of the last 20 settled rising findings held, lowered 10 percent when over 80 percent did'', updated_at = datetime(''now'') WHERE key = ''analytics_rise_min_views'' AND updated_at < COALESCE((SELECT MAX(settled_at) FROM analytics_findings WHERE kind = ''rising'' AND status = ''settled''), '''')"}, {"type": "sql", "name": "metric_precision", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = (SELECT printf(''%.2f'', AVG(outcome = ''held'')) FROM analytics_findings WHERE status = ''settled'' AND settled_at >= datetime(''now'',''-28 days'')), last_refreshed = datetime(''now'') WHERE metric = ''analytics_trend_precision_28d''"}, {"type": "sql", "name": "metric_actions", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM analytics_findings WHERE status IN (''acted'',''settled'') AND action LIKE ''research_queue%'' AND created_at >= datetime(''now'',''-7 days'')) AS TEXT), last_refreshed = datetime(''now'') WHERE metric = ''analytics_actions_7d''"}]}', 60000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('analytics-loop-hourly', '35 * * * *', 'analytics-loop', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_fleet_runs_started_at; DROP INDEX IF EXISTS idx_alerts_undigested;
-- spof-review: no new component; two indexes and one statement rewrite with an identical answer.
-- charter-pillar: cost
-- CAUSE-MAPPED: no metric registered.
--
-- D1-READS-COST-7 (D1-ROWS-READ-COST-1, 2026-11-13). Live d1QueriesAdaptiveGroups, qnfo-audit, 11:00 to 12:00 UTC:
-- 1. fleet_runs (32 K rows) has no index that starts with started_at, so `WHERE started_at < ?1` (retention count,
--    1.15 M an hour) and the qnfo-observability freshness probe (864 K an hour) scan the table. One index.
-- 2. alerts `WHERE digested IS NULL ORDER BY id LIMIT ?` scans all 10 K rows (445 K an hour). A partial index holds only
--    the undigested ones.
-- 3. The metric-refresh fleet task runs about once a minute; its remedy_efficacy_30d term joined analytics_action_log to
--    v_metric_trigger_state per firing with a correlated latest-id subquery: 50 K rows a run (3 M an hour). Each trigger
--    votes once on its current state, so EXISTS over idx_aal_trigger_fired gives the same value (0.5266 both ways,
--    measured live) from 1.4 K rows.
CREATE INDEX IF NOT EXISTS idx_fleet_runs_started_at ON fleet_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_alerts_undigested ON alerts (id) WHERE digested IS NULL;
UPDATE fleet_tasks SET definition = replace(definition, 'SELECT CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END AS o FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id WHERE a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') AND a.status IN (''dispatched'', ''deduped'') AND a.id = (SELECT b.id FROM analytics_action_log b WHERE b.trigger_id = a.trigger_id AND b.fired_at >= datetime(''now'', ''-30 days'') AND b.fired_at < datetime(''now'', ''-7 days'') AND b.status IN (''dispatched'', ''deduped'') ORDER BY b.fired_at DESC, b.id DESC LIMIT 1) /* REMEDY-EFFICACY-PER-TRIGGER-1: one vote per trigger, the latest firing in the window decides */', 'SELECT CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END AS o FROM v_metric_trigger_state s WHERE EXISTS (SELECT 1 FROM analytics_action_log a WHERE a.trigger_id = s.id AND a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') AND a.status IN (''dispatched'', ''deduped'')) /* REMEDY-EFFICACY-PER-TRIGGER-1: one vote per trigger with a firing in the window (D1-READS-COST-7: 1.4 K rows, not 50 K) */'),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh' AND instr(definition, 'SELECT CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END AS o FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id WHERE a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') AND a.status IN (''dispatched'', ''deduped'') AND a.id = (SELECT b.id FROM analytics_action_log b WHERE b.trigger_id = a.trigger_id AND b.fired_at >= datetime(''now'', ''-30 days'') AND b.fired_at < datetime(''now'', ''-7 days'') AND b.status IN (''dispatched'', ''deduped'') ORDER BY b.fired_at DESC, b.id DESC LIMIT 1) /* REMEDY-EFFICACY-PER-TRIGGER-1: one vote per trigger, the latest firing in the window decides */') > 0;

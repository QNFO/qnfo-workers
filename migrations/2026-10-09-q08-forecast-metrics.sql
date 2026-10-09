-- Q08-FORECAST-1 (2026-10-09, pillar reach). q08-signal-engine 0.9.0 writes forecasts (most-likely scenario narratives built from a
-- published essay's mechanism, each with a dated, checkable resolution condition and a probability) and settles them itself when
-- the horizon passes: two judges from different model families read public evidence, and a forecast the evidence cannot settle
-- after four weekly checks is marked void in public. This registers the two guards that keep that loop honest, both written by
-- q08 writeOwnMetrics on every generation cron (no model call):
--   q08_forecasts_overdue_open  open forecasts more than 35 days past their horizon; the resolver should have settled or voided
--                               each by then (4 checks, 7 days apart), so anything above 0 means the resolver is stalled.
--   q08_forecast_void_share     void / (resolved + void); written only from 10 finished forecasts. Voids are not scored, so a
--                               high share would hide misses: the lever is better watch queries and watch urls in the prompt.
-- Idempotent (INSERT OR IGNORE; triggers only where none is enabled).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric IN ('q08_forecasts_overdue_open', 'q08_forecast_void_share'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('q08_forecasts_overdue_open', 'q08_forecast_void_share') AND notes = 'Q08-FORECAST-1 2026-10-09';
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('q08_forecasts_overdue_open', 'surface', 'guard', 'q08_forecasts rows with status open whose horizon is more than 35 days ago (q08 GET /api/metrics windows.7d.forecasts_overdue_open)', 'https://q08.org/api/metrics', '0 (2026-10-09, no forecasts yet)', '0', 'q08-signal-engine', 'analytics_metric_triggers q08_forecasts_overdue_open', '2h', '> 0', '> 3', 'UNMEASURED', NULL),
 ('q08_forecast_void_share', 'surface', 'guard', 'void / (resolved + void) over all q08_forecasts, written once at least 10 forecasts are finished (q08 GET /api/metrics windows.7d.forecast_void_share)', 'https://q08.org/api/metrics', 'unmeasured before 10 finished forecasts', '<= 0.5', 'q08-signal-engine', 'analytics_metric_triggers q08_forecast_void_share', '2h', '> 0.5', '> 0.8', 'UNMEASURED', NULL);

WITH v(metric_key, title, operator, threshold, priority, action, cooldown) AS (VALUES
  ('q08_forecasts_overdue_open', 'q08 has open forecasts more than 35 days past their horizon (resolver stalled)', 'gt', 0, 6,
   'Pillar reach. Read the rows: SELECT slug, horizon, checks, last_check_at FROM q08_forecasts WHERE status = ''open'' AND horizon <= date(''now'',''-35 days'') (q08-signal D1; GET https://q08.org/api/forecasts). Each should have been settled or voided after 4 weekly checks by resolveForecasts in the generation cron. Find why it did not (last_check_at, the cron, judge errors in the engine logs) and fix resolveForecasts; never mark a forecast resolved by hand without the evidence, and never delete one.', 24),
  ('q08_forecast_void_share', 'q08 voids more than half of its finished forecasts (evidence cannot settle them)', 'gt', 0.5, 6,
   'Pillar reach. Voided forecasts are unscored, so a high share hides misses. Read the dispositions: SELECT claim, resolution, watch_query, watch_urls, disposition FROM q08_forecasts WHERE status = ''void'' (q08-signal D1). Change FORECAST_DIRECTIVE in q08-signal-engine/worker.js so claims settle on public facts a search can find (sharper resolution conditions, better watch_query and watch_urls), or add an evidence source to gatherEvidence. Do not loosen the judges to resolve more.', 72)
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', v.operator, v.threshold, v.priority, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', 'q08-signal-engine', 'agent_issues', v.cooldown, 1, 'Q08-FORECAST-1 2026-10-09'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

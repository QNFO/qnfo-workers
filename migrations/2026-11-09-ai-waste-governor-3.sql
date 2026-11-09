-- AI-WASTE-GOVERNOR-3 (2026-11-09): review-gate findings on PR 8772 that hold. A purpose whose calls all errored books 0 neurons (AI-ATTR-FAILED-FREE-1) and was flagged unmetered; the 7-day window spanned 8 calendar days; the trigger create was not re-runnable.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS ai_waste_governor_tick_2; DROP VIEW IF EXISTS v_ai_waste_headline; DROP VIEW IF EXISTS v_ai_waste_by_purpose_7d
-- BACKUP: analytics_metric_triggers

DROP TRIGGER IF EXISTS ai_waste_governor_tick_2;
DROP VIEW IF EXISTS v_ai_waste_headline;
DROP VIEW IF EXISTS v_ai_waste_by_purpose_7d;

CREATE VIEW v_ai_waste_by_purpose_7d AS
SELECT worker, purpose,
  SUM(calls) AS calls,
  SUM(errors) AS errors,
  ROUND(COALESCE(SUM(neurons), 0)) AS neurons,
  ROUND(SUM(CASE WHEN calls > errors THEN errors * 1.0 * COALESCE(neurons, 0) / (calls - errors) ELSE 0 END)) AS error_waste_neurons,
  ROUND(SUM(CASE WHEN calls > errors THEN errors * 1.0 * COALESCE(neurons, 0) / (calls - errors) ELSE 0 END) / 1000.0 * 0.011, 2) AS error_waste_usd,
  CASE WHEN SUM(calls) >= 100 AND SUM(errors) < SUM(calls) AND COALESCE(SUM(neurons), 0) = 0 AND COALESCE(SUM(out_tok), 0) = 0 THEN 1 ELSE 0 END AS unmetered
FROM ai_call_counters
WHERE day >= date('now', '-6 day')
GROUP BY worker, purpose;

CREATE VIEW v_ai_waste_headline AS
SELECT
  COALESCE((SELECT ROUND(SUM(error_waste_neurons) / 1000.0 * 0.011, 2) FROM v_ai_waste_by_purpose_7d), 0) AS error_waste_usd_7d,
  (SELECT COUNT(*) FROM v_ai_waste_by_purpose_7d WHERE unmetered = 1) AS unmetered_purposes_7d,
  (SELECT COUNT(*) FROM research_queue WHERE terminal_rearms >= 5 AND COALESCE(status, '') NOT IN ('published', 'merged', 'deferred')) AS research_rows_over_4_cycles,
  ROUND((SELECT COUNT(*) FROM research_queue WHERE status = 'published' AND published_at >= date('now', '-6 day')) / 7.0, 1) AS published_per_day_7d;


CREATE TRIGGER IF NOT EXISTS ai_waste_governor_tick_2
AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT error_waste_usd_7d FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'ai_error_waste_usd_7d' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
  UPDATE metric_registry SET last_value = CAST((SELECT unmetered_purposes_7d FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'ai_unmetered_purposes_7d' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
  UPDATE metric_registry SET last_value = CAST((SELECT research_rows_over_4_cycles FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'research_rows_over_4_cycles' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
  UPDATE metric_registry SET last_value = CAST((SELECT published_per_day_7d FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'research_published_per_day_7d' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
END;

-- TRIGGER-PARSE-1 (2026-10-02). Pillar: core.
--
-- v_metric_trigger_state is the judge of every metric trigger. It read a value as a number only when the trimmed string
-- held nothing but digits, '.', '+' and '-', so a percentage written with its sign ("+348.89%", impressions_growth_30d)
-- was judged NULL: the trigger was blind in the view (and in metrics_in_breach, which counts the view) while
-- evaluateMetricTriggers in qnfo-fleet-control read the same value as 348.89. One trailing '%' is now dropped before the
-- test. Everything else that is not a plain number ("n/a", a sentence) stays NULL, and qnfo-fleet-control 0.4.99
-- (triggerNum) applies the same rule, so the evaluator and the judge agree.
--
-- Rollback: re-run the CREATE VIEW from migrations/2026-10-02-metric-closed-loop.sql.

DROP VIEW IF EXISTS v_metric_trigger_state;
CREATE VIEW v_metric_trigger_state AS
WITH raw AS (
  SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.queue_target, t.priority,
    COALESCE(
      CASE WHEN t.source_table = 'records' THEN (SELECT CASE WHEN rtrim(trim(x.value), '% ') <> '' AND rtrim(trim(x.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(x.value), '% ') AS REAL) END FROM analytics_dash_records x WHERE x.metric = t.metric_key) END,
      (SELECT CASE WHEN rtrim(trim(m.value), '% ') <> '' AND rtrim(trim(m.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(m.value), '% ') AS REAL) END FROM analytics_dash_meta m WHERE m.key = t.metric_key),
      (SELECT CASE WHEN rtrim(trim(r.last_value), '% ') <> '' AND rtrim(trim(r.last_value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(r.last_value), '% ') AS REAL) END FROM metric_registry r WHERE r.metric = t.metric_key)
    ) AS val
  FROM analytics_metric_triggers t WHERE t.enabled = 1
)
SELECT id, metric_key, title, operator, threshold, owner, queue_target, priority, val,
  CASE WHEN val IS NULL THEN NULL
       WHEN operator = 'gt' THEN val > threshold
       WHEN operator = 'lte' THEN val <= threshold
       WHEN operator = 'lt' THEN val < threshold
       WHEN operator = 'eq' THEN val = threshold
       ELSE val >= threshold END AS hit
FROM raw;

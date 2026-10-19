-- EMPTY-REPLY-RATE-ALERT-1 (agent_issues 2829, path B; RESOLVE-ALL-OPEN-1, owner directive 2026-10-19). Pillar autonomy.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS ai_model_error_rate_tick; DELETE FROM analytics_metric_triggers WHERE metric_key =
--           'ai_model_error_rate_max_1d'; DELETE FROM metric_registry WHERE metric = 'ai_model_error_rate_max_1d';
--
-- Why: ai_model_health proves reachability with a trivial prompt, so a model that answers empty under a real budget (a
-- reasoning model spending max_tokens on thought, finish=length, no content: REASONING-BUDGET-1) reads "ok" there and only
-- shows up as an error count in ai_call_counters, which nothing alerted on. Measured 2026-10-19 04:40Z from ai_call_counters:
-- @cf/qwen/qwen3.8-27b 63 errors of 78 calls on 2026-10-18 (0.808) and 8 of 13 today; @cf/zai-org/glm-5.3-flash 3170 of
-- 5418 on 2026-10-18 (0.585); @cf/moonshotai/kimi-k2.6 83 of 228 today (0.364). No issue was open for any of them.
-- What: one metric, refreshed on every fleet_tick (10-minute heartbeat, so the signal fires within one tick), the worst
-- per-model error share over yesterday and today (models with at least 20 calls in the window, so one failed call of two
-- does not page), and a trigger at 0.5 that files one deduped agent_issues row through evaluateMetricTriggers. Paths A
-- (budget-shaped health probe in ai-health-prober) and C (day-over-day jump) stay open on the issue.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('ai_model_error_rate_max_1d', 'operational', 'reliability',
  'max over models with SUM(calls) >= 20 in ai_call_counters for day >= date(now, -1 day) of SUM(errors) / SUM(calls) (an empty or failed reply is counted as an error by the callers that write ai_call_counters)',
  'qnfo-audit.ai_call_counters (EMPTY-REPLY-RATE-ALERT-1, migrations/2026-10-19-resolve-empty-reply-rate.sql)',
  '0.808 on 2026-10-19 04:40Z (@cf/qwen/qwen3.8-27b, 63 of 78 calls on 2026-10-18)',
  '<= 0.5: no model in rotation fails or answers empty on more than half its calls',
  'qnfo-ai', 'qnfo-fleet-control', 'hourly', '> 0.3', '> 0.5', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS ai_model_error_rate_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(COALESCE((
      SELECT MAX(r) FROM (
        SELECT ROUND(1.0 * SUM(errors) / SUM(calls), 3) AS r
        FROM ai_call_counters
        WHERE day >= date('now', '-1 day')
        GROUP BY model
        HAVING SUM(calls) >= 20)), 0) AS TEXT)
  WHERE metric = 'ai_model_error_rate_max_1d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'ai_model_error_rate_max_1d', 'AI model answers empty or fails on more than half its calls (ai_call_counters)', 'registry', 'gt', 0.5, 2,
  'Pillar autonomy (EMPTY-REPLY-RATE-ALERT-1, agent_issues 2829). Find the model: SELECT model, worker, purpose, SUM(calls) c, SUM(errors) e, ROUND(1.0*SUM(errors)/SUM(calls),3) r FROM ai_call_counters WHERE day >= date(''now'',''-1 day'') GROUP BY model, worker, purpose HAVING SUM(calls) >= 5 ORDER BY r DESC. Then: (1) when the errors are empty replies from a reasoning model (finish=length), raise that caller''s max_tokens or move the model behind a non-reasoning leg (REASONING-BUDGET-1); (2) when one caller dominates, demote the model in that caller''s ladder or hedge order and keep a per-request fallback to the previous model; (3) when every caller of the model fails, take it out of the qnfo-ai rotation until ai-health-prober passes it under a real budget. Done: ai_model_error_rate_max_1d <= 0.5 at two refreshes.',
  'qnfo-ai', 'agent_issues', 2, 1, 'EMPTY-REPLY-RATE-ALERT-1 (migrations/2026-10-19-resolve-empty-reply-rate.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'ai_model_error_rate_max_1d');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session:claude/resolve-open-issues-cmtzsy', 'a model failure that shows only as an error count is invisible until a metric reads that count',
  'EMPTY-REPLY-RATE-ALERT-1: metric ai_model_error_rate_max_1d refreshed on fleet_tick, trigger gt 0.5',
  'measured 2026-10-19 04:40Z: qwen3.8-27b 0.808 and glm-5.3-flash 0.585 error share on 2026-10-18 while no issue was open',
  'migration merged', 'one metric_registry row, one analytics_metric_triggers row, one fleet_tick trigger that writes only metric_registry', 'the Rollback header',
  'a model that answers empty or fails under real load files its own issue within one tick', 'the trigger files one issue on its first evaluation (current value 0.8)', 'none',
  'ai_call_counters, metric_registry, analytics_metric_triggers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'EMPTY-REPLY-RATE-ALERT-1:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:empty-reply-rate');

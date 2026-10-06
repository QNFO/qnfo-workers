-- Q08-STALL-METRIC-1 (2026-10-06, pillar reach, agent_issues 2034). Registers q08_hours_since_last_piece, written by
-- q08-signal-engine 0.8.10 writeOwnMetrics on every generation cron (hours since MAX(published_pieces.published_at),
-- rounded to 0.1; no model call). No analytics_metric_triggers row on purpose: q08 stallDetector already files and closes
-- the stall issue itself, so a trigger would file a duplicate. Idempotent (INSERT OR IGNORE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'q08_hours_since_last_piece';
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('q08_hours_since_last_piece', 'surface', 'guard', 'Hours since MAX(published_pieces.published_at) in q08-signal, rounded to 0.1 (q08 0.8.10 writeOwnMetrics, every generation cron)', 'https://q08.org/api/runs', 'unmeasured before 2026-10-06', '< 8 (a piece at least every 8 hours; judgement set 2026-10-06)', 'q08-signal-engine', 'q08-signal-engine stallDetector (agent_issues Q08-PUBLISH-STALL-AUTO-1)', '2h', '>= 8', '>= 24', 'UNMEASURED', NULL);

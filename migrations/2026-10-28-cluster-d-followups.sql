-- Cluster D follow-ups (2026-10-28, charter pillar autonomy; OWNER-NO-LOOSE-ENDS-1). Two defects found while draining the METRIC-TRIGGER / LOOP-BREAKER issues sit in files
-- under another session's live work claim (qnfo-ops/worker.js) or need the published-record rules of q08-signal-engine, so each is filed with a code-task doer.
-- 1. LOOP-BREAKER-1 1000700: a handled DeepSeek 429 (the fallback to the free model works, OPS-GW-429-FREE-1) is written to cloud_ops_events with status 'error', and
--    v_loop_breaker_signatures counts status 'error' rows, so a working fallback reads as a failing loop. Prediction: no 'upstream 429 at callDeepSeek' signature after the change.
-- 2. forecast_resolution_criteria_complete 1000671: forecasts 2, 3 and 4 (published 2026-10-26, before the criteria gate) name no edge-case rule; their resolution text is immutable
--    by trigger, so the honest fix is to void and republish them with complete criteria. Prediction: metric 0 -> 1.0 on the next bp26_forecast run.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'OPS-UPSTREAM-429-HANDLED-1:%' OR title LIKE 'FORECAST-CRITERIA-REPUBLISH-1:%';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'OPS-UPSTREAM-429-HANDLED-1: a handled DeepSeek 429 is logged as an info row, not as an error, so the loop breaker stops counting a working fallback',
 'Charter pillar: autonomy. Child of LOOP-BREAKER-1 issue 1000700. opsUpstreamError in qnfo-ops/worker.js inserts every upstream failure into cloud_ops_events with status error, including a 429 that the caller then serves from the free model (callDeepSeek breaks to budgetFallback on 429, OPS-GW-429-FREE-1). v_loop_breaker_signatures counts status error rows, so five handled 429s in 24 h filed LOOP-BREAKER-1. Change: when status is 429 insert the row with kind ops_upstream_throttle and status info (same text and meta, same 5-minute per-isolate dedupe); every other status keeps kind ops_upstream_error and status error. The reader near the ops_stream_abort code that looks up the newest ops_upstream_error keeps working because 429 is not a failure that ended a request. Add an offline test in qnfo-ops. Definition of done: the worker carries the new kind and no new upstream 429 at callDeepSeek signature appears in v_loop_breaker_signatures for 6 hours.
code-probe: {"paths": ["qnfo-ops/worker.js"], "contains": "ops_upstream_throttle"}
code-task: repo=qnfo-workers path=qnfo-ops/worker.js
code-anchor: VALUES (?1, ?2, ''ops_upstream_error'', ?3, ?4, ''qnfo-ops'', ''error'')',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'OPS-UPSTREAM-429-HANDLED-1:%' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'FORECAST-CRITERIA-REPUBLISH-1: void the open q08 forecasts whose resolution text fails the criteria gate and republish them with a source, a date and an edge-case rule',
 'Charter pillar: personal (q08 forecasts, q08-signal-engine). Metric forecast_resolution_criteria_complete (issue 1000671) reads 0 of 3: forecast 2 (PJM auction) lacks a source and an edge-case rule, forecasts 3 (TrendForce) and 4 (Broadcom) lack an edge-case rule. The published fields are immutable by trigger q08_forecasts_published_fields_immutable, so the text cannot be edited; the existing retraction path sets status void with a disposition (see the UPDATE q08_forecasts SET status = void in the retract code). Change: one idempotent sweep step in q08-signal-engine that, for each open forecast whose resolution fails validateForecast (the same three patterns as scripts/bp26_forecast.py), voids it with disposition superseded-incomplete-criteria and queues a replacement through the existing generator, whose prompt and validateForecast gate already require the three parts; it never touches a forecast that passes and never a resolved one. Offline test with a failing and a passing fixture. Definition of done: the sweep is in the worker, and the next bp26_forecast run reads forecast_resolution_criteria_complete at 1.0 (or no open failing forecast).
code-probe: {"paths": ["q08-signal-engine/worker.js"], "contains": "superseded-incomplete-criteria"}
code-task: repo=qnfo-workers path=q08-signal-engine/worker.js
code-anchor: function validateForecast(',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'FORECAST-CRITERIA-REPUBLISH-1:%' AND status = 'open');

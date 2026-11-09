-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE metric_key = 'pm_forecast_brier'; DELETE FROM metric_registry WHERE metric = 'pm_forecast_brier';
-- spof-review: q08-signal-engine reads the prediction-market program's public charter through a service binding; if that worker is down the value is null and the existing q08 metrics are unaffected. No new cron, trigger, host or credential.
-- TRIGGER-EXEMPT: pm_forecast_brier is a reading of the short-term prediction-market program's model Brier score, shown beside forecast_brier; whether the model beats the market price is judged by the program's own graduation gate and its metrics (pm_brier_gain with a trigger), so a second trigger here would file the same breach twice.
-- CAUSE-MAPPED: pm_forecast_brier maps to the existing cause key `measurement` in metric_breach_cause in this same file.
--
-- PM-Q08-TIE-1 (issue 8961, charter pillar personal): q08's own forecasts take 14 to 730 days to resolve, so its calibration moves slowly. The prediction-market program resolves questions in days;
-- q08-signal-engine 0.47.0 reads that calibration through the PM service binding and records the model's Brier score here once 30 questions have resolved, and shows it on /forecasts.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('pm_forecast_brier', 'surface', 'target', 'mean Brier score of the prediction-market program model over its resolved short-term questions (q08 GET /api/metrics windows.7d.pm_forecast_brier, read from https://markets.q08.org/api/charter calibration); null under 30 resolved', 'https://q08.org/api/metrics', 'null on 2026-11-09 (no question resolved yet)', 'below the market price Brier score (pm_brier_gain > 0)', 'q08-signal-engine', 'reported beside forecast_brier; the program judges the gap in its own graduation gate', '2h', 'none', 'none', 'UNMEASURED', NULL);

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('pm_forecast_brier', 'measurement', 'PM-Q08-TIE-1: the fast-resolving calibration reading');

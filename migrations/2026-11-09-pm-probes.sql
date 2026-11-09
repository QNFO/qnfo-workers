-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key IN ('pm_inconsistent_share','pm_lookahead_share'); DELETE FROM metric_breach_cause WHERE metric_key IN ('pm_inconsistent_share','pm_lookahead_share'); DELETE FROM metric_registry WHERE metric IN ('pm_inconsistent_share','pm_lookahead_share');
-- spof-review: the two metrics are read from the worker's own review loop; a failed publish to qnfo-audit is best effort and logged, so the tick still completes. No new cron, trigger, host or credential.
-- CAUSE-MAPPED: both metrics map to the existing cause key `measurement` in metric_breach_cause in this same file.
--
-- PM-PROBE-1 (issue 9107, charter pillar personal): q08-prediction-markets 1.7.0 asks one member, on a hashed 20 percent sample of markets, for the NO wording (its answer must sum with YES to 1 within 0.15) and
-- re-runs it with today moved back 30 days (the answer must not move by more than 0.2). The share of probed estimates that fail each check is published here so a model that has become inconsistent, or that uses
-- information from after the stated date, is seen by the fleet rather than only on the dashboard.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('pm_inconsistent_share', 'operational', 'guard', 'share of probed forecasts (a hashed 20 percent sample) whose NO-wording answer does not sum with the YES answer to 1 within 0.15; 0 until a forecast has been probed', 'q08-prediction-markets review loop (TRADES_DB pt_estimate.probe); GET https://markets.q08.org/api/charter probes', '0 on 2026-11-09', '< 0.25', 'q08-prediction-markets', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach', '*/5', '> 0.25', '> 0.5', 'NEW', 'runner'),
 ('pm_lookahead_share', 'operational', 'guard', 'share of probed forecasts whose answer moves by more than 0.2 when only the stated date is moved back 30 days (the model used information from after that date); 0 until a forecast has been probed', 'q08-prediction-markets review loop (TRADES_DB pt_estimate.probe); GET https://markets.q08.org/api/charter probes', '0 on 2026-11-09', '< 0.25', 'q08-prediction-markets', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach', '*/5', '> 0.25', '> 0.5', 'NEW', 'runner');

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('pm_inconsistent_share', 'measurement', 'PM-PROBE-1: the consistency probe failure rate'),
 ('pm_lookahead_share', 'measurement', 'PM-PROBE-1: the fake-date probe failure rate');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
 ('pm_inconsistent_share', 'Prediction-market forecasts contradict themselves across wordings', 'metric_registry', 'gt', 0.25, 3,
  'Pillar personal (PM-PROBE-1). More than a quarter of the probed forecasts give a YES and a NO answer that do not sum to 1 within 0.15. GET https://markets.q08.org/api/charter shows probes.inconsistent and the per-row probe in /api/state predictions. Those estimates are recorded as inconsistent and never traded, so this is a quality signal: check whether an ensemble member changed (the member list in each log row) and replace it, or lower the sampling tolerance only with the measurement that justifies it.
code-task: repo=qnfo-workers path=q08-prediction-markets/worker.js
code-anchor: export function probeVerdict(pYes, pNo, pFake, cfg = CFG) {',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'PM-PROBE-1'),
 ('pm_lookahead_share', 'Prediction-market forecasts use information from after the stated date', 'metric_registry', 'gt', 0.25, 3,
  'Pillar personal (PM-PROBE-1). More than a quarter of the probed forecasts move by more than 0.2 when only the stated date is moved back 30 days, which means the model is using what it knew after that date. GET https://markets.q08.org/api/charter shows probes.lookahead. The member that moved is dropped from the ensemble for that market already; if the share stays high, replace that model in ENSEMBLE or drop the market class from the universe.
code-task: repo=qnfo-workers path=q08-prediction-markets/worker.js
code-anchor: export function probeVerdict(pYes, pNo, pFake, cfg = CFG) {',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'PM-PROBE-1');

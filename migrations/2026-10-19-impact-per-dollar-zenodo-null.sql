-- IMPACT-PER-DOLLAR-NULL-1 (2026-10-19, charter pillar autonomy; METRIC-TRIGGER-4986 metrics_on_probation_overdue; METRIC-CLOSED-LOOP-1; metric_authorship probation)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = replace(definition, 'COALESCE(CAST((SELECT last_value FROM metric_registry WHERE metric=''zenodo_views_total'') AS REAL), 0.0) + 100.0', 'CAST((SELECT last_value FROM metric_registry WHERE metric=''zenodo_views_total'') AS REAL) + 100.0') WHERE name LIKE 'METRIC-REFRESH-1%'; UPDATE metric_authorship SET probation_until = '2026-10-19T08:02:17Z' WHERE metric IN ('ask_helpful_rate_30d', 'q08_forecast_void_share') AND status = 'probation'; DELETE FROM remediation_contracts WHERE class = 'fm-metric-refresh-null-component'; DELETE FROM failure_modes WHERE fm_key = 'metric-refresh-null-component'
-- Rollback scope: the fleet task text, two probation dates and the registry rows; the value written below is overwritten by the next METRIC-REFRESH-1 run; the decision_log row stays (append-only).
-- spof-review: none added. The refresh is the existing METRIC-REFRESH-1 task; the detector fm-metric-refresh-null-component is the second path.
--
-- MEASURED (qnfo-audit, 2026-10-19 15:30Z, SELECT only). metrics_on_probation_overdue reads 3: external_impact_per_dollar, ask_helpful_rate_30d, q08_forecast_void_share
-- (metric_authorship, probation_until 2026-10-19T08:02:17Z, graduation "a value at a refresh after probation_until, with its analytics_metric_triggers row or a named exemption").
--   * external_impact_per_dollar: the producer is broken. The METRIC-REFRESH-1 fleet task (version 1, 2026-10-06) writes cost_usd_30d / (pageviews_30d + zenodo_views_total +
--     100 * subscribers) every refresh, last_refreshed 2026-10-19T15:01:02Z and state OK. metric_registry has no zenodo_views_total row any more (the Zenodo path is retired,
--     NO-ZENODO-DOI-0; SELECT metric FROM metric_registry WHERE metric LIKE 'zenodo%' returns no rows), so the scalar subquery is NULL, the whole expression is NULL and last_value
--     is NULL after every run. The true value is 445.67 / (12090 + 100 * 4) = 0.03568 against the trigger 1519 (gt 0.012): a real breach that the NULL has been hiding.
--     This file makes the retired term 0, fills the value now, and leaves trigger 1519 to judge it.
--   * ask_helpful_rate_30d and q08_forecast_void_share: the producers work and the probation rule cannot be met by volume. qnfo-ai-search writes the helpful rate only from 10 ratings
--     (worker.js: Number(fb.n) >= 10 ? ... : null) and ask_feedback has 3 ratings in 30 days; q08 /api/metrics windows.7d reads forecasts_resolved 0, forecasts_void 1,
--     forecast_void_share null (written once 10 forecasts are finished). Neither is a refresher defect, and retiring them would drop live triggers 396 and 3498. Their probation
--     is extended 30 days (to 2026-11-18T08:02:17Z), which is the window of the first metric and the same ask volume rule for the second; the extension is a recorded decision with
--     its revert, not a graduation, and the metric stays on probation until a value exists.
--
-- WHAT THIS FILE DOES
--   1. METRIC-REFRESH-1: COALESCE(zenodo_views_total, 0) in the external_impact_per_dollar expression (one replace on the stored definition, guarded by instr).
--   2. writes the honest value now (the same formula) so the detector and the trigger read it before the next run.
--   3. extends probation_until for the two volume-gated metrics.
--   4. failure mode metric-refresh-null-component and detector fm-metric-refresh-null-component (a refreshed metric whose value is NULL while its inputs exist).
--   5. one decision_log row.

UPDATE fleet_tasks
   SET definition = replace(definition,
         'CAST((SELECT last_value FROM metric_registry WHERE metric=''zenodo_views_total'') AS REAL) + 100.0',
         'COALESCE(CAST((SELECT last_value FROM metric_registry WHERE metric=''zenodo_views_total'') AS REAL), 0.0) + 100.0')
 WHERE name LIKE 'METRIC-REFRESH-1%'
   AND instr(definition, 'CAST((SELECT last_value FROM metric_registry WHERE metric=''zenodo_views_total'') AS REAL) + 100.0') > 0;

UPDATE metric_registry
   SET last_value = CAST(ROUND(CAST((SELECT last_value FROM metric_registry WHERE metric = 'cost_usd_30d') AS REAL)
         / (CAST((SELECT last_value FROM metric_registry WHERE metric = 'pageviews_30d') AS REAL)
            + COALESCE(CAST((SELECT last_value FROM metric_registry WHERE metric = 'zenodo_views_total') AS REAL), 0.0)
            + 100.0 * (SELECT COUNT(*) FROM subscribers)), 5) AS TEXT),
       last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'OK'
 WHERE metric = 'external_impact_per_dollar' AND last_value IS NULL;

UPDATE metric_authorship
   SET probation_until = '2026-11-18T08:02:17Z'
 WHERE metric IN ('ask_helpful_rate_30d', 'q08_forecast_void_share') AND status = 'probation' AND probation_until = '2026-10-19T08:02:17Z';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('metric-refresh-null-component',
  'a metric refresh writes NULL every run because one input of its expression no longer exists, the metric reads refreshed and OK, and no trigger can ever fire on it',
  'external_impact_per_dollar adds CAST((SELECT last_value FROM metric_registry WHERE metric=''zenodo_views_total'') AS REAL) to its denominator; the Zenodo metrics were removed with the Zenodo path, so SQL NULL propagated through the sum and the division and the metric stayed NULL from the exit to 2026-10-19 while last_refreshed advanced',
  'IMPACT-PER-DOLLAR-NULL-1 (migrations/2026-10-19-impact-per-dollar-zenodo-null.sql): the retired term is COALESCEd to 0; a term of a refresh expression that can disappear is COALESCEd when it is written',
  'no metric_registry row has last_value NULL with last_refreshed inside 3 hours and state OK where its trigger is enabled and its authorship is overdue',
  'fm-metric-refresh-null-component', '2026-10-19', NULL,
  'a metric input row is deleted and the refresh expression has no COALESCE',
  'last_value NULL, state OK, last_refreshed current; metric_authorship probation overdue for a metric that "never produced a value"',
  'the metric and its trigger (external_impact_per_dollar, trigger 1519 gt 0.012): a breach of 0.0357 against 0.012 was invisible');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-metric-refresh-null-component', NULL, 'IMPACT-PER-DOLLAR-NULL-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM metric_registry r JOIN analytics_metric_triggers t ON t.metric_key = r.metric AND t.enabled = 1 JOIN metric_authorship a ON a.metric = r.metric AND a.status = ''probation'' WHERE r.last_value IS NULL AND r.state = ''OK'' AND r.last_refreshed > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a metric on probation is graduated by a value, so a refresh that can only write NULL is a producer defect; a metric whose value needs volume the fleet does not have yet keeps its probation, extended with a recorded reason, until the volume exists',
  'IMPACT-PER-DOLLAR-NULL-1: METRIC-REFRESH-1 COALESCEs the retired zenodo_views_total term; external_impact_per_dollar written now (0.03568); probation of ask_helpful_rate_30d and q08_forecast_void_share extended 30 days',
  'qnfo-audit 2026-10-19 15:30Z: no metric_registry row like zenodo%; external_impact_per_dollar last_value NULL with last_refreshed 15:01:02Z; cost_usd_30d 445.67, pageviews_30d 12090, subscribers 4; ask_feedback 3 ratings in 30 d; q08 /api/metrics forecasts_resolved 0 forecast_void_share null',
  'migration merged', 'one fleet task text, one metric value, two probation dates, two registry rows; metrics_on_probation_overdue falls from 3 to 0 within the hourly refresh; trigger 1519 will file a real breach (0.0357 against 0.012)',
  'the Rollback header restores the task text and both probation dates and deletes the registry rows',
  'a refreshed metric cannot sit at NULL unseen',
  'metrics_on_probation_overdue = 0 within 2 h',
  'none',
  'd1:qnfo-audit metric_registry, fleet_tasks and metric_authorship (SELECT only); offline node:sqlite suite migrations/detector-measurement-repairs.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'IMPACT-PER-DOLLAR-NULL-1:') = 1);

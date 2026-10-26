-- METRIC-SAMPLE-GATE-2 (2026-10-26, charter pillar autonomy; agent_issues 1000033, the closing probe added by migrations/2026-10-26-metric-sample-gate-1.sql).
-- WHAT WAS FOUND (own review of the probe, read 2026-10-26 19:45Z from live qnfo-audit): the contract issue-1000033 asserts that ask_helpful_rate_30d and q08_forecast_void_share are "both still on probation" (status = 'probation').
--   That holds for q08_forecast_void_share for as long as it has no value, but ask_helpful_rate_30d already has one (33.3). The kernel_registries_tick graduation rule is status = 'probation' AND probation_until < now AND a value exists,
--   and its probation_until is 2026-11-18T08:02:17Z: on that day it graduates, the probe reads "not both still on probation", and the issue that the probe closed on 2026-10-26T19:19:56Z is reopened by REMEDIATION-REOPEN-2
--   for a state that is no defect (a metric with a value that finished its probation). The probe's job is to keep the two rows visible (no retiring, no deleting, no dormant marking); a graduated row with a value is visible.
-- WHAT THIS FILE DOES: the one condition accepts status 'probation' or 'graduated' (a retired, deleted or missing row still fails), and the action text says so. The text is changed with replace() on the stored probe, guarded by instr() so a
--   probe another doer rewrote is left alone and a replay changes nothing; the Rollback is the exact inverse replace. next_due_at is set to now so the consumer re-reads it within its cadence.
-- PREDICTION: the contract passes at its next read (issue 1000033 stays closed), and still passes on 2026-11-18 when ask_helpful_rate_30d graduates; it fails if either metric is retired or deleted, if metrics_on_probation_overdue is not 0,
--   if the step probation-sample-gate is missing or metrics_awaiting_samples is stale for 180 minutes. Falsifier: issue 1000033 reopened after 2026-11-18 with the observed text "not both still tracked".
-- spof-review: none added. No DELETE or DROP runs in this file, and no backup table is needed because the Rollback is an exact inverse of the replace.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'AND status IN (''probation'', ''graduated'')) <> 2 THEN ''not met: ask_helpful_rate_30d and q08_forecast_void_share are not both still tracked (probation or graduated)''', 'AND status = ''probation'') <> 2 THEN ''not met: ask_helpful_rate_30d and q08_forecast_void_share are not both still on probation'''), action = replace(action, 'stay registered and tracked (on probation, or graduated once they hold a value)', 'stay registered and on probation') WHERE class = 'issue-1000033' AND module = 'metric-sample-gate-1' AND instr(verify_probe, 'AND status IN (''probation'', ''graduated'')) <> 2 THEN') > 0;

UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, 'AND status = ''probation'') <> 2 THEN ''not met: ask_helpful_rate_30d and q08_forecast_void_share are not both still on probation''', 'AND status IN (''probation'', ''graduated'')) <> 2 THEN ''not met: ask_helpful_rate_30d and q08_forecast_void_share are not both still tracked (probation or graduated)'''),
    action = replace(action, 'stay registered and on probation', 'stay registered and tracked (on probation, or graduated once they hold a value)'),
    next_due_at = datetime('now')
WHERE class = 'issue-1000033' AND module = 'metric-sample-gate-1'
  AND instr(verify_probe, 'AND status = ''probation'') <> 2 THEN ''not met: ask_helpful_rate_30d and q08_forecast_void_share are not both still on probation''') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a2 (remediation session 2026-10-26)',
  'a closing probe must assert the defect is gone, not freeze a state that ends by itself: a metric with a value graduates when its probation ends, and that is not a relapse',
  'METRIC-SAMPLE-GATE-2: the closing probe of agent_issues 1000033 accepts status probation or graduated for ask_helpful_rate_30d and q08_forecast_void_share (retired, deleted or missing rows still fail)',
  'read 2026-10-26 19:45Z from live qnfo-audit: ask_helpful_rate_30d has a value (33.3) and probation_until 2026-11-18T08:02:17Z, kernel_registries_tick graduates a probation row with a value once probation_until has passed, the probe required status probation',
  'applied through the canonical path on merge: the contract passes at its next read and still passes after 2026-11-18',
  'one remediation_contracts row (verify_probe and action text of class issue-1000033, next_due_at), no trigger, worker, metric, cap or guard threshold changed',
  'the Rollback header of migrations/2026-10-26-metric-sample-gate-2.sql is the exact inverse replace of the two texts',
  'closing-probe-without-a-time-bomb',
  'issue 1000033 stays closed through 2026-11-18; the contract reads ok at its next verification',
  NULL,
  'node:sqlite replay (migrations/metric-sample-gate-2.test.mjs) after migrations/2026-10-26-metric-sample-gate-1.sql: the old probe fails on a graduated metric, the new one passes, a retired or deleted row still fails, a replay changes nothing, the Rollback restores both texts byte for byte; apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor LIKE 'rem-a2%' AND instr(action, 'METRIC-SAMPLE-GATE-2') > 0);

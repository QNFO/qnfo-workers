-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET target = '0; trigger floor is the first measured value' WHERE metric = 'roster_capabilities_single_executor'; UPDATE analytics_metric_triggers SET threshold = 158, action = REPLACE(REPLACE(action, 'Zero is structurally unachievable; use a ratchet target at or below 157 (measured 2026-10-18), with critical-path coverage tracked by spofs_total.', 'The threshold is the count measured when this trigger was created; the target is 0.'), 'AND capability NOT LIKE ''worker:%'' ', '') WHERE metric_key = 'roster_capabilities_single_executor';
-- ROSTER-CAPABILITY-RATCHET-1 (issue 2447, charter pillar core): keep the trigger aligned with the measured ratchet, not an impossible zero.
UPDATE metric_registry
   SET target = 'ratchet: never above 157 (measured 2026-10-18); growth fires, reduction is the goal, 0 is not achievable by design. Critical-path coverage tracked by spofs_total'
 WHERE metric = 'roster_capabilities_single_executor';

UPDATE analytics_metric_triggers
   SET threshold = 157,
       action = REPLACE(
         REPLACE(action,
           'The threshold is the count measured when this trigger was created; the target is 0.',
           'Zero is structurally unachievable; use a ratchet target at or below 157 (measured 2026-10-18), with critical-path coverage tracked by spofs_total.'),
         'WHERE kind IN (''worker'', ''model'') GROUP BY capability',
         'WHERE kind IN (''worker'', ''model'') AND capability NOT LIKE ''worker:%'' GROUP BY capability')
 WHERE metric_key = 'roster_capabilities_single_executor';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-metric-trigger-4992',
       'The roster counts every named worker/model capability, so a zero target is structurally unachievable; the measured ratchet is 157.',
       'ROSTER-CAPABILITY-RATCHET-1: align the metric target and trigger action with the measured ratchet of 157, and keep the live breach visible.',
       'qnfo-audit read 2026-11-01: roster_capabilities_single_executor last_value 179; metric_registry target ratchet 157; analytics_metric_triggers threshold 158 and action still said target 0. Issue 2447 records that 58 named capabilities were acquired in seven days and identifies critical-path coverage as spofs_total.',
       'applied by migration',
       'metric_registry target and analytics_metric_triggers threshold/action; the current value is not rewritten.',
       'the Rollback line restores the previous target, threshold, and action wording.',
       'the metric contract retains a truthful target and its diagnostic query matches the metric universe.',
       'the metric remains 179 and above the 157 ratchet until genuine redundancy work lands; no breach is hidden.',
       NULL,
       'read-only qnfo-audit D1 query; node migrations/roster-capability-ratchet.test.mjs'
 WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'ROSTER-CAPABILITY-RATCHET-1:%');

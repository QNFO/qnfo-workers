-- COST-TRIGGER-TITLE-1 (pillar cost; BRIEF4 investigator, session_01JADz8uHqYt9eUMBTwbbBE6). The titles of two cost triggers still carry
-- the thresholds COST-BUDGET-RECALIBRATION-1 replaced on 2026-10-09 (migrations/2026-10-09-15-cost-budget-recalibration.sql moved
-- the thresholds of triggers 354 and 409 from 10 and 15 to 95 and left the title text alone). Measured 2026-10-19 15:30Z in
-- qnfo-audit: analytics_metric_triggers 354 title "Cost gap: Workers AI cost over $10/30d (target $7.50)" with threshold 95 and
-- metric_registry.target "<= 95 (realistic: 2.59/day = 78/30d)"; trigger 409 title "...above $15/30d" with threshold 95. The title is
-- copied into every new METRIC-TRIGGER issue (qnfo-fleet-control evaluateMetricTriggers: "METRIC-TRIGGER-<id>-<KEY>: " + title.slice(0, 80)),
-- so a reader of issue 99924 sees a $10 limit against a 95 threshold and a measured 178. The threshold (95) is the live one; only
-- the wording is wrong. Nothing is re-defined: thresholds, operators and formulas are unchanged, so no breach is hidden and the
-- value of both metrics is unaffected. An issue is matched by its "METRIC-TRIGGER-<id>-" prefix (evaluateMetricTriggers and
-- TRIGGER-RECOVERY-1 both use LIKE 'METRIC-TRIGGER-<id>-%'), so the new title files no duplicate of an open issue.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET title = 'Cost gap: Workers AI cost over $10/30d (target $7.50)' WHERE id = 354 AND metric_key = 'workers_ai_cost_30d_usd'; UPDATE analytics_metric_triggers SET title = 'Fleet AI run-rate above $15/30d (the fleet''s own live spend)' WHERE id = 409 AND metric_key = 'fleet_ai_run_rate_30d_usd';

UPDATE analytics_metric_triggers
   SET title = 'Cost gap: Workers AI cost over $95/30d (target $78 = 2.59/day, owner 2026-10-09)',
       notes = COALESCE(notes, '') || ' | COST-TRIGGER-TITLE-1 2026-10-19: title said $10/30d (target $7.50); the live threshold is 95 since COST-BUDGET-RECALIBRATION-1'
 WHERE id = 354 AND metric_key = 'workers_ai_cost_30d_usd' AND title LIKE '%$10/30d%';

UPDATE analytics_metric_triggers
   SET title = 'Fleet AI run-rate above $95/30d (the fleet''s own live spend)',
       notes = COALESCE(notes, '') || ' | COST-TRIGGER-TITLE-1 2026-10-19: title said $15/30d; the live threshold is 95 since COST-BUDGET-RECALIBRATION-1'
 WHERE id = 409 AND metric_key = 'fleet_ai_run_rate_30d_usd' AND title LIKE '%$15/30d%';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6', 'A trigger title is wording copied into new issues; the threshold column is what the evaluator judges, so correcting the wording moves no metric and hides no breach',
 'COST-TRIGGER-TITLE-1: corrected the stale dollar limits in the titles of analytics_metric_triggers 354 and 409 to the live threshold 95 (COST-BUDGET-RECALIBRATION-1)',
 'qnfo-audit 2026-10-19 15:30Z: trigger 354 threshold 95 vs title $10/30d; trigger 409 threshold 95 vs title $15/30d; metric_registry workers_ai_cost_30d_usd target <= 95; v_metric_trigger_state val 178.03 and 474.45, both hit=1 before and after',
 'pending', 'wording of two analytics_metric_triggers rows and the title of any issue those triggers file from now on; open issues 99924, 2731 and 99928 keep their titles',
 'UPDATE analytics_metric_triggers SET title back to the old text (rollback line of this migration)',
 NULL, 'workers_ai_cost_30d_usd > 95 within 24 h', NULL, 'analytics_metric_triggers, v_metric_trigger_state, evaluateMetricTriggers title prefix match'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE instr(d.action, 'COST-TRIGGER-TITLE-1:') = 1);

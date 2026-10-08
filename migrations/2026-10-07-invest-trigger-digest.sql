-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET queue_target = 'agent_issues' WHERE id = 11;
-- INVEST-TRIGGER-DIGEST-1 (2026-10-07, pillar autonomy; METRIC-CLOSED-LOOP-1: a loop that acts on its own metric points its
-- trigger at the digest so a breach is not filed twice).
-- qnfo-fleet-dashboard INVEST-DECISION-1 files its own advisory issue for a SCALE_BACK or KILL verdict (agent_issues 1836,
-- reopened by REMEDIATION-REOPEN-1 while the verdict holds, with the reasons, levers and flips of /api/decision), and
-- trigger 11 (invest_decision_level gte 2, cooldown 24h) filed a second row for the same signal (agent_issues 2124,
-- 2026-10-07, closed as its duplicate). The trigger now raises the digest alert only (evaluateMetricTriggers: every
-- queue_target other than agent_issues is a digest alert naming the target); the dashboard's row stays the record.
UPDATE analytics_metric_triggers
   SET queue_target = 'digest',
       notes = COALESCE(notes, '') || ' | INVEST-TRIGGER-DIGEST-1 2026-10-07: digest only; INVEST-DECISION-1 (qnfo-fleet-dashboard) files its own issue for this verdict'
 WHERE id = 11 AND queue_target = 'agent_issues';

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET target = '0 continue, 1 continue-at-risk, 2 scale back, 3 stop, -1 unknown (advisory; owner decides)' WHERE metric = 'invest_decision_level'; DELETE FROM failure_modes WHERE fm_key = 'two-closers-disagree'; DELETE FROM remediation_contracts WHERE class = 'fm-two-closers-disagree'
-- LOOP-ISSUE-FLAP-1 (2026-10-13, pillar autonomy, failure mode two-closers-disagree). Three issues were closed and reopened 12 to
-- 15 times in 24 hours (issue_lifecycle): METRIC-FIX-RELAPSED-1: invest_decision_level (2087), METRIC-REGRESSION-1:
-- impressions_growth_30d (2327) and METRIC-REGRESSION-1: human_wait_oldest_days (2322). Each hour the remediation tick closed
-- the issue on its contract (the metric's current value inside a target) and qnfo-fleet-control IMPROVEMENT-LOOP-1 refiled it
-- on its own rule, which issue_refile_reopen turned into a reopen. Two closers judged one issue by different rules:
-- (1) invest_decision_level: the registry target text "0 continue, 1 continue-at-risk, ..." parses (charterTarget) as "<= 0",
--     so the loop read level 1 as off target, while its alert trigger fires only at >= 2 and the issue contract (rewritten on
--     2026-10-12 by this session) accepted <= 1. The registry target now states the alert's own rule, "<= 1".
-- (2) a METRIC-REGRESSION-1 issue is the loop's finding about a 7-day trend; its contract had been rewritten to judge the
--     current value against the target, which a regression issue does not claim. The loop already closes its own issues when
--     a finding clears, so the contracts of every open loop-filed issue (METRIC-REGRESSION-1 and METRIC-FIX-RELAPSED-1) now
--     read the loop's latest findings, and the two closers agree.
UPDATE metric_registry SET target = '<= 1 (advisory scale: 0 continue, 1 continue-at-risk, 2 scale back, 3 stop, -1 unknown; the alert fires at >= 2; owner decides)' WHERE metric = 'invest_decision_level';
UPDATE remediation_contracts SET verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT state_json FROM improvement_loop_runs ORDER BY id DESC LIMIT 1) IS NULL THEN ''pending: no improvement loop run recorded'' WHEN (SELECT state_json FROM improvement_loop_runs ORDER BY id DESC LIMIT 1) LIKE ''%"'' || (SELECT title FROM agent_issues WHERE id = ' || CAST(issue_id AS TEXT) || ') || ''"%'' THEN ''the improvement loop still finds this in its latest run (IMPROVEMENT-LOOP-1 closes it when the finding clears)'' ELSE ''ok'' END AS observed',
  status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE status = 'open' AND (title LIKE 'METRIC-REGRESSION-1:%' OR title LIKE 'METRIC-FIX-RELAPSED-1:%'));
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius)
VALUES ('two-closers-disagree', 'two closers judge one issue by different rules, so it is closed and reopened every hour',
  'the remediation contract of a loop-filed issue judged the metric against its target while IMPROVEMENT-LOOP-1 judged a trend or parsed a different target from the registry text; issue_refile_reopen turned each refile into a reopen (2087, 2322, 2327: 12-15 reopens in 24 h)',
  'LOOP-ISSUE-FLAP-1: contracts of loop-filed issues read the loop''s latest findings; registry targets state the rule the alert uses',
  'fm-two-closers-disagree: no open issue reopened 3 or more times in 24 h', 'fm-two-closers-disagree', '2026-10-13',
  'issue_lifecycle churn, open_agent_issues and mttr inflated, fix_hold_rate distorted', 'every metric issue whose filer and closer differ');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-two-closers-disagree', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT l.issue_id FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE a.status = ''open'' AND l.event = ''reopened'' AND l.ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY l.issue_id HAVING COUNT(*) >= 3)) AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'LOOP-ISSUE-FLAP-1', 'failure-mode detector', 'qnfo-fleet-control');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'one issue has one closing rule: the filer that judges a finding is the rule its contract mirrors',
   'LOOP-ISSUE-FLAP-1: invest_decision_level registry target states the alert rule (<= 1); contracts of open loop-filed issues mirror the improvement loop''s latest findings; failure mode two-closers-disagree with a detector',
   'issue_lifecycle 24 h: 2087 reopened 15 times, 2327 13, 2322 12; metric_history invest_decision_level meets 0 at value 1 (target text parsed as <= 0) while trigger 494-type alert is gte 2 and the contract accepted <= 1 (this session''s 2026-10-12 rewrite)',
   'merged through the canonical path', 'three issues stop flapping; loop-filed issues close only when the loop clears them', 'the Rollback line of this file',
   'an issue stays closed or open on one rule', 'within 2 hours 2087 closes and stays closed; 2322 and 2327 stay open while the loop still finds their regression and close when it clears; fm-two-closers-disagree reads 0 within 24 h', 'none', 'd1:issue_lifecycle, metric_history, improvement_loop_runs');

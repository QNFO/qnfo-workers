-- VERIFICATION-DEFERRAL-HONEST-2 (2026-10-26, charter pillar autonomy; agent_issues 1000278, 1000279, 1000323, 1000324, 1000406, 1000461 VERIFICATION-DEFERRED-7D-1, and VERIFICATION-DEFERRAL-STALL-1 2954).
-- WHAT WAS FOUND (read 2026-10-26 from live qnfo-audit, read-only):
--   qnfo-fleet-control VERIFICATION-PATH-1 files one VERIFICATION-DEFERRED-7D-1 issue for a contract that has read 'pending' for 7 days, and its Lever line offers three exits: supply what the probe waits for,
--   change the probe so it measures the defect now, or park the contract with a recorded decision. Nine goal-dod-v1 contracts (issue_id NULL, probe = the DoD query of the goal, copied from goals.dod by the
--   hourly contracts-sync step of fleet_tasks roadmap-self-maintain) and one loop-owned issue contract had deferred since 2026-10-19/20:
--     goal-TP-6-DURABLE-EXECUTION-1 (1000278), goal-CONNECTION-ENGAGEMENT-1 (1000279), goal-CONNECTION-LEDGER-1 (1000323), goal-RADAR-TASTE-LEARN-1 (1000324), goal-TP-5-MEASURE-TO-ACT-1 (1000461),
--     goal-TP-7-REACH-SURVIVES-REVIEW-GATE-1, goal-GH-WEBHOOK-REGISTER-1 and goal-GH-APP-FLEET-2-CONVERSIONS-0 (their issues are due within a day), goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1, and issue-100064 (1000406).
--   Eight of the nine goal probes misuse 'pending'. 'pending' means the probe cannot judge yet (a metric that is not measured, a window that is still open). These probes DO judge: they read a measured value
--   against a bound and answer 'pending: <name> <value>' when the bound is not met, e.g. ops_tool_budget_bail_7d 207 (needs 0), cron_schedules 47 (needs <= 40), breach_code_task_pct 8.1 (needs >= 30), 4 after-event
--   questions sent (needs 6), 3 calendar_feedback rows (needs 5), 0 named 'went' answers, 0 gh-webhook deliveries. The fleet's own convention (CONSUMER-PENDING-IS-DEFERRAL-1) already treats a pending read that carries
--   a number against a bound as a failure when the text names the bound (TP-1-AUTONOMY-ENGINE-1, TP-3, TP-4 read 'fail'), and treats the others as deferrals that write no row, so these goals have had no verdict for a week.
--   The ninth goal, TP-9-DEPLOY-PATH-NO-LOCKOUT-1, waits for a 30-day window that closes on 2026-11-05: that is a true deferral and is left alone (its VERIFICATION-DEFERRED-7D-1 issue, when filed, names the date).
--   issue-100064 (COMPANION-PUBLISH-STALL-AUTO-1, high) is refreshed and closed by its filing loop (personal-companion companionStallDetector: it closes the issue itself with evidence when two pieces have landed since
--   it was filed with no two failed generation runs between them). Its contract only waits for that close evidence, so it reads 'pending' for as long as the loop has not recovered.
-- WHAT THIS FILE DOES (the doers named by each issue are the goal owners and the filing loop, both reached through data, not code):
--   1. goals.dod of the eight measured goals: the label of an unmet measured condition changes from 'pending: ...' to 'unmet: ...' (the measured numbers stay in the text, the pass condition is unchanged, and a branch
--      that is a true wait, 'metric ops_tool_budget_bail_7d not measured yet', stays pending). Two goals answered a bare 'pending': they now say what is missing and by how much. The contracts are synced to the new probe
--      now (the hourly contracts-sync step would do the same) and made due, so each reads a verdict at the next tick: 'unmet' is a failure with its reason (verdict fail), not a deferral. The VERIFICATION-DEFERRED-7D-1
--      issues of these goals (five open now, three due within a day) have a probe that reads 'cleared' as soon as the contract is no longer deferred, and the autoclose path closes them.
--   2. issue-100064: the contract is parked as monitoring, the standard state of a loop-owned issue (LOOP-OWNED-CONTRACT-MONITORING-1): the filing loop closes the issue itself on recovery, with the evidence this
--      contract waited for. The issue stays open (high) and keeps its code-task line; nothing is closed by this file.
--   3. one decision_log row naming every class, with the revert.
-- PREDICTION: within 60 minutes of apply every one of the nine contracts reads a verdict (fail with the measured reason, or monitoring for issue-100064), VERIFICATION-DEFERRED-7D-1 issues 1000278, 1000279, 1000323,
--   1000324, 1000406 and 1000461 close on their own probes, and no new VERIFICATION-DEFERRED-7D-1 issue is filed for the other goals. Guard effect, stated honestly: the eight goal contracts become failing subjects of
--   remediation_latest_pass_pct_7d (1070 of 1348 pass today, 1070 of 1356 with them: about -0.5 point) and add about 520 rows a day (22-minute cadence) to the 19,000 orphan rows that issue 1000045 counts: the failure
--   is real, the goals are unmet.
-- spof-review: none added. No DELETE or DROP runs in this file, so it names no BACKUP table beyond the two it creates for the Rollback.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_vdh2_goals
-- Rollback: UPDATE goals SET dod = (SELECT b.dod FROM bak_20261026_vdh2_goals b WHERE b.goal_key = goals.goal_key), updated_at = datetime('now') WHERE goal_key IN (SELECT goal_key FROM bak_20261026_vdh2_goals); UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261026_vdh2_contracts b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261026_vdh2_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_vdh2_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_vdh2_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261026_vdh2_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_vdh2_contracts);

-- 0. Backups for the Rollback.
CREATE TABLE IF NOT EXISTS bak_20261026_vdh2_goals AS SELECT goal_key, dod FROM goals WHERE goal_key IN ('TP-5-MEASURE-TO-ACT-1', 'TP-6-DURABLE-EXECUTION-1', 'TP-7-REACH-SURVIVES-REVIEW-GATE-1', 'CONNECTION-ENGAGEMENT-1', 'CONNECTION-LEDGER-1', 'RADAR-TASTE-LEARN-1', 'GH-WEBHOOK-REGISTER-1', 'GH-APP-FLEET-2-CONVERSIONS-0');

CREATE TABLE IF NOT EXISTS bak_20261026_vdh2_contracts AS SELECT class, verify_probe, status, last_verdict, action, next_due_at, deferred_since FROM remediation_contracts WHERE class IN ('goal-TP-5-MEASURE-TO-ACT-1', 'goal-TP-6-DURABLE-EXECUTION-1', 'goal-TP-7-REACH-SURVIVES-REVIEW-GATE-1', 'goal-CONNECTION-ENGAGEMENT-1', 'goal-CONNECTION-LEDGER-1', 'goal-RADAR-TASTE-LEARN-1', 'goal-GH-WEBHOOK-REGISTER-1', 'goal-GH-APP-FLEET-2-CONVERSIONS-0', 'issue-100064');

-- 1. The DoD text of the measured goals: an unmet measured condition is 'unmet', not 'pending'.
UPDATE goals
SET dod = replace(replace(dod, '''pending: ops_tool_budget_bail_7d ', '''unmet: ops_tool_budget_bail_7d '), '''pending: cron_schedules ', '''unmet: cron_schedules '),
    updated_at = datetime('now')
WHERE goal_key = 'TP-6-DURABLE-EXECUTION-1' AND (instr(dod, '''pending: ops_tool_budget_bail_7d ') > 0 OR instr(dod, '''pending: cron_schedules ') > 0);

UPDATE goals
SET dod = replace(dod, '''pending: breach_code_task_pct ', '''unmet: breach_code_task_pct '), updated_at = datetime('now')
WHERE goal_key = 'TP-5-MEASURE-TO-ACT-1' AND instr(dod, '''pending: breach_code_task_pct ') > 0;

UPDATE goals
SET dod = replace(dod, '''pending: subscribers_growth_monthly ', '''unmet: subscribers_growth_monthly '), updated_at = datetime('now')
WHERE goal_key = 'TP-7-REACH-SURVIVES-REVIEW-GATE-1' AND instr(dod, '''pending: subscribers_growth_monthly ') > 0;

UPDATE goals
SET dod = replace(dod, '''pending: no went answer with a name in calendar_feedback yet (owner action)''', '''unmet: no went answer with a name in calendar_feedback yet (owner action)'''), updated_at = datetime('now')
WHERE goal_key = 'CONNECTION-LEDGER-1' AND instr(dod, '''pending: no went answer with a name in calendar_feedback yet (owner action)''') > 0;

UPDATE goals
SET dod = replace(dod, '''pending: no gh-webhook delivery recorded in the last 120 minutes''', '''unmet: no gh-webhook delivery recorded in the last 120 minutes'''), updated_at = datetime('now')
WHERE goal_key = 'GH-WEBHOOK-REGISTER-1' AND instr(dod, '''pending: no gh-webhook delivery recorded in the last 120 minutes''') > 0;

UPDATE goals
SET dod = replace(dod, '''pending: workers served by the App broker in 24 hours: ', '''unmet: workers served by the App broker in 24 hours: '), updated_at = datetime('now')
WHERE goal_key = 'GH-APP-FLEET-2-CONVERSIONS-0' AND instr(dod, '''pending: workers served by the App broker in 24 hours: ') > 0;

UPDATE goals
SET dod = replace(dod, 'ELSE ''pending'' END AS observed', 'ELSE ''unmet: after-event questions sent '' || (SELECT COUNT(*) FROM owner_questions WHERE kind=''after-event'' AND sent_at IS NOT NULL) || '' of 6 needed, answer rate 14d '' || COALESCE((SELECT last_value FROM metric_registry WHERE metric=''owner_question_answer_rate_14d''), ''n/a'') || '' (needs 0.3)'' END AS observed'),
    updated_at = datetime('now')
WHERE goal_key = 'CONNECTION-ENGAGEMENT-1' AND instr(dod, 'ELSE ''pending'' END AS observed') > 0;

UPDATE goals
SET dod = replace(dod, 'ELSE ''pending'' END AS observed', 'ELSE ''unmet: calendar_feedback rows '' || (SELECT COUNT(*) FROM calendar_feedback) || '' (needs 5 and a radar report that used them)'' END AS observed'),
    updated_at = datetime('now')
WHERE goal_key = 'RADAR-TASTE-LEARN-1' AND instr(dod, 'ELSE ''pending'' END AS observed') > 0;

-- 2. The contracts take the new probe now (the hourly contracts-sync step of roadmap-self-maintain makes the same copy) and are due at once.
UPDATE remediation_contracts
SET verify_probe = (SELECT d.probe FROM v_goal_dod d WHERE 'goal-' || d.goal_key = remediation_contracts.class),
    next_due_at = datetime('now')
WHERE module = 'goal-dod-v1' AND status = 'active'
  AND class IN ('goal-TP-5-MEASURE-TO-ACT-1', 'goal-TP-6-DURABLE-EXECUTION-1', 'goal-TP-7-REACH-SURVIVES-REVIEW-GATE-1', 'goal-CONNECTION-ENGAGEMENT-1', 'goal-CONNECTION-LEDGER-1', 'goal-RADAR-TASTE-LEARN-1', 'goal-GH-WEBHOOK-REGISTER-1', 'goal-GH-APP-FLEET-2-CONVERSIONS-0')
  AND EXISTS (SELECT 1 FROM v_goal_dod d WHERE 'goal-' || d.goal_key = remediation_contracts.class AND d.probe IS NOT NULL AND d.probe IS NOT remediation_contracts.verify_probe);

-- 3. issue-100064: a loop-owned issue whose contract only waits for the loop's own close evidence is parked as monitoring.
UPDATE remediation_contracts
SET status = 'monitoring', next_due_at = NULL, deferred_since = NULL,
    last_verdict = 'monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)',
    action = 'VERIFICATION-DEFERRAL-HONEST-2: parked by a recorded decision (decision_log names issue-100064). personal-companion companionStallDetector refreshes and closes this issue itself, with the evidence this contract waited for (two pieces landed since it was filed, no two failed generation runs between them), so the contract only repeated the loop''s own wait. The issue stays open and its code-task line stays with the code loop.'
WHERE class = 'issue-100064' AND status = 'active' AND last_verdict LIKE 'deferred%'
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100064 AND a.status = 'open');

-- 4. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a2 (remediation session 2026-10-26)',
  'a probe that can judge must not answer pending: a pending read writes no verification row, so a goal that is measurably unmet reads as not yet evaluated for ever, and the 7-day rule then files an issue about the wait',
  'VERIFICATION-DEFERRAL-HONEST-2: goals.dod of TP-5-MEASURE-TO-ACT-1, TP-6-DURABLE-EXECUTION-1, TP-7-REACH-SURVIVES-REVIEW-GATE-1, CONNECTION-ENGAGEMENT-1, CONNECTION-LEDGER-1, RADAR-TASTE-LEARN-1, GH-WEBHOOK-REGISTER-1 and GH-APP-FLEET-2-CONVERSIONS-0 say unmet instead of pending for a measured unmet condition (contracts goal-TP-5-MEASURE-TO-ACT-1, goal-TP-6-DURABLE-EXECUTION-1, goal-TP-7-REACH-SURVIVES-REVIEW-GATE-1, goal-CONNECTION-ENGAGEMENT-1, goal-CONNECTION-LEDGER-1, goal-RADAR-TASTE-LEARN-1, goal-GH-WEBHOOK-REGISTER-1, goal-GH-APP-FLEET-2-CONVERSIONS-0 synced and due), contract issue-100064 parked as monitoring (loop-owned), goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1 left pending because its 30-day window closes 2026-11-05',
  'read 2026-10-26 from live qnfo-audit: nine goal-dod-v1 contracts deferred since 2026-10-19 or 20 (364 to 383 attempts for the seven past 7 days), issue-100064 deferred since 2026-10-19 10:43Z, six VERIFICATION-DEFERRED-7D-1 issues open; measured values: ops_tool_budget_bail_7d 207, cron_schedules 47, breach_code_task_pct 8.1 with 34 needs-machine-probe contracts, 4 after-event questions sent and answer rate n/a, 3 calendar_feedback rows, 0 named went answers; v_goal_dod.probe is copied into the contract by roadmap-self-maintain contracts-sync and contracts-reactivate re-activates a parked goal contract, so goals.dod is the lever, not the contract; TP-1, TP-3 and TP-4 contracts already read fail on the same shape; personal-companion companionStallDetector closes issue 100064 itself',
  'applied through the canonical path on merge: eight goal contracts read a failing verdict with their reason within a tick, six VERIFICATION-DEFERRED-7D-1 issues close, issue 100064 keeps a monitoring contract',
  'eight goals.dod texts (a label changes, the pass condition does not), eight contract probes, one contract state, two backup tables, no issue status, trigger, worker or secret is touched',
  'the Rollback header of migrations/2026-10-26-verification-deferral-honest-2.sql restores goals.dod and the nine contracts from bak_20261026_vdh2_goals and bak_20261026_vdh2_contracts',
  'goal-probe-judges-not-defers',
  'within 60 minutes of apply: no goal-dod-v1 contract except TP-9 reads deferred, VERIFICATION-DEFERRED-7D-1 issues 1000278, 1000279, 1000323, 1000324, 1000406 and 1000461 are closed by their own probes, remediation_latest_pass_pct_7d moves by about -0.5 point',
  NULL,
  'node:sqlite replay (migrations/verification-deferral-honest-2.test.mjs) with the eight DoD texts as read from live qnfo-audit, the live v_goal_dod view text, each new probe run unmet and met, the VERIFICATION-DEFERRED-7D-1 closing probe of qnfo-fleet-control RT_STILL_DEFERRED_SQL, apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor LIKE 'rem-a2%' AND instr(action, 'VERIFICATION-DEFERRAL-HONEST-2') > 0);

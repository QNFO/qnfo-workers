-- IL-RELAPSE-TRIGGER-1 (2026-10-19, qnfo-fleet-control 0.39.0, charter pillar autonomy; agent_issues 99927, 2884, 100012).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-relapse-judged-against-target-not-trigger'; DELETE FROM failure_modes WHERE fm_key = 'relapse-judged-against-target-not-trigger'; DELETE FROM control_registry WHERE control = 'improvement-loop-relapse-trigger-judge'; DELETE FROM capability_ledger WHERE capability = 'relapse-vs-early-warning-judgement'; DELETE FROM metric_authorship WHERE metric = 'fix_target_hold_rate_30d'; DELETE FROM metric_registry WHERE metric = 'fix_target_hold_rate_30d'; UPDATE metric_registry SET formula = 'held / judged over metric issues closed in the last 30d (METRIC-TRIGGER-*, OBJECTIVE-CONSTRAINT-BREACH-1, METRIC-REGRESSION-1): relapsed when a metric_history day after closure fails its target (IMPROVEMENT-LOOP-1)', target = '>= 0.8 (closed metric issues whose metric stayed on target afterwards)' WHERE metric = 'fix_hold_rate_30d'
-- Rollback scope: the registry rows only (decision_log is append-only and keeps its row); the behaviour is the worker change, so set ops_config il_relapse_trigger_judge = off (no deploy; the tick then judges every closure on the registry target as before) or redeploy qnfo-fleet-control 0.38.0 as well.
-- spof-review: none added. The relapse judge stays inside improvementLoopTick (hourly); the strict view is a second, independent reading of the same closures (fix_target_hold_rate_30d), and the detector below reads the open issues, not the worker.
--
-- REVIEW 2026-10-19 (session_01JADz8uHqYt9eUMBTwbbBE6, landing the handoff patch): live qnfo-audit 14:55Z, read only. Rows this file touches:
--   metric_registry: 1 INSERT (fix_target_hold_rate_30d, absent) and 1 UPDATE (fix_hold_rate_30d, its formula matches the guarded text: 1 row; trigger 388
--   lt 0.8 is unchanged, nothing is loosened); the second UPDATE changes 0 rows after the INSERT. control_registry, failure_modes, remediation_contracts,
--   capability_ledger, decision_log: 1 INSERT each (none exists), every statement is INSERT OR IGNORE or guarded by NOT EXISTS, so a second apply changes nothing.
--   The metric_authorship birth trigger adds one probation row. No issue is closed, reopened or dismissed by this file: the worker does that, one issue at a
--   time, and only for an open METRIC-FIX-RELAPSED-1 or METRIC-REGRESSION-1 issue whose finding is no longer fileable (the same rule as IL-DEFECT-ONLY-1).
--   Expected effect on the four open relapse issues (2884, 100012, 100065, 2158): the loop will try to close each with early-warning evidence, and
--   CLOSE-BINDS-TO-PROBE-1 refuses while their loop-owned contracts read fail; the detector below reads 4 until that clears, by design.
--   fix_hold_rate_30d after the deploy: 46 of 67 = 0.69 (independent SQL replay; the worker's own 30-day window moves it by a closure or two), still under 0.8.
--
-- WHY. IMPROVEMENT-LOOP-1 re-checks every metric issue closed in the last 30 days and files METRIC-FIX-RELAPSED-1 when a later metric_history day
-- fails the metric's registry TARGET. A METRIC-TRIGGER issue does not close on the target: TRIGGER-RECOVERY-1 closes it once the trigger
-- PREDICATE has been clear for 60 minutes, and for many metrics the target is stricter than the threshold. Measured 2026-10-19 13:00Z:
--   gateway_cap_30d_usd         trigger 364  gt 180    target <=150   value 180   (issue 2778 closed 2026-10-17; relapse issue 2884 open)
--   server_side_close_share_7d  trigger 5799 lt 0.9    target >=0.95  value 0.94  (issue 99947 closed 2026-10-18; relapse issue 100012 open)
--   paper_render_defect_pages   trigger 498  gt 3      target 0       value 2     (relapse issue 2158 open)
--   paper_math_browser_fail_pages trigger 798 gt 2     target 0       value 1     (relapse issue 100065 open)
-- All four triggers are clear, so each fix held by the rule that closed it; fix_hold_rate_30d read 0.5 (33 held of 66) and the trigger on it
-- (id 388, lt 0.8) kept the tracker 99927 open. A D1 replay of the 30-day closures with the trigger predicate reads 46 held of 67 (0.69);
-- the rest are genuine relapses (the trigger hit again) and keep their own issues.
-- WHAT. qnfo-fleet-control 0.39.0 judges a closure by the trigger it was filed under: a relapse needs the trigger hit again on a day after the
-- closure; a target miss with the trigger clear is an early warning (file false, closed with that evidence by the tick, listed in GET
-- /improvement target_misses). fix_hold_rate_30d counts closures that way. The strict target-based reading moves to the new guard metric
-- fix_target_hold_rate_30d, so the change cannot hide a metric that is off target. A closure with no readable trigger (a constraint breach, a
-- deleted trigger) is judged on the target as before.
--
-- METRIC-CLOSED-LOOP-1 EXEMPTION (fix_target_hold_rate_30d has no threshold trigger): it is the strict view of the closures that fix_hold_rate_30d
-- already grades with trigger 388, and "a target miss with the trigger clear" is an early warning by definition, so a second trigger on the same
-- producer would file the same finding twice (two signals from one producer are one path). IMPROVEMENT-LOOP-1 trends it (target "maximize") and files
-- METRIC-REGRESSION-1 when it declines 15% week on week while off target.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('fix_target_hold_rate_30d', 'system', 'guard',
  'held / judged over the same closures as fix_hold_rate_30d, but relapsed when a metric_history day after closure fails the registry target even if the closing trigger is clear (IMPROVEMENT-LOOP-1, IL-RELAPSE-TRIGGER-1)',
  'qnfo-audit.metric_history + agent_issues (qnfo-fleet-control IMPROVEMENT-LOOP-1)',
  '0.5 on 2026-10-19 13:00Z (33 held of 66 against the registry target); that was fix_hold_rate_30d before IL-RELAPSE-TRIGGER-1',
  'maximize (the strict view of fix_hold_rate_30d: closed metric issues whose metric stayed on its registry target afterwards; trended, no threshold trigger)',
  'qnfo-fleet-control',
  'IMPROVEMENT-LOOP-1 files METRIC-REGRESSION-1 on a decline (exempt from a threshold trigger: METRIC-CLOSED-LOOP-1, migrations/2026-10-19-fix-target-hold-rate.sql)',
  'hourly', 'falling week on week', 'falling 2 weeks', NULL, NULL, 'UNMEASURED', NULL);

-- the registry row may already exist (the worker seeds it with INSERT OR IGNORE on its first 0.39.0 tick): make the exemption text authoritative either way
UPDATE metric_registry SET
  disposition_actor = 'IMPROVEMENT-LOOP-1 files METRIC-REGRESSION-1 on a decline (exempt from a threshold trigger: METRIC-CLOSED-LOOP-1, migrations/2026-10-19-fix-target-hold-rate.sql)'
WHERE metric = 'fix_target_hold_rate_30d' AND instr(COALESCE(disposition_actor, ''), 'exempt from a threshold trigger') = 0;

UPDATE metric_registry SET
  formula = 'held / judged over metric issues closed in the last 30d (METRIC-TRIGGER-*, OBJECTIVE-CONSTRAINT-BREACH-1): relapsed when a metric_history day after closure would hit the trigger the issue was filed under again (TRIGGER-RECOVERY-1 closes on that predicate); a closure with no readable trigger is judged against the registry target (IMPROVEMENT-LOOP-1, IL-RELAPSE-TRIGGER-1)',
  target = '>= 0.8 (closed metric issues whose metric stayed clear of the rule that closed them afterwards)'
WHERE metric = 'fix_hold_rate_30d'
  AND formula = 'held / judged over metric issues closed in the last 30d (METRIC-TRIGGER-*, OBJECTIVE-CONSTRAINT-BREACH-1, METRIC-REGRESSION-1): relapsed when a metric_history day after closure fails its target (IMPROVEMENT-LOOP-1)';

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('improvement-loop-relapse-trigger-judge',
  'qnfo-fleet-control improvementEvaluate (IL-RELAPSE-TRIGGER-1, 0.39.0): a METRIC-FIX-RELAPSED-1 finding needs the closing trigger hit again on a day after the closure; a target miss with the trigger clear is an early warning (file false)',
  'filter',
  'IMPROVEMENT-LOOP-1 filing METRIC-FIX-RELAPSED-1 for fixes that held by the rule that closed them (agent_issues 2884 gateway_cap_30d_usd, 100012 server_side_close_share_7d, 100065 and 2158 paper metrics) and grading them as failures in fix_hold_rate_30d (0.5 on 2026-10-19)',
  0, 'keep', 'applied',
  'the target-based reading is not removed: fix_target_hold_rate_30d (guard) keeps the old figure, GET /improvement target_misses lists each closure whose metric still misses its target with the trigger clear, and the early-warning finding stays in improvement_loop_runs.state_json; a closure with no readable trigger is still judged on the target. The metric''s own trigger still files the breach when the threshold is crossed again.',
  NULL,
  'qnfo-fleet-control/improvement-relapse-trigger.test.mjs: 42 of 109 assertions pass and 67 fail on 0.37.0 (a gateway_cap_30d_usd closure with the trigger clear is filed as a relapse, fix_hold_rate_30d reads 0); all 109 pass on 0.39.0, including the controls (trigger hit again is a relapse, no readable or a disabled trigger is judged on the target, a constraint breach is judged on the target, ops_config il_relapse_trigger_judge = off restores the target judgement on the real tick). D1 replay 2026-10-19 13:30Z and again 14:55Z (independent SQL, same result): 46 of 67 closures held by the trigger (3 of the 67 sit under a disabled trigger and are judged on the target; none of them flips), 33 of 67 by the target.',
  99927);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('relapse-judged-against-target-not-trigger',
  'the improvement loop calls a fix a relapse because the metric misses its registry target, although the fix was closed on the trigger predicate and the trigger is still clear',
  'a METRIC-TRIGGER issue closes when its trigger predicate has been clear for 60 minutes (TRIGGER-RECOVERY-1) but improvementEvaluate judged the closure against metric_registry.target, which is stricter for many metrics (gateway_cap_30d_usd gt 180 vs <=150, server_side_close_share_7d lt 0.9 vs >=0.95, paper_render_defect_pages gt 3 vs 0)',
  'qnfo-fleet-control 0.39.0 IL-RELAPSE-TRIGGER-1: a relapse needs the closing trigger hit again; a target miss with the trigger clear is an early warning (file false, closed with that evidence) counted in the new guard fix_target_hold_rate_30d; fix_hold_rate_30d counts closures by the trigger predicate',
  'remediation_contracts fm-relapse-judged-against-target-not-trigger (d1-query, hourly)',
  'fm-relapse-judged-against-target-not-trigger', '2026-10-19', 99927,
  'a metric whose trigger threshold is looser than its registry target has a METRIC-TRIGGER issue closed on recovery, then sits between the two',
  'a METRIC-FIX-RELAPSED-1 issue is open for a metric whose trigger is not hit; fix_hold_rate_30d stays under 0.8 while the closures held (0.5 against 0.69 on 2026-10-19)',
  'every fix the loop closes for a metric with a loose trigger is re-opened as a relapse and the fix-durability trigger stays breached');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES
 ('fm-relapse-judged-against-target-not-trigger', NULL,
  'an open METRIC-FIX-RELAPSED-1 issue whose metric has an enabled trigger that is not hit',
  'improvementLoopTick closes it with early-warning evidence on its next hourly run (IL-RELAPSE-TRIGGER-1); a hit here that persists past two ticks means the closure was refused (close-while-contract-fails) or the worker is older than 0.39.0',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND a.title LIKE ''METRIC-FIX-RELAPSED-1: %'' AND EXISTS (SELECT 1 FROM v_metric_trigger_state v WHERE v.metric_key = substr(a.title, instr(a.title, '': '') + 2) AND v.hit = 0)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now', '+90 minutes'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('relapse-vs-early-warning-judgement',
  'migrations/2026-10-19-fix-target-hold-rate.sql (IL-RELAPSE-TRIGGER-1, qnfo-fleet-control 0.39.0)',
  'metric_history daily values, analytics_metric_triggers operator and threshold, the closing rule TRIGGER-RECOVERY-1',
  'measured hourly: fix_hold_rate_30d (trigger-judged), fix_target_hold_rate_30d (target-judged guard); hourly detector fm-relapse-judged-against-target-not-trigger',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'the improvement loop tells a fix that failed (the closing trigger hit again) from a metric that merely misses a stricter target (early warning, no issue), so METRIC-FIX-RELAPSED-1 tracks defects and the fix-durability rate reads what the closing rule judged');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a fix is judged by the rule that closed it: TRIGGER-RECOVERY-1 closes a METRIC-TRIGGER issue on the trigger predicate, so a relapse is the trigger hit again, and a stricter registry target the metric still misses is an early warning, kept visible rather than filed',
  'IL-RELAPSE-TRIGGER-1: improvementEvaluate judges closed METRIC-TRIGGER issues by their trigger predicate (a target miss with the trigger clear is a file-false early warning); fix_hold_rate_30d counts closures that way; new guard metric fix_target_hold_rate_30d keeps the target-based figure; control_registry row improvement-loop-relapse-trigger-judge; failure mode relapse-judged-against-target-not-trigger with detector fm-relapse-judged-against-target-not-trigger',
  'qnfo-audit 2026-10-19 13:00-13:30Z: fix_hold_rate_30d 0.5 (33 of 66); a replay of the 30-day closures with the trigger predicate holds 46 of 67 and with the target 33 of 67; open relapse issues 2884, 100012, 100065 and 2158 are all on metrics whose trigger is not hit (gateway_cap_30d_usd 180 vs gt 180, server_side_close_share_7d 0.939 vs lt 0.9); qnfo-fleet-control/improvement-relapse-trigger.test.mjs fails 67 of 109 on 0.37.0 and passes 109 on 0.39.0; the four open relapse issues carry circular loop-owned contracts that read fail, so close-while-contract-fails (CLOSE-BINDS-TO-PROBE-1) refuses the loop''s own close until those contracts are monitoring or deferred (a separate change)',
  'merged to main', 'one hourly loop in qnfo-fleet-control (improvementLoopTick) files fewer METRIC-FIX-RELAPSED-1 issues and closes an open one whose trigger is clear with early-warning evidence once its own contract no longer refuses the close; fix_hold_rate_30d rises from 0.5 to about 0.69 (still under the 0.8 trigger, so 99927 stays open until the genuine relapses are fixed); one guard metric added, no trigger removed, no cap or hold changed',
  'ops_config il_relapse_trigger_judge = off (no deploy) restores the target judgement, or redeploy qnfo-fleet-control 0.38.0 (or let the canary revert); the Rollback header removes the registry rows; fix_target_hold_rate_30d keeps the old reading meanwhile',
  'the improvement loop separates a failed fix from a stricter-target miss without hiding either: relapse issues track defects, the early warnings and the strict rate stay readable',
  'fix_hold_rate_30d >= 0.65 within 12 h', 'none',
  'improvement.test.mjs, improvement-superseded.test.mjs, improvement-relapse-trigger.test.mjs (fixtures gateway_cap_30d_usd and server_side_close_share_7d), migrations/fix-target-hold-rate.test.mjs; live D1 reads of v_metric_trigger_state, metric_history, improvement_loop_runs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'IL-RELAPSE-TRIGGER-1:') = 1);

-- LOOP-CLOSE-VS-PROBE-1 (2026-10-20, charter pillar: autonomy; agent_issues 100344 IL-CLOSE-VS-PROBE-1, 2562, 100163, 2158, 2679).
-- Failure mode, detector and decision for a loop whose close is refused by the contract that is supposed to confirm it. Read from qnfo-audit and the Cloudflare Observability bridge 2026-10-20 10:10Z (wave-4 RCA):
-- qnfo-fleet-control improvementLoopTick closes an early-warning (file:false) METRIC-FIX-RELAPSED-1 or METRIC-REGRESSION-1 issue with the loop's own evidence every hour, but the issue's contract
-- (probe-template-v2d-loop, issue-2158: 74 failed verifications of 74) fails for as long as the finding key is listed in improvement_loop_runs.state_json.findings, which holds the early warnings too.
-- The trigger issue_close_evidence_required (CLOSE-BINDS-TO-PROBE-1) aborts the close ("close-while-contract-fails"), the closer's catch writes one console.error line per hour, and that line keeps the
-- Cloudflare Observability group cf-obs-e55da256 active, which the traffic-health journey reads as "an error group recurred in 6 h" (journey_runs: 451 of 454 runs since 2026-10-14 failed). worker_logs holds 8 such rows in the
-- last 6 hours. The fix is code (IL-CLOSE-VS-PROBE-1, issue 100344, qnfo-fleet-control 0.44.2: the loop writes only the findings it keeps open and defers a close that the trigger would refuse); this file records
-- the failure mode and its measurement so a recurrence is found within the hour whichever closer causes it (nine more closers in qnfo-fleet-control use the same unguarded pattern), and records the decision.
-- Rejected on the way, with the reason, so the next session does not repeat them: guarding the triage_close_sync triggers (every closer's explicit UPDATE agent_issues aborts the same way and issue_triage would
-- stay closed while the issue stays open); parking contract issue-2158 by hand (red-drain PARKED-REARM-1 re-arms it within the hour); relaxing issue_close_evidence_required (it is the guard that stops a close without evidence).
-- decision_log is append-only, so the Rollback leaves the decision row.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-loop-close-vs-probe-disagree' AND module = 'failure-mode'; DELETE FROM failure_modes WHERE fm_key = 'loop-close-vs-probe-disagree' AND issue_id = 100344;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('loop-close-vs-probe-disagree',
  'a loop closes an issue with its own evidence while the issue''s remediation contract still reads fail, so the close-evidence trigger aborts the write every cycle and the caught error becomes an hourly error line',
  'two closers disagree about one issue and the D1 trigger issue_close_evidence_required (CLOSE-BINDS-TO-PROBE-1, 2026-10-18) arbitrates by aborting the loop''s write. improvementLoopTick persists state_json.findings with every finding key, including the file:false early warnings it wants closed, and the contract of the issue (probe-template-v2d-loop) passes only when the key is absent from that list, so it can never pass for an issue the loop wants to close. objectiveConstraintsTick, loopWatch, charterBreaches and six other closers write the close without reading the contract, so any of them repeats the abort when its issue''s contract lags the recovery (2446 on 2026-10-20 10:00Z)',
  'IL-CLOSE-VS-PROBE-1 (agent_issues 100344, qnfo-fleet-control 0.44.2): improvementLoopTick writes state.findings as only the findings it keeps open and early_warnings as a count; closeBlockedByContract() runs the trigger''s predicate before the close INSERT in improvementLoopTick and objectiveConstraintsTick, defers the write, counts close_deferred and logs one warning line. The detector below reads the worker_logs rows of the abort and must read 0 after the deploy plus 6 quiet hours',
  'the d1-query contract fm-loop-close-vs-probe-disagree counts qnfo-fleet-control worker_logs rows of the last 6 hours whose exceptions_json names close-while-contract-fails (expected 0)',
  'fm-loop-close-vs-probe-disagree', '2026-10-20', 100344,
  'a loop closer writes a close for an issue whose active or holding remediation contract has last_verdict fail, vacuous-probe-result, probe-error, probe-not-machine-executable or probe-same-account-host',
  'worker_logs shows a qnfo-fleet-control scheduled exception "D1_ERROR: close-while-contract-fails" every hour at minute 00 (and every 5 minutes for workflowFailureIntake while a failed-run issue is open); the Observability group stays active and the traffic-health journey step "no Cloudflare Observability error group recurred in 6 h" fails',
  'the traffic-health journey (red since 2026-10-14), an hourly error line per affected issue, and a closeable issue left open for ever (2158 for more than 24 hours); no data loss, the trigger refused the write');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-loop-close-vs-probe-disagree', NULL, 'LOOP-CLOSE-VS-PROBE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM worker_logs WHERE script_name = ''qnfo-fleet-control'' AND ts_ms > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 21600) * 1000 AND exceptions_json LIKE ''%close-while-contract-fails%'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a close that the close-evidence trigger refuses every hour is a disagreement between two closers, and the loop that wants the close is the one that must stop writing a state its own contract cannot accept; the trigger is the guard and stays',
  'LOOP-CLOSE-VS-PROBE-1: failure mode loop-close-vs-probe-disagree with its d1-query detector, and the code change handed to the code loop as IL-CLOSE-VS-PROBE-1 (agent_issues 100344) with anchors, tests and a code-probe; the trigger issue_close_evidence_required, issue-2158''s contract and the triage_close_sync triggers are left unchanged',
  'qnfo-audit 2026-10-20 10:10Z: contract issue-2158 failed 74 of 74 verifications since 2026-10-19 06:30Z; worker_logs holds close-while-contract-fails rows at 10:00:37, 09:01:37, 08:01:43, 07:01:39, 06:01:11, 05:01:07, 04:01:18, 03:01:20 and 02:00:44; fleet_issue_dispatch cf-obs-e55da256 active, count 19; journey_runs traffic-health 451 of 454 runs ok=0 since 2026-10-14; improvement_loop_runs ids 443 to 446 closed=0 with 28 file:false findings of 87',
  'recorded through the canonical path on merge; the detector reads 8 rows now and must read 0 six hours after the qnfo-fleet-control change is live; issues 2158, 2562 and 100163 close by their own contracts as the loop clears',
  'one failure mode row and one detector contract in qnfo-audit; no worker, trigger, secret or schedule change in this file',
  'run the migration Rollback header: it removes the detector contract and the failure mode (decision_log is append-only and keeps this row)',
  'a closer that the close-evidence trigger would refuse defers and counts the deferral instead of aborting and logging an error each cycle',
  'worker_logs close-while-contract-fails rows in the last 6 hours fall from 8 to 0 within 7 hours of the deploy; the traffic-health journey step for a recurring Observability group passes; issue 2158 closes with the loop evidence; no new error line from improvementLoopTick or objectiveConstraintsTick',
  'none',
  'worker_logs exceptions_json, remediation_contracts for issue-2158, improvement_loop_runs state_json, fleet_issue_dispatch, journey_runs, the live trigger text of issue_close_evidence_required, qnfo-fleet-control/worker.js improvementLoopTick and objectiveConstraintsTick'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'LOOP-CLOSE-VS-PROBE-1:') = 1);

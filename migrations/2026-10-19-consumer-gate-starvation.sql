-- CONSUMER-GATE-STARVATION-1 (2026-10-19, charter pillar: autonomy; owner directive 2026-10-19: "pull requests need to squash, merge and close faster as they are holding up code loops and CI pipelines").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-consumer-gate-starvation'; DELETE FROM failure_modes WHERE fm_key = 'consumer-gate-starvation';
--
-- WHY (measured 2026-10-19)
-- The remediation consumer (scripts/remediation_consumer.py, run by remediation-consumer.yml) probes every due contract, closes the issues whose
-- probes pass and re-arms the failure-mode detectors. Its cadence gate (CONSUMER-CI-LOOP-1) let a workflow_run-triggered run proceed only when no consumer
-- run had started in the last 20 minutes, and read "a consumer run" as any run of the workflow concluded success. A run the gate itself skipped ends with
-- its consume job skipped and the workflow concluded success, so each skipped trigger restarted the window. Every merge to main completes three upstream
-- workflows, each of which triggers the consumer; on a day of continuous merges the gate held itself shut: none of the last 30 runs had a consume job that
-- ran, the last verification was 08:56Z, the log said "last consumer run started 174s ago" at 10:04Z, 78 failure-mode detectors read unprobed (was 9),
-- 54 code-read contracts were 50 minutes overdue, and issues whose fix had merged (100071 to 100073, PR 2753) stayed open: the loop that closes the fleet's
-- work had stopped while the work was being merged faster than ever. qnfo-cloud-ops PROBE-CADENCE-1 reads the last run of the same workflow, so its
-- second path (a dispatch when the consumer is idle) was blinded the same way.
-- Fix: scripts/consumer-cadence-gate.mjs counts only a run whose consume job ran (in progress, queued or successful); suite
-- scripts/consumer-cadence-gate.test.mjs. The detector below reads the ledger the consumer writes, from the fleet-control hourly tick as well as from the
-- runner, so a starved runner is still seen.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('consumer-gate-starvation',
   'the remediation consumer stops probing while main is busy: its cadence gate counts the runs it skipped itself as consumer runs',
   'the gate selected workflow runs with conclusion success, and a run whose consume job was skipped concludes success, so each skipped workflow_run trigger restarted the 20-minute window; triggers arrive faster than that whenever merges do',
   'CONSUMER-GATE-STARVATION-1: scripts/consumer-cadence-gate.mjs counts only a run whose consume job ran; the suite replays the starved history',
   'SELECT 0 expected: the newest remediation_verifications row is not older than 45 minutes',
   'fm-consumer-gate-starvation', '2026-10-19', NULL,
   'triggers of the remediation-consumer workflow arrive more often than every 20 minutes',
   'v_failure_mode_status reads dozens of detectors unprobed; issues stay open after their fix merged; code-read contracts go overdue',
   'every contract and failure-mode detector, every issue that closes on a probe: the fleet''s own closing loop');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-consumer-gate-starvation', NULL,
  'SELECT ''0'' AS expected, CAST(COALESCE((SELECT CASE WHEN MAX(verified_at) < datetime(''now'', ''-45 minutes'') THEN 1 ELSE 0 END FROM remediation_verifications), 1) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'CONSUMER-GATE-STARVATION-1', 'failure-mode detector', 'qnfo-fleet-control');

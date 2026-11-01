-- ERRATA-CHAIN-DISPATCH-1 (QNFO.RSCH, pillar research; QNFO/qnfo-fleet-issues#95).
-- The folded consumer is qnfo-research-exec, not the retired standalone errata workers.
-- Requeue only its stranded action-board dispatch after installing the binding/handler.
-- No errata, paper, publication flag, or issue closure is changed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261030_errata_dispatch
-- Rollback: UPDATE fleet_issue_dispatch SET exec_state=b.exec_state, exec_ts=b.exec_ts, exec_result=b.exec_result, exec_attempts=b.exec_attempts FROM bak_20261030_errata_dispatch b WHERE fleet_issue_dispatch.fingerprint=b.fingerprint; DELETE FROM remediation_contracts WHERE class='fm-errata-chain-dispatch'; DELETE FROM failure_modes WHERE fm_key='errata-chain-dispatch'

CREATE TABLE IF NOT EXISTS bak_20261030_errata_dispatch AS
SELECT fingerprint, exec_state, exec_ts, exec_result, exec_attempts
FROM fleet_issue_dispatch WHERE fingerprint = 'iss-f3457a77';

UPDATE fleet_issue_dispatch
SET exec_state = NULL, exec_ts = NULL, exec_result = NULL, exec_attempts = 0
WHERE fingerprint = 'iss-f3457a77' AND state = 'queued'
  AND exec_state IN ('no-action', 'needs-human');

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id)
VALUES ('errata-chain-dispatch', 'errata chain backpressure has no safe consumer dispatch',
  'execTargetFor omitted errata and persisted no-action/needs-human receipts were never retried',
  'ERRATA-CHAIN-DISPATCH-1: service-binding kick queues the folded responder for an unused cron slot; publish retains its existing gate',
  'errata dispatch parked without a consumer', 'fm-errata-chain-dispatch', '2026-10-30', NULL);

INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('fm-errata-chain-dispatch', 'ERRATA-CHAIN-DISPATCH-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM fleet_issue_dispatch WHERE fingerprint=''iss-f3457a77'' AND state=''queued'' AND exec_state IN (''no-action'',''needs-human'')',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot-errata-chain-95', 'backpressure needs the consumer, not more email intake',
  'ERRATA-CHAIN-DISPATCH-1',
  '2026-10-30 D1: 232 detected and 31 audited errata; responder last processed 5; iss-f3457a77 parked no-action',
  'pending canonical deployment and live verification',
  'errata action-board dispatch and unused errata cron slots only',
  'rollback header in migrations/2026-10-30-errata-chain-dispatch.sql and revert branch code',
  'private durable consumer kick without copying ERRATA_TOKEN',
  'parked errata dispatches fall from 1 to 0; one bounded extra responder batch on the next unused member slot',
  'none', 'live D1 reads; offline private-route, cron, binding and SQLite migration tests'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action = 'ERRATA-CHAIN-DISPATCH-1');

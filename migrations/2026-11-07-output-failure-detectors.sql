-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded' WHERE class IN ('fm-output-as-text', 'fm-sole-safeguard') AND precondition = 'OUTPUT-FAILURE-DETECTORS-1';
-- OUTPUT-FAILURE-DETECTORS-1: GitHub #8404, #8405; contributes to #8400.
-- Live 2026-11-07: both failure_modes.probe_class values name absent contracts.
-- The prose verification_probes rows do not supply executable contracts to
-- remediation_consumer. Register hourly standing detectors with no issue_id,
-- so closing an issue cannot retire its recurrence detector.
-- This measures recorded violations; it does not prove scanner coverage or
-- implement artifact-required closeout. No issue closes from registration.
-- spof-review: existing D1 runner and consumer; no new service or credential.

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport,
   max_attempts, escalate_to, expected_cadence_h, status)
VALUES
  ('fm-output-as-text', NULL, 'OUTPUT-FAILURE-DETECTORS-1',
   'failure-mode detector',
   'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM false_stop_hits WHERE pattern_key = ''text-as-output'' AND julianday(ts) >= julianday(''now'', ''-7 days'')',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active'),
  ('fm-sole-safeguard', NULL, 'OUTPUT-FAILURE-DETECTORS-1',
   'failure-mode detector',
   'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM false_stop_hits WHERE pattern_key = ''sole-safeguard'' AND julianday(ts) >= julianday(''now'', ''-7 days'')',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

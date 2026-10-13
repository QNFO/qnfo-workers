-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'probe-review-refused' WHERE class = 'fm-paper-abstract-empty' AND status = 'active'; DELETE FROM remediation_contracts WHERE class IN ('fm-probe-review-refuses-detector', 'fm-code-read-stale-checkout'); DELETE FROM failure_modes WHERE fm_key IN ('probe-review-refuses-detector', 'code-read-stale-checkout'); DELETE FROM decision_log WHERE instr(action, 'PROBE-REVIEW-DETECTORS-1:') = 1
-- PROBE-REVIEW-DETECTORS-1 (2026-10-13, pillar autonomy, metric failure_modes_recurring 10 at 11:25 UTC).
-- qnfo-cloud-ops PROBE-REVIEW-1 judges the closing probes of open issues and takes a "self-confirming" one out of the closing path
-- (status probe-review-refused, which neither executor reads). At 08:50 UTC it judged fm-paper-abstract-empty, a failure-mode
-- detector that carries issue_id 2468 only as its origin, against the definition of done of CITE-FULLTEXT-1 and refused it. A
-- failure-mode or belief detector is a standing recurrence probe that closes no issue (scripts/remediation_consumer.py
-- is_standing_detector, qnfo-fleet-control DETECTOR-CADENCE-1), so the refusal switched the detector off and
-- v_failure_mode_status has counted paper-abstract-empty as unprobed since 09:51 UTC.
-- (1) qnfo-cloud-ops 1.26.3 (same pull request) never selects fm-* or belief-* contracts, or module failure-mode, for review.
-- (2) The refused detector is restored and due now; its probe text and issue_id are unchanged.
-- (3) The failure mode is recorded with a d1-query detector: no fm-/belief- contract may sit in probe-review-refused.
-- (4) CODE-READ-FRESH-CHECKOUT-1 (scripts/remediation_consumer.py, same pull request): the consumer run of f5a8bda judged the new
--     code-read detector fm-factcheck-waits-for-slowest at 11:26:08 UTC against a checkout older than the merge that added its marker
--     and wrote missing-marker, a false recurrence. A failing code-read verdict on a contract created after the checkout's commit is
--     no longer written. The detector is made due now, so the first run on this merge judges it.
UPDATE remediation_contracts SET status = 'active', last_verdict = 'restored: PROBE-REVIEW-DETECTORS-1', next_due_at = datetime('now')
WHERE class = 'fm-paper-abstract-empty' AND status = 'probe-review-refused';
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('probe-review-refuses-detector', 'the closing-probe review refuses a standing failure-mode or belief detector, and the detector stops running',
  'PROBE-REVIEW-1 selected every d1-query contract on an open issue; a failure-mode detector carrying its origin issue_id was judged against that issue''s definition of done, judged self-confirming and set to probe-review-refused, a status neither executor reads',
  'PROBE-REVIEW-DETECTORS-1: qnfo-cloud-ops 1.26.3 skips fm-*, belief-* and module failure-mode contracts; migration 2026-10-13-25 restored fm-paper-abstract-empty',
  'no fm-* or belief-* contract has status probe-review-refused', 'fm-probe-review-refuses-detector', '2026-10-13', 2468,
  'a failure-mode detector written with an issue_id', 'failure_modes_recurring counts a detector as unprobed while its contract reads probe-review-refused', 'every failure-mode and belief detector tied to an open issue');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-probe-review-refuses-detector', NULL, 'PROBE-REVIEW-DETECTORS-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status = ''probe-review-refused'' AND (substr(class, 1, 3) = ''fm-'' OR substr(class, 1, 7) = ''belief-'' OR module = ''failure-mode'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a standing detector is an audit of a fixed failure mode, not the closing probe of the issue it came from',
  'PROBE-REVIEW-DETECTORS-1: qnfo-cloud-ops 1.26.3 keeps fm-/belief- detectors out of the closing-probe review; fm-paper-abstract-empty restored',
  'remediation_contracts fm-paper-abstract-empty status probe-review-refused since 2026-10-13 08:50 UTC (note on agent_issues 2468); v_failure_mode_status paper-abstract-empty unprobed, last probed 08:48 UTC; failure_modes_recurring 10 at 11:25 UTC',
  'merged through the canonical path', 'which contracts PROBE-REVIEW-1 selects; one contract status', 'the Rollback line of this file and a revert of qnfo-cloud-ops 1.26.3',
  'failure-mode detectors cannot be switched off by the closing-probe review', 'paper-abstract-empty leaves the unprobed list within two consumer runs of the merge and fm-probe-review-refuses-detector reads 0', 'none',
  'd1:remediation_contracts, v_failure_mode_status, agent_issues 2468; code:qnfo-cloud-ops PROBE_REVIEW_SELECT, scripts/remediation_consumer.py is_standing_detector'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PROBE-REVIEW-DETECTORS-1:') = 1);
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('code-read-stale-checkout', 'a new code-read detector is judged against a checkout older than the merge that added its marker and reads as a recurrence',
  'the remediation consumer checks out main when its run starts; a migration merged while it runs adds a code-read contract whose marker only that merge brings, and the run wrote missing-marker (fm-factcheck-waits-for-slowest, 11:26:08 UTC, verifier f5a8bda)',
  'CODE-READ-FRESH-CHECKOUT-1: consume_code writes no failing verdict for a contract created after the checkout commit (checkout_epoch, newer_than_checkout); the next run judges it',
  'scripts/remediation_consumer.py on main carries the CODE-READ-FRESH-CHECKOUT-1 guard', 'fm-code-read-stale-checkout', '2026-10-13', NULL,
  'a code-read detector added by a migration while a consumer run is in flight', 'a failure mode reads recurring minutes after its fix merged, with observed missing-marker', 'every code-read detector filed with its fix');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-code-read-stale-checkout', NULL, 'CODE-READ-FRESH-CHECKOUT-1', 'failure-mode detector',
  '{"paths": ["scripts/remediation_consumer.py"], "contains": "if passed != 1 and newer_than_checkout(c.get(\"ts\"), checkout_epoch()):"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = 'fm-factcheck-waits-for-slowest' AND status = 'active';

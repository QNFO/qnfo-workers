-- CODE-READ-STALE-CHECKOUT-1 (2026-10-19, charter pillar: autonomy; agent_issues 100081). Companion to the scripts/remediation_consumer.py change.
-- Measured: contract issue-100062 (REPOSLUG-UNIFORM-1) returned last_verdict = checkout-older-than-contract at 2026-10-19T07:49:54Z
-- although its fix was on main and live. The consumer deferred every failing code-read verdict on a contract whose ts was later than the
-- commit time of the checkout's HEAD (CODE-READ-FRESH-CHECKOUT-1, 2026-10-13). On a quiet main that is always true: the contract is written
-- after the last merge, so a checkout that IS the tip of main was called older until some other commit happened to land. The consumer now
-- defers only when origin main has moved past HEAD (or its tip cannot be read), so a current checkout judges the contract. 0 active
-- contracts carry the verdict at the time of this change; the detector below holds that at 0 and gives the verdict 120 minutes (SLA-120M-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-code-read-checkout-false-stale'; DELETE FROM failure_modes WHERE fm_key = 'code-read-checkout-false-stale'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('code-read-checkout-false-stale',
  'a code-read contract reads checkout-older-than-contract although the consumer''s checkout is the tip of main',
  'the consumer compared the commit time of HEAD with the contract''s ts; a contract is written after the merge that brings its marker, so on a quiet main its ts is always later than HEAD''s commit time and the deferral never lifted until an unrelated merge landed',
  'scripts/remediation_consumer.py CODE-READ-STALE-CHECKOUT-1: the deferral applies only when git ls-remote shows origin main past HEAD, or cannot be read; a checkout that is the tip judges the contract and writes its verdict',
  'fm-code-read-checkout-false-stale: active contracts whose last verdict is checkout-older-than-contract and whose last attempt is over 120 minutes old',
  'fm-code-read-checkout-false-stale', '2026-10-19T07:49:54Z', 100081,
  'a code-read contract is created or re-armed after the last commit on main and its probe fails',
  'the contract keeps a deferral verdict instead of a pass or a fail, so the issue cannot close on a fix that is live and a real failure records no attempt',
  'every code-read contract (code-probe lines, fm detectors on repository text); the issue it guards stays open past its SLA');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-code-read-checkout-false-stale', NULL, 'CODE-READ-STALE-CHECKOUT-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status = ''active'' AND last_verdict LIKE ''checkout-older-than-contract%'' AND last_attempt_at < strftime(''%Y-%m-%d %H:%M:%S'', ''now'', ''-120 minutes'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

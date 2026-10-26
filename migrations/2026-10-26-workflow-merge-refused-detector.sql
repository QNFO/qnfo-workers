-- WORKFLOW-MERGE-REFUSED-1 (2026-10-26, charter pillar autonomy; follows migrations/2026-10-26-owner-auto-approve-all.sql).
-- qnfo-fleet-control 0.50.0 lets the stale-PR lane merge a pull request that changes .github/ (owner: "Yes, auto-approve all"). GitHub may still refuse that one merge: a GitHub App
-- (or an Actions token) may not create or update a workflow file without the `workflows` permission, and the answer is an HTTP 403, 404 or 422 whose text names the workflow or says
-- the resource is not accessible by integration. The lane logs it as a branch_hygiene_log 'merge-refused' row ("merge HTTP <status> <message>"). Until the first such pull request is seen,
-- nothing proves the token can do it, so this file registers the failure mode and its detector: a refusal of that shape in the last 24 hours reads above 0 and files an issue within the hour.
-- The step it asks for, when it happens, is the owner's alone (granting the App the `workflows: write` permission is a credential only the owner can mint), so the card carries an IDENTITY-BOUND line.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-lane-workflow-merge-refused'; DELETE FROM failure_modes WHERE fm_key = 'lane-workflow-merge-refused'
-- BACKUP: failure_modes
-- spof-review: no new cron, trigger, binding, host or credential; one failure_modes row and one detector contract.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('lane-workflow-merge-refused', 'the stale-PR lane decides to merge a pull request that changes .github/ and GitHub refuses the merge call, so the owner-approved path stays open for ever',
  'a GitHub App token may not create or update a workflow file without the workflows permission (HTTP 403 "Resource not accessible by integration", 404, or 422 naming the workflow); the lane read it as a refusal and kept the pull request open, and nothing before 0.50.0 had ever asked the token to do it',
  'IDENTITY-BOUND: grant the qnfo-fleet GitHub App the "Workflows: Read and write" repository permission (GitHub settings, the owner''s account); until then a session merges the pull request, as before OWNER-AUTO-APPROVE-ALL-1; the lane retries on every tick and merges it the moment the permission exists',
  'no branch_hygiene_log merge-refused row in the last 24 hours reads "merge HTTP ..." with a workflow or not-accessible text', 'fm-lane-workflow-merge-refused', '2026-10-26', NULL,
  'a pull request that changes .github/ passes every lane gate and the merge call is refused', 'branch_hygiene_log action merge-refused, why "merge HTTP 403/404/422 ..." naming a workflow or "Resource not accessible by integration"; the pull request stays open past 10 minutes', 'every pull request that changes .github/ waits for a session again, past the owner''s 10 minutes');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-lane-workflow-merge-refused', NULL, 'WORKFLOW-MERGE-REFUSED-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM branch_hygiene_log WHERE action = ''merge-refused'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-24 hours'') AND why LIKE ''merge HTTP%'' AND (why LIKE ''%workflow%'' OR why LIKE ''%not accessible%'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

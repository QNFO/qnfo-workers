-- BLOCKER-REDTEAM-AUTO-1 (2026-10-11, pillar autonomy; owner directive 2026-10-11 "Remediate all open items and failure modes, as
-- well as automatic resolution of root causes for future issues 100% autonomously").
-- unverified_blocker_claims read 43 and had no automatic tester: the 9 blocker_redteam rows ever written came from sessions, and
-- v_blocker_claims expires a test after 24 hours, so the metric could only grow. scripts/blocker_redteam_runner.py (a step of
-- remediation-consumer.yml) now attempts each claim deterministically and records the result; a claim it cannot test stays
-- counted. This file records the failure mode and its detector.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-blocker-claims-untested'; DELETE FROM failure_modes WHERE fm_key = 'blocker-claims-untested'
-- BACKUP: failure_modes

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('blocker-claims-untested', 'blocker claims accumulate untested', 'only sessions wrote blocker_redteam rows, and every row expires after 24 hours',
  'BLOCKER-REDTEAM-AUTO-1: the runner tests every claim each run (doer present, token verify, IDENTITY-BOUND line)',
  'a blocker-redteam-runner row within 3 hours whenever a claim is open', 'fm-blocker-claims-untested', '2026-10-09', 2195,
  'the runner step stops', 'unverified_blocker_claims rises', 'false blockers keep work parked');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-blocker-claims-untested', NULL, 'BLOCKER-REDTEAM-AUTO-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM blocker_redteam WHERE actor = ''blocker-redteam-runner'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a blocker claim with a doer, a working token or an identity-bound reason can be tested without a model', 'BLOCKER-REDTEAM-AUTO-1: deterministic red-team of every untested blocker claim each consumer run', 'v_blocker_claims 2026-10-11 09:40Z: 43 claims, 9 blocker_redteam rows ever (sessions only)', 'false blockers are removed with evidence; real ones are confirmed with their reason', 'blocker_redteam inserts only', 'drop the workflow step', 'the fleet red-teams its own blocker claims', 'within one consumer run unverified_blocker_claims falls below 25', NULL, 'D1, Cloudflare token verify'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BLOCKER-REDTEAM-AUTO-1%');

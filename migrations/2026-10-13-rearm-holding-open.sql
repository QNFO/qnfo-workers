-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'holding' WHERE class IN ('issue-2192', 'issue-2193', 'issue-2195') AND status = 'active'
--
-- HOLDING-OPEN-REARM-1 (2026-10-13; charter pillar autonomy). A contract moves to 'holding' after a pass (REMEDIATION-HOLD-1,
-- daily re-probe). When the issue is reopened by the D1 trigger issue_refile_reopen, nothing re-arms its contract, so an open
-- issue is probed once a day at most, or not at all while the stored next_due_at goes stale. Read 2026-10-13 22:05Z: open
-- issues 2192, 2193 and 2195 had 'holding' contracts last attempted at 07:21Z and due since 08:16Z, 14 hours without a probe;
-- 2192 (metric staleness) was reopened at 21:01Z and passes again, but cannot close. Data only: no trigger is created or
-- dropped (D1-TRIGGER-DEPTH-1). The lasting fix belongs in the qnfo-fleet-control remediation tick (an open issue's holding
-- contract runs as active); the fm-holding-open-overdue detector below reports any recurrence within the hour.

UPDATE remediation_contracts SET status = 'active', next_due_at = datetime('now'), attempts = 0
WHERE status = 'holding' AND class NOT LIKE 'fm-%' AND class NOT LIKE 'belief-%'
  AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('holding-open-overdue',
 'an open issue''s contract stays in holding, so the issue is not re-probed and cannot close itself',
 'issue_refile_reopen (D1) reopens the issue but leaves its contract in holding; the remediation tick re-arms a holding contract only when it reopens the issue itself (REMEDIATION-REOPEN-1)',
 'HOLDING-OPEN-REARM-1 re-armed the stuck contracts; the lasting fix is for the remediation tick to run an open issue''s holding contract as active',
 'no open issue has a holding contract due more than 2 hours ago',
 'fm-holding-open-overdue', '2026-10-13', 2192,
 'a closed issue refiled within 24 h of its close',
 'issues 2192, 2193 and 2195 unprobed for 14 hours while open',
 'every issue the refile trigger reopens');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-holding-open-overdue', NULL, 'HOLDING-OPEN-REARM-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = ''open'' AND c.status = ''holding'' AND c.next_due_at IS NOT NULL AND datetime(c.next_due_at) < datetime(''now'', ''-2 hours'')) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
  predicted_outcome, reach_gain, surfaces_tested) VALUES
('session_018gmMjMgWAuzVh7gHPBcosA',
 'an open issue is always probed at its own cadence, whatever state its contract was left in by an earlier close',
 'HOLDING-OPEN-REARM-1: re-armed holding contracts of open issues; fm-holding-open-overdue detector',
 'read 2026-10-13 22:05Z: open issues 2192, 2193, 2195 with holding contracts due since 08:16Z, last attempt 07:21Z',
 'applied by apply-migrations', 'three remediation_contracts rows', 'see the Rollback header',
 'reopened issues are probed again and can close on their own',
 'fm-holding-open-overdue = 0 within 2 h', 'none', 'live D1 read; zero-trigger data migration');

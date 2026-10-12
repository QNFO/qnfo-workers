-- HEARTBEAT-PROBE-REPAIR-1 (2026-10-12, pillar autonomy; agent_issues 2119, 2133, 2204). Three contracts required a
-- fleet_heartbeat row that can never be written: qnfo-fleet-dashboard writes no heartbeat at all (fleet_heartbeat holds 7
-- workers on 2026-10-12, none of them the dashboard), and qnfo-email-orchestrator is FOLDED into qnfo-cloud-ops as member
-- 0.5.4-folded, so its version never reaches 0.5.5. Each probe is rebased on the thing it was meant to prove:
--   2119 the owner-local cost line is on the public dashboard (fleet.qnfo.org/ carries "(owner-local)", read 2026-10-12),
--        checked from the runner;
--   2133 watchmaker_index <= 1 (the dashboard part is live at 1.29.2; reads 1 on 2026-10-12);
--   2204 inbound_first_response_h_median_30d <= 24 (reads 24.1 on 2026-10-12, so this one stays open on the metric itself).
-- The failure mode probe-awaits-missing-heartbeat counts active contracts that wait on a heartbeat its worker has not
-- written in 2 days.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: -- restore the three verify_probe values from git history (migrations that set them); DELETE FROM remediation_contracts WHERE class = 'fm-probe-awaits-missing-heartbeat'; DELETE FROM failure_modes WHERE fm_key = 'probe-awaits-missing-heartbeat'

UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "(owner-local)"}', verify_transport = 'runner-https',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2119';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''watchmaker_index'') AS REAL) <= 1 THEN ''ok'' ELSE ''watchmaker_index reads '' || COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''watchmaker_index''), ''?'') END AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2133';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''inbound_first_response_h_median_30d'') AS REAL) <= 24 THEN ''ok'' ELSE ''median '' || COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''inbound_first_response_h_median_30d''), ''n/a'') || '' h'' END AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2204';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('probe-awaits-missing-heartbeat', 'a contract waits on a fleet_heartbeat row its worker never writes',
  'probes were written against fleet_heartbeat for workers that do not heartbeat (qnfo-fleet-dashboard) or are folded at a fixed member version',
  'HEARTBEAT-PROBE-REPAIR-1: rebase such probes on the behaviour (runner-https on the live page, or the metric itself)',
  'no active contract names a worker in fleet_heartbeat that has written no heartbeat in 2 days', 'fm-probe-awaits-missing-heartbeat', '2026-10-12', 2119,
  'a probe written by hand for a deploy check', 'an issue whose fix is live stays open forever', 'issues that cannot close');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-probe-awaits-missing-heartbeat', NULL, 'HEARTBEAT-PROBE-REPAIR-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id JOIN service_registry s ON instr(c.verify_probe, ''fleet_heartbeat WHERE worker = '''''' || s.service || '''''''') > 0 WHERE c.status IN (''active'', ''holding'') AND a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM fleet_heartbeat h WHERE h.worker = s.service AND h.ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 days''))) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'fm-sweep-empty'; DELETE FROM remediation_contracts WHERE class = 'fm-sweep-empty';
-- BACKUP: failure_modes
-- Issue 8329 (SWEEP-EMPTY-1): a finished cmdline-maintain sweep that filed nothing went unnoticed. qnfo-agents 0.16.2 files SWEEP-EMPTY-1 in code; this registers the failure mode and its detector.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen)
VALUES ('fm-sweep-empty',
  'A finished cmdline-maintain sweep filed no agent_issues row and nothing noticed',
  'The first live sweep (request 2645) read for 16 steps, returned no file_issue id, and the run closed as done with no check on its yield',
  'qnfo-agents 0.16.2 executeRun files SWEEP-EMPTY-1 with the run id when a done sweep returned no filed-issue id (qnfo-agents/src/lib.js, maintain.test.mjs)',
  'd1-query: done cmdline-maintain requests with no later agent-source agent_issues row (expected 0)',
  'fm-sweep-empty', '2026-11-06 17:36:40');
INSERT INTO remediation_contracts (class, verify_transport, verify_probe, expected_cadence_h, precondition, action, max_attempts, escalate_to, status)
SELECT 'fm-sweep-empty', 'd1-query',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cf_agent_requests r WHERE r.requester LIKE ''cmdline-maintain%'' AND r.status = ''done'' AND NOT EXISTS (SELECT 1 FROM agent_issues i WHERE i.created_at >= strftime(''%s'', r.created_at) * 1000 AND i.source LIKE ''%agent%'')) AS TEXT) AS observed',
  1, 'TRUE', 'file_issue', 3, 'code-loop', 'active'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-sweep-empty');

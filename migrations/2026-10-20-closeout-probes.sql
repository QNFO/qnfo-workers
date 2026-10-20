-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded' WHERE class IN ('issue-100295', 'issue-100298', 'issue-100299');
-- Session closeout (session_01PzViV5mKHujgukcPrHsfAE, 2026-10-20; owner: "handoff remaining items to server-side"). Issues 100295,
-- 100298 and 100299 had only contracts born superseded, so nothing closed them. Each gets a d1-query probe on its own definition of done,
-- read by the hourly remediation tick, which closes the issue when the probe passes. Pillar autonomy.
UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''0'' AS expected, CAST(COALESCE((SELECT CAST(last_value AS INTEGER) FROM metric_registry WHERE metric = ''merges_undeployed_over_60m''), 1) + COALESCE((SELECT CAST(last_value AS INTEGER) FROM metric_registry WHERE metric = ''code_prs_unmerged_over_120m''), 1) AS TEXT) AS observed',
       verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100298';
UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''0'' AS expected, COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''issues_over_24h_no_doer''), ''unmeasured'') AS observed',
       verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100299';
UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''0'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM workflow_main_state) = 0 THEN 1 ELSE 0 END + (SELECT COUNT(*) FROM workflow_main_state s WHERE s.conclusion IN (''failure'', ''timed_out'', ''startup_failure'') AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = ''open'' AND a.title = ''WORKFLOW-FAILED-1: '' || s.workflow)) AS TEXT) AS observed',
       verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100295';

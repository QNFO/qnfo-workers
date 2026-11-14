-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN verdict = ''ok'' THEN ''ok'' ELSE verdict END AS observed FROM cf_resource_registry WHERE id = ''d1:' || substr((SELECT a.title FROM agent_issues a WHERE 'issue-' || a.id = remediation_contracts.class), 23) || '''' WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'CF-RESOURCE-HOT-1: d1 %') AND verify_probe LIKE '%WHERE rtype = ''d1'' AND name = %'
-- CAUSE-MAPPED: registers no metric.
-- CF-RESOURCE-HOT-PROBE-1 (2026-11-14, charter pillar: cost; follows CLOSING-PROBE-ADOPT-1, #11885). The two CF-RESOURCE-HOT-1 issues (d1 living-paper, d1 qnfo-audit)
-- carry a closing probe that names cf_resource_registry id 'd1:<database name>', but D1 rows are keyed 'd1:<database uuid>' (the registry writes rtype:rid), so
-- the adopted probe returned no row and the consumer stamped vacuous-probe-result (2026-11-14T15:10Z). The probe now selects the row by rtype and name.
-- It fails honestly while the database stays hot (> 500M rows read in 7 days) and closes the issue when the registry stops marking it hot. New issues are
-- filed with the row id by the qnfo-cloud-ops fix in agent_issues 1003554.
-- Replayed on node:sqlite before the PR: probe returns {"expected":"ok","observed":"hot"} while hot, {"expected":"ok","observed":"ok"} after; the Rollback line restores the old text.
UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN verdict IN (''ok'', ''resolved'') THEN ''ok'' ELSE verdict END AS observed FROM cf_resource_registry WHERE rtype = ''d1'' AND name = ''' || substr((SELECT a.title FROM agent_issues a WHERE 'issue-' || a.id = remediation_contracts.class), 23) || '''',
       last_verdict = NULL, next_due_at = datetime('now')
 WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE status = 'open' AND title LIKE 'CF-RESOURCE-HOT-1: d1 %' AND instr(substr(title, 23), '''') = 0)
   AND verify_probe LIKE '%FROM cf_resource_registry WHERE id = ''d1:%';

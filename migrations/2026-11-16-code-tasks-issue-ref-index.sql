-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_code_tasks_issue_ref; UPDATE remediation_contracts SET verify_probe = (SELECT body FROM bak_20261116_code_tasks_issue_ref WHERE kind = 'probe') WHERE class = 'fm-remediation-over-budget-metric-lifetime-count'
-- CAUSE-MAPPED: registers no metric_registry row.
-- D1-READS-CUT-9: the RED-DRAIN eligibility count scanned code_tasks with goal LIKE '%#N %' per candidate (469,497 rows read per run).
-- An expression index on the issue number in goal turns it into an index lookup (measured 1,114 rows read). The over-budget metric
-- detector probe is moved to the same predicate so both keep measuring the same set (review finding on PR 12285).
CREATE INDEX IF NOT EXISTS idx_code_tasks_issue_ref ON code_tasks(CAST(substr(goal, instr(goal,'#')+1) AS INTEGER), status);

CREATE TABLE IF NOT EXISTS bak_20261116_code_tasks_issue_ref (kind TEXT, name TEXT, body TEXT);
INSERT INTO bak_20261116_code_tasks_issue_ref (kind, name, body)
SELECT 'probe', class, verify_probe FROM remediation_contracts WHERE class = 'fm-remediation-over-budget-metric-lifetime-count'
  AND NOT EXISTS (SELECT 1 FROM bak_20261116_code_tasks_issue_ref WHERE kind = 'probe');

UPDATE remediation_contracts SET verify_probe =
 'SELECT ''0'' AS expected, CAST(CASE WHEN EXISTS (SELECT 1 FROM metric_registry m WHERE m.metric = ''remediation_contracts_over_budget'' AND CAST(m.last_value AS INTEGER) = '
 || '(SELECT COUNT(*) FROM remediation_contracts r WHERE r.status IN (''active'',''holding'') AND r.last_verdict=''fail'' AND r.attempts > 5*COALESCE(r.max_attempts,3) '
 || 'AND substr(r.class,1,3) <> ''fm-'' AND substr(r.class,1,7) <> ''belief-'' '
 || 'AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN (''closed'',''superseded'') AND CAST(substr(ct.goal, instr(ct.goal,''#'')+1) AS INTEGER) = r.issue_id) '
 || 'AND NOT (r.issue_id IS NOT NULL AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id=r.issue_id AND a.status=''open'' AND a.title NOT LIKE ''METRIC-TRIGGER-%'') '
 || 'AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id=r.issue_id AND c2.class<>r.class AND c2.status IN (''active'',''holding'')))) '
 || 'AND m.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-120 minutes'')) THEN 0 ELSE 1 END AS TEXT) AS observed'
WHERE class = 'fm-remediation-over-budget-metric-lifetime-count' AND verify_probe LIKE '%group_concat(goal%';

-- APPLY-BY: ci
-- DB: qnfo-audit
-- ORPHAN-GUARD-BIRTH-1b (2026-10-06, pillar autonomy; follow-up to migrations/2026-10-06-orphan-birth-contracts.sql).
-- The v2 template owns a loop-filed issue only when agent_issues.source equals a live service_registry.service. Loops file
-- under a sub-name (issue 2083 came from "qnfo-lifecycle-metric-freshness", a loop inside qnfo-lifecycle), so such an issue kept
-- the needs-machine-probe placeholder and the orphan guard counted it (issues_without_next_action read 1 at 19:00Z). A second
-- template (v2b) matches a source that starts with a live service name followed by "-"; v2 stays as it is (no DROP), and when
-- both match, v2 runs first and v2b finds nothing left to do. The backfill gives every placeholder contract of such an issue
-- the same 48h probe.
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_v2b_loop;

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_v2b_loop AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.state = 'live' AND instr(a.source, s.service || '-') = 1
              WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'filed by a live fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)',
      action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
      verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

-- Backfill: every placeholder contract of an open issue filed under a sub-name of a live service.
UPDATE remediation_contracts
SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
    precondition = 'filed by a live fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)',
    action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
    verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ' did not close it within 48h'' END AS observed'
WHERE status = 'needs-machine-probe' AND issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.state = 'live' AND (s.service = a.source OR instr(a.source, s.service || '-') = 1)
              WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%');

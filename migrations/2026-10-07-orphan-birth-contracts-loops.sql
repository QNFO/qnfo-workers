-- APPLY-BY: ci
-- DB: qnfo-audit
-- ORPHAN-GUARD-BIRTH-1c (2026-10-07, pillar autonomy; follow-up to 2026-10-06-orphan-birth-contracts.sql and -prefix.sql).
-- The v2 and v2b templates own a loop-filed issue only when its source is a live service name or a sub-name of one. Loops also
-- file under their own names: charter-loop (CHARTER-MVP-DOWN-1, five issues), objective-constraints (OBJECTIVE-CONSTRAINT-BREACH-1),
-- qnfo-fleet-advisor (MODEL-DEGRADED). Measured 2026-10-07T08:01Z: issues_without_next_action read 7, all seven from such
-- sources. A loop is anything that is not a session, a chat or the owner's queue, so the v2c template owns every issue whose
-- source is not one of those and whose title is not a metric trigger's (v1 owns those). v2 and v2b stay; when several match,
-- the first to run sets the probe and the others find nothing left (WHERE status = 'needs-machine-probe').
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_v2c_loop;

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_v2c_loop AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
              AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
              AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
              AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%')
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'filed by a fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)',
      action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
      verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

-- Backfill: every placeholder contract of an open issue filed by such a loop.
UPDATE remediation_contracts
SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
    precondition = 'filed by a fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)',
    action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
    verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ' did not close it within 48h'' END AS observed'
WHERE status = 'needs-machine-probe' AND issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%'
              AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
              AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
              AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%');

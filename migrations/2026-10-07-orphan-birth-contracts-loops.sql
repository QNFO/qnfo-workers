-- APPLY-BY: ci
-- DB: qnfo-audit
-- ORPHAN-GUARD-BIRTH-1c (2026-10-07, pillar autonomy; follow-up to 2026-10-06-orphan-birth-contracts.sql, -prefix.sql and
-- 2026-10-07-loop-source-hosts.sql). The v2 and v2b templates own a loop-filed issue when its source is a live service name or
-- a sub-name of one; v2c (LOOP-SOURCE-HOSTS-1, PR 760, applied 2026-10-07T08:26Z) owns a source that has an issue_source_hosts
-- row whose host is live. A loop that files under a label with no row (charter-loop and objective-constraints had none until
-- PR 760 seeded them; measured 2026-10-07T08:01Z: issues_without_next_action read 7, all from such labels) still keeps the
-- placeholder and needs a person or a session to add the row. This fallback (v2d) owns every remaining issue whose source is
-- not a session, a chat or the owner's queue, with the same 48h probe, so a new loop label needs no row to get its next action.
-- v2, v2b and v2c stay; when several match, the first to run sets the probe and the others find nothing left
-- (WHERE status = 'needs-machine-probe'), and v2d's WHEN clause excludes a mapped label outright.
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_v2d_unmapped_loop;

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_v2d_unmapped_loop AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
              AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
              AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
              AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
              AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source))
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2d-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'filed by a fleet loop under an unmapped label (ORPHAN-GUARD-BIRTH-1c), which owns it for 48h',
      action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
      verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

-- Backfill: every placeholder contract of an open issue filed by such an unmapped loop.
UPDATE remediation_contracts
SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2d-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
    precondition = 'filed by a fleet loop under an unmapped label (ORPHAN-GUARD-BIRTH-1c), which owns it for 48h',
    action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
    verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ' did not close it within 48h'' END AS observed'
WHERE status = 'needs-machine-probe' AND issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%'
              AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
              AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
              AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
              AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source));

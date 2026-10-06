-- ORPHAN-GUARD-BIRTH-1 (2026-10-06, pillar autonomy, transformation lever T5.13). The first hour of ORPHAN-ISSUE-GUARD-1 live
-- (issues_without_next_action, 15:00Z) found two orphans that were nobody's fault: CRAWL-HEALTH-1 (2065, filed and closed
-- by the crawl-health loop itself) and the guard's own METRIC-TRIGGER issue (2066). Both had no remediation_contracts row
-- at all: contract rows were written later by the bridge, and contract_probe_templates_v1 (the probe at birth for
-- METRIC-TRIGGER issues) fires only when such a row is inserted. Two triggers close that gap:
--   agent_issues_birth_contract_ins   every new open issue gets its contract row (status needs-machine-probe) the moment it
--                                      is inserted, so the v1 template gives a METRIC-TRIGGER issue its probe at birth;
--   contract_probe_templates_v2_loop   an issue filed by a live fleet worker (agent_issues.source in service_registry) that is
--                                      not a METRIC-TRIGGER issue is owned by that loop: its contract becomes active with a
--                                      probe that reads pending for 48h (the loop closes it on recovery, as the crawl-health,
--                                      loop-watch and q08 stall loops do) and stale after 48h open, which fails the probe and
--                                      escalates. A needs-machine-probe placeholder was, and is, not a next action.
-- The backfill gives every open issue without a contract row one now; the templates fire on those rows too.
-- Idempotent: CREATE TRIGGER IF NOT EXISTS, INSERT OR IGNORE, guarded INSERT.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_birth_contract_ins; DROP TRIGGER IF EXISTS contract_probe_templates_v2_loop;

CREATE TRIGGER IF NOT EXISTS agent_issues_birth_contract_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id)
BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 24, 'needs-machine-probe', 'birth');
END;

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_v2_loop AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
              WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'filed by a live fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)',
      action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
      verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
SELECT 'issue-' || a.id, a.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1 backfill)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 24, 'needs-machine-probe', 'birth'
FROM agent_issues a
WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id);

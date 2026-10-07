-- LOOP-SOURCE-HOSTS-1 (2026-10-07, pillar autonomy; owner directive 2026-10-07 "maximize system autonomy"). Measured
-- 2026-10-07 08:20Z: issues_without_next_action = 7 (trigger 1959 in breach, target 0). All 7 were filed by loops that
-- close their own issues on recovery: 5 CHARTER-MVP-DOWN-1 (source 'charter-loop'), 1 OBJECTIVE-CONSTRAINT-BREACH-1
-- (source 'objective-constraints') and 1 MODEL-DEGRADED (source 'qnfo-fleet-advisor'). Each got a birth contract
-- (ORPHAN-GUARD-BIRTH-1) that stayed needs-machine-probe, because contract_probe_templates_v2_loop owns an issue only when
-- agent_issues.source is a live service_registry name, and these labels are loop names inside qnfo-fleet-control (the
-- advisor runs there as a folded member). This file:
--   1. issue_source_hosts maps a loop label to the worker that runs it; seeded with the three labels above;
--   2. contract_probe_templates_v2c_loop gives an issue from a mapped label, whose host is live, the same 48h ownership
--      probe as v2 (pending while the loop owns it, ok once closed, stale after 48h open, which fails and escalates);
--   3. backfills the open issues from mapped labels whose contract is still the needs-machine-probe placeholder.
-- A loop that files under a new label adds one row here; a label with no row keeps today's behaviour.
-- Idempotent: CREATE ... IF NOT EXISTS, INSERT OR IGNORE, guarded UPDATE. No DELETE or DROP outside the rollback.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_v2c_loop; UPDATE remediation_contracts SET status = 'needs-machine-probe', verify_probe = 'needs-machine-probe', module = 'birth' WHERE module = 'probe-template-v2c-loop'; DROP TABLE IF EXISTS issue_source_hosts;

CREATE TABLE IF NOT EXISTS issue_source_hosts (source TEXT PRIMARY KEY, host TEXT NOT NULL, note TEXT, ts TEXT DEFAULT (datetime('now')));

INSERT OR IGNORE INTO issue_source_hosts (source, host, note) VALUES
 ('charter-loop', 'qnfo-fleet-control', 'CHARTER-LOOP-1 files and closes CHARTER-MVP-DOWN-1 and friends'),
 ('objective-constraints', 'qnfo-fleet-control', 'OBJECTIVE-CONSTRAINTS-1 files and closes OBJECTIVE-CONSTRAINT-BREACH-1'),
 ('qnfo-fleet-advisor', 'qnfo-fleet-control', 'the advisor member files MODEL-DEGRADED and gateway findings; the backlog sweep (qnfo-lifecycle backlogMod) closes model-health issues once no named model is degraded');

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_v2c_loop AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
              JOIN service_registry s ON s.service = m.host AND s.state = 'live'
              WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2c-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'filed by a fleet loop under a mapped label (LOOP-SOURCE-HOSTS-1), which owns it for 48h',
      action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
      verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

UPDATE remediation_contracts
SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2c-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
    precondition = 'filed by a fleet loop under a mapped label (LOOP-SOURCE-HOSTS-1), which owns it for 48h',
    action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
    verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ' did not close it within 48h'' END AS observed'
WHERE status = 'needs-machine-probe' AND verify_probe = 'needs-machine-probe' AND issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
              JOIN service_registry s ON s.service = m.host AND s.state = 'live'
              WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%');

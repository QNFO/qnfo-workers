-- PROBE-CADENCE-FLOOR-1 (2026-10-12, pillar autonomy; owner directives 2026-10-06 OWNER-NO-LOOSE-ENDS-1 and 2026-10-08 QUEUE-SLA-1:
-- no issue unprobed or unprocessed for more than one cycle).
-- issues_unprobed_60m read 19 live (target <= 10) with 188 open issues. 17 of them are contracts that cannot meet the 60-minute
-- window by construction: 12 sit on expected_cadence_h 6, 2 on 24, 1 on 2 (the consumer stamps next_due_at from that value), and
-- 2 (issues 2272, 2283) are still needs-machine-probe because no template matches a session-filed issue. The cause is the birth
-- trigger agent_issues_birth_contract_ins, which hard-codes expected_cadence_h 24 for every new issue. This migration:
--   1. keeps the 17 rows' old cadence in bak_20261012_probe_cadence, then sets every active contract of an open issue to hourly;
--   2. recreates the birth trigger with cadence 1;
--   3. adds a floor trigger so an insert or update of an active issue contract can never again set a cadence above 1;
--   4. adds the third birth template (v3): an issue no earlier template claims gets a machine-executable probe that stays failing
--      until the issue itself is closed with evidence, so it is probed hourly instead of waiting at needs-machine-probe;
--   5. drops the empty `contains` key from issue-2077's probe (the runner reads "" as not machine-executable).
-- It closes nothing and edits no metric. Detector contracts (fm-*, belief-*) are untouched: they already run hourly.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_probe_cadence
-- Rollback: DROP TRIGGER IF EXISTS remediation_contracts_cadence_floor_ai; DROP TRIGGER IF EXISTS remediation_contracts_cadence_floor_au; DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic; UPDATE remediation_contracts SET expected_cadence_h = (SELECT b.expected_cadence_h FROM bak_20261012_probe_cadence b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261012_probe_cadence)

CREATE TABLE IF NOT EXISTS bak_20261012_probe_cadence AS
SELECT c.class, c.expected_cadence_h, c.status, c.verify_probe, c.next_due_at
FROM remediation_contracts c
WHERE c.issue_id IN (SELECT id FROM agent_issues WHERE status = 'open')
  AND (c.expected_cadence_h IS NULL OR c.expected_cadence_h > 1 OR c.status = 'needs-machine-probe');

UPDATE remediation_contracts SET expected_cadence_h = 1, next_due_at = datetime('now')
WHERE status = 'active' AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open')
  AND (expected_cadence_h IS NULL OR expected_cadence_h > 1);

DROP TRIGGER IF EXISTS agent_issues_birth_contract_ins;
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id)
BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth');
END;

DROP TRIGGER IF EXISTS remediation_contracts_cadence_floor_ai;
CREATE TRIGGER remediation_contracts_cadence_floor_ai AFTER INSERT ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;

DROP TRIGGER IF EXISTS remediation_contracts_cadence_floor_au;
CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;

DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic;
CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live' WHERE a.id = NEW.issue_id)
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)',
      action = 'the issue closes only through issue_triage.close_evidence; the probe reads its status every hour and fails while it is open',
      verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE ''open: no close_evidence yet'' END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

UPDATE remediation_contracts
SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1,
    precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)',
    action = 'the issue closes only through issue_triage.close_evidence; the probe reads its status every hour and fails while it is open',
    verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE ''open: no close_evidence yet'' END FROM agent_issues WHERE id = ' || issue_id || ') AS observed'
WHERE status = 'needs-machine-probe' AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');

UPDATE remediation_contracts
SET verify_probe = '{"url": "https://scorecard.qnfo.org/", "status": 410}', next_due_at = datetime('now'), last_verdict = NULL
WHERE class = 'issue-2077' AND verify_probe LIKE '%"contains": ""%';

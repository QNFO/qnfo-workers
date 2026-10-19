-- KPI-THRESHOLDS-1 (agent_issues 2727) and CODE-FLOW-PR-SPLIT-1 (agent_issues 2941): closing probes (2026-10-19, qnfo-fleet-dashboard 1.46.0, pillar autonomy).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_rc_kpi_flow b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261019_rc_kpi_flow b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261019_rc_kpi_flow b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_rc_kpi_flow b WHERE b.class = remediation_contracts.class) WHERE class IN ('issue-2727', 'issue-2941');
--
-- WHY
-- Both issues describe live behaviour of fleet.qnfo.org and had no machine-executable closing probe: issue-2727 carried the
-- closure-observing template (CLOSE-PROBE-CIRCULAR-1, status superseded) and issue-2941 read "probe-unusable". The change that fixes
-- them (qnfo-fleet-dashboard 1.46.0) ships the figures the issues ask for; a runner-https probe that fails until the deploy and passes
-- after it lets the hourly consumer close them against their own definitions of done.
--   issue-2727: GET /api/kpi has a service_levels document and no key named last_7d (the issue's own probe: no last_7d or all_time).
--   issue-2941: GET /api/area/autonomy shows the Code loop flow split by pull request (stage closed-no-pr) and the old stage label
--               "closed, unmerged" is gone.
-- The previous contract rows are kept in bak_20261019_rc_kpi_flow (the rollback restores them).

CREATE TABLE IF NOT EXISTS bak_20261019_rc_kpi_flow AS
  SELECT class, verify_probe, verify_transport, status, last_verdict FROM remediation_contracts WHERE class IN ('issue-2727', 'issue-2941');

UPDATE remediation_contracts
  SET verify_transport = 'runner-https', verify_probe = '{"url": "https://fleet.qnfo.org/api/kpi", "status": 200, "contains": "service_levels", "absent": "last_7d"}',
      status = 'active', module = 'kpi-flow-closing-probe', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      expected_cadence_h = 1, max_attempts = 3,
      precondition = 'KPI-THRESHOLDS-1 shipped as qnfo-fleet-dashboard 1.46.0',
      action = 'merge and deploy the change; scripts/remediation_consumer.py GETs /api/kpi from the GitHub runner and a pass closes the issue'
  WHERE class = 'issue-2727' AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2727 AND status = 'open');

UPDATE remediation_contracts
  SET verify_transport = 'runner-https', verify_probe = '{"url": "https://fleet.qnfo.org/api/area/autonomy", "status": 200, "contains": "closed-no-pr", "absent": "closed, unmerged"}',
      status = 'active', module = 'kpi-flow-closing-probe', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      expected_cadence_h = 1, max_attempts = 3,
      precondition = 'CODE-FLOW-PR-SPLIT-1 shipped as qnfo-fleet-dashboard 1.46.0',
      action = 'merge and deploy the change; scripts/remediation_consumer.py GETs the autonomy area feed from the GitHub runner and a pass closes the issue'
  WHERE class = 'issue-2941' AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2941 AND status = 'open');

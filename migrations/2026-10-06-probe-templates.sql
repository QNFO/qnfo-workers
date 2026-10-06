-- PROBE-TEMPLATES-1 (2026-10-06, pillar autonomy, transformation lever T5.2 "probe generator"): a METRIC-TRIGGER issue's
-- contract is born with its machine probe instead of waiting for a session to write one. Measured 2026-10-06: of the 16
-- open METRIC-TRIGGER issues, 15 carry an active probe that a session wrote by hand (modules session, metric-gap,
-- issue-contract-bridge; most read v_metric_trigger_state.hit for the issue's own trigger), and the newest (issue 2022,
-- trigger 404) was born needs-machine-probe like every one before it. scripts/remediation_contract_bridge.py registers an
-- unmapped issue with that sentinel; this D1 trigger fills the probe at insert, so it covers every writer.
-- The probe is the filer's own verdict, not prose: the issue title is built by qnfo-fleet-control evaluateMetricTriggers as
-- METRIC-TRIGGER-<trigger id>-<METRIC>, and the probe passes only when that trigger reads hit = 0 on a measured value (an
-- unmeasured, disabled or missing trigger reads 0). Only the integer id is taken from the title.
-- Deliberately NOT templated: TOOL-FAILURE issues. "No error from the tool in 7 days" never holds for a tool whose callers
-- send bad input (ops_d1_query errs on model-written SQL daily), so that probe would fail for ever and only lower the guard
-- remediation_latest_pass_pct_7d; qnfo-ops' own classifier closes that family (47 of 49 in 30 days).
-- Generated rows carry module 'probe-template-v1'. Also templates open METRIC-TRIGGER placeholders once (issue 2022 today).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_v1; UPDATE remediation_contracts SET status = 'needs-machine-probe', verify_probe = 'needs-machine-probe', verify_transport = 'd1-query', module = 'issue-contract-bridge' WHERE module = 'probe-template-v1';

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_v1
AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v1', attempts = 0, last_verdict = NULL,
      next_due_at = datetime('now'),
      verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') = 0 AND (SELECT val FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') IS NOT NULL THEN ''1'' ELSE ''0'' END AS observed'
  WHERE class = NEW.class
    AND EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND title LIKE 'METRIC-TRIGGER-%' AND CAST(substr(title, 16) AS INTEGER) > 0);
END;

UPDATE remediation_contracts
SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v1', attempts = 0, last_verdict = NULL,
    next_due_at = datetime('now'),
    verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = '
      || (SELECT CAST(substr(i.title, 16) AS INTEGER) FROM agent_issues i WHERE i.id = remediation_contracts.issue_id)
      || ') = 0 AND (SELECT val FROM v_metric_trigger_state WHERE id = '
      || (SELECT CAST(substr(i.title, 16) AS INTEGER) FROM agent_issues i WHERE i.id = remediation_contracts.issue_id)
      || ') IS NOT NULL THEN ''1'' ELSE ''0'' END AS observed'
WHERE status = 'needs-machine-probe'
  AND issue_id IN (SELECT id FROM agent_issues WHERE status NOT IN ('closed', 'resolved', 'wontfix') AND title LIKE 'METRIC-TRIGGER-%' AND CAST(substr(title, 16) AS INTEGER) > 0);

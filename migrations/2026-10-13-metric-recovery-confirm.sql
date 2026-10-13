-- METRIC-RECOVERY-CONFIRM-1 (2026-10-13, pillar autonomy; owner directive 2026-10-13 "All issues shall be remediated/resolved/
-- drained/deployed faster than they accumulate", audit after REMEDIATION-2X-1). A METRIC-TRIGGER issue's closing probe
-- (PROBE-TEMPLATES-1, module probe-template-v1) passed on a single reading with hit = 0, so a metric hovering at its threshold
-- closed its issue and evaluateMetricTriggers filed it again (issue_refile_reopen reopens it) a few hours later. In the 48 h to
-- 2026-10-13 19:40Z six METRIC-TRIGGER issues reopened two or more times (1780 fleet_ai_run_rate_30d_usd 10 times, 2167 3, 2193 2,
-- 2194 2, 2195 2, 2459 2): 21 of 127 reopens, each one counted as new inflow by issue_drain_ratio_24h.
-- The probe now asks for a recovery confirmed across a refresh of the metric:
--   breach (hit = 1, or no value)                                  -> '0'   (as before)
--   first reading with hit = 0                                     -> 'recovering' (no pass; the issue stays open)
--   hit = 0, the contract's previous verification read 'recovering'
--     or '1', and metric_registry.last_refreshed is later than it  -> '1'   (pass; the auto-close closes the issue)
-- A metric with no refresh stamp needs the recovery to hold 50 minutes. Only the integer trigger id (from the title) and the
-- integer issue id reach the probe text, as before. The post-close hold (REMEDIATION-HOLD-1) reads the same probe: a held contract
-- whose previous verification passed keeps passing while hit = 0, and a breach reads '0' and reopens, as before.
-- Generated rows carry module 'probe-template-v1h'. failure_modes row metric-close-flap with detector fm-metric-close-flap.
-- spof-review: no new path; the template trigger is replaced in place on the same table and keeps one producer, as before.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_v1_probes
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261013_v1_probes b WHERE b.class = remediation_contracts.class), module = 'probe-template-v1' WHERE class IN (SELECT class FROM bak_20261013_v1_probes); DROP TRIGGER IF EXISTS contract_probe_templates_v1; then re-run the CREATE TRIGGER of migrations/2026-10-06-probe-templates.sql; DELETE FROM remediation_contracts WHERE class = 'fm-metric-close-flap'; DELETE FROM failure_modes WHERE fm_key = 'metric-close-flap'

CREATE TABLE IF NOT EXISTS bak_20261013_v1_probes AS
  SELECT class, issue_id, verify_probe, module, status, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
  FROM remediation_contracts WHERE module IN ('probe-template-v1', 'probe-template-v1h');

DROP TRIGGER IF EXISTS contract_probe_templates_v1;

CREATE TRIGGER IF NOT EXISTS contract_probe_templates_v1
AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v1h', attempts = 0, last_verdict = NULL,
      next_due_at = datetime('now'),
      verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') = 0 AND (SELECT val FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') IS NOT NULL THEN CASE WHEN (SELECT COUNT(*) FROM (SELECT observed, verified_at FROM remediation_verifications WHERE class = ''issue-'
        || CAST(NEW.issue_id AS INTEGER)
        || ''' ORDER BY id DESC LIMIT 1) p WHERE p.observed IN (''1'', ''recovering'') AND datetime(p.verified_at) < COALESCE(datetime((SELECT last_refreshed FROM metric_registry WHERE metric = (SELECT metric_key FROM analytics_metric_triggers WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || '))), datetime(''now'', ''-50 minutes''))) > 0 THEN ''1'' ELSE ''recovering'' END ELSE ''0'' END AS observed'
  WHERE class = NEW.class
    AND EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND title LIKE 'METRIC-TRIGGER-%' AND CAST(substr(title, 16) AS INTEGER) > 0);
END;

UPDATE remediation_contracts
SET module = 'probe-template-v1h',
    verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = '
      || (SELECT CAST(substr(a.title, 16) AS INTEGER) FROM agent_issues a WHERE a.id = remediation_contracts.issue_id)
      || ') = 0 AND (SELECT val FROM v_metric_trigger_state WHERE id = '
      || (SELECT CAST(substr(a.title, 16) AS INTEGER) FROM agent_issues a WHERE a.id = remediation_contracts.issue_id)
      || ') IS NOT NULL THEN CASE WHEN (SELECT COUNT(*) FROM (SELECT observed, verified_at FROM remediation_verifications WHERE class = ''issue-'
      || CAST(remediation_contracts.issue_id AS INTEGER)
      || ''' ORDER BY id DESC LIMIT 1) p WHERE p.observed IN (''1'', ''recovering'') AND datetime(p.verified_at) < COALESCE(datetime((SELECT last_refreshed FROM metric_registry WHERE metric = (SELECT metric_key FROM analytics_metric_triggers WHERE id = '
      || (SELECT CAST(substr(a.title, 16) AS INTEGER) FROM agent_issues a WHERE a.id = remediation_contracts.issue_id)
      || '))), datetime(''now'', ''-50 minutes''))) > 0 THEN ''1'' ELSE ''recovering'' END ELSE ''0'' END AS observed'
WHERE module = 'probe-template-v1'
  AND issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.title LIKE 'METRIC-TRIGGER-%' AND CAST(substr(a.title, 16) AS INTEGER) > 0);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('metric-close-flap', 'a METRIC-TRIGGER issue closes and reopens every few hours while its metric hovers at the threshold',
  'the closing probe (PROBE-TEMPLATES-1) passed on one reading with hit = 0, while evaluateMetricTriggers refiles on the next breach; nothing required the recovery to hold, so each crossing became one close and one reopen',
  'METRIC-RECOVERY-CONFIRM-1: the probe passes only after a hit = 0 reading has been confirmed by a later refresh of the metric (probe-template-v1h)',
  'METRIC-TRIGGER issues reopened three or more times in 24 h', 'fm-metric-close-flap', '2026-10-11', 1780,
  'a metric that crosses its trigger threshold more than once a day', 'issue_lifecycle: dispositioned then reopened on the same METRIC-TRIGGER issue, hourly at :01 (1780 fleet_ai_run_rate_30d_usd, 10 reopens in 48 h)',
  'issue_drain_ratio_24h and open_agent_issues (each cycle is one inflow and one close), the owner''s view of what is open');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-metric-close-flap', NULL, 'METRIC-RECOVERY-CONFIRM-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT l.issue_id FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE l.event = ''reopened'' AND a.title LIKE ''METRIC-TRIGGER-%'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY l.issue_id HAVING COUNT(*) >= 3)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

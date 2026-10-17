-- PROCESS-CADENCE-SLA-2 (2026-10-17): make the gap view agree with the ceiling it enforces.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: process_contracts
-- Rollback: re-create v_process_contract_gaps and v_process_contract_violations from
--           migrations/2026-10-17-process-cadence-sla.sql.
--
-- PROCESS-CADENCE-SLA-1 set each scheduled process SLA to max(120, cadence + slack) and amended the
-- PROCESS-CONTRACT-1 triggers to allow max(120, 2 x cadence). The gap view kept the older rule "sla_min > cadence * 2
-- is a violation", so the eight sub-hourly workers whose SLA is the 120 floor (fleet-exec 10 min, qnfo-pdf 10,
-- qnfo-fleet-dashboard 15, qnfo-email-orchestrator 15, ai-health-prober 20, qnfo-deploy-guard 20, qnfo-ai-calibration
-- 30, qnfo-ops 30) were reported as sla-over-2x-cadence even though the trigger accepted them. The measurement
-- disagreed with the control; this file makes both use max(120, cadence * 2).

  -- BACKUP: process_contracts
DROP VIEW IF EXISTS v_process_contract_gaps;
CREATE VIEW v_process_contract_gaps AS
SELECT
  c.process, c.owner, c.sla_min, p.cadence_min,
  CASE
    WHEN c.sla_min IS NULL OR c.sla_min <= 0 THEN 'no-sla'
    WHEN p.cadence_min IS NOT NULL AND c.sla_min <= p.cadence_min THEN 'sla-below-cadence'
    WHEN p.cadence_min IS NOT NULL AND c.sla_min > max(120, p.cadence_min * 2) THEN 'sla-over-ceiling'
    WHEN p.cadence_min IS NULL AND c.sla_min > 120 THEN 'sla-over-120'
    ELSE 'ok'
  END AS sla_state,
  CASE
    WHEN c.definition_of_done IS NULL OR trim(c.definition_of_done) = '' THEN 'no-dod'
    ELSE 'ok'
  END AS dod_state,
  CASE
    WHEN json_valid(c.paths_json) = 0 THEN 'paths-not-json'
    WHEN json_array_length(c.paths_json) < 2 THEN 'single-path'
    ELSE 'ok'
  END AS path_state
FROM process_contracts c
LEFT JOIN process_cadence p ON p.process = c.process;

  -- BACKUP: process_contracts
DROP VIEW IF EXISTS v_process_contract_violations;
CREATE VIEW v_process_contract_violations AS
SELECT process, owner, sla_state, dod_state, path_state
FROM v_process_contract_gaps
WHERE sla_state <> 'ok' OR dod_state <> 'ok' OR path_state <> 'ok';

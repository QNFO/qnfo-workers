-- PROCESS-CADENCE-SLA-1 (2026-10-17, owner directive: "ALL STEPS, ALL PROCESSES SHALL HAVE SLA AND MULTIPLE
-- EXECUTION/REMEDIATION/WORKAROUND PATHS TO SUCCESSFUL DEFINITION OF DONE")
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: process_contracts
--
-- Why: SLA-AND-PATHS-1 seeded 44 contracts with a flat sla_min=120, including workers whose cron is daily or weekly.
-- A daily worker cannot meet a 120-minute SLA and a weekly one is not measured by it at all, so the number was an
-- assertion that no run could satisfy or violate. Measured 2026-10-17 from worker_schedules.crons_json: cadence ranges
-- from 10 minutes (fleet-exec, qnfo-pdf) to weekly (qnfo-subscribers).
--
-- The invariant this encodes: a scheduled process may be at most ONE extra cadence period late, and never less than
-- the 120-minute work-item ceiling. sla_min = cadence + slack (1h sub-daily, 2h daily, 1d weekly), so a missed tick is
-- a breach and a healthy one is not.
--
-- Also replaces the seeded DoD ("the run completes and records its output", which nothing can decide) with a state a
-- query decides: a cloud_ops_events row for the job inside the SLA window. v_process_run_freshness evaluates exactly
-- that for every process.
--
-- Rollback: UPDATE process_contracts SET sla_min=120 WHERE cadence_min IS NOT NULL; ALTER TABLE process_contracts DROP
--           COLUMN cadence_min; DROP VIEW v_process_run_freshness; and restore v_process_contract_gaps from
--           migrations/2026-10-17-process-contracts.sql.

ALTER TABLE process_contracts ADD COLUMN cadence_min INTEGER;

  -- BACKUP: process_contracts
DROP VIEW IF EXISTS v_process_contract_gaps;
CREATE VIEW v_process_contract_gaps AS
SELECT
  process, owner, sla_min, cadence_min,
  CASE
    WHEN sla_min IS NULL OR sla_min <= 0 THEN 'no-sla'
    WHEN cadence_min IS NOT NULL AND sla_min <= cadence_min THEN 'sla-below-cadence'
    WHEN cadence_min IS NOT NULL AND sla_min > cadence_min * 2 THEN 'sla-over-2x-cadence'
    WHEN cadence_min IS NULL AND sla_min > 120 THEN 'sla-over-120'
    ELSE 'ok'
  END AS sla_state,
  CASE
    WHEN definition_of_done IS NULL OR trim(definition_of_done) = '' THEN 'no-dod'
    ELSE 'ok'
  END AS dod_state,
  CASE
    WHEN json_valid(paths_json) = 0 THEN 'paths-not-json'
    WHEN json_array_length(paths_json) < 2 THEN 'single-path'
    ELSE 'ok'
  END AS path_state
FROM process_contracts;

  -- BACKUP: process_contracts
DROP VIEW IF EXISTS v_process_contract_violations;
CREATE VIEW v_process_contract_violations AS
SELECT process, owner, sla_state, dod_state, path_state
FROM v_process_contract_gaps
WHERE sla_state <> 'ok' OR dod_state <> 'ok' OR path_state <> 'ok';

-- Measured run freshness, for every process rather than the two that happened to have timestamps.
  -- BACKUP: process_contracts
DROP VIEW IF EXISTS v_process_run_freshness;
CREATE VIEW v_process_run_freshness AS
SELECT
  c.process,
  c.owner,
  c.sla_min,
  c.cadence_min,
  e.last_ts AS last_event,
  CAST((julianday('now') - julianday(e.last_ts)) * 1440 AS INTEGER) AS minutes_since,
  CASE
    WHEN e.last_ts IS NULL THEN 'never-observed'
    WHEN (julianday('now') - julianday(e.last_ts)) * 1440 > c.sla_min THEN 'breach'
    ELSE 'ok'
  END AS state
FROM process_contracts c
LEFT JOIN (SELECT job, MAX(ts) AS last_ts FROM cloud_ops_events WHERE job IS NOT NULL GROUP BY job) e
  ON e.job = c.process;

-- Cadence observed on 2026-10-17 from worker_schedules.crons_json.
WITH c(process, cadence_min, sla_min) AS (VALUES
  ('fleet-exec', 10, 120),
  ('qnfo-pdf', 10, 120),
  ('qnfo-fleet-dashboard', 15, 120),
  ('ai-health-prober', 20, 120),
  ('qnfo-deploy-guard', 20, 120),
  ('qnfo-ai-calibration', 30, 120),
  ('qnfo-ops', 30, 120),
  ('q08-signal-engine', 60, 120),
  ('errata-hub', 60, 120),
  ('personal-companion', 60, 120),
  ('qnfo-lifecycle', 60, 120),
  ('qnfo-signal-loop', 60, 120),
  ('radar-hub', 60, 120),
  ('qnfo-email-orchestrator', 15, 120),
  ('calendar-api', 60, 120),
  ('qnfo-observability', 60, 120),
  ('qnfo-ai-search', 60, 120),
  ('qnfo-paper-reviser', 240, 300),
  ('qnfo-github-steward', 360, 420),
  ('qnfo-kaizen', 1440, 1560),
  ('qnfo-outreach', 1440, 1560),
  ('qnfo-infra', 1440, 1560),
  ('qnfo-skill-sync', 1440, 1560),
  ('qnfo-paper-indexer', 1440, 1560),
  ('qnfo-archive', 1440, 1560),
  ('qnfo-intent-orchestrator', 1440, 1560),
  ('qnfo-gateway', 1440, 1560),
  ('qnfo-backlog-exec', 1440, 1560),
  ('qnfo-autonomy-scorer', 1440, 1560),
  ('qnfo-venue-radar', 1440, 1560),
  ('personal-api', 1440, 1560),
  ('qnfo-subscribers', 10080, 10200)
)
UPDATE process_contracts
SET cadence_min = (SELECT cadence_min FROM c WHERE c.process = process_contracts.process),
    sla_min = (SELECT sla_min FROM c WHERE c.process = process_contracts.process),
    definition_of_done = 'A cloud_ops_events row exists for this job within the last ' ||
      (SELECT sla_min FROM c WHERE c.process = process_contracts.process) ||
      ' minutes (cadence ' || (SELECT cadence_min FROM c WHERE c.process = process_contracts.process) || ' min, one missed period is a breach).',
    updated_at = datetime('now')
WHERE process IN (SELECT process FROM c);


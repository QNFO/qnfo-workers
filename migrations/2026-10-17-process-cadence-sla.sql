-- PROCESS-CADENCE-SLA-1 (2026-10-17, owner directive: "ALL STEPS, ALL PROCESSES SHALL HAVE SLA AND MULTIPLE
-- EXECUTION/REMEDIATION/WORKAROUND PATHS TO SUCCESSFUL DEFINITION OF DONE")
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: process_contracts
-- Rollback: DROP TRIGGER process_contract_valid_ins; DROP TRIGGER process_contract_valid_upd; then re-create both from
--           migrations/2026-10-17-process-contracts.sql; DELETE FROM process_cadence; UPDATE process_contracts
--           SET sla_min = 120; and restore each seeded DoD from the same file.
--
-- Why: SLA-AND-PATHS-1 seeded 44 contracts at a flat sla_min=120, including daily and weekly crons. A daily worker
-- cannot meet 120 minutes and a weekly one is not measured by it at all, so the number was an assertion no run could
-- satisfy or violate. Measured from worker_schedules.crons_json: cadence runs 10 minutes (fleet-exec, qnfo-pdf) to
-- weekly (qnfo-subscribers).
--
-- The invariant: a scheduled process may be at most ONE extra cadence period late, and never below the 120 minute
-- work-item ceiling. That is max(120, 2 x cadence). The PROCESS-CONTRACT-1 triggers enforced "at most 120" flat, which
-- is what rejected the first version of this migration at statement 8; they are amended here to the cadence ceiling
-- rather than dropped. The check for every other column (owner, DoD, two paths) is unchanged.
--
-- Cadence lives in its own table so this file is idempotent: adding a column to process_contracts cannot be re-run, and
-- an ALTER that has already applied fails the whole migration.
--
-- NOTE the first version of this file was merged as #1377 and failed at statement 8 (7 applied). Re-running this
-- corrected file is safe: every statement is CREATE ... IF NOT EXISTS, DROP ... IF EXISTS, INSERT OR REPLACE or UPDATE.

CREATE TABLE IF NOT EXISTS process_cadence (
  process TEXT PRIMARY KEY,
  cadence_min INTEGER NOT NULL,
  sla_min INTEGER NOT NULL
);

INSERT OR REPLACE INTO process_cadence (process, cadence_min, sla_min) VALUES
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
  ('qnfo-subscribers', 10080, 10200);

DROP TRIGGER IF EXISTS process_contract_valid_ins;
CREATE TRIGGER process_contract_valid_ins BEFORE INSERT ON process_contracts
WHEN NEW.owner IS NULL OR trim(NEW.owner) = ''
  OR NEW.sla_min IS NULL OR NEW.sla_min <= 0
  OR NEW.sla_min > max(120, coalesce((SELECT c.cadence_min * 2 FROM process_cadence c WHERE c.process = NEW.process), 120))
  OR NEW.definition_of_done IS NULL OR trim(NEW.definition_of_done) = ''
  OR json_valid(NEW.paths_json) = 0 OR json_array_length(NEW.paths_json) < 2
BEGIN
  SELECT RAISE(ABORT,'PROCESS-CONTRACT-1: a process needs an owner, an SLA within max(120, 2x its cadence), a definition of done, and at least two ordered paths');
END;

DROP TRIGGER IF EXISTS process_contract_valid_upd;
CREATE TRIGGER process_contract_valid_upd BEFORE UPDATE ON process_contracts
WHEN NEW.owner IS NULL OR trim(NEW.owner) = ''
  OR NEW.sla_min IS NULL OR NEW.sla_min <= 0
  OR NEW.sla_min > max(120, coalesce((SELECT c.cadence_min * 2 FROM process_cadence c WHERE c.process = NEW.process), 120))
  OR NEW.definition_of_done IS NULL OR trim(NEW.definition_of_done) = ''
  OR json_valid(NEW.paths_json) = 0 OR json_array_length(NEW.paths_json) < 2
BEGIN
  SELECT RAISE(ABORT,'PROCESS-CONTRACT-1: a process needs an owner, an SLA within max(120, 2x its cadence), a definition of done, and at least two ordered paths');
END;

  -- BACKUP: process_contracts
DROP VIEW IF EXISTS v_process_contract_gaps;
CREATE VIEW v_process_contract_gaps AS
SELECT
  c.process, c.owner, c.sla_min, p.cadence_min,
  CASE
    WHEN c.sla_min IS NULL OR c.sla_min <= 0 THEN 'no-sla'
    WHEN p.cadence_min IS NOT NULL AND c.sla_min <= p.cadence_min THEN 'sla-below-cadence'
    WHEN p.cadence_min IS NOT NULL AND c.sla_min > p.cadence_min * 2 THEN 'sla-over-2x-cadence'
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

  -- BACKUP: process_contracts
DROP VIEW IF EXISTS v_process_run_freshness;
CREATE VIEW v_process_run_freshness AS
SELECT
  c.process, c.owner, c.sla_min, p.cadence_min,
  e.last_ts AS last_event,
  CAST((julianday('now') - julianday(e.last_ts)) * 1440 AS INTEGER) AS minutes_since,
  CASE
    WHEN e.last_ts IS NULL THEN 'never-observed'
    WHEN (julianday('now') - julianday(e.last_ts)) * 1440 > c.sla_min THEN 'breach'
    ELSE 'ok'
  END AS state
FROM process_contracts c
LEFT JOIN process_cadence p ON p.process = c.process
LEFT JOIN (SELECT job, MAX(ts) AS last_ts FROM cloud_ops_events WHERE job IS NOT NULL GROUP BY job) e
  ON e.job = c.process;

UPDATE process_contracts
SET sla_min = (SELECT p.sla_min FROM process_cadence p WHERE p.process = process_contracts.process),
    definition_of_done = 'A cloud_ops_events row exists for this job within the last ' ||
      (SELECT p.sla_min FROM process_cadence p WHERE p.process = process_contracts.process) ||
      ' minutes (cadence ' || (SELECT p.cadence_min FROM process_cadence p WHERE p.process = process_contracts.process) ||
      ' min; one missed cadence period is a breach).',
    updated_at = datetime('now')
WHERE process IN (SELECT process FROM process_cadence);

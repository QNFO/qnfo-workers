-- D1-REMEDIATION-DUE-INDEX-1 (2026-11-01, charter pillar cost; issue #6055).
-- The 10-minute remediation tick scans and sorts every contract to select at most 150 due D1 probes.
-- Live EXPLAIN QUERY PLAN showed SCAN c and USE TEMP B-TREE FOR ORDER BY; this partial expression index
-- orders only active/holding contracts on the transports that tick selects.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_rc_active_due_transport;

CREATE INDEX IF NOT EXISTS idx_rc_active_due_transport
  ON remediation_contracts (COALESCE(next_due_at, ts))
  WHERE status IN ('active', 'holding')
    AND verify_transport IN ('d1-query', 'd1-query@portfolio-state', 'external-https');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
   capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session:copilot/fix-d1-db-overloaded-error',
  'The recurring remediation due-contract query adds avoidable D1 read and sort work by scanning unrelated contract states and transports.',
  'D1-REMEDIATION-DUE-INDEX-1: add a partial ordering index for active/holding contracts on the transports selected by the 10-minute tick.',
  'Live D1 EXPLAIN QUERY PLAN showed SCAN c and USE TEMP B-TREE FOR ORDER BY. The qnfo-fleet-control remediation tick runs every 10 minutes and selects at most 150 due contracts.',
  'Pending CI migration application and post-deploy plan and overload readback.',
  'The remediation_contracts due-probe selection query.',
  'DROP INDEX IF EXISTS idx_rc_active_due_transport.',
  'The due-probe query can walk a compact ordered index instead of scanning and sorting all contract rows.',
  'The query plan loses its full scan sort; qnfo-fleet-control D1 overload events fall to 0 over the next 24 hours without reducing due-probe coverage.',
  'No direct external reach gain; lower D1 pressure preserves probe throughput.',
  'Live read-only D1 query plan and contract counts; offline SQLite query-plan and migration-idempotence test; post-deploy D1 query-plan and observability readback.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'D1-REMEDIATION-DUE-INDEX-1:%'
);

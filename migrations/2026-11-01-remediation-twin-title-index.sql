-- D1-REMEDIATION-TWIN-TITLE-INDEX-1 (2026-11-01, charter pillar cost; issue #3596).
-- The due-contract query checks each result for an open issue with a live contract
-- using lower(trim(title)); this partial expression index avoids rescanning open issues.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_agent_issues_open_title_normalized;

CREATE INDEX IF NOT EXISTS idx_agent_issues_open_title_normalized
  ON agent_issues (lower(trim(title)), id)
  WHERE status = 'open';

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
   capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session:copilot/fix-d1-db-overloaded-error-again',
  'The due-contract query repeatedly scans open issues to find active or holding contracts with a normalized title match.',
  'D1-REMEDIATION-TWIN-TITLE-INDEX-1: add a partial expression index for open issue title matching.',
  'The worker query has a correlated lower(trim(title)) lookup; local SQLite EXPLAIN QUERY PLAN reports SCAN o before the index and an indexed search after it.',
  'Pending CI migration application and post-deploy D1 query-plan and overload readback.',
  'The remediation due-contract query’s carrying-twin check.',
  'DROP INDEX IF EXISTS idx_agent_issues_open_title_normalized.',
  'The correlated open-issue lookup can seek a compact index while preserving its status and title predicate.',
  'The twin lookup changes from a full open-issue scan to an indexed search; D1 overload events fall without reducing due-probe coverage.',
  'No direct external reach gain; lower D1 pressure preserves probe throughput.',
  'Local SQLite query plan and twin-matching behavior; CI migration validation; post-deploy D1 query-plan and observability readback.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'D1-REMEDIATION-TWIN-TITLE-INDEX-1:%'
);

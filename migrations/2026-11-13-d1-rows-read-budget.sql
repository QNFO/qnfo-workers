-- D1-ROWS-READ-BUDGET-1 (2026-11-13, charter pillar: cost; owner: "billions of D1 rows read, nothing in the Quniverse needs that").
-- The hourly cost ledger already writes cost_usage_daily (product d1, metric rows_read); nothing read it against a budget. 2026-11-12 read 1.71 B rows.
--   1. fm-d1-rows-read-over-budget: expected 0. observed is yesterday's rows read when it exceeds the budget in ops_config d1_rows_read_daily_budget (default 150 M, about 90 percent under the 2026-11-06..12 mean of 1.4 B), else 0.
--      A miss files through the failure-mode path (remediation_contracts, escalate_to qnfo-fleet-control), the same path as fm-open-loops-unclosed.
--   2. An expression index on agent_issues(CAST(id AS TEXT)): the roadmap_implementation verify UPDATE (item LIKE 'AI-%' ... CAST(a.id AS TEXT) = substr(item, 4)) scanned all of agent_issues per roadmap row, 59 M rows in 18 calls.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_agent_issues_id_text; DELETE FROM remediation_contracts WHERE class = 'fm-d1-rows-read-over-budget'; DELETE FROM failure_modes WHERE fm_key = 'd1-rows-read-over-budget'; DELETE FROM ops_config WHERE key = 'd1_rows_read_daily_budget';
-- CAUSE-MAPPED: registers no metric_registry row; the detector is a failure_modes row with a remediation contract.

CREATE INDEX IF NOT EXISTS idx_agent_issues_id_text ON agent_issues(CAST(id AS TEXT));

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('d1_rows_read_daily_budget', '150000000', 'D1-ROWS-READ-BUDGET-1: daily D1 rows-read budget the fm-d1-rows-read-over-budget detector grades against; raise it only with the measurement that justifies it.');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('d1-rows-read-over-budget', 'D1 rows read per day exceeds the budget: a statement scans a table or view on every call',
  'unindexed lookups, views that scan big tables on each call, and per-tick loops polling large tables (qnfo-audit 9.46 B rows in 7 days to 2026-11-13)',
  'read d1QueriesAdaptiveGroups for the statements that read the most rows, add an index or a cache or a watermark, deploy through the canonical path, and compare cost_usage_daily rows_read the next day',
  'the fm-d1-rows-read-over-budget contract returns yesterday''s D1 rows read when it is over ops_config d1_rows_read_daily_budget, else 0',
  'fm-d1-rows-read-over-budget', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'cost_usage_daily product d1 metric rows_read for the previous UTC day above the budget',
  'the Cloudflare invoice charges for billions of D1 rows read',
  'cost: D1 rows-read billing; every loop that reads qnfo-audit');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-d1-rows-read-over-budget', NULL, 'D1-ROWS-READ-BUDGET-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST(COALESCE((SELECT CASE WHEN quantity > COALESCE((SELECT CAST(value AS REAL) FROM ops_config WHERE key = ''d1_rows_read_daily_budget''), 150000000) THEN CAST(quantity AS INTEGER) ELSE 0 END FROM cost_usage_daily WHERE vendor = (SELECT vendor FROM cost_usage_daily WHERE product = ''d1'' AND metric = ''rows_read'' ORDER BY date DESC LIMIT 1) AND product = ''d1'' AND metric = ''rows_read'' AND date = date(''now'', ''-1 day'')), 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

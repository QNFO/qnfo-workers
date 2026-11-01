-- METRIC-CAUSE-AT-REGISTRATION-1 (2026-11-01, charter pillar autonomy). 2026-11-01-issue-family-throughput-action.sql (pull request 5505) registered
-- largest_issue_family_net_inflow_24h with no metric_breach_cause row, so the registration rule in migrations/metric-family-cluster-b.test.mjs failed on main.
-- That file stays as merged (MIGRATION-NO-CLOBBER-1: the runner re-applies an edited file); the mapping lives here and the suite lists the pair in MAPPED_FORWARD.
-- A positive net inflow means a family of issues opens faster than it closes, so a breach is an issue-backlog problem (the same cause as driver_drain_24h and
-- closure_branching_ratio_24h), not spend, heartbeat or a defect in the measurement.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE metric_key = 'largest_issue_family_net_inflow_24h' AND cause_key = 'issue-backlog';
INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
  ('largest_issue_family_net_inflow_24h', 'issue-backlog', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: the largest open issue family gains backlog; the root cause of a positive net inflow is a family that opens faster than it closes, so repair its closing path, not the count.');

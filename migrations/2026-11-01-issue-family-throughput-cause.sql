-- METRIC-CAUSE-AT-REGISTRATION-1 (2026-11-01): map the already-merged issue-family throughput metric.
-- The original registration migration was merged without its cause row; this forward migration supplies the root-cause attribution.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE metric_key = 'largest_issue_family_net_inflow_24h' AND cause_key = 'issue-backlog' AND note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01-issue-family-throughput-action:%';

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note)
VALUES (
  'largest_issue_family_net_inflow_24h',
  'issue-backlog',
  'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01-issue-family-throughput-action: the metric measures positive net inflow in an open issue family.'
);

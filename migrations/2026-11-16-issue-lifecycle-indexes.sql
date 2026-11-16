-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_issue_lifecycle_event_ts; DROP INDEX IF EXISTS idx_issue_lifecycle_issue_event_ts;
-- CAUSE-MAPPED: registers no metric_registry row.
-- D1-READS-CUT-10: the reopen-family probes (fm-two-closers-disagree, fm-metric-close-flap, fm-cf-obs-bridge-refile-loop, fm-reopen-without-live-path)
-- filtered issue_lifecycle by event and ts and scanned about 2.47M rows per query (65k rows, repeated scans). Measured after the indexes: 1,329 / 5,882 / 818 / 5,413 rows read.
CREATE INDEX IF NOT EXISTS idx_issue_lifecycle_event_ts ON issue_lifecycle(event, ts);
CREATE INDEX IF NOT EXISTS idx_issue_lifecycle_issue_event_ts ON issue_lifecycle(issue_id, event, ts);

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_issue_lifecycle_open_drop
-- CAUSE-MAPPED: registers no metric_registry row.
-- D1-READS-CUT-11: v_issue_accounting.silent_drops_since_ledger filters issue_lifecycle with an OR
-- ((event='dispositioned' AND has_evidence=0) OR event='deleted'), which no plain index serves, so every read of the view
-- (the fm-silent-drop-unaccounted probe, 39 runs an hour) scanned about 32k lifecycle rows. A partial index with the same
-- predicate holds only the qualifying rows (0 now). Measured live: the lifecycle clause 32,429 -> 16 rows read, the whole view 40,151 -> 7,738.
-- The index already exists live; the statement is IF NOT EXISTS. The view text is unchanged (the planner matches the predicate).
CREATE INDEX IF NOT EXISTS idx_issue_lifecycle_open_drop ON issue_lifecycle(id) WHERE ((event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted');

-- HOT-VIEW-INDEXES-1 (2026-10-12, pillar cost; Cloudflare D1 best practice "use indexes", EXPLAIN QUERY PLAN on the hourly views).
-- qnfo-audit is one single-threaded D1 shared by every worker, so a full scan in a view that the hourly metric tick runs per open
-- issue costs every other worker latency. EXPLAIN QUERY PLAN on 2026-10-12 showed full table scans inside the correlated
-- subqueries of v_issues_no_next_action (SCAN c on remediation_contracts by issue_id, SCAN w on work_claims by issue_id,
-- SCAN h on human_actions by source, SCAN k on code_tasks by status; 102,441 rows read per call) and of v_failure_mode_status
-- (SCAN v on remediation_verifications by class; 1,391,979 rows read per call). Six additive indexes close them. Nothing is
-- dropped or rewritten; every view returns the same rows.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_rc_issue_status; DROP INDEX IF EXISTS idx_rv_class_id; DROP INDEX IF EXISTS idx_rv_class_verified; DROP INDEX IF EXISTS idx_work_claims_issue; DROP INDEX IF EXISTS idx_human_actions_source; DROP INDEX IF EXISTS idx_code_tasks_status

CREATE INDEX IF NOT EXISTS idx_rc_issue_status ON remediation_contracts (issue_id, status);
CREATE INDEX IF NOT EXISTS idx_rv_class_id ON remediation_verifications (class, id);
CREATE INDEX IF NOT EXISTS idx_rv_class_verified ON remediation_verifications (class, verified_at);
CREATE INDEX IF NOT EXISTS idx_work_claims_issue ON work_claims (issue_id, released_at);
CREATE INDEX IF NOT EXISTS idx_human_actions_source ON human_actions (source, status);
CREATE INDEX IF NOT EXISTS idx_code_tasks_status ON code_tasks (status);

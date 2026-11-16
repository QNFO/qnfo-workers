-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_code_tasks_issue_ref;
-- D1-READS-CUT-9: the RED-DRAIN eligibility count scanned code_tasks with goal LIKE '%#N %' per candidate (469,497 rows read per run).
-- An expression index on the issue number in goal turns it into an index lookup (measured 1,114 rows read).
CREATE INDEX IF NOT EXISTS idx_code_tasks_issue_ref ON code_tasks(CAST(substr(goal, instr(goal,'#')+1) AS INTEGER), status);

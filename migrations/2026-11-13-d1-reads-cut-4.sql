-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_goals_gl_item; DROP INDEX IF EXISTS idx_agent_issues_title_norm; DROP INDEX IF EXISTS idx_ipm_project_code;
-- spof-review: no new component; three indexes.
-- charter-pillar: cost
-- CAUSE-MAPPED: no metric registered.
--
-- D1-READS-COST-4 (owner 2026-11-13). Live d1QueriesAdaptiveGroups, qnfo-audit, one hour on 2026-11-13 (after PRs 11435 and 11439):
--   roadmap-goal-verify / roadmap-goal-reopen / roadmap-next-verify UPDATEs of roadmap_implementation: 2.40 M rows in 52 runs, because
--     `'GL-' || g.goal_key = item` and `m.project_code = artifact_ref` could not seek (no expression index on goals, none on issue_project_map);
--   `SELECT id, status FROM agent_issues WHERE lower(trim(title)) = lower(trim(?1)) AND status IN (...)`: 1.60 M rows in 228 runs (full scan per filer dedupe).
-- Expression and plain indexes make each a seek. Same answers.
CREATE INDEX IF NOT EXISTS idx_goals_gl_item ON goals (('GL-' || goal_key), status);
CREATE INDEX IF NOT EXISTS idx_ipm_project_code ON issue_project_map (project_code);
CREATE INDEX IF NOT EXISTS idx_agent_issues_title_norm ON agent_issues (lower(trim(title)), status);

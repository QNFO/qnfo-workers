-- ANCHOR-DRAFT-PR-CODETASK-1 (2026-11-10, charter pillar autonomy): trigger issues_without_draft_pr (2026-11-09-draft-pr-per-issue.sql) names a code-anchor
-- but no code-task line, so ANCHOR GUARD fails in the scans job of every pull request. The first pair needs its own code-task line; the anchor occurs once
-- in qnfo-github-steward/worker.js. A second run finds the line present and changes nothing.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = replace(action, 'code-task: repo=qnfo-workers path=qnfo-github-steward/worker.js' || char(10), '') WHERE metric_key = 'issues_without_draft_pr';
UPDATE analytics_metric_triggers
SET action = replace(action, 'code-anchor: async function tsDraftPrs(env, out) {', 'code-task: repo=qnfo-workers path=qnfo-github-steward/worker.js' || char(10) || 'code-anchor: async function tsDraftPrs(env, out) {')
WHERE metric_key = 'issues_without_draft_pr' AND instr(action, 'code-task:') = 0;

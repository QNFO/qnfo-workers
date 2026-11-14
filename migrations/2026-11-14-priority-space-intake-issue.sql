-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_issues WHERE title = 'PRIORITY-SPACE-1.1: code loop intake reads v_issue_value_queue';
-- Follow-up of PRIORITY-SPACE-1 (PR 11840): the ranking only drains faster once a doer reads it.
INSERT INTO agent_issues (title, description, priority, status, category, source, created_at)
SELECT 'PRIORITY-SPACE-1.1: code loop intake reads v_issue_value_queue',
'v_issue_value_queue (migrations/2026-11-14-priority-space.sql) ranks open issues by value per cost with family leverage; 529 of 732 open issues carry the label critical, so v_issue_queue_v2 ordering is mostly by age. Join v_issue_value_queue in INTAKE_QUEUE_V2_SQL and order by its pos first (fam_rank = 1 rows before siblings), keeping v_issue_queue_v2 as a fallback when the view errors.
code-task: repo=qnfo-workers path=qnfo-code-orchestrator/worker.js
code-anchor: var INTAKE_QUEUE_V2_SQL = 
code-probe: {"paths": ["qnfo-code-orchestrator/worker.js"], "contains": "v_issue_value_queue"}',
'high', 'open', 'autonomy', 'session:priority-space', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PRIORITY-SPACE-1.1: code loop intake reads v_issue_value_queue');

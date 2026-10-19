-- PLAN-WIP-SUPERSEDED-1 (2026-10-19, charter pillar: autonomy; agent_issues 100074). The qnfo-code-orchestrator planner gate counted
-- unfinished code tasks with a hand-written terminal list that omitted 'superseded' (terminal since CLAIM-TERMINAL-RELEASE-1), so
-- 8 superseded tasks from 2026-10-18T12:21Z read as work in progress (WIP 19 >= PLAN_WIP 12) and issue_plans received no row from
-- 2026-10-18T12:12Z to 2026-10-19T07:54Z. qnfo-code-orchestrator 0.18.25 builds every such predicate from CODE_TASK_DONE. This file
-- records the failure mode and its detector: the planner wrote a plan in the last 120 minutes, or the real work in progress (every
-- status outside the done set and the merge handoffs) is at the gate.
-- Idempotent (INSERT OR IGNORE). The contract is created active and due now.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-code-plan-wip-terminal-omitted'; DELETE FROM failure_modes WHERE fm_key = 'code-plan-wip-terminal-omitted'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('code-plan-wip-terminal-omitted', 'the code-loop planner counts finished code tasks as work in progress and stops planning', 'planIssues listed the terminal code_tasks statuses by hand without ''superseded'', which CODE_TASK_DONE gained in 0.18.14, so superseded tasks held the WIP gate shut indefinitely', 'qnfo-code-orchestrator 0.18.25 PLAN-WIP-SUPERSEDED-1: the WIP gate and fail() read CODE_TASK_DONE_SQL, built from CODE_TASK_DONE', 'fm-code-plan-wip-terminal-omitted: a plan in the last 120 minutes, or real WIP at PLAN_WIP (12)', 'fm-code-plan-wip-terminal-omitted', '2026-10-18T12:12:09Z', 100074, 'a code task set to a terminal status the planner query does not list', 'issue_plans gains no row while code_tasks keeps changing; plan returns "work in progress N >= 12"', 'code loop: every open issue that waits on the planner (138 never planned on 2026-10-19)');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-code-plan-wip-terminal-omitted', NULL, 'PLAN-WIP-SUPERSEDED-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM issue_plans WHERE planned_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) OR (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN (''merged'', ''closed'', ''superseded'', ''publish_failed'', ''needs_human'', ''failed'', ''reverted'', ''branch_pushed'', ''published'', ''pr_open'')) >= 12 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-code-orchestrator', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

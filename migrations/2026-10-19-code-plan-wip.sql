-- PLAN-WIP-TUNABLE-1 (2026-10-19, charter pillar: autonomy; agent_issues 100086). qnfo-code-orchestrator 0.18.27 reads its planner
-- work-in-progress gate from ops_config code_plan_wip (bounds 1-48, default 12). Measured 2026-10-19 08:0xZ by qnfo-ops: WIP was
-- exactly 12 (8 queued, 1 branch_pushed, 2 published, 1 ready) against PLAN_WIP 12, the steady state of 8 lanes with retries, so
-- issue_plans got 10 rows in 24 h and none planned. This file sets 40: MAX_OPEN_TASKS (48) still bounds the queue, the daily plan cap
-- (code_plan_daily_cap 48) and SPEND-CAP-1 bound the rate. Deleting the row restores 12 without a deploy.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'code_plan_wip'; UPDATE remediation_contracts SET verify_probe = replace(verify_probe, '>= COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''code_plan_wip''), 12)', '>= 12') WHERE class = 'fm-code-plan-wip-terminal-omitted'; DELETE FROM failure_modes WHERE fm_key = 'code-plan-wip-steady-state'

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('code_plan_wip', '40', 'PLAN-WIP-TUNABLE-1 (agent_issues 100086): qnfo-code-orchestrator planner WIP gate (default 12, bounds 1-48); delete the row to revert');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('code-plan-wip-steady-state', 'the code-loop planner gate equals the loop''s normal work in progress, so it plans only when the loop is idle', 'PLAN_WIP (12) was not scaled when TICK_LANES went 4 -> 8 and MAX_OPEN_TASKS 20 -> 48; 8 lanes with retries keep about 12 tasks unfinished', 'qnfo-code-orchestrator 0.18.27 PLAN-WIP-TUNABLE-1: the gate reads ops_config code_plan_wip, set to 40', 'fm-code-plan-wip-terminal-omitted: a plan in the last 120 minutes, or real WIP at the gate', 'fm-code-plan-wip-terminal-omitted', '2026-10-19T08:00:00Z', 100086, 'the code loop busy with 12 or more unfinished tasks', 'issue_plans gains only not-code rows; plan returns "work in progress 12 >= 12"', 'code loop: every open issue that waits on the planner');

-- The detector from 2026-10-19-plan-wip-superseded.sql passed whenever real WIP reached 12, which is this deadlock; it now reads the
-- same gate as the worker.
UPDATE remediation_contracts SET verify_probe = replace(verify_probe, '>= 12 THEN', '>= COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''code_plan_wip''), 12) THEN'), next_due_at = NULL
  WHERE class = 'fm-code-plan-wip-terminal-omitted' AND instr(verify_probe, '>= 12 THEN') > 0;

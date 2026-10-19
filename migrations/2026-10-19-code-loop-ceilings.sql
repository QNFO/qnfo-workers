-- CODE-LOOP-CEILINGS-TUNABLE-1 (2026-10-19, charter pillar: autonomy; agent_issues 100075). qnfo-code-orchestrator 0.18.26 reads its
-- planner daily cap and tick lane count from ops_config. Measured 2026-10-19 07:52Z: 745 model calls / $3.62 against the 1500-call
-- SPEND-CAP-1 budget, model_ladder_budget blocked=0, 138 open issues never planned. This file raises the plan cap 24 -> 48 and the
-- lanes 8 -> 12. SPEND-CAP-1 (ops_config code_loop_daily_calls, default 1500) still stops the lanes at the day's budget.
-- Prediction: issue_plans rows with a model per day roughly double within 24 h with calls under 1500/day; if spend reaches the cap or
-- code_task_success_rate_30d falls, delete the two rows (the Rollback line) and the literals 24 and 8 apply again without a deploy.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key IN ('code_plan_daily_cap', 'code_tick_lanes')

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('code_plan_daily_cap', '48', 'CODE-LOOP-CEILINGS-TUNABLE-1 (agent_issues 100075): qnfo-code-orchestrator planner plans per day (default 24, bounds 1-200); delete the row to revert'),
 ('code_tick_lanes', '12', 'CODE-LOOP-CEILINGS-TUNABLE-1 (agent_issues 100075): qnfo-code-orchestrator concurrent task lanes per tick (default 8, bounds 1-16); delete the row to revert');

-- RESEARCH-PLANS-DEAD-1 (#1622, 2026-10-01): research_plans is dropped as dead. Applied live.
-- It was a legacy WBS-era table: wbs_code was a foreign key to projects, and it had phases_json and total_phases.
-- It held 0 rows. No code in the repository read or wrote it, no view or trigger used it, and no table referenced it.
-- The L2 stage machine (docs/AUTONOMOUS-RESEARCH-PIPELINE.md section 3) has no separate plan artifact:
--   - research_queue (stage, context, attempt, revise_count, ...) carries each idea's state;
--   - stage transitions are audited in cloud_ops_events job='qnfo-research-exec' (474 stage events in the 7d before
--     the drop);
--   - pipeline_tasks has not been written since 2026-09-06.
DROP TABLE IF EXISTS research_plans;

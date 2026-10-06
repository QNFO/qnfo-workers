-- TRIGGER-CODE-TASK-LINES-1 (2026-10-06, pillar autonomy, transformation lever T1.9 code-task-lines-on-triggers). The 69
-- enabled triggers without a code-task line were read one by one on 2026-10-06 (session_01CX4ooVZuEie1F9eEtYHx2u). Most of
-- them are diagnosis-first or data-driven levers (read a ledger, find the dominant cause, then act), owner-level calls, loops
-- that already file their own code tasks (ASK-LOOP-1), or changes to control-plane workers the merge runner never merges
-- (qnfo-ops, qnfo-gateway); a code-task line on those would send the code loop a goal it cannot verify and lower
-- code_task_success_rate_30d, the metric wave W0 waits on. One trigger names a concrete one-file change with a unique anchor:
-- idea_topic_concentration_30d (idea-hub triageProposals: the diversity constraint). fleet_ai_run_rate_30d_usd's lever
-- (reasoning_effort low on qnfo-research-exec glm stages) is already the default since REASONING-EFFORT-LOW-1 (#1504), so its
-- action gets a note instead of a line. Idempotent: guarded UPDATEs.
-- Re-applied 2026-10-06 (MIGRATION-APPLY-FAILED-1, agent_issues 2046, migration_runs id 6): the first run on commit 634eaef
-- failed with "LIKE or GLOB pattern too complex" because D1 refuses LIKE patterns over 50 bytes (the guard was 54 bytes;
-- the 27-byte one passed). The guards now use instr(), which has no such limit; apply_migrations.py --check refuses long
-- LIKE patterns from this file on.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = substr(action, 1, instr(action, char(10) || 'code-task: repo=qnfo-workers path=idea-hub/worker.js') - 1) WHERE metric_key = 'idea_topic_concentration_30d' AND instr(action, 'code-task: repo=qnfo-workers path=idea-hub/worker.js') > 0; UPDATE analytics_metric_triggers SET action = replace(action, ' (TRIGGER-CODE-TASK-LINES-1 2026-10-06: reasoning_effort low is already the default for glm models in qnfo-research-exec aiText since REASONING-EFFORT-LOW-1, #1504; the remaining lever is the model and the call count per stage, read ai_call_counters first.)', '') WHERE metric_key = 'fleet_ai_run_rate_30d_usd';

UPDATE analytics_metric_triggers
SET action = action || char(10) || 'code-task: repo=qnfo-workers path=idea-hub/worker.js' || char(10) || 'code-anchor: async function triageProposals(env) {'
WHERE metric_key = 'idea_topic_concentration_30d' AND instr(action, 'code-task: repo=qnfo-workers path=idea-hub/worker.js') = 0;

UPDATE analytics_metric_triggers
SET action = action || ' (TRIGGER-CODE-TASK-LINES-1 2026-10-06: reasoning_effort low is already the default for glm models in qnfo-research-exec aiText since REASONING-EFFORT-LOW-1, #1504; the remaining lever is the model and the call count per stage, read ai_call_counters first.)'
WHERE metric_key = 'fleet_ai_run_rate_30d_usd' AND instr(action, 'TRIGGER-CODE-TASK-LINES-1') = 0;

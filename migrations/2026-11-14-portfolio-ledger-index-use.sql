-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = replace(definition, 'WHERE l.task_id=''deploy:''||dh.id AND l.action=''deployed'')', 'WHERE l.task_id=''deploy:''||dh.id)'), version = version + 1, updated_at = datetime('now') WHERE id = 'portfolio-lifecycle'; UPDATE fleet_tasks_canonical SET definition = replace(definition, 'WHERE l.task_id=''deploy:''||dh.id AND l.action=''deployed'')', 'WHERE l.task_id=''deploy:''||dh.id)'), repo_path = 'migrations/2026-10-26-portfolio-gap-detectors.sql' WHERE id = 'portfolio-lifecycle'
-- CAUSE-MAPPED: registers no metric.
-- D1-LEDGER-SCAN-1 (2026-11-14, charter pillar: cost; qnfo-audit is verdict 'hot' in cf_resource_registry, > 500M rows read in 7 days; D1 "exceeded its CPU
-- time limit and was reset" is the error behind LOOP-BREAKER-1 1003547/1003548, CF-OBS-ISSUE-1 1003550 and the CHAOS-DRILL-FAILED-1 sweeps).
-- Measured 2026-11-14 with d1QueriesAdaptiveGroups (24 h, qnfo-audit, ordered by rows read): the top statement is the first step of fleet task
-- portfolio-lifecycle, INSERT OR IGNORE INTO project_ledger ... FROM deployment_history dh ... AND NOT EXISTS (SELECT 1 FROM project_ledger l WHERE
-- l.task_id='deploy:'||dh.id): 137,119,268 rows read in 81 runs (1.7M a run) for a 2,908-row ledger and 562 deploys in 7 days. The only index on
-- project_ledger.task_id is the partial unique index ux_project_ledger_deploy (task_id) WHERE action = 'deployed', which SQLite uses only when the
-- query says action = 'deployed'; without it EXPLAIN QUERY PLAN shows "SCAN l" per deploy row, with it "SEARCH l USING COVERING INDEX
-- ux_project_ledger_deploy (task_id=?)". Every row this step writes has action 'deployed', so the added predicate changes no result.
-- Prediction: that statement drops from ~137M to < 1M rows read a day (562 index probes a run instead of 562 x 2,908 scans).
-- Verify: d1QueriesAdaptiveGroups for the statement 24 h after the apply; EXPLAIN QUERY PLAN as above. Follow-up statements: agent_issues 1003559.
UPDATE fleet_tasks
   SET definition = replace(definition, 'WHERE l.task_id=''deploy:''||dh.id)', 'WHERE l.task_id=''deploy:''||dh.id AND l.action=''deployed'')'),
       version = version + 1, updated_at = datetime('now')
 WHERE id = 'portfolio-lifecycle' AND instr(definition, 'WHERE l.task_id=''deploy:''||dh.id)') > 0;
UPDATE fleet_tasks_canonical
   SET definition = replace(definition, 'WHERE l.task_id=''deploy:''||dh.id)', 'WHERE l.task_id=''deploy:''||dh.id AND l.action=''deployed'')'),
       repo_path = 'migrations/2026-11-14-portfolio-ledger-index-use.sql'
 WHERE id = 'portfolio-lifecycle' AND instr(definition, 'WHERE l.task_id=''deploy:''||dh.id)') > 0;

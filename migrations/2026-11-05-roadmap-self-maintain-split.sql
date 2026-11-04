-- ROADMAP-SELF-MAINTAIN-SPLIT-1 (2026-11-05, charter pillar autonomy, program QNFO.OPS; cluster C8-PROJECTS-GOALS of the roadmap and backlog completion sweep).
-- The one loop that closes goals and roadmap rows (fleet task roadmap-self-maintain, ROADMAP-SELF-MAINTAIN-1, 22 steps) has not finished since 2026-11-04 13:34Z.
-- Read 2026-11-04 22:50Z from qnfo-audit: fleet_runs for the task: 36 ok (last 13:34:46Z, 7 s for 22 steps), 22 failed with "orphaned: invocation ended before the run finished (CRON-ADVANCE-FIRST-1)", 2 still running
-- (21:30 and 22:30); every hourly run since 15:30Z dies about two minutes after it starts, and the dispatcher invocation that started it dies with it (the cron queued behind it is picked up two minutes later by the next tick).
-- Run rows carry no per-step timing, so the slow step cannot be named from D1; the reads of every step compile and answer in 0.4-170 ms on an idle database, so the delay is queueing behind other writers.
-- Effects of the dead loop, all measured the same hour: metric goals_unevaluated reads 221 (last_refreshed 15:30:52Z) while the live computation of the same formula reads 1; metrics goals_completed_7d and the
-- ledger event stopped at 13:34Z; roadmap rows of retired projects stay open (87 PROJ- rows unverified, 16 of them for a project whose status is retired, the case the step roadmap-project-verify closes); 11 FM- rows whose
-- detector reads absent and no open issue carries them are unverified (step roadmap-fm-verify); open critical issue 100069 (METRIC-TRIGGER-9162-GOALS-UNEVALUATED) rests on the stale 221.
-- Same cure the fleet applied to management-personas (PLUSSING-OWN-TASK-1, PERSONAS-C-SPLIT-1): split the workflow by step name into independent tasks with their own hourly crons, so a step that stalls costs only its own task
-- and the closing steps no longer wait behind the metrics, and a stalled task is named by which cron still orphans. Steps are copied by name from the live definition, once.
--   roadmap-self-maintain      programs-log .. contracts-reactivate (8 steps, :30, unchanged cron)
--   roadmap-close-goals        complete-log, complete, reopen-log, reopen (4 steps, :36)
--   roadmap-close-rows         roadmap-goal-verify, roadmap-goal-reopen, roadmap-next-verify, roadmap-project-verify, roadmap-fm-verify (5 steps, :38)
--   roadmap-self-metrics       the four metric steps and the ledger step (5 steps, :44)
-- Then the closers' own predicates run once now (the rows are the loop's to close; the evidence text names the state that was read at apply time), and metric goals_unevaluated is recomputed with the loop's own formula.
-- Revert: the Rollback header. Verify after merge: SELECT task_id, status, COUNT(*) FROM fleet_runs WHERE task_id LIKE 'roadmap-%' AND started_at > datetime('now','-3 hours') GROUP BY 1,2.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261105_rsm_def
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261105_rsm_def), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = 'roadmap-self-maintain'; DELETE FROM fleet_crons WHERE name IN ('roadmap-close-goals-hourly', 'roadmap-close-rows-hourly', 'roadmap-self-metrics-hourly'); DELETE FROM fleet_tasks WHERE id IN ('roadmap-close-goals', 'roadmap-close-rows', 'roadmap-self-metrics'); UPDATE roadmap_implementation SET status = (SELECT b.status FROM bak_20261105_rsm_rows b WHERE b.id = roadmap_implementation.id), evidence = (SELECT b.evidence FROM bak_20261105_rsm_rows b WHERE b.id = roadmap_implementation.id), verified_at = (SELECT b.verified_at FROM bak_20261105_rsm_rows b WHERE b.id = roadmap_implementation.id) WHERE id IN (SELECT id FROM bak_20261105_rsm_rows)

CREATE TABLE IF NOT EXISTS bak_20261105_rsm_def AS SELECT definition FROM fleet_tasks WHERE id = 'roadmap-self-maintain';
CREATE TABLE IF NOT EXISTS bak_20261105_rsm_rows AS SELECT * FROM roadmap_implementation WHERE (item LIKE 'PROJ-%' OR item LIKE 'FM-%' OR item LIKE 'NEXT-%') AND status NOT IN ('verified', 'retired');

INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
SELECT 'roadmap-close-goals', 'ROADMAP-SELF-MAINTAIN-SPLIT-1: goals complete or reopen on their DoD evidence', 'workflow',
 json_object('steps', json((SELECT json_group_array(json(value)) FROM json_each((SELECT definition FROM fleet_tasks WHERE id = 'roadmap-self-maintain'), '$.steps') WHERE json_extract(value, '$.name') IN ('complete-log', 'complete', 'reopen-log', 'reopen')))),
 120000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-self-maintain' AND json_array_length(definition, '$.steps') > 20);

INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
SELECT 'roadmap-close-rows', 'ROADMAP-SELF-MAINTAIN-SPLIT-1: roadmap rows verify or reopen on goal, project, work-mapping and detector state', 'workflow',
 json_object('steps', json((SELECT json_group_array(json(value)) FROM json_each((SELECT definition FROM fleet_tasks WHERE id = 'roadmap-self-maintain'), '$.steps') WHERE json_extract(value, '$.name') IN ('roadmap-goal-verify', 'roadmap-goal-reopen', 'roadmap-next-verify', 'roadmap-project-verify', 'roadmap-fm-verify')))),
 120000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-self-maintain' AND json_array_length(definition, '$.steps') > 20);

INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
SELECT 'roadmap-self-metrics', 'ROADMAP-SELF-MAINTAIN-SPLIT-1: goal and roadmap metrics and the run ledger', 'workflow',
 json_object('steps', json((SELECT json_group_array(json(value)) FROM json_each((SELECT definition FROM fleet_tasks WHERE id = 'roadmap-self-maintain'), '$.steps') WHERE json_extract(value, '$.name') IN ('metric-goals-unevaluated', 'metric-goals-without-dod', 'metric-roadmap-unplaced', 'metric-goals-completed', 'ledger')))),
 120000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-self-maintain' AND json_array_length(definition, '$.steps') > 20);

UPDATE fleet_tasks SET definition = json_set(definition, '$.steps', json((SELECT json_group_array(json(value)) FROM json_each(definition, '$.steps') WHERE json_extract(value, '$.name') IN ('programs-log', 'programs', 'objectives-log', 'objectives', 'contracts', 'contracts-sync', 'contracts-retire', 'contracts-reactivate')))),
 version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'roadmap-self-maintain' AND json_array_length(definition, '$.steps') > 20
  AND EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-close-goals' AND json_array_length(definition, '$.steps') = 4)
  AND EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-close-rows' AND json_array_length(definition, '$.steps') = 5)
  AND EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-self-metrics' AND json_array_length(definition, '$.steps') = 5);

INSERT OR IGNORE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, next_fire, updated_at)
SELECT 'roadmap-close-goals-hourly', '36 * * * *', 'roadmap-close-goals', 1, 'UTC', NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-close-goals');
INSERT OR IGNORE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, next_fire, updated_at)
SELECT 'roadmap-close-rows-hourly', '38 * * * *', 'roadmap-close-rows', 1, 'UTC', NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-close-rows');
INSERT OR IGNORE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, next_fire, updated_at)
SELECT 'roadmap-self-metrics-hourly', '44 * * * *', 'roadmap-self-metrics', 1, 'UTC', NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE EXISTS (SELECT 1 FROM fleet_tasks WHERE id = 'roadmap-self-metrics');

-- Catch-up: the closing predicates of the loop, run once. Each row's evidence names the state read at apply time.
UPDATE roadmap_implementation SET status = 'verified', verified_at = datetime('now'),
  evidence = 'ROADMAP-SELF-MAINTAIN-SPLIT-1 catch-up (same predicate as step roadmap-project-verify): project ' || (SELECT p.status FROM projects p WHERE 'PROJ-' || p.project_code = roadmap_implementation.item) || ' (projects.updated_at ' || COALESCE((SELECT p.updated_at FROM projects p WHERE 'PROJ-' || p.project_code = roadmap_implementation.item), '?') || ')'
WHERE item LIKE 'PROJ-%' AND status <> 'verified'
  AND EXISTS (SELECT 1 FROM projects p WHERE 'PROJ-' || p.project_code = roadmap_implementation.item AND p.status IN ('completed', 'archived', 'retired'));

UPDATE roadmap_implementation SET status = 'verified', verified_at = datetime('now'),
  evidence = 'ROADMAP-SELF-MAINTAIN-SPLIT-1 catch-up (same predicate as step roadmap-fm-verify): detector reads absent at ' || COALESCE((SELECT s.last_probed FROM v_failure_mode_status s WHERE 'FM-' || s.fm_key = roadmap_implementation.item), '?') || ' and no open issue carries it'
WHERE item LIKE 'FM-%' AND status <> 'verified'
  AND EXISTS (SELECT 1 FROM v_failure_mode_status s WHERE 'FM-' || s.fm_key = roadmap_implementation.item AND s.status = 'absent')
  AND NOT EXISTS (SELECT 1 FROM failure_modes f JOIN agent_issues a ON a.id = f.issue_id AND a.status = 'open' WHERE 'FM-' || f.fm_key = roadmap_implementation.item);

UPDATE roadmap_implementation SET status = 'verified', verified_at = datetime('now'),
  evidence = 'ROADMAP-SELF-MAINTAIN-SPLIT-1 catch-up (same predicate as step roadmap-next-verify): ' || CASE WHEN EXISTS (SELECT 1 FROM projects p WHERE p.project_code = roadmap_implementation.artifact_ref AND p.status <> 'active') THEN 'project left active' ELSE 'work is mapped to the project (' || (SELECT COUNT(*) FROM issue_project_map m WHERE m.project_code = roadmap_implementation.artifact_ref) || ' issues in issue_project_map)' END
WHERE item LIKE 'NEXT-%' AND status NOT IN ('verified', 'retired')
  AND (EXISTS (SELECT 1 FROM issue_project_map m WHERE m.project_code = roadmap_implementation.artifact_ref) OR EXISTS (SELECT 1 FROM projects p WHERE p.project_code = roadmap_implementation.artifact_ref AND p.status <> 'active'));

-- The metric the loop publishes, recomputed with its own formula (step metric-goals-unevaluated).
UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_goal_status s JOIN remediation_contracts c ON c.class = 'goal-' || s.goal_key WHERE s.status = 'adopted' AND s.transport IS NOT NULL AND replace(substr(c.ts, 1, 19), 'T', ' ') < datetime('now', '-120 minutes') AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime('now', '-120 minutes')) AND NOT (COALESCE(c.status, '') = 'active' AND COALESCE(c.last_verdict, '') LIKE 'deferred%' AND COALESCE(replace(substr(c.last_attempt_at, 1, 19), 'T', ' '), '') >= datetime('now', '-120 minutes'))) AS TEXT),
  last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
WHERE metric = 'goals_unevaluated';

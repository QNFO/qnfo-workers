-- CRON-WATCH-TASK-DOER-1 (2026-10-19, pillar autonomy; agent_issues 100154, code task ct_im100154, owner directive 2026-10-19: "ALL CRON
-- FAILURES/ERRORS SHALL BE TRIAGED AND REMEDIATED AUTOMATICALLY BY THE FLEET.").
--
-- WHAT WAS MISSING (qnfo-audit read 2026-10-19)
--   CRON-WATCH-1 escalates a CRON-FAULT-1 issue at 3 failures in a row: priority high, and for a Cloudflare worker a `code-task:` line for the
--   code loop. A fleet_tasks fault (task-failed:<task id>, one of the fleet-exec workflows) has no worker_dir, so its escalation text was only
--   "fix it by migration" and no line reached the code loop's intake: task-failed:code-loop-terminal-reconcile (agent_issues 100152, escalated
--   2026-10-19 12:02Z) carries none and was fixed by a session (PR 2878).
--
-- WHAT THIS CHANGES (one fleet_tasks row, no worker deploy)
--   The `escalate` step of fleet_tasks cron-watch (step 7) now names the migration that defines the failing task. fleet_tasks has no source
--   path, so the step finds it in migration_runs: the applied `migrations/*.sql` whose file name carries the task id, nearest in time to
--   fleet_tasks.updated_at; when no name matches, the file applied within 60 s before to 10 minutes after the definition was last written.
--   The line is `code-task: repo=qnfo-workers path=migrations/<file>.sql`. A fault with no such file keeps the old text (nothing is invented).
--   The worker branch is untouched. The step stays idempotent: an issue is escalated once (the ESCALATED marker).
--
-- WHAT THIS DOES NOT CHANGE
--   The code loop's merge scope: mergeScopeWhy (qnfo-code-orchestrator) and cmScope (qnfo-fleet-control) still refuse a `migrations/` primary path
--   (a migration is a companion of a worker, script or doc task only), so the loop parks the task for a session with the exact file named,
--   which is the state ct_im100154 is in. Taking migrations as a primary path would let the loop change D1 schema and fleet task definitions on
--   its own and is a separate scope decision for the owner's canaried path (CODE-LOOP-CONTROL-PLANE-1), not part of this migration.
--
-- Verify after apply:
--   SELECT instr(json_extract(definition, '$.steps[6].sql'), 'code-task: repo=qnfo-workers path=migrations/') > 0 AS has_line, version FROM fleet_tasks WHERE id = 'cron-watch';
--   SELECT fault_key, issue_id FROM cron_watch_actions WHERE action = 'escalated' AND fault_key LIKE 'task-failed:%';   -- next such issue's description carries the line
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261019_cron_watch_escalate WHERE id = 'cron-watch'), version = version + 1 WHERE id = 'cron-watch'; DELETE FROM decision_log WHERE capability_gain = 'cron-task-fault-code-line'
-- BACKUP: bak_20261019_cron_watch_escalate

CREATE TABLE IF NOT EXISTS bak_20261019_cron_watch_escalate AS SELECT id, definition, version, updated_at FROM fleet_tasks WHERE id = 'cron-watch';

UPDATE fleet_tasks
   SET definition = json_set(definition, '$.steps[6].sql', 'UPDATE agent_issues SET priority = CASE WHEN priority = ''critical'' THEN ''critical'' ELSE ''high'' END, updated_at = (CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000), description = COALESCE(description, '''') || char(10) || ''ESCALATED (CRON-WATCH-1) '' || strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') || '': '' || (SELECT f.consecutive_fails FROM v_cron_fault_due f WHERE ''CRON-FAULT-1: '' || f.fault_key = agent_issues.title) || '' consecutive failures.'' || COALESCE((SELECT char(10) || ''code-task: repo=qnfo-workers path='' || f.worker_dir || ''/worker.js'' FROM v_cron_fault_due f WHERE ''CRON-FAULT-1: '' || f.fault_key = agent_issues.title AND f.worker_dir IS NOT NULL), (SELECT '' The fleet task definition lives in qnfo-audit fleet_tasks; fix it by migration. The applied migration closest to the definition by name and time follows (CRON-WATCH-TASK-DOER-1).'' || char(10) || ''code-task: repo=qnfo-workers path=migrations/'' || substr(m.file, 12) FROM v_cron_fault_due f JOIN fleet_tasks t ON t.id = substr(f.worker, 12) JOIN migration_runs m ON m.status = ''ok'' AND m.file LIKE ''migrations/%.sql'' AND (instr(m.file, t.id) > 0 OR (CAST(strftime(''%s'', replace(substr(m.applied_at, 1, 19), ''T'', '' '')) AS INTEGER) - CAST(strftime(''%s'', replace(substr(t.updated_at, 1, 19), ''T'', '' '')) AS INTEGER)) BETWEEN -60 AND 600) WHERE ''CRON-FAULT-1: '' || f.fault_key = agent_issues.title AND f.kind = ''task-failed'' ORDER BY (instr(m.file, t.id) > 0) DESC, abs(CAST(strftime(''%s'', replace(substr(m.applied_at, 1, 19), ''T'', '' '')) AS INTEGER) - CAST(strftime(''%s'', replace(substr(t.updated_at, 1, 19), ''T'', '' '')) AS INTEGER)) ASC, m.id DESC LIMIT 1), '' The fleet task definition lives in qnfo-audit fleet_tasks; fix it by migration. No applied migration file matches it by name or time: find the file that defines the task id in migrations/.'') WHERE status = ''open'' AND title LIKE ''CRON-FAULT-1: %'' AND instr(COALESCE(description, ''''), ''ESCALATED (CRON-WATCH-1)'') = 0 AND title IN (SELECT ''CRON-FAULT-1: '' || fault_key FROM v_cron_fault_due WHERE consecutive_fails >= 3)'),
       version = version + 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE id = 'cron-watch'
   AND json_extract(definition, '$.steps[6].name') = 'escalate'
   AND instr(json_extract(definition, '$.steps[6].sql'), 'path=migrations/') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session drain-ops',
  'A fleet task fault is fixed by a migration, so the escalation should name the migration; the table fleet_tasks has no source path, but migration_runs records the file name and the apply time, which locate the definition without a schema change',
  'CRON-WATCH-TASK-DOER-1: the escalate step of fleet_tasks cron-watch writes a code-task line naming the migration that defines a failing fleet task (name, then time against fleet_tasks.updated_at)',
  'qnfo-audit read 2026-10-19: cron_watch_actions escalated task-failed:code-loop-terminal-reconcile (issue 100152) with no code-task line; migration_runs holds migrations/2026-10-19-code-loop-terminal-reconcile-2.sql applied 12:26:21Z against fleet_tasks.updated_at 12:26:18',
  'pending: first task-failed escalation after apply',
  'one fleet_tasks row (cron-watch step 7); agent_issues descriptions gain a line; no worker, no scope change',
  'Rollback line of migrations/2026-10-19-cron-watch-task-doer.sql (backup table bak_20261019_cron_watch_escalate)',
  'cron-task-fault-code-line',
  'the next escalated task-failed fault carries a code-task line naming its migration',
  'node:sqlite suite migrations/cron-watch-task-doer.test.mjs (name match, time match, no match, worker branch, once-only); qnfo-audit read of migration_runs and fleet_tasks'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE capability_gain = 'cron-task-fault-code-line');

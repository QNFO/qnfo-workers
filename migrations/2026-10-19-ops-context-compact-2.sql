-- OPS-CONTEXT-COMPACT-2 and D1-LIVE-COLUMNS-1 (2026-10-19, charter pillar cost; agent_issues 2068, 100128 and the LOOP-BREAKER-1 twins 100079,
-- 100083, 100127) with FLEET-GRAPH-DELETE-ADAPT-1 (agent_issues 100146). qnfo-ops 2.50.5 and scripts/fleet_graph.mjs 1.0.2 carry the change;
-- this file records the two new failure modes with their detectors, the decisions, and re-bases the issue-2068 closing probe.
--
-- issue 2068: 2.39.2 compacted only older tool results (head 1200 chars). Measured 2026-10-19 from ops_ai_log (source job, 7 days): 3 job
-- rows, one of them 1,593,580 prompt tokens (job-27a22cfb02c6a5, 2026-10-17, 40 turns, 54 tool calls, 34,837 completion tokens), so the
-- assistant messages (reasoning_content, tool_call arguments) and the 1,200-char excerpts of every older round still rode along on every
-- round. 2.50.5 ages rounds (2 whole, 4 head+tail, older a digest), compacts the assistant side too and holds each round to 32,000
-- estimated tokens. The old probe read the rolling 7 days, so the pre-fix 1.59M row (2026-10-17) kept it failing until 2026-10-24 whatever the
-- fix did; the new probe reads job rows since the compaction release went live (deployment_history, version_id context-compact-2) and keeps
-- the issue's definition of done: at least 3 job rows, none at or above 800000 prompt tokens, ok share not below the 7 days before.
--
-- issues 100079, 100083, 100127, 100128 (verified live 2026-10-19 13:05Z): v_loop_breaker_signatures has no qnfo-ops row (it skips
-- ops_ai_tool rows tool_error_exclusions classifies; 0ac04ce) and their four contracts read pass. Nothing is changed for them here. The
-- remaining cost of the 23 ops_ai_tool "no such column" errors that day (27 ops_d1_query errors, 2026-10-19) is the retry round each one
-- forces, which 2.50.5 shortens by describing the live columns of the table the error names.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM ops_ai_log WHERE source = ''job'' AND datetime(ts) >= datetime(''now'', ''-7 days'') AND ts >= ''2026-10-07T08:17'') < 3 THEN ''pending: '' || (SELECT COUNT(*) FROM ops_ai_log WHERE source = ''job'' AND ts >= ''2026-10-07T08:17'') || '' job rows since the issue was filed (needs 3)'' WHEN (SELECT MAX(prompt_tokens) FROM ops_ai_log WHERE source = ''job'' AND datetime(ts) >= datetime(''now'', ''-7 days'') AND ts >= ''2026-10-07T08:17'') < 800000 THEN ''ok'' ELSE ''job prompt tokens still >= 800000'' END AS observed', next_due_at = NULL WHERE class = 'issue-2068'; DELETE FROM remediation_contracts WHERE class IN ('fm-ops-agent-history-resend', 'fm-ops-d1-live-columns'); DELETE FROM failure_modes WHERE fm_key IN ('ops-agent-history-resend', 'ops-d1-live-columns')
-- Rollback scope: the contract and registry rows; the behaviour is the worker change (revert qnfo-ops/worker.js and scripts/fleet_graph.mjs). decision_log is append-only and keeps its rows.
-- spof-review: none added. The compaction runs on the copy sent upstream; the loop's own transcript, the job record and the tool log stay whole, so reverting the worker restores the old behaviour with no data loss.

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN d.t IS NULL THEN ''pending: qnfo-ops context-compact-2 is not deployed yet'' WHEN j.n < 3 THEN ''pending: '' || j.n || '' job rows since '' || d.t || '' (needs 3)'' WHEN j.mx >= 800000 THEN ''job prompt tokens still >= 800000 (max '' || j.mx || '' since the compaction release)'' WHEN j.share < COALESCE(b.share, 1.0) THEN ''job ok share '' || j.share || '' is below the 7 days before the release ('' || COALESCE(b.share, 1.0) || '')'' ELSE ''ok'' END AS observed FROM (SELECT MIN(deployed_at) AS t FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%'') d LEFT JOIN (SELECT COUNT(*) AS n, MAX(prompt_tokens) AS mx, AVG(ok) AS share FROM ops_ai_log WHERE source = ''job'' AND ts >= (SELECT MIN(deployed_at) FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%'')) j ON 1 = 1 LEFT JOIN (SELECT AVG(ok) AS share FROM ops_ai_log WHERE source = ''job'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', (SELECT MIN(deployed_at) FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%''), ''-7 days'') AND ts < (SELECT MIN(deployed_at) FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%'')) b ON 1 = 1',
  next_due_at = NULL
WHERE class = 'issue-2068' AND instr(verify_probe, 'context-compact-2') = 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('ops-agent-history-resend',
  'one owner job costs over a million prompt tokens because every agent round resends the whole earlier transcript',
  'truncateToContext compacted only the tool results of older rounds (2.39.2, head 1200 chars); the assistant messages of those rounds (reasoning_content, long tool_call arguments, long content) and one excerpt per call stayed in full, and the only per-round bound was the 262,144-token model window, so cost grew with the square of the round count (job-27a22cfb02c6a5: 40 turns, 1,593,580 prompt tokens on 2026-10-17)',
  'qnfo-ops 2.50.5 OPS-CONTEXT-COMPACT-2: opsBoundRound ages tool-bearing rounds (2 whole, 4 head+tail, older a digest with long argument strings cut), compacts the assistant side, holds a round to 32,000 estimated tokens (squeeze, then drop the oldest rounds, task pinned) and prices JOB_BUDGET_EXCEEDED on the bounded copy; qnfo-ops/context-compact.test.mjs replays the job shape',
  'qnfo-ops/worker.js on main sends the bounded copy to the model in the job loop (a code-read contract: the consumer reads its checkout of main); the runtime measure is the issue-2068 probe (max job prompt_tokens < 800000 since the release)',
  'fm-ops-agent-history-resend', '2026-10-19', 2068,
  'an agent loop of 20 or more tool rounds with reasoning or long call arguments, on any upstream',
  'ops_ai_log source job prompt_tokens above 1,000,000 for one owner request; JOB_BUDGET_EXCEEDED on a job that was making progress',
  'AI spend of the ops agent (61 percent of Workers AI neurons on 2026-10-06) and the jobs that end ok=0 at the per-job cap');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('ops-d1-live-columns',
  'the ops agent keeps guessing columns: 23 ops_ai_tool "no such column" errors on 2026-10-19, each one a retry round',
  'the D1-SCHEMA-HINT-1 answer read d1_schema_index for the first table after FROM only, so a join alias (w.task_id), a view and a table the index missed fell through to a bare table list',
  'qnfo-ops 2.50.5 D1-LIVE-COLUMNS-1: ops_d1_query reads pragma_table_info of the table the error names (an alias resolves to its table) or of every table the query reads (at most 4), returns available_columns or available_columns_by_table, and keeps the index as the fallback',
  'qnfo-ops/worker.js on main defines d1LiveColumns and ops_d1_query calls it before the index fallback (code-read)',
  'fm-ops-d1-live-columns', '2026-10-19', 100128,
  'ops_d1_query with a column the table does not have, in a join, on a view, or on a table missing from d1_schema_index',
  'cloud_ops_events kind ops_ai_tool status error with "no such column"; the loop breaker counted the first guess (100128, 100127, 100083, 100079 until 0ac04ce excluded agent input errors)',
  'one extra model round per miss; in a job, an extra copy of the whole transcript');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-ops-agent-history-resend', NULL, 'OPS-CONTEXT-COMPACT-2', 'failure-mode detector',
  '{"paths":["qnfo-ops/worker.js"],"contains":"truncateToContext(msgs, OPS_ROUND_INPUT_BUDGET_TOKENS + 4096, { hard: true })"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'session-probe', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-ops-d1-live-columns', NULL, 'D1-LIVE-COLUMNS-1', 'failure-mode detector',
  '{"paths":["qnfo-ops/worker.js"],"contains":"_live = await d1LiveColumns(env[bind], sqlEff, msg);"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'session-probe', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'the cost of an ops agent job is the prompt resent each round, not the owner''s use; the model needs to see what it already ran (the call and a trace of the result) but not every older reasoning block, long argument and result in full',
  'OPS-CONTEXT-COMPACT-2: qnfo-ops 2.50.5 compacts older rounds in three ages, compacts the assistant messages of older rounds, holds each upstream round of a server-side agent loop to 32,000 estimated tokens and prices the per-job cap on the bounded copy; the loops keep their own whole transcript',
  'ops_ai_log source job, 2026-10-19 13:05Z: 3 rows in 7 days, max 1,593,580 prompt tokens (job-27a22cfb02c6a5, 40 turns, 54 tool calls, 34,837 completion tokens), 119,355 and 677,324 for the other two; owner chat sources mobile/public/other max 72,049/21,100/136,408. qnfo-ops/context-compact.test.mjs (63 checks) replays the shape: 60 percent fewer estimated prompt tokens than 2.39.2 on the shell-heavy job, 71 percent with long reasoning, 28 percent when 16k results dominate',
  'merged to main (pending the parent session)',
  'every server-side agent loop of qnfo-ops (job workflow and chat), not client-run tool loops; the model can see less of old rounds and may repeat a call whose detail was cut (each older round keeps its call and a head and tail of its result, with a re-run note)',
  'revert qnfo-ops/worker.js to 2.50.4; the Rollback header restores the old issue-2068 probe and removes the two detectors',
  'a job of 40 tool rounds costs about 40 percent of the prompt it cost, and a round can no longer exceed its budget',
  'ops_job_max_prompt_tokens < 800000 within 168 h',
  'none', 'offline suite qnfo-ops/context-compact.test.mjs (63 passed) and the whole qnfo-ops suite set; scripts/version-bump-guard.py and scripts/mirror-guard.py on the commit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'OPS-CONTEXT-COMPACT-2:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'an agent that guesses a column learns faster from the live columns of the table it named than from a table list; the index is the fallback, not the source',
  'D1-LIVE-COLUMNS-1: ops_d1_query answers "no such column" with pragma_table_info of the table the error names (alias resolved) or of every table the query reads, at most 4',
  'cloud_ops_events kind ops_ai_tool status error: 49 errors on 2026-10-19 (13:05Z), 23 of them "no such column", 27 from ops_d1_query; eight in 16 minutes at 10:20Z to 10:36Z on status, response, key, close_evidence, worker, schedule, ts and metric',
  'merged to main (pending the parent session)',
  'ops_d1_query error answers only; the query itself and the read-only guard are unchanged',
  'revert qnfo-ops/worker.js to 2.50.4 (the index hint stays as it was); the Rollback header removes the detector',
  'the agent corrects a bad column from the first error, including in joins and views',
  'ops_ai_tool_no_such_column_errors_24h <= 12 within 72 h',
  'none', 'offline suite qnfo-ops/context-compact.test.mjs d1TablesIn and d1LiveColumns cases (alias, join, view, internal table, unknown table)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'D1-LIVE-COLUMNS-1:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'the 80-term DELETE cap of 1.0.1 came from one measurement (96 terms of a three-column key pass, 99 fail), so a limit that moves or a WHERE that grows would fail every push again; the cheap defence is to halve the statement on that exact error',
  'FLEET-GRAPH-DELETE-ADAPT-1: scripts/fleet_graph.mjs 1.0.2 retries a DELETE that D1 refuses with "Expression tree is too large" with half the OR terms per statement down to one, and throws any other error at once',
  'cloud_ops_events kind fleet-graph: error at 11:17Z, 11:19Z, 11:23Z, 11:24Z, 11:46Z, 11:47Z (the 400-term DELETEs fixed by 1.0.1, 10530e3, 11:52Z); 11 consecutive ok runs 11:52Z to 12:56Z at version 1.0.1; v_loop_breaker_signatures fleet-graph n=6 last_ts 2026-10-19T11:47:42Z; the signature leaves the 6-hour probe window at 17:48Z',
  'merged to main (pending the parent session)',
  'the graph write only; a retried DELETE of keys already gone changes nothing',
  'revert scripts/fleet_graph.mjs to 1.0.1',
  'a moved D1 expression-depth limit costs a smaller statement, not a stale graph',
  'fleet_graph_delete_depth_failures_24h = 0 within 24 h',
  'none', 'scripts/fleet_graph.mjs --selftest with acorn 8.19.0 (fake D1 at limits 100, 30 and 4, writeScope with 300 stale nodes and edges)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'FLEET-GRAPH-DELETE-ADAPT-1:') = 1);

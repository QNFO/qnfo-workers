-- LOOP-BREAKER-TOOL-EXCLUSIONS-1 (2026-10-19, charter pillar: autonomy; agent_issues 100127 and 100128, doctrine revision 2 section 2 loop breaker).
-- WHY. v_loop_breaker_signatures files a LOOP-BREAKER-1 issue for any error text that recurs three times in 24 hours. For qnfo-ops tool calls
-- (cloud_ops_events kind ops_ai_tool) the fleet already classifies caller mistakes in tool_error_exclusions, and tool_failures_24h and the
-- TOOL-FAILURE issue filer honour that table, but the loop breaker read the raw error rows. Measured 2026-10-19 10:40Z:
--   * 100128 "ops_d1_query: D1_ERROR: no such column": the ops agent guessed a column name on tables that lack it (05:40Z, 08:04Z, 09:49Z, 10:20Z).
--     ops_d1_query already answers every such error with available_columns (D1-SCHEMA-HINT-1) and the next call succeeded in each of the three
--     ops_ai_log turns read (10:37Z close_evidence, 09:31Z updated_at, 08:22Z created_at). The exclusion 'no such column' (agent-schema-guess) exists.
--   * 100127 "container_workspace_exec: command exited 1: cd: /workspace/qw: No such file or directory": the agent changed into a clone that does not
--     exist; the exclusion 'command exited' (agent-input-error, CONTAINER-EXIT-VISIBLE-1) exists.
-- Both are caller input errors a tool change cannot remove, so the signature can never "not recur for 6 hours" while agents keep guessing, and the
-- issue the loop breaker files cannot close. The view now applies the same exclusion predicate as tool_failures_24h to ops_ai_tool rows only; every
-- other producer, every code-task signature and every tool error outside the exclusion table is counted as before, and tool_failures_excluded_24h
-- still lists each excluded row, so a mis-classified defect stays visible. Rows of other kinds that merely contain an exclusion word are not touched.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_loop_breaker_signatures; CREATE VIEW v_loop_breaker_signatures AS SELECT 'event' AS src, producer, sig, COUNT(*) AS n, MAX(ts) AS last_ts, MIN(substr(dt,1,300)) AS example FROM (SELECT producer, ts, dt, substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(dt,'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9','')),1,48) AS sig FROM (SELECT producer, ts, txt || CASE WHEN err <> '' THEN ': ' || err ELSE '' END AS dt FROM (SELECT COALESCE(job, kind, '?') AS producer, ts, COALESCE(text, '') AS txt, CASE WHEN json_valid(meta) THEN COALESCE(json_extract(meta, '$.error'), '') ELSE '' END AS err FROM cloud_ops_events WHERE status = 'error' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') AND instr(COALESCE(text, ''), 'filed agent_issue') = 0))) GROUP BY producer, sig HAVING COUNT(*) >= 3 UNION ALL SELECT 'code-task', path, sig, COUNT(*), MAX(updated_at), MIN(substr(err,1,300)) FROM (SELECT path, updated_at, COALESCE(last_error, merge_note, '') AS err, substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(COALESCE(last_error, merge_note, ''), '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')),1,48) AS sig FROM code_tasks WHERE status IN ('failed','publish_failed','reverted','needs_human') AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) GROUP BY path, sig HAVING COUNT(*) >= 3; DELETE FROM remediation_contracts WHERE class = 'fm-loop-breaker-counts-excluded-tool-errors'; DELETE FROM failure_modes WHERE fm_key = 'loop-breaker-counts-excluded-tool-errors'; DELETE FROM control_registry WHERE control = 'loop_breaker_tool_exclusions'
-- BACKUP: bak_20261019_loop_breaker_view

CREATE TABLE IF NOT EXISTS bak_20261019_loop_breaker_view AS SELECT name, sql FROM sqlite_master WHERE name = 'v_loop_breaker_signatures';

DROP VIEW IF EXISTS v_loop_breaker_signatures;

CREATE VIEW v_loop_breaker_signatures AS SELECT 'event' AS src, producer, sig, COUNT(*) AS n, MAX(ts) AS last_ts, MIN(substr(dt,1,300)) AS example FROM (SELECT producer, ts, dt, substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(dt,'0',''),'1',''),'2',''),'3',''),'4',''),'5',''),'6',''),'7',''),'8',''),'9','')),1,48) AS sig FROM (SELECT producer, ts, txt || CASE WHEN err <> '' THEN ': ' || err ELSE '' END AS dt FROM (SELECT COALESCE(job, kind, '?') AS producer, ts, COALESCE(text, '') AS txt, CASE WHEN json_valid(meta) THEN COALESCE(json_extract(meta, '$.error'), '') ELSE '' END AS err FROM cloud_ops_events WHERE status = 'error' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') AND instr(COALESCE(text, ''), 'filed agent_issue') = 0 AND NOT (kind = 'ops_ai_tool' AND EXISTS (SELECT 1 FROM tool_error_exclusions x WHERE instr(COALESCE(meta, ''), x.pattern) > 0 OR instr(COALESCE(text, ''), x.pattern) > 0))))) GROUP BY producer, sig HAVING COUNT(*) >= 3 UNION ALL SELECT 'code-task', path, sig, COUNT(*), MAX(updated_at), MIN(substr(err,1,300)) FROM (SELECT path, updated_at, COALESCE(last_error, merge_note, '') AS err, substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(COALESCE(last_error, merge_note, ''), '0', ''), '1', ''), '2', ''), '3', ''), '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', '')),1,48) AS sig FROM code_tasks WHERE status IN ('failed','publish_failed','reverted','needs_human') AND updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) GROUP BY path, sig HAVING COUNT(*) >= 3;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('loop-breaker-counts-excluded-tool-errors',
  'the loop breaker counts qnfo-ops tool errors that the fleet has already classified as caller input, so LOOP-BREAKER-1 issues are filed for guesses no tool change can remove and never close',
  'v_loop_breaker_signatures grouped raw cloud_ops_events error rows; tool_error_exclusions (read by tool_failures_24h and the TOOL-FAILURE filer) was not applied to it',
  'LOOP-BREAKER-TOOL-EXCLUSIONS-1: the view skips ops_ai_tool rows that match tool_error_exclusions; tool_failures_excluded_24h still lists them',
  'fm-loop-breaker-counts-excluded-tool-errors: the view definition still references tool_error_exclusions (1 while the exclusion is in place)',
  'fm-loop-breaker-counts-excluded-tool-errors', '2026-10-19T09:49:16Z', 100128,
  'an ops agent repeats a classified caller mistake (a guessed column, a missing workspace directory) three times in a day',
  'LOOP-BREAKER-1 issues for ops_d1_query no such column and container_workspace_exec command exited that stay open',
  'loop-breaker issue noise on the qnfo-ops producer; the owner and the fleet read the queue as if the tool were broken');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-loop-breaker-counts-excluded-tool-errors', NULL, 'LOOP-BREAKER-TOOL-EXCLUSIONS-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE name = ''v_loop_breaker_signatures'' AND instr(sql, ''tool_error_exclusions'') > 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id)
VALUES ('loop_breaker_tool_exclusions', 'qnfo-audit.v_loop_breaker_signatures (event branch, kind ops_ai_tool rows matching tool_error_exclusions)', 'filter',
 'LOOP-BREAKER-1 issues filed for classified caller-input errors of qnfo-ops tools', 0, 'keep', 'applied',
 'tool_failures_excluded_24h lists every excluded error row; the non-tool events and the code-task branch of the view are unchanged',
 'issues 100127 and 100128 (2026-10-19): ops_d1_query no such column and container_workspace_exec command exited are agent-schema-guess and agent-input-error rows already in tool_error_exclusions; the next call succeeded in each turn read.', 100128);

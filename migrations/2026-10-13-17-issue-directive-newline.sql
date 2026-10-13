-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_directive_newline_ai; DELETE FROM control_registry WHERE control = 'issue-directive-newline-guard'; DELETE FROM remediation_contracts WHERE class = 'fm-directive-literal-newline'; DELETE FROM failure_modes WHERE fm_key = 'directive-literal-newline'
-- ISSUE-DIRECTIVE-NEWLINE-1 (2026-10-13, pillar autonomy, metrics breach_code_task_pct and code_task_success_rate_30d).
-- Two open issues joined their machine-read lines with the two characters backslash and n instead of a newline: 2381
-- LEARNER-COVERAGE-1 (2 such joins, filed 2026-10-12) and 2473 RESEARCH-RERUN-COST-1 (4 joins, filed 2026-10-13 05:19 UTC), both
-- written straight to D1 by a session as an escaped JSON string. SQLite stores the backslash as is. The code loop intake
-- (qnfo-code-orchestrator INTAKE_MARK) needs the path at the end of its line, so "path=qnfo-social/worker.js\ncode-anchor: ..."
-- never matches: neither issue ever produced a code task (code_tasks has no row whose goal names #2381 or #2473 at 07:40 UTC).
-- (1) The two rows are repaired: a literal backslash-n directly before a directive keyword becomes a newline.
-- (2) Every writer is covered from now on: an insert that carries such a join is rewritten the same way (a guard that normalises,
--     never aborts; ANTIFRAGILE-1). Only the separator before the six directive keywords changes, so prose that quotes "\n"
--     elsewhere is left alone. The trigger has the shape of agent_issues_created_at_norm_ins (an AFTER INSERT that updates its own
--     row), so it adds no trigger nesting level (D1-TRIGGER-DEPTH-1). A description change is not rewritten, because an AFTER
--     UPDATE OF description trigger would add a level under every insert; the detector below catches that case instead.
-- (3) Failure mode directive-literal-newline with its detector fm-directive-literal-newline (d1-query, hourly): no open issue
--     holds the join.
UPDATE agent_issues SET
  description = replace(replace(replace(replace(replace(replace(description,
    '\ncode-task:', char(10) || 'code-task:'), '\ncode-anchor:', char(10) || 'code-anchor:'), '\ncode-probe:', char(10) || 'code-probe:'),
    '\nruntime-probe:', char(10) || 'runtime-probe:'), '\nsession-task:', char(10) || 'session-task:'), '\ndepends-on:', char(10) || 'depends-on:'),
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE status = 'open' AND (instr(description, '\ncode-') > 0 OR instr(description, '\nruntime-probe:') > 0 OR instr(description, '\nsession-task:') > 0 OR instr(description, '\ndepends-on:') > 0);
CREATE TRIGGER IF NOT EXISTS agent_issues_directive_newline_ai AFTER INSERT ON agent_issues
WHEN instr(NEW.description, '\ncode-') > 0 OR instr(NEW.description, '\nruntime-probe:') > 0 OR instr(NEW.description, '\nsession-task:') > 0 OR instr(NEW.description, '\ndepends-on:') > 0
BEGIN
  UPDATE agent_issues SET description = replace(replace(replace(replace(replace(replace(description,
    '\ncode-task:', char(10) || 'code-task:'), '\ncode-anchor:', char(10) || 'code-anchor:'), '\ncode-probe:', char(10) || 'code-probe:'),
    '\nruntime-probe:', char(10) || 'runtime-probe:'), '\nsession-task:', char(10) || 'session-task:'), '\ndepends-on:', char(10) || 'depends-on:')
  WHERE id = NEW.id;
END;
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
 ('issue-directive-newline-guard', 'qnfo-audit trigger agent_issues_directive_newline_ai (migrations/2026-10-13-17-issue-directive-newline.sql)', 'guard',
  'an issue whose code-task, code-anchor, code-probe, runtime-probe, session-task or depends-on line is joined to the line before it by a literal backslash-n, so no doer parses it',
  0, 'keep', 'applied',
  'fm-directive-literal-newline (d1-query, hourly) counts open issues that still hold the join, which catches a description change the insert trigger does not see and a dropped trigger; the guard only rewrites the separator and never refuses an insert',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'agent_issues 2381 and 2473 at 07:40 UTC: 2 and 4 joins, no code task in code_tasks; a local SQLite run of this file repaired the 2473 text so qnfo-code-orchestrator INTAKE_MARK matches it',
  2473, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('directive-literal-newline', 'an issue''s machine-read lines (code-task, code-anchor, code-probe, runtime-probe) are joined by a literal backslash-n, so no doer can parse them',
  'a session wrote the description to D1 as an escaped JSON or SQL string; SQLite keeps the backslash, and the code loop intake needs the path at the end of a line, so 2381 and 2473 never became code tasks',
  'ISSUE-DIRECTIVE-NEWLINE-1: D1 trigger agent_issues_directive_newline_ai turns a backslash-n before a directive keyword into a newline on every insert; the two open rows were repaired by migration 2026-10-13-17; the detector catches a later description change',
  'no open agent_issues row holds a literal backslash-n before a directive keyword', 'fm-directive-literal-newline', '2026-10-12', 2473,
  'a description built by hand as an escaped string', 'an open issue with a code-task line and no code task after hours', 'every issue a session or a migration files by hand');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-directive-literal-newline', NULL, 'ISSUE-DIRECTIVE-NEWLINE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND (instr(description, ''\ncode-'') > 0 OR instr(description, ''\nruntime-probe:'') > 0 OR instr(description, ''\nsession-task:'') > 0 OR instr(description, ''\ndepends-on:'') > 0)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a directive line an issue carries reaches its doer whatever tool wrote the row',
  'ISSUE-DIRECTIVE-NEWLINE-1: repair the two open issues whose directive lines were joined by a literal backslash-n, and normalise every later insert in D1',
  'agent_issues 2381 (2 joins) and 2473 (4 joins) at 07:40 UTC; INTAKE_MARK in qnfo-code-orchestrator/worker.js needs the path at the end of a line; code_tasks has no row naming either issue',
  'merged through the canonical path', 'agent_issues only: the separator before six directive keywords', 'the Rollback line of this file',
  'issues filed by hand reach the code loop', 'fm-directive-literal-newline passes at its first run; the code loop builds a task for 2381 within 3 hours of the merge (2473 waits on the qnfo-research-exec file claim)', 'none',
  'd1:agent_issues, code_tasks, sqlite_master triggers; code:qnfo-code-orchestrator INTAKE_MARK');

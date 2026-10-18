-- ISSUE-SLA-GUARD-RELIABLE-1 (2026-10-18, pillar autonomy; owner doctrine: every process needs an explicit SLA and a
-- second path to the definition of done - a second path that fails half its ticks is not a second path)
--
-- WHAT WAS WRONG
-- The guard installed by migrations/2026-10-18-issue-sla-invariant-guard.sql detects a broken SLA window by inserting an
-- ISSUE-SLA-INVARIANT-1 row into agent_issues:
--     INSERT INTO agent_issues (...) SELECT ... FROM (SELECT 1) WHERE (SELECT COUNT(*) ...) > 0 AND NOT EXISTS (...)
-- agent_issues refuses that statement shape at COMPILE time. Measured live 2026-10-18:
--     INSERT INTO agent_issues SELECT * FROM agent_issues WHERE 0                      -> 7500 triggers nested too deep
--     INSERT INTO agent_issues (all cols) SELECT ... FROM agent_issues WHERE 0          -> 7500
--     INSERT INTO agent_issues (title) SELECT 'x' WHERE 0                               -> 7500
--     real single-row INSERTs                                                           -> succeed
-- The refusal tracks how deep the trigger chain happens to compile (the same 2-column form passed at 13:01Z and failed
-- at 13:14Z), and other sessions add and drop triggers on that table continuously. So the guard ran, failed, ran,
-- failed:
--     fleet_runs 10035 12:56:07Z failed "triggers nested too deep"
--     fleet_runs 10048 13:00:43Z ok
--     fleet_runs 10056 13:10:19Z ok
--     fleet_runs 10072 13:20:17Z failed "triggers nested too deep"
-- A detector that only works when an unrelated table's compile depth happens to be shallow is not a detector.
--
-- THE FIX
-- Record the violation in issue_ledger instead: it carries no triggers at all (verified: 0 rows in sqlite_master for
-- type='trigger' AND tbl_name='issue_ledger'), and qnfo-audit.unified_open_issues already unions it as an open store,
-- so the row is visible to everything that reads open issues. Two steps replace the one:
--   record-window-violation  upserts fingerprint 'issue-sla-window-violation' as open, bumping occurrences, and puts the
--                            live count in the title - only when the count is non-zero
--   clear-window-violation   resolves the same row the moment the count returns to zero, so the record is self-clearing
--                            and cannot accumulate stale findings the way a filed issue would
--
-- WHAT IS UNCHANGED
-- repair-missing-rows and repair-null-deadlines (both no-ops when the invariant holds), the */10 cron, the baseline key,
-- and the ledger step that records the live trigger SQL on every run.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: re-apply migrations/2026-10-18-issue-sla-invariant-guard.sql to restore the previous task definition, and
--   DELETE FROM issue_ledger WHERE fingerprint='issue-sla-window-violation'.
--
-- Verify after apply:
--   SELECT definition LIKE '%issue-sla-window-violation%' FROM fleet_tasks WHERE id='issue-sla-invariant-guard';  -- 1
--   -- and, after the next tick, a run that does NOT fail:
--   SELECT status, started_at FROM fleet_runs WHERE task_id='issue-sla-invariant-guard' ORDER BY id DESC LIMIT 3;

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('issue-sla-invariant-guard',
        'ISSUE-SLA-INVARIANT-GUARD-1: second path for the issue SLA window — repair a missing deadline and record one issue_ledger row when the trigger stops applying it',
        'workflow',
        '{"steps":[{"type":"sql","db":"AUDIT","name":"repair-missing-rows","sql":"INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, triaged_at) SELECT a.id, ''AUTOTRIAGE-3'', ''triaged'', COALESCE((SELECT t.owner FROM analytics_metric_triggers t WHERE a.title LIKE ''METRIC-TRIGGER-%'' AND t.id = CAST(substr(a.title, 16) AS INTEGER) AND t.owner IN (SELECT service FROM service_registry)), ''qnfo-ops''), datetime(''now'', ''+120 minutes''), datetime(''now'') FROM agent_issues a WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM issue_triage t2 WHERE t2.issue_id = a.id)"},{"type":"sql","db":"AUDIT","name":"repair-null-deadlines","sql":"UPDATE issue_triage SET sla_due_at = datetime(''now'', ''+120 minutes'') WHERE (sla_due_at IS NULL OR trim(sla_due_at) = '''') AND issue_id IN (SELECT id FROM agent_issues WHERE status = ''open'')"},{"type":"sql","db":"AUDIT","name":"record-window-violation","sql":"INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) SELECT ''issue-sla-window-violation'', ''issue-sla-invariant-guard'', ''high'', ''reliability'', ''ISSUE-SLA-INVARIANT-1: '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) || '' open issue(s) created after the baseline have a deadline at or before their own created_at, so the 120-minute window is not being applied'', ''open'', datetime(''now''), datetime(''now''), 1, ''The single writer of an issue SLA deadline is the agent_issues_autotriage2_ins trigger. This row lives in issue_ledger because agent_issues refuses every INSERT ... SELECT form at compile time (D1 7500), which is why the earlier version of this guard flapped. Definition of done: sqlite_master for agent_issues_autotriage2_ins contains +120 minutes and this row is resolved. Second path: this guard repairs a missing or NULL deadline with the same 120-minute rule every 10 minutes, so issues keep a real SLA while the trigger is broken.'', datetime(''now'') FROM (SELECT 1) WHERE (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) > 0 ON CONFLICT(fingerprint) DO UPDATE SET status = ''open'', title = excluded.title, last_seen = datetime(''now''), occurrences = occurrences + 1, last_detail = excluded.last_detail, updated_at = datetime(''now'')"},{"type":"sql","db":"AUDIT","name":"clear-window-violation","sql":"UPDATE issue_ledger SET status = ''resolved'', resolved_at = datetime(''now''), resolution_note = ''auto: every open issue created after the baseline carries a 120-minute SLA window again'', updated_at = datetime(''now'') WHERE fingerprint = ''issue-sla-window-violation'' AND status = ''open'' AND (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) = 0"},{"type":"sql","db":"AUDIT","name":"ledger","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''issue-sla-invariant-guard-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''issue-sla-invariant-guard'', ''ISSUE-SLA-INVARIANT-GUARD-1: '' || (SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id)) || '' open issues without a triage row | '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = ''open'' AND (t.sla_due_at IS NULL OR trim(t.sla_due_at) = '''')) || '' without a deadline | '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) || '' post-baseline rows with no window'' || '' | trigger has 120-minute window: '' || COALESCE((SELECT CASE WHEN sql LIKE ''%+120 minutes%'' THEN ''yes'' ELSE ''NO'' END FROM sqlite_master WHERE name = ''agent_issues_autotriage2_ins''), ''MISSING''), NULL, ''issue-sla-invariant-guard'', ''ok''"}]}',
        30000, 1, 2, 1, datetime('now'));

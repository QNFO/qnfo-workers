-- ISSUE-SLA-GUARD-SELFHEAL-2 (2026-10-18, pillar autonomy; owner doctrine: every process needs an explicit SLA and a
-- second path to the definition of done, and a second path must survive the first one being deleted)
--
-- WHY
-- At 13:47Z a concurrent session hand-dropped three triggers on agent_issues (autotriage2_ins, code_probe_ins,
-- runtime_probe_ins) as ad-hoc depth relief for issue 2817. No migration did it and nothing recorded it. The measured
-- result, within a minute: SIX OF THE LAST EIGHT issues were filed with sla_due_at NULL - no SLA at all. The rule shipped
-- earlier today was silently gone.
--
-- The guard installed by ISSUE-SLA-GUARD-RELIABLE-1 repaired the NULLs on its next tick (open issues with a null deadline
-- went back to 0 without anyone touching it), which is the first real evidence that the second path earns its cron. But
-- two gaps showed up in the same incident:
--   * it can only repair a MISSING or NULL deadline; issue 99910 was repaired mid-outage and carries a 1-minute window
--     instead of 120, and nothing corrects that;
--   * when the trigger is dropped, the run ledger says "trigger has 120-minute window: MISSING" and nobody acts on it.
--     A grep in a log is not a finding.
--
-- WHAT THIS ADDS to fleet_tasks issue-sla-invariant-guard (version 3)
--   repair-short-window     any open issue filed after the baseline whose deadline is earlier than created_at + 120 minutes
--                           is extended to exactly that. It only ever EXTENDS a deadline, never shortens one, so it cannot
--                           manufacture urgency - it restores the window the rule promised.
--                           The comparison uses 119 minutes, not 120, on purpose: julianday arithmetic on a value that is
--                           exactly 120 minutes reads as marginally less than 120, so a literal 120 would rewrite correct
--                           rows on every tick. Measured 2026-10-18 13:57Z: the 120.0 form matched four rows whose window
--                           was exactly 120 minutes. The one-minute tolerance absorbs that rounding and leaves a genuinely
--                           short window (issue 99910, 1 minute) still matched.
--   record-trigger-missing  upserts an issue_ledger row when sqlite_master shows agent_issues_autotriage2_ins absent or
--                           without '+120 minutes', i.e. when the primary writer has been dropped or reverted by hand
--   clear-trigger-missing   resolves that row the moment the trigger is back with the window
--
-- WHY issue_ledger AND NOT agent_issues
-- agent_issues refuses every INSERT ... SELECT form at compile time (7500), which is what made the earlier version of this
-- guard flap. issue_ledger carries no triggers and is already unioned by qnfo-audit.unified_open_issues, so the row is
-- visible to everything that reads open issues.
--
-- MEASURED BEFORE WRITING (qnfo-audit, 2026-10-18 13:56Z)
--   trigger present with '+120 minutes': yes (restored by hand at 13:53Z after the drop)
--   open issues with a null deadline: 0    open issues with a window shorter than 120 minutes: 1 (issue 99910, 1 minute)
--   triggers on agent_issues: 21           (code_probe_ins and runtime_probe_ins are still dropped - not this file's scope)
--
-- SAFETY
--   Every repair is bounded to open issues created after ops_config issue_sla_window_baseline_ms and at or before now, so
--   the 162 legacy rows filed before the baseline keep their historical deadlines as evidence. Both record steps are
--   upserts keyed on a fixed fingerprint, so they cannot accumulate rows. Nothing is deleted and no issue is closed.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: re-apply migrations/2026-10-18-issue-sla-guard-reliable.sql to restore version 2 of the definition, then
--   DELETE FROM issue_ledger WHERE fingerprint IN ('issue-sla-window-violation','issue-sla-trigger-missing');
--
-- Verify after apply:
--   SELECT version, definition LIKE '%repair-short-window%' FROM fleet_tasks WHERE id='issue-sla-invariant-guard';  -- 3, 1
--   -- after the next tick:
--   SELECT status, started_at FROM fleet_runs WHERE task_id='issue-sla-invariant-guard' ORDER BY id DESC LIMIT 2;
--   SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id=a.id
--    WHERE a.status='open' AND a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key='issue_sla_window_baseline_ms')
--      AND a.created_at <= CAST(strftime('%s','now') AS INTEGER)*1000
--      AND julianday(t.sla_due_at) < julianday(a.created_at/1000,'unixepoch') + 119.0/1440.0;      -- 0

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('issue-sla-invariant-guard',
        'ISSUE-SLA-INVARIANT-GUARD-1: second path for the issue SLA window — repair a missing, null or short deadline and record when the trigger itself is dropped (v3)',
        'workflow',
        '{"steps":[{"type":"sql","db":"AUDIT","name":"repair-missing-rows","sql":"INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, triaged_at) SELECT a.id, ''AUTOTRIAGE-3'', ''triaged'', COALESCE((SELECT t.owner FROM analytics_metric_triggers t WHERE a.title LIKE ''METRIC-TRIGGER-%'' AND t.id = CAST(substr(a.title, 16) AS INTEGER) AND t.owner IN (SELECT service FROM service_registry)), ''qnfo-ops''), datetime(''now'', ''+120 minutes''), datetime(''now'') FROM agent_issues a WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM issue_triage t2 WHERE t2.issue_id = a.id)"},{"type":"sql","db":"AUDIT","name":"repair-null-deadlines","sql":"UPDATE issue_triage SET sla_due_at = datetime(''now'', ''+120 minutes'') WHERE (sla_due_at IS NULL OR trim(sla_due_at) = '''') AND issue_id IN (SELECT id FROM agent_issues WHERE status = ''open'')"},{"type":"sql","db":"AUDIT","name":"repair-short-window","sql":"UPDATE issue_triage SET sla_due_at = (SELECT datetime(a.created_at/1000, ''unixepoch'', ''+120 minutes'') FROM agent_issues a WHERE a.id = issue_triage.issue_id) WHERE issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status = ''open'' AND a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.sla_due_at IS NOT NULL AND trim(t.sla_due_at) <> '''' AND julianday(t.sla_due_at) < julianday(a.created_at/1000, ''unixepoch'') + 119.0/1440.0))"},{"type":"sql","db":"AUDIT","name":"record-window-violation","sql":"INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) SELECT ''issue-sla-window-violation'', ''issue-sla-invariant-guard'', ''high'', ''reliability'', ''ISSUE-SLA-INVARIANT-1: '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) || '' open issue(s) created after the baseline have a deadline at or before their own created_at, so the 120-minute window is not being applied'', ''open'', datetime(''now''), datetime(''now''), 1, ''The single writer of an issue SLA deadline is the agent_issues_autotriage2_ins trigger. This row lives in issue_ledger because agent_issues refuses every INSERT ... SELECT form at compile time (D1 7500). Definition of done: sqlite_master for agent_issues_autotriage2_ins contains +120 minutes and this row is resolved. Second path: this guard repairs a missing, null or short deadline with the same 120-minute rule every 10 minutes.'', datetime(''now'') FROM (SELECT 1) WHERE (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) > 0 ON CONFLICT(fingerprint) DO UPDATE SET status = ''open'', title = excluded.title, last_seen = datetime(''now''), occurrences = occurrences + 1, last_detail = excluded.last_detail, updated_at = datetime(''now'')"},{"type":"sql","db":"AUDIT","name":"clear-window-violation","sql":"UPDATE issue_ledger SET status = ''resolved'', resolved_at = datetime(''now''), resolution_note = ''auto: every open issue created after the baseline carries a 120-minute SLA window again'', updated_at = datetime(''now'') WHERE fingerprint = ''issue-sla-window-violation'' AND status = ''open'' AND (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) = 0"},{"type":"sql","db":"AUDIT","name":"record-trigger-missing","sql":"INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) SELECT ''issue-sla-trigger-missing'', ''issue-sla-invariant-guard'', ''high'', ''reliability'', ''ISSUE-SLA-TRIGGER-MISSING-1: agent_issues_autotriage2_ins is absent or no longer stamps a 120-minute window'', ''open'', datetime(''now''), datetime(''now''), 1, ''The primary writer of every issue SLA deadline has been dropped or reverted - on 2026-10-18 13:47Z a session hand-dropped three agent_issues triggers as depth relief and six of the next eight issues were filed with no deadline at all. This row is the finding that a log line could not be. Definition of done: sqlite_master for agent_issues_autotriage2_ins contains +120 minutes and this row is resolved. Second path: this guard still repairs missing, null and short deadlines every 10 minutes, so issues keep a real SLA while the trigger is gone.'', datetime(''now'') FROM (SELECT 1) WHERE NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''agent_issues_autotriage2_ins'' AND sql LIKE ''%+120 minutes%'') ON CONFLICT(fingerprint) DO UPDATE SET status = ''open'', last_seen = datetime(''now''), occurrences = occurrences + 1, updated_at = datetime(''now'')"},{"type":"sql","db":"AUDIT","name":"clear-trigger-missing","sql":"UPDATE issue_ledger SET status = ''resolved'', resolved_at = datetime(''now''), resolution_note = ''auto: agent_issues_autotriage2_ins is present again and stamps +120 minutes'', updated_at = datetime(''now'') WHERE fingerprint = ''issue-sla-trigger-missing'' AND status = ''open'' AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''agent_issues_autotriage2_ins'' AND sql LIKE ''%+120 minutes%'')"},{"type":"sql","db":"AUDIT","name":"ledger","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''issue-sla-invariant-guard-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''issue-sla-invariant-guard'', ''ISSUE-SLA-INVARIANT-GUARD-1 (v3): '' || (SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id)) || '' open issues without a triage row | '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = ''open'' AND (t.sla_due_at IS NULL OR trim(t.sla_due_at) = '''')) || '' without a deadline | '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = ''open'' AND a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND t.sla_due_at IS NOT NULL AND trim(t.sla_due_at) <> '''' AND julianday(t.sla_due_at) < julianday(a.created_at/1000, ''unixepoch'') + 119.0/1440.0) || '' with a short window | '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) || '' post-baseline rows with no window | trigger has 120-minute window: '' || COALESCE((SELECT CASE WHEN sql LIKE ''%+120 minutes%'' THEN ''yes'' ELSE ''NO'' END FROM sqlite_master WHERE name = ''agent_issues_autotriage2_ins''), ''MISSING''), NULL, ''issue-sla-invariant-guard'', ''ok''"}]}',
        30000, 1, 3, 1, datetime('now'));

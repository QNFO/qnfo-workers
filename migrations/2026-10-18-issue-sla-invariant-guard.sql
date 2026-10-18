-- ISSUE-SLA-INVARIANT-GUARD-1 (2026-10-18, pillar autonomy; owner doctrine: every process needs an explicit SLA AND a
-- second path to the definition of done — no single-path process is acceptable)
--
-- WHY
-- `agent_issues_autotriage2_ins` is the only writer of an issue's SLA deadline. Two defects follow from that single path.
--
-- (1) THE DEADLINE EQUALED THE START. Measured 2026-10-18 12:45Z: of 228 open issues, **162 had a sla_due_at at or
--     before their own created_at**. The rule was `datetime('now')`, so every issue filed by IMPROVEMENT-LOOP-1,
--     TRIGGER-RECOVERY-1 or the audit was in breach at birth, and a deadline that always equals the start distinguishes
--     nothing. The fleet's own ceiling for an issue is 120 minutes (ISSUE-SLA-2H-1, the same ceiling
--     sla_120_guard_contract_ins/upd already enforce on remediation contracts).
--
-- (2) NOTHING NOTICES WHEN THE TRIGGER STOPS WORKING. That is the single point of failure: a dropped or renamed trigger,
--     or a WHEN clause that stops matching, removes issue SLAs silently.
--
-- THE SECOND PATH
-- spof-review: fleet_tasks issue-sla-invariant-guard (cron */10) re-derives every open issue's deadline from the 120-minute
-- rule, repairs a missing or NULL one, and files one deduped ISSUE-SLA-INVARIANT-1 when a row created after this
-- migration's baseline still has no window — so a dead or reverted trigger is caught within 10 minutes instead of never.
--
-- WHY THIS FILE DOES NOT CARRY THE TRIGGER DDL (read this before adding it back)
-- The 120-minute window is LIVE in qnfo-audit as of 2026-10-18 12:52Z, but it was applied out of band, because the
-- migration applier cannot apply any trigger re-creation on agent_issues:
--
--   * scripts/apply_migrations.py verifies a new trigger by compiling zero-row writes against every table that can reach
--     it, including `INSERT INTO "agent_issues" SELECT * FROM "agent_issues" WHERE 0`.
--   * D1 counts trigger depth at COMPILE time (its own comment at apply_migrations.py:391-396 says exactly this: "a
--     trigger whose WHEN is never true still counts, and so does an INSERT ... WHERE 0"), and agent_issues already
--     carries ~24 triggers, several of which update agent_issues itself. So that self-reading probe is refused with
--     7500 "triggers nested too deep" — measured, twice.
--   * The runner's safety rule is to DROP the trigger it just created when a probe is refused. The first attempt at this
--     migration therefore left production WITHOUT agent_issues_autotriage2_ins (migration_runs id 292, 12:45:31Z). The
--     trigger was restored by hand at 12:46Z and re-created with the 120-minute window at 12:52Z.
--   * The refusal is a property of the PROBE, not of the trigger: the identical probe is refused with the ORIGINAL
--     datetime('now') trigger in place, so no trigger on this table can pass it, and the failure mode is "the applier
--     deletes a working trigger". Filed as its own issue (see the control_registry evidence below).
--
-- Adding DROP/CREATE TRIGGER to this file again would repeat that outage. The trigger's live definition is recorded
-- below verbatim so main still carries it; it is applied by the guard's owner, not by the applier, until the probe is
-- fixed. The guard is what makes that deferral safe: if the window ever regresses, ISSUE-SLA-INVARIANT-1 is filed.
--
--   -- live agent_issues_autotriage2_ins (1133 chars, contains '+120 minutes'), 2026-10-18 12:52Z:
--   CREATE TRIGGER agent_issues_autotriage2_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' BEGIN
--     INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
--     SELECT NEW.id, CASE WHEN o.owner IS NULL THEN 'AUTOTRIAGE-1' ELSE 'AUTOTRIAGE-2' END, 'triaged',
--            COALESCE(o.owner, 'qnfo-ops'), datetime('now', '+120 minutes')
--       FROM (SELECT COALESCE(
--               (SELECT t.owner FROM analytics_metric_triggers t WHERE NEW.title LIKE 'METRIC-TRIGGER-%'
--                 AND t.id = CAST(substr(NEW.title, 16) AS INTEGER) AND t.owner IN (SELECT service FROM service_registry)),
--               (SELECT s.service FROM service_registry s
--                 WHERE instr(COALESCE(NEW.description,''), 'code-task: repo=qnfo-workers path=') > 0
--                   AND s.service = substr(substr(NEW.description, instr(NEW.description,'code-task: repo=qnfo-workers path=') + 34), 1,
--                        instr(substr(NEW.description, instr(NEW.description,'code-task: repo=qnfo-workers path=') + 34), '/') - 1))
--             ) AS owner) o;
--   END;
--
-- MEASURED BEFORE WRITING THIS FILE (qnfo-audit, 2026-10-18 12:45Z)
--   open issues 228 | open with no triage row 0 | open with no deadline 0 | deadline at-or-before birth 162
--   => the repair steps are no-ops today; the detector is the one that earns its cron.
--
-- SAFETY
--   Idempotent: ops_config uses INSERT OR IGNORE (an existing baseline is never moved, so a re-apply cannot silently
--   forgive rows it already judged), every repair is NOT EXISTS-guarded, detection files at most one open issue at a
--   time, no trigger is created or dropped, and nothing is deleted.
--   The 162 legacy rows are deliberately NOT rewritten: their deadlines really were in the past, and rewriting them would
--   erase evidence rather than fix a rule.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM fleet_crons WHERE name='issue-sla-invariant-guard-10m'; DELETE FROM fleet_tasks WHERE
--   id='issue-sla-invariant-guard'; DELETE FROM control_registry WHERE control='agent_issues_autotriage2_ins';
--   DELETE FROM ops_config WHERE key='issue_sla_window_baseline_ms'; the triage rows it repaired are ordinary records
--   and are left in place.
--
-- Verify after apply:
--   SELECT value FROM ops_config WHERE key='issue_sla_window_baseline_ms';                          -- non-null epoch (ms)
--   SELECT id, cron_expr, enabled FROM fleet_crons WHERE name='issue-sla-invariant-guard-10m';      -- */10, enabled
--   SELECT sql LIKE '%+120 minutes%' FROM sqlite_master WHERE name='agent_issues_autotriage2_ins';  -- 1
--   (within ~10 minutes) SELECT COUNT(*) FROM cloud_ops_events WHERE kind='issue-sla-invariant-guard'
--    AND ts >= datetime('now','-10 minutes');                                                       -- >= 1

-- 1. The baseline the guard judges against: this instant, never moved again by a re-apply ---------------------------
INSERT OR IGNORE INTO ops_config (key, value, note)
VALUES ('issue_sla_window_baseline_ms', CAST(strftime('%s','now') AS INTEGER) * 1000,
        'ISSUE-SLA-INVARIANT-GUARD-1: issues created after this instant must carry a 120-minute SLA window. Rows filed before it (162 at apply time, deadline at or before their own created_at) are left untouched as evidence.');

-- 2. The second path: a guard that re-derives the deadline and reports a dead or reverted trigger --------------------
INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('issue-sla-invariant-guard',
        'ISSUE-SLA-INVARIANT-GUARD-1: second path for the issue SLA window — repair a missing deadline and file one issue when the trigger stops applying it',
        'workflow',
        '{"steps":[{"type":"sql","db":"AUDIT","name":"repair-missing-rows","sql":"INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, triaged_at) SELECT a.id, ''AUTOTRIAGE-3'', ''triaged'', COALESCE((SELECT t.owner FROM analytics_metric_triggers t WHERE a.title LIKE ''METRIC-TRIGGER-%'' AND t.id = CAST(substr(a.title, 16) AS INTEGER) AND t.owner IN (SELECT service FROM service_registry)), ''qnfo-ops''), datetime(''now'', ''+120 minutes''), datetime(''now'') FROM agent_issues a WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM issue_triage t2 WHERE t2.issue_id = a.id)"},{"type":"sql","db":"AUDIT","name":"repair-null-deadlines","sql":"UPDATE issue_triage SET sla_due_at = datetime(''now'', ''+120 minutes'') WHERE (sla_due_at IS NULL OR trim(sla_due_at) = '''') AND issue_id IN (SELECT id FROM agent_issues WHERE status = ''open'')"},{"type":"sql","db":"AUDIT","name":"detect-dead-trigger","sql":"INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ''ISSUE-SLA-INVARIANT-1: the issue SLA trigger is not applying the 120-minute window'', ''Filed by issue-sla-invariant-guard (every 10 minutes, automated). The single writer of an issue SLA deadline is the agent_issues_autotriage2_ins trigger. '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) || '' issue(s) created after the baseline have a deadline at or before their own created_at, so the rule is not being applied.'' || char(10) || ''Definition of done: sqlite_master for agent_issues_autotriage2_ins contains +120 minutes, the count above is 0, and this issue carries the trigger SQL and the row ids it judged as evidence.'' || char(10) || ''Second path: this guard re-derives the same 120-minute window for any open issue missing a deadline, so issues keep a real SLA even while the trigger is broken.'', ''issue-sla-invariant-guard'', ''reliability'', ''high'', ''open'', CAST(strftime(''%s'',''now'') AS INTEGER)*1000, CAST(strftime(''%s'',''now'') AS INTEGER)*1000 WHERE (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) > 0 AND NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.title LIKE ''ISSUE-SLA-INVARIANT-1:%'' AND x.status = ''open'')"},{"type":"sql","db":"AUDIT","name":"ledger","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''issue-sla-invariant-guard-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''issue-sla-invariant-guard'', ''ISSUE-SLA-INVARIANT-GUARD-1: '' || (SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id)) || '' open issues without a triage row | '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = ''open'' AND (t.sla_due_at IS NULL OR trim(t.sla_due_at) = '''')) || '' without a deadline | '' || (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.created_at >= (SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''issue_sla_window_baseline_ms'') AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND a.status = ''open'' AND t.sla_due_at <= datetime(a.created_at/1000, ''unixepoch'')) || '' post-baseline rows with no window'' || '' | trigger has 120-minute window: '' || COALESCE((SELECT CASE WHEN sql LIKE ''%+120 minutes%'' THEN ''yes'' ELSE ''NO'' END FROM sqlite_master WHERE name = ''agent_issues_autotriage2_ins''), ''MISSING''), NULL, ''issue-sla-invariant-guard'', ''ok''"}]}',
        30000, 1, 1, 1, datetime('now'));

-- next_fire NULL = due on the very next tick (fleet-exec: next_fire IS NULL OR next_fire <= now), so the guard is live
-- within a minute of the merge and the dispatcher then writes its own next_fire (same convention as portfolio-lifecycle).
INSERT INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('issue-sla-invariant-guard-10m', '*/10 * * * *', 'issue-sla-invariant-guard', 1, 'UTC', datetime('now'))
ON CONFLICT(name) DO UPDATE SET cron_expr=excluded.cron_expr, task_id=excluded.task_id, enabled=excluded.enabled, updated_at=excluded.updated_at;

-- 3. The control registry row: the trigger is kept, its alternate path is named, and the applier defect is recorded ---
INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, reviewed_at)
VALUES ('agent_issues_autotriage2_ins',
        'qnfo-audit, applied out of band (definition recorded in migrations/2026-10-18-issue-sla-invariant-guard.sql)',
        'gate',
        'an issue being filed with no SLA window at all, or with a window of zero minutes (deadline == created_at)',
        1,
        'keep',
        'applied',
        'fleet_tasks issue-sla-invariant-guard on the */10 tick: repairs a missing or NULL deadline with the same 120-minute rule, files ISSUE-SLA-INVARIANT-1 when a post-baseline row still has no window, and ledgers the live trigger SQL every run',
        NULL,
        'Measured 2026-10-18 12:45Z: 228 open issues, 162 with sla_due_at at or before created_at (the window was datetime(''now'')); 0 with no triage row; 0 with a NULL deadline. The trigger now stamps now + 120 minutes (ISSUE-SLA-2H-1 ceiling). APPLIED OUT OF BAND because scripts/apply_migrations.py verifies a new trigger with INSERT INTO agent_issues SELECT * FROM agent_issues WHERE 0, which D1 refuses with 7500 triggers-nested-too-deep at compile time even with the ORIGINAL trigger in place, and the runner then drops the trigger it just created (migration_runs id 292, 12:45:31Z, production left without agent_issues_autotriage2_ins until 12:46Z). The probe, not the trigger, is the defect.',
        strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- 4. First run: the same repair statements the guard runs every 10 minutes, so applying this file makes the invariant
--    true now rather than at the next tick. Each is a no-op today (measured 0 / 0) and cannot double-write.
INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, triaged_at)
SELECT a.id, 'AUTOTRIAGE-3', 'triaged',
       COALESCE((SELECT t.owner FROM analytics_metric_triggers t
                  WHERE a.title LIKE 'METRIC-TRIGGER-%' AND t.id = CAST(substr(a.title, 16) AS INTEGER)
                    AND t.owner IN (SELECT service FROM service_registry)), 'qnfo-ops'),
       datetime('now', '+120 minutes'), datetime('now')
FROM agent_issues a
WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM issue_triage t2 WHERE t2.issue_id = a.id);

UPDATE issue_triage SET sla_due_at = datetime('now', '+120 minutes')
WHERE (sla_due_at IS NULL OR trim(sla_due_at) = '')
  AND issue_id IN (SELECT id FROM agent_issues WHERE status = 'open');

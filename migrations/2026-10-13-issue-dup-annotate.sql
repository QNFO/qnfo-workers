-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_issue_dup_triggers
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_open_dup_annotate; -- then recreate agent_issues_dedup_gap_ledger from the sql column of bak_20261013_issue_dup_triggers; agent_issue_refiles may stay (nothing else reads it)
--
-- ISSUE-DUP-ABORT-1 (GHA-AUDIT-1 follow-up, 2026-10-13; charter pillar autonomy). An insert into agent_issues whose title
-- matches an OPEN issue up to case and surrounding spaces hits the unique index idx_agent_issues_open_title_ci and ABORTS.
-- When that insert runs inside a trigger, SQLite rolls back the whole statement that fired it: the fleet_tick heartbeat
-- row, the decision_log entry, the human_actions card (human_actions_autonomy_first_ai has no dedupe at all), the
-- code_tasks status change (code_tasks_needs_human_reroute_au). Measured: migration_runs 2026-10-12 08:00Z, files -23 and
-- -24 failed on a plain INSERT INTO fleet_tick and INSERT INTO decision_log with "UNIQUE constraint failed: index
-- 'idx_agent_issues_open_title_ci'". A caller that is not a migration leaves no record at all; the BEFORE INSERT ledger
-- agent_issues_dedup_gap_ledger was rolled back with the statement it could not save.
--
-- Fix (ANTIFRAGILE-1: a guard on agent_issues normalises, annotates or reopens, never aborts): one BEFORE INSERT trigger
-- counts the refile against the open issue in agent_issue_refiles and skips the duplicate row (RAISE(IGNORE)), so the
-- statement that fired it completes. No id is consumed, so the id-gap ledger trigger is retired with it (its predicted
-- gap would now be a real id). The open issue stands; nothing is dropped: the refile count, time and source are kept.

CREATE TABLE IF NOT EXISTS bak_20261013_issue_dup_triggers AS
  SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master
  WHERE type = 'trigger' AND name = 'agent_issues_dedup_gap_ledger';

CREATE TABLE IF NOT EXISTS agent_issue_refiles (
  issue_id INTEGER PRIMARY KEY,
  refiles INTEGER NOT NULL DEFAULT 0,
  first_at TEXT,
  last_at TEXT,
  last_source TEXT
);

DROP TRIGGER IF EXISTS agent_issues_dedup_gap_ledger;

DROP TRIGGER IF EXISTS agent_issues_open_dup_annotate;

CREATE TRIGGER agent_issues_open_dup_annotate BEFORE INSERT ON agent_issues
WHEN COALESCE(NEW.status, 'open') = 'open'
  AND EXISTS (SELECT 1 FROM agent_issues x WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title)))
BEGIN
  INSERT OR IGNORE INTO agent_issue_refiles (issue_id, refiles, first_at)
    SELECT x.id, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM agent_issues x
    WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title)) ORDER BY x.id LIMIT 1;
  UPDATE agent_issue_refiles SET refiles = refiles + 1, last_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    last_source = substr(COALESCE(NEW.source, '?'), 1, 200)
  WHERE issue_id = (SELECT x.id FROM agent_issues x WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title))
                    ORDER BY x.id LIMIT 1);
  SELECT RAISE(IGNORE);
END;

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('issue-dup-abort',
 'a trigger that files an issue whose title is already open (up to case and spaces) aborts the write that fired it',
 'the unique partial index idx_agent_issues_open_title_ci aborts the duplicate insert, and SQLite rolls back the whole statement that fired the trigger chain; the BEFORE INSERT ledger was rolled back with it',
 'agent_issues_open_dup_annotate counts the refile in agent_issue_refiles and skips the duplicate row (RAISE(IGNORE)), so the parent write completes',
 'the annotate trigger exists and no migration failed on the open-title index in the last 24 h',
 'fm-issue-dup-abort', '2026-10-12', NULL,
 'a trigger-filed issue (autonomy-first reroute, code-task reroute, metric or tool-error filer) repeats a title that is open',
 'migrations 2026-10-12-23 and -24 failed on INSERT INTO fleet_tick and decision_log; other callers fail without a trace',
 'the fleet tick heartbeat, decision_log, owner cards, code task status changes and every migration that writes them');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-issue-dup-abort', NULL, 'ISSUE-DUP-ABORT-1', 'failure-mode detector',
 'SELECT ''1'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name = ''agent_issues_open_dup_annotate'') * (1 - MIN(1, (SELECT COUNT(*) FROM migration_runs WHERE status = ''error'' AND instr(COALESCE(error, ''''), ''idx_agent_issues_open_title'') > 0 AND applied_at >= datetime(''now'', ''-24 hours'')))) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state,
  alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
('agent_issues_open_dup_annotate', 'qnfo-audit trigger (migrations/2026-10-13-issue-dup-annotate.sql)', 'guard',
 'a duplicate open issue title aborting the write that fired the filing trigger', 0, 'replace', 'applied',
 'the unique index still refuses a duplicate from a direct INSERT that bypasses triggers (none do: BEFORE INSERT fires on every insert)',
 datetime('now'), 'replaces agent_issues_dedup_gap_ledger, which recorded the clash but was rolled back with the aborted statement', NULL,
 datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
  predicted_outcome, reach_gain, surfaces_tested) VALUES
('session_018gmMjMgWAuzVh7gHPBcosA',
 'a duplicate open title is a refile of the open issue, never a reason to roll back the write that raised it',
 'ISSUE-DUP-ABORT-1: agent_issues_open_dup_annotate counts the refile and skips the duplicate row; agent_issues_dedup_gap_ledger retired',
 'migration_runs 2026-10-12: files -23 and -24 failed with UNIQUE constraint failed: index idx_agent_issues_open_title_ci on INSERT INTO fleet_tick and decision_log',
 'applied by apply-migrations', 'agent_issues inserts only', 'see the Rollback header of migrations/2026-10-13-issue-dup-annotate.sql',
 'trigger-filed issues can repeat without breaking the fleet tick, owner cards or code tasks',
 'fm-issue-dup-abort = 1 within 2 h', 'none', 'D1 trigger chain, migration runner, offline replay (scripts/issue_dup_annotate_test.py)');

-- AGENT-ISSUES-REOPEN-TWIN-GUARD-1 (2026-10-18, pillar autonomy; restores the fleet heartbeat)
--
-- THE OUTAGE THIS FIXES
-- qnfo-audit.fleet_tick, the fleet's 10-minute heartbeat, stopped at 2026-10-18T12:14:08Z and had not recovered
-- 138 minutes later. Its writer is qnfo-code-orchestrator's feedFleetTick (cron */2 * * * *), which wraps the insert in
-- try/catch and reports the failure as cloud_ops_events.kind='fleet-cron-tick-error' - so it was logged every two minutes
-- and never fatal, which is exactly why it stayed invisible.
--
--   fleet_tick: D1_ERROR: UNIQUE constraint failed: index 'idx_agent_issues_open_title_ci'
--
-- The insert compiles (INSERT INTO fleet_tick (source) SELECT 'x' FROM fleet_tick WHERE 0 succeeds), so this is an
-- EXECUTION abort inside one of fleet_tick's 44 triggers. Two of them reopen work:
--     reconcile_tick          UPDATE agent_issues SET status = 'open', ...
--     recurrence_guard_tick   UPDATE agent_issues SET status = 'open', ...
-- Neither checks whether an OPEN row already carries that title, and idx_agent_issues_open_title_ci is a partial unique
-- index on the open rows. Measured 2026-10-18: 94 pairs where a non-open row shares lower(trim(title)) with an open one -
-- systematically a METRIC-TRIGGER issue parked in 'monitoring' plus a NEWER open issue filed with the same title. The
-- next recurrence reopens the parked twin straight into the index, the UPDATE aborts, and because a trigger runs inside
-- the inserting statement the WHOLE fleet_tick row rolls back. One bad reopen per tick is enough to kill the heartbeat.
--
-- WHY A GUARD TRIGGER AND NOT A PATCH TO THOSE TWO
-- The reopen happens in two long trigger bodies and any future writer would repeat the bug. A single BEFORE UPDATE guard
-- skips the row instead of aborting the statement, which fixes every current and future reopen writer at once, and never
-- touches the two bodies (trigger DDL in this fleet has already caused one outage today: migration_runs 292 dropped a
-- working trigger).
--
-- PROVEN ON A SCRATCH TABLE (live qnfo-audit, 2026-10-18 14:40Z, before this file was written)
--   table zz_t: partial unique index on lower(trim(title)) WHERE status='open', one open row and one 'monitoring' row
--   sharing a title, plus one 'monitoring' row with a unique title
--     UPDATE zz_t SET status='open' WHERE id=<twin>        -> 7500 UNIQUE constraint failed  (the outage, reproduced)
--     ... after creating exactly the guard below:
--     UPDATE zz_t SET status='open' WHERE id=<twin>        -> changes 0, no error   (collision skipped)
--     UPDATE zz_t SET status='open' WHERE id=<unique>      -> changes 1             (legitimate reopen still works)
--   The scratch objects were dropped afterwards.
--
-- SEMANTICS OF THE SKIP
-- Skipping is correct, not a compromise: the open twin IS the live report of that condition. Reopening the parked copy
-- would either duplicate the finding or create the second open row the index forbids. The guard applies to ANY reopen
-- (status -> 'open' from a non-open state) whose title already has an open row, whatever writes it.
--
-- spof-review: this is a BEFORE UPDATE guard on agent_issues; its alternate path is the open-twin check itself - a reopen
-- that the guard skips is still carried by the open row with the same title, which every reader of open issues already
-- sees, so no finding is lost when the skip fires.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: issue_triage
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_reopen_open_twin_guard;
--   DELETE FROM control_registry WHERE control='agent_issues_reopen_open_twin_guard';
--   (the heartbeat then depends again on the reopen writers never colliding)
--
-- Verify after apply:
--   SELECT name FROM sqlite_master WHERE name='agent_issues_reopen_open_twin_guard';        -- 1 row
--   -- within ~2 minutes, the heartbeat writer succeeds again:
--   SELECT MAX(ts), ROUND((julianday('now')-julianday(replace(substr(MAX(ts),1,19),'T',' ')))*1440,1)
--     FROM fleet_tick;                                                                     -- gap back under 10 minutes
--   SELECT COUNT(*) FROM cloud_ops_events WHERE kind='fleet-cron-tick-error'
--     AND ts >= datetime('now','-10 minutes');                                              -- 0

DROP TRIGGER IF EXISTS agent_issues_reopen_open_twin_guard;

CREATE TRIGGER agent_issues_reopen_open_twin_guard
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status = 'open'
  AND COALESCE(OLD.status, '') <> 'open'
  AND EXISTS (SELECT 1 FROM agent_issues o
               WHERE o.id <> NEW.id
                 AND o.status = 'open'
                 AND lower(trim(o.title)) = lower(trim(NEW.title)))
BEGIN
  SELECT RAISE(IGNORE);
END;

-- Record the control and its alternate path, so the next reader does not "fix" the guard by deleting it.
INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, reviewed_at)
VALUES ('agent_issues_reopen_open_twin_guard',
        'qnfo-audit (migrations/2026-10-18-agent-issues-reopen-twin-guard.sql)',
        'guard',
        'a reopen (status -> open) whose title already has an open row, which the partial unique index idx_agent_issues_open_title_ci forbids; the abort used to roll back the whole fleet_tick heartbeat insert',
        1,
        'keep',
        'applied',
        'the open row carrying the same title is itself the live report of the condition, so a skipped reopen loses no finding - every reader of open issues sees it',
        strftime('%Y-%m-%dT%H:%M:%SZ','now'),
        'Measured 2026-10-18: fleet_tick last insert 12:14:08Z (138 minutes stale) with 76 fleet-cron-tick-error rows reading "UNIQUE constraint failed: index idx_agent_issues_open_title_ci"; 94 pairs where a non-open row shares lower(trim(title)) with an open one; reconcile_tick and recurrence_guard_tick both reopen without an open-twin check. Scratch-table reproduction at 14:40Z: without the guard the reopen raises 7500, with it the reopen is skipped (changes 0) and a legitimate reopen still applies (changes 1).',
        strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- ISSUE-SLA-WINDOW-1-RETRY (2026-10-18, pillar autonomy; owner doctrine: every process needs an explicit SLA and a second
-- path to the definition of done)
--
-- WHAT THIS IS
-- The 120-minute issue SLA window, re-applied through the migration runner now that TRIGGER-DEPTH-PROBE-STAR-1 (merged
-- 13:07:44Z, PR #2179) stops the depth canary from refusing a probe that D1 refuses no matter what the trigger contains.
--
-- The window itself is already LIVE: it was applied out of band at 12:52Z because the first attempt (migration_runs 292,
-- 12:45:31Z) was refused by the star-select probe and the runner then dropped the trigger. That left the file recorded as
-- failed while production ran a definition no migration_runs row described - the exact drift the fleet treats as a defect.
-- This file closes that gap: after it applies, migration_runs carries the same definition production runs.
--
-- spof-review: the second path is already installed and is the fleet_tasks issue-sla-invariant-guard workflow on the */10
-- tick (migrations/2026-10-18-issue-sla-invariant-guard.sql): it re-derives every open issue's deadline from this same
-- 120-minute rule, repairs a missing or NULL one, files one deduped ISSUE-SLA-INVARIANT-1 when a post-baseline row has no
-- window, and ledgers whether the live trigger still contains '+120 minutes' on every run.
--
-- WHY THE GUARD IS THE SECOND PATH AND NOT A DECORATION
-- The table this trigger lives on carries 23 triggers; several update agent_issues itself. A trigger there is one writer
-- on a crowded chain, so it can be refused, renamed, or replaced by a later migration. The guard re-derives the deadline
-- from first principles every 10 minutes and reports the absence, so a dead trigger costs at most one tick.
--
-- SAFETY
--   Idempotent: DROP TRIGGER IF EXISTS then CREATE, so re-applying cannot duplicate anything and cannot change the row
--   data. No row is read or written by this file. The runner now snapshots trigger definitions before the file runs and
--   restores the previous definition if the depth canary refuses (D1-TRIGGER-DEPTH-RESTORE-1), so a refusal here leaves
--   production exactly as it was rather than without the trigger.
--
-- EXPECTED RESULT
--   (new issues only) sla_due_at = created_at + 120 minutes. The 168 open rows filed before the guard's baseline keep
--   their historical deadlines on purpose: they really were in the past, and rewriting them would erase evidence.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: issue_triage
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_autotriage2_ins; recreate it with datetime('now') in place of
--   datetime('now', '+120 minutes').
--
-- Verify after apply:
--   SELECT sql LIKE '%+120 minutes%' FROM sqlite_master WHERE name='agent_issues_autotriage2_ins';   -- 1
--   SELECT status, statements FROM migration_runs WHERE file LIKE '%issue-sla-window-retry%';        -- ok

DROP TRIGGER IF EXISTS agent_issues_autotriage2_ins;

CREATE TRIGGER agent_issues_autotriage2_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open'
BEGIN
  INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
  SELECT NEW.id,
         CASE WHEN o.owner IS NULL THEN 'AUTOTRIAGE-1' ELSE 'AUTOTRIAGE-2' END,
         'triaged',
         COALESCE(o.owner, 'qnfo-ops'),
         datetime('now', '+120 minutes')
    FROM (SELECT COALESCE(
            (SELECT t.owner FROM analytics_metric_triggers t
              WHERE NEW.title LIKE 'METRIC-TRIGGER-%'
                AND t.id = CAST(substr(NEW.title, 16) AS INTEGER)
                AND t.owner IN (SELECT service FROM service_registry)),
            (SELECT s.service FROM service_registry s
              WHERE instr(COALESCE(NEW.description, ''), 'code-task: repo=qnfo-workers path=') > 0
                AND s.service = substr(substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34), 1,
                                       instr(substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34), '/') - 1))
          ) AS owner) o;
END;

-- Record that production and migration_runs now describe the same trigger.
UPDATE control_registry
   SET location = 'qnfo-audit (migrations/2026-10-18-issue-sla-window-retry.sql)',
       evidence = COALESCE(evidence, '') || ' | 2026-10-18 13:1xZ: the definition production runs is now applied through the migration runner (ISSUE-SLA-WINDOW-1-RETRY) after TRIGGER-DEPTH-PROBE-STAR-1 fixed the star-select probe that refused it and D1-TRIGGER-DEPTH-RESTORE-1 made a refusal non-destructive.',
       reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
 WHERE control = 'agent_issues_autotriage2_ins';

-- ISSUE-SLA-WINDOW-APPLIER-2 (2026-10-18, pillar autonomy; owner doctrine: every process needs an explicit SLA and a
-- second path to the definition of done)
--
-- WHY A SECOND FILE
-- The 120-minute issue SLA window is LIVE (applied by hand 12:52Z), but no migration_runs row describes it. The two
-- attempts to record it both failed:
--   * migration_runs 292 (12:45:31Z) — the depth canary's star-select INSERT probe was refused and the runner dropped
--     the trigger it had just created, leaving production without agent_issues_autotriage2_ins.
--   * migration_runs 296 (13:12:49Z) — refused again even with an explicit column list; D1-TRIGGER-DEPTH-RESTORE-1
--     put the previous definition back, so nothing was lost, but the file stayed failed.
-- Both contents are sha256-locked, so neither is replayed. TRIGGER-DEPTH-INSERT-ADVISORY-1 (merged 13:20:01Z, PR #2220)
-- is the fix: every zero-row INSERT ... SELECT probe on agent_issues is refused by D1 whatever the trigger contains
-- (measured 13:14Z: star select, explicit column list, and a literal source that reads nothing — all 7500), while
-- DELETE ... WHERE 0 and UPDATE ... SET c = c WHERE 0 compile and real single-row inserts succeed. The canary now lets
-- only UPDATE/DELETE veto, so this file can apply and production and migration_runs agree again.
--
-- spof-review: the second path is the fleet_tasks issue-sla-invariant-guard workflow on the */10 tick, installed by
-- migrations/2026-10-18-issue-sla-invariant-guard.sql: it re-derives every open issue's deadline from this same
-- 120-minute rule, repairs a missing or NULL one, files one deduped ISSUE-SLA-INVARIANT-1 when a post-baseline row has no
-- window, and ledgers whether the live trigger still contains '+120 minutes' on every run.
--
-- SAFETY
--   DROP TRIGGER IF EXISTS then CREATE: idempotent, and no row is read or written by this file. The runner snapshots
--   trigger definitions before the file runs, so a refusal would restore the previous definition rather than leave the
--   table without its trigger. The 168 open rows filed before the guard's baseline keep their historical deadlines on
--   purpose — they really were in the past, and rewriting them would erase evidence.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: issue_triage
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_autotriage2_ins; recreate it with datetime('now') in place of
--   datetime('now', '+120 minutes').
--
-- Verify after apply:
--   SELECT status, statements FROM migration_runs WHERE file LIKE '%issue-sla-window-applier-2%';  -- ok
--   SELECT sql LIKE '%+120 minutes%' FROM sqlite_master WHERE name='agent_issues_autotriage2_ins';  -- 1

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

-- Point the control registry row at the file that now describes what production runs.
UPDATE control_registry
   SET location = 'qnfo-audit (migrations/2026-10-18-issue-sla-window-applier-2.sql)',
       evidence = COALESCE(evidence, '') || ' | 2026-10-18 13:2xZ: the definition production runs is applied through the migration runner (ISSUE-SLA-WINDOW-APPLIER-2) after TRIGGER-DEPTH-INSERT-ADVISORY-1 stopped a statement shape D1 refuses unconditionally from vetoing the file, and D1-TRIGGER-DEPTH-RESTORE-1 made a refusal non-destructive.',
       reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
 WHERE control = 'agent_issues_autotriage2_ins';

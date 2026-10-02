-- AUTOTRIAGE-OWNER-ROUTE-1 (2026-10-02). Pillar: autonomy.
--
-- Evidence (qnfo-audit, 2026-10-02 09:30Z): 48 of 54 open agent_issues were owned by qnfo-ops, all 48 by the
-- agent_issues_autotriage_ins trigger, which wrote the constant 'qnfo-ops' for every new issue. EVOLVE-PR-1 in
-- qnfo-fleet-control picks its target worker from issue_triage.owner and never targets qnfo-ops (EVOLVE_DENY), so the
-- self-repair loop had no candidates: evolve_candidates holds 2 rows since the 2026-10-01 rebuild, the last at
-- 2026-10-01T11:00Z. A metric trigger already names its owning worker (analytics_metric_triggers.owner) and a code task
-- names its file; the trigger threw both away.
--
-- Change: the owner of a new issue is, in order,
--   1. the trigger's owner, for a METRIC-TRIGGER-<id>-... issue;
--   2. the worker directory of its `code-task: repo=qnfo-workers path=<dir>/...` line;
--   3. qnfo-ops, as before.
-- 1 and 2 apply only when the name is a row of service_registry, so 'agent', 'human' and typos still fall to qnfo-ops.
-- Routed rows carry rc 'AUTOTRIAGE-2'; unrouted rows keep 'AUTOTRIAGE-1'.
--
-- Rollback: DROP TRIGGER agent_issues_autotriage2_ins; then re-create the previous trigger:
--   CREATE TRIGGER agent_issues_autotriage_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' BEGIN INSERT OR IGNORE
--   INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (NEW.id, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops',
--   datetime('now','+7 days')); END;
-- The backfill below is undone by: UPDATE issue_triage SET owner='qnfo-ops', rc='AUTOTRIAGE-1' WHERE rc='AUTOTRIAGE-2';

CREATE TRIGGER IF NOT EXISTS agent_issues_autotriage2_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' BEGIN
  INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
  SELECT NEW.id,
         CASE WHEN o.owner IS NULL THEN 'AUTOTRIAGE-1' ELSE 'AUTOTRIAGE-2' END,
         'triaged',
         COALESCE(o.owner, 'qnfo-ops'),
         datetime('now','+7 days')
  FROM (SELECT COALESCE(
          (SELECT t.owner FROM analytics_metric_triggers t
            WHERE NEW.title LIKE 'METRIC-TRIGGER-%'
              AND t.id = CAST(substr(NEW.title, 16) AS INTEGER)
              AND t.owner IN (SELECT service FROM service_registry)),
          (SELECT s.service FROM service_registry s
            WHERE instr(COALESCE(NEW.description,''), 'code-task: repo=qnfo-workers path=') > 0
              AND s.service = substr(
                    substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34),
                    1,
                    instr(substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34), '/') - 1))
        ) AS owner) o;
END;

DROP TRIGGER IF EXISTS agent_issues_autotriage_ins;

-- Backfill the open issues the old trigger mis-owned (same two rules).
UPDATE issue_triage SET rc = 'AUTOTRIAGE-2', owner = (
    SELECT t.owner FROM agent_issues a JOIN analytics_metric_triggers t ON t.id = CAST(substr(a.title, 16) AS INTEGER)
     WHERE a.id = issue_triage.issue_id)
 WHERE rc = 'AUTOTRIAGE-1' AND owner = 'qnfo-ops'
   AND issue_id IN (SELECT a.id FROM agent_issues a JOIN analytics_metric_triggers t ON t.id = CAST(substr(a.title, 16) AS INTEGER)
                     WHERE a.status = 'open' AND a.title LIKE 'METRIC-TRIGGER-%' AND t.owner IN (SELECT service FROM service_registry));

UPDATE issue_triage SET rc = 'AUTOTRIAGE-2', owner = (
    SELECT substr(substr(a.description, instr(a.description, 'code-task: repo=qnfo-workers path=') + 34), 1,
                  instr(substr(a.description, instr(a.description, 'code-task: repo=qnfo-workers path=') + 34), '/') - 1)
      FROM agent_issues a WHERE a.id = issue_triage.issue_id)
 WHERE rc = 'AUTOTRIAGE-1' AND owner = 'qnfo-ops'
   AND issue_id IN (SELECT a.id FROM agent_issues a
                     WHERE a.status = 'open' AND instr(COALESCE(a.description,''), 'code-task: repo=qnfo-workers path=') > 0
                       AND substr(substr(a.description, instr(a.description, 'code-task: repo=qnfo-workers path=') + 34), 1,
                                  instr(substr(a.description, instr(a.description, 'code-task: repo=qnfo-workers path=') + 34), '/') - 1)
                           IN (SELECT service FROM service_registry));

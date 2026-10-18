-- 2026-10-18 ISSUE-SLA-WINDOW-1 (closeout of the remediation verification audit)
--
-- Found while closing out: agent_issues_autotriage2_ins sets sla_due_at = datetime('now'), i.e. an issue is due
-- at the instant it is filed. Measured on 2026-10-18 12:36Z: 161 of 227 open issues had a sla_due_at at or before
-- their own created_at. Every one of them was in breach from birth, so the fleet's issue SLA measured nothing:
-- a metric where the deadline always equals the start cannot distinguish a fast fix from an abandoned one, and
-- every issue filed by a loop (IMPROVEMENT-LOOP-1, TRIGGER-RECOVERY-1, the audit) contributed a permanent breach
-- row the moment it existed.
--
-- The fleet's own ceiling for an issue is 120 minutes (ISSUE-SLA-2H-1, owner directive; the same 120 minutes the
-- sla_120_guard_contract_ins/upd triggers already enforce on remediation contracts, and RADAR-*/SLA-120M-INBOUND-1
-- elsewhere). This migration gives the trigger that value and nothing else: the owner-resolution expression is
-- copied unchanged, and only the deadline moves from "now" to "now + 120 minutes".
--
-- Deliberately NOT done here: the 161 existing issues are left as they are. Their deadlines were genuinely in the
-- past and re-writing them would erase evidence rather than fix a rule. This changes future rows only.
--
-- Revert: recreate the trigger with datetime('now') in place of datetime('now', '+120 minutes').
--
-- Verify after apply:
--   SELECT sql FROM sqlite_master WHERE name='agent_issues_autotriage2_ins';              -- contains '+120 minutes'
--   -- and, for issues filed after the apply, the window is real:
--   SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id
--    WHERE a.created_at > <apply epoch ms>
--      AND ROUND((julianday(t.sla_due_at) - julianday(a.created_at/1000,'unixepoch')) * 1440) <> 120;   -- 0

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

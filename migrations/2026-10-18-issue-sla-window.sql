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
-- SECOND PATH (SPOF-REVIEW-GATE-1, owner doctrine: every step needs more than one way to a correct
-- outcome). The trigger sets the deadline once, at insert; it cannot notice if a later writer, a manual
-- insert or a dropped trigger reintroduces a zero window. The standing detector below re-probes the rule
-- every hour and is reported the same way every other broken invariant is (remediation-tick verdict + the
-- v_verification_verdict_split / detector-breach path), so a regression is visible without anyone running a
-- query. It is scoped to issues created after 2026-10-18T12:45Z on purpose: the 161 legacy rows described
-- above are evidence and must not turn the detector red for 161 reasons forever.
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

-- The second path: a standing detector (class prefix 'belief-' makes it a detector, so DETECTOR-CADENCE-1
-- keeps it running for ever and it never closes). Expected '1' = no new issue has a deadline at or before its
-- own creation. issue_id is NULL because this audits a rule, not one issue.
--
-- escalate_to is NOT NULL on this table. The first version of this INSERT omitted it, so INSERT OR IGNORE
-- swallowed the row without an error and the migration looked applied while the second path did not exist.
-- Caught by reading the row back rather than trusting the statement's success flag.
--
-- created_at <= now excludes future-dated rows: issue 2967 carries created_at 14:00Z with an SLA of 12:09Z,
-- a defect of its own (an issue that does not exist yet) and not a zero-window issue. The guard keeps this
-- detector focused on the rule it asserts.
INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
VALUES
  ('belief-no-zero-sla-window', NULL,
   'ISSUE-SLA-WINDOW-1: an issue must not be due at the moment it is filed',
   'agent_issues_autotriage2_ins sets sla_due_at = now + 120 minutes (ISSUE-SLA-2H-1); this detector proves the rule held for every issue created after the migration',
   'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = ''open'' AND a.created_at > 1792327500000 AND a.created_at <= CAST(strftime(''%s'',''now'') AS INTEGER)*1000 AND datetime(t.sla_due_at) <= datetime(a.created_at/1000,''unixepoch'')) = 0 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-ops', 1, 'active');

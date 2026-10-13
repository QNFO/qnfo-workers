-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_v_email_human_pending_v2
-- Rollback: DROP VIEW IF EXISTS v_email_human_pending_v2; CREATE VIEW v_email_human_pending_v2 AS SELECT e.id, e.sender, e.recipient, e.subject, e.received_at, e.status FROM emails e WHERE e.status IN ('processed','received') AND e.sender NOT LIKE '%bounce%' AND e.sender NOT LIKE 'cfbounces+%' AND e.sender NOT LIKE 'SRS0=%' AND e.sender NOT LIKE '%mailer-daemon%' AND e.sender NOT LIKE '%dmarcreport%' AND lower(e.sender) NOT LIKE '%noreply%' AND lower(e.sender) NOT LIKE '%no-reply%' AND e.sender NOT LIKE '%@qnfo.org' AND e.sender NOT LIKE '%@qnfo.net' AND e.sender NOT LIKE '%@qwav.%' AND e.sender NOT LIKE '%@q08.org' AND e.sender NOT LIKE '%example.invalid' AND e.sender NOT LIKE '%sciforum.net' AND e.sender NOT LIKE '%openreview.net' AND e.sender NOT LIKE '%mercatus.gmu.edu' AND e.sender NOT LIKE '%evalsignal.xyz' AND lower(e.sender) <> 'rwnquni@outlook.com' AND NOT EXISTS (SELECT 1 FROM email_sender_policy p WHERE p.kind='junk' AND lower(e.sender) LIKE lower(p.pattern)) ORDER BY e.received_at DESC; UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT count(*) FROM v_email_human_pending_v2 p WHERE EXISTS (SELECT 1 FROM email_commands c WHERE c.email_id = p.id) OR EXISTS (SELECT 1 FROM email_reply_queue q WHERE q.email_id = p.id AND q.decision NOT IN (''escalate'',''pending''))) AS TEXT) AS observed' WHERE class = 'issue-2336'
-- EMAIL-PENDING-VIEW-OVERCOUNT-1 (agent_issues 2336, pillar personal). v_email_human_pending_v2 feeds the dashboard's
-- "Waiting on you" mail cards (qnfo-fleet-dashboard inbox read). It filtered only on emails.status and sender patterns,
-- so it listed (2026-10-13 06:40 UTC) the two mass call-for-paper mails 989 and 990, whose email_reply_queue rows are
-- decision 'skip' (cold sender, a solicitation by COLD-HUMAN-ESCALATE-1's wording test), and on 2026-10-12 owner commands
-- run through email_commands. The view now also leaves out:
--   * mail that ran as an owner command (email_commands.email_id) or came from an enabled email_command_senders address;
--   * mail whose reply-queue decision says it is finished: 'skip' (junk or solicitation), 'sent' (answered), 'closed'.
-- It keeps 'held' and 'escalate' mail, and mail with no queue row: COLD-HUMAN-ESCALATE-1 (migration 2026-10-12) relies on
-- the view to show a real person's first mail, and 984 (a person's EB-1A request, decision 'held' by INBOUND-SLA-1 as a
-- legal matter for the owner) must stay on the owner's page. The issue's original definition of done ("decision other than
-- escalate or pending") would have hidden held mail, so its contract now counts commands and finished decisions only.
CREATE TABLE IF NOT EXISTS bak_20261013_v_email_human_pending_v2 AS SELECT name, sql FROM sqlite_master WHERE name = 'v_email_human_pending_v2';
DROP VIEW IF EXISTS v_email_human_pending_v2;
CREATE VIEW v_email_human_pending_v2 AS
SELECT e.id, e.sender, e.recipient, e.subject, e.received_at, e.status
FROM emails e
WHERE e.status IN ('processed','received')
  AND e.sender NOT LIKE '%bounce%'
  AND e.sender NOT LIKE 'cfbounces+%'
  AND e.sender NOT LIKE 'SRS0=%'
  AND e.sender NOT LIKE '%mailer-daemon%'
  AND e.sender NOT LIKE '%dmarcreport%'
  AND lower(e.sender) NOT LIKE '%noreply%'
  AND lower(e.sender) NOT LIKE '%no-reply%'
  AND e.sender NOT LIKE '%@qnfo.org'
  AND e.sender NOT LIKE '%@qnfo.net'
  AND e.sender NOT LIKE '%@qwav.%'
  AND e.sender NOT LIKE '%@q08.org'
  AND e.sender NOT LIKE '%example.invalid'
  AND e.sender NOT LIKE '%sciforum.net'
  AND e.sender NOT LIKE '%openreview.net'
  AND e.sender NOT LIKE '%mercatus.gmu.edu'
  AND e.sender NOT LIKE '%evalsignal.xyz'
  AND lower(e.sender) <> 'rwnquni@outlook.com'
  AND NOT EXISTS (SELECT 1 FROM email_sender_policy p WHERE p.kind='junk' AND lower(e.sender) LIKE lower(p.pattern))
  AND NOT EXISTS (SELECT 1 FROM email_commands c WHERE c.email_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM email_command_senders s WHERE s.enabled = 1 AND (lower(e.sender) = lower(s.pattern) OR instr(lower(e.sender), '<' || lower(s.pattern) || '>') > 0))
  AND NOT EXISTS (SELECT 1 FROM email_reply_queue q WHERE q.email_id = e.id AND q.decision IN ('skip','sent','closed'))
ORDER BY e.received_at DESC;
UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT count(*) FROM v_email_human_pending_v2 p WHERE EXISTS (SELECT 1 FROM email_commands c WHERE c.email_id = p.id) OR EXISTS (SELECT 1 FROM email_reply_queue q WHERE q.email_id = p.id AND q.decision IN (''skip'',''sent'',''closed''))) AS TEXT) AS observed',
  status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2336';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'the owner''s mail cards list only mail that still owes the owner something; held and escalated mail is owed',
   'EMAIL-PENDING-VIEW-OVERCOUNT-1: v_email_human_pending_v2 leaves out owner commands, command senders and mail whose reply-queue decision is skip, sent or closed; held and escalated mail stays; the issue contract follows that rule instead of its first definition, which would have hidden held mail',
   'view 06:40 UTC: 989 and 990 (call for papers, decision skip) listed; 984 (a person''s legal request, decision held) must stay per COLD-HUMAN-ESCALATE-1; email_reply_queue decisions in use: closed 32, held 2, sent 15, skip 17',
   'merged through the canonical path', 'the dashboard mail cards drop solicitations and answered mail; a held person''s mail stays', 'the Rollback line of this file (old view text and contract)',
   'owner mail cards without finished items', 'issue 2336 contract reads 0 within an hour of the merge and the issue closes; 984 still in the view', 'none', 'd1:v_email_human_pending_v2, email_reply_queue, email_commands, email_command_senders; code:qnfo-fleet-dashboard inbox read');

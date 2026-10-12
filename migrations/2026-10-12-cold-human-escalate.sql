-- COLD-HUMAN-ESCALATE-1 (2026-10-12, pillar personal; owner: "ARE THERE ANY REAL HUMAN EMAILS COMING IN AT ALL? ... NO LOOSE
-- ENDS"). A real person's first email never reached the owner. emails 984 (kottevarun@gmail.com, 2026-10-11 20:01Z, "Your
-- router_calibrate.py in qnfo-workers and the UCCI paper": thanks for crediting their paper and asks the owner for a signed
-- one-page statement of facts for an EB-1A petition) was written to email_reply_queue 63 as decision 'skip', reason "cold
-- sender not in contact_ledger: no owner notice (NOTICE-REPLY-1)", by qnfo-email enqueueHumanReply: every sender who is not
-- already a contact is skipped with no notice, person or junk journal alike. The same day EMAIL-PENDING-VIEW-OVERCOUNT-1 (issue
-- 2336) read "3 have an email_reply_queue row with decision skip (cold sender, ids 980, 984, 985) ... None is waiting for a
-- reply" and archived the nine rows (backup bak_20261012_waiting_on_you_mail), so 984 left the dashboard's Waiting on you.
-- Meanwhile the two mass call-for-paper emails 989/990 stayed in the queue (fixed in qnfo-fleet-dashboard 1.31.0 MAIL-ASK-1).
--
-- This file, independent of qnfo-email's code (claimed by code task ct_4ydc5qetubsa66, EMAIL-VOICE-DRAFTER-1 #2373):
-- 1. trigger email_reply_queue_cold_human_escalate: a cold-sender skip is turned into 'escalate' unless the email is a
--    solicitation by its first-contact wording (journal, Scopus, conference, call for papers, submit your, manuscript, ISSN,
--    editorial office, publish your ...). A reply subject (Re:/AW:/Fwd:) always escalates: in the 2026-09..10 queue the
--    wording test would otherwise have dropped replies from MDPI, the UvA congress office and the Zenodo helpdesk.
--    Escalated rows keep the email 'processed', so v_email_human_pending_v2 lists it and the dashboard shows a card
--    (INBOUND-SLA-1 classes it; unknown_human, legal, money and the rest are cards; never answered automatically).
-- 2. restores 984: queue row 63 to escalate, emails 984 to processed (backup first).
-- 3. failure mode cold-human-silent-drop with its detector, and NOTICE-REPLY-COLD-HUMAN-1 for the code path (owner notice by
--    email, so the owner can answer by replying, as for known contacts).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_cold_human_984
-- Rollback: UPDATE email_commands SET status = 'error', result = json_extract(result, '$.was') WHERE id IN (10, 11, 12, 13, 14) AND status = 'closed'; UPDATE email_parse_failures SET resolved_at = NULL WHERE email_id IN (796, 802) AND notes LIKE '%COLD-HUMAN-ESCALATE-1%'; DROP TRIGGER IF EXISTS email_reply_queue_cold_human_escalate; UPDATE email_reply_queue SET decision = 'skip', skip_reason = 'cold sender not in contact_ledger: no owner notice (NOTICE-REPLY-1)' WHERE id = 63; UPDATE emails SET status = 'archived' WHERE id = 984; DELETE FROM remediation_contracts WHERE class = 'fm-cold-human-silent-drop'; DELETE FROM failure_modes WHERE fm_key = 'cold-human-silent-drop'; UPDATE agent_issues SET status = 'superseded' WHERE title LIKE 'NOTICE-REPLY-COLD-HUMAN-1:%' AND status = 'open'

CREATE TABLE IF NOT EXISTS bak_20261012_cold_human_984 AS
  SELECT 'emails' AS src, e.id AS row_id, e.status AS status, NULL AS decision, NULL AS skip_reason FROM emails e WHERE e.id = 984
  UNION ALL SELECT 'email_reply_queue', q.id, NULL, q.decision, q.skip_reason FROM email_reply_queue q WHERE q.id = 63;

CREATE TRIGGER IF NOT EXISTS email_reply_queue_cold_human_escalate AFTER INSERT ON email_reply_queue
WHEN NEW.decision = 'skip' AND COALESCE(NEW.skip_reason, '') LIKE 'cold sender not in contact_ledger%'
  AND EXISTS (SELECT 1 FROM emails e WHERE e.id = NEW.email_id AND (
    lower(ltrim(COALESCE(e.subject, ''))) LIKE 're:%' OR lower(ltrim(COALESCE(e.subject, ''))) LIKE 'aw:%'
    OR lower(ltrim(COALESCE(e.subject, ''))) LIKE 'fwd:%' OR lower(ltrim(COALESCE(e.subject, ''))) LIKE 'fw:%'
    OR NOT (
      lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%journal%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%scopus%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%conference%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%congress%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%symposium%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%call for paper%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%submit your%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%submission%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%manuscript%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%webinar%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%abstract%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%issn%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%editorial office%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%editorial board%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%special issue%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%invitation to publish%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%publish your%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%indexed in%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%impact factor%'
      OR lower(COALESCE(e.subject, '') || ' ' || substr(COALESCE(e.body_text, ''), 1, 2000)) LIKE '%peer-review process%'
    )))
BEGIN
  UPDATE email_reply_queue SET decision = 'escalate', human_score = 2, updated_at = datetime('now'),
    skip_reason = 'COLD-HUMAN-ESCALATE-1: first-time sender with no solicitation wording; shown to the owner (was: ' || NEW.skip_reason || ')'
  WHERE id = NEW.id;
END;

UPDATE email_reply_queue SET decision = 'escalate', human_score = 2, updated_at = datetime('now'),
  skip_reason = 'COLD-HUMAN-ESCALATE-1: restored 2026-10-12; a person asking the owner for a signed statement (EB-1A) was skipped as a cold sender and archived by the 2336 cleanup'
WHERE id = 63 AND email_id = 984 AND decision = 'skip';
UPDATE emails SET status = 'processed' WHERE id = 984 AND status = 'archived';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('cold-human-silent-drop', 'a real person writing for the first time never reaches the owner', 'qnfo-email NOTICE-REPLY-1 skips every sender not in contact_ledger with no notice, so first contact from a person is treated like a junk journal; a cleanup that reads skip as "not waiting" (issue 2336) then archives it out of the owner queue', 'D1 trigger email_reply_queue_cold_human_escalate (migrations/2026-10-12-cold-human-escalate.sql) escalates a cold skip unless it carries first-contact solicitation wording; NOTICE-REPLY-COLD-HUMAN-1 adds the email notice in qnfo-email', 'no cold-sender skip row created after 2026-10-12 14:00 lacks solicitation wording', 'fm-cold-human-silent-drop', '2026-10-11', NULL, 'a person who is not yet a contact emails the owner', 'email_reply_queue decision skip with reason cold sender not in contact_ledger on mail with no journal or conference wording', 'every new correspondent: collaborators, editors, journalists, funders, legal requests');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-cold-human-silent-drop', NULL, 'COLD-HUMAN-ESCALATE-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM email_reply_queue q JOIN emails e ON e.id = q.email_id WHERE q.decision = ''skip'' AND COALESCE(q.skip_reason, '''') LIKE ''cold sender not in contact_ledger%'' AND q.created_at > ''2026-10-12 14:00:00'' AND lower(COALESCE(e.subject, '''') || '' '' || substr(COALESCE(e.body_text, ''''), 1, 2000)) NOT LIKE ''%journal%'' AND lower(COALESCE(e.subject, '''') || '' '' || substr(COALESCE(e.body_text, ''''), 1, 2000)) NOT LIKE ''%conference%'' AND lower(COALESCE(e.subject, '''') || '' '' || substr(COALESCE(e.body_text, ''''), 1, 2000)) NOT LIKE ''%manuscript%'') = 0 AND (SELECT COUNT(*) FROM emails WHERE id = 984 AND status = ''archived'') = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-email', 1, 'holding', 'failure-mode', 45000, 5, 0);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'NOTICE-REPLY-COLD-HUMAN-1: qnfo-email skips a first-time human sender with no owner notice',
 'Charter pillar: personal. Failure mode cold-human-silent-drop (migrations/2026-10-12-cold-human-escalate.sql). enqueueHumanReply writes decision skip, "cold sender not in contact_ledger: no owner notice (NOTICE-REPLY-1)", for every sender who is not already a contact, so emails 984 (a person asking the owner for a signed statement) reached nobody. The D1 trigger email_reply_queue_cold_human_escalate now escalates such rows unless they carry solicitation wording, so they reach the dashboard queue; the code still sends no email notice. Change: in the cold branch, when the subject is a reply or the text has no solicitation wording (the same list as the trigger), insert decision escalate and call notifyOwner with the same "[handoff]" notice the known-contact branch sends (reply to answer, SPAM to block, IGNORE to drop); keep skip for solicitations. Land after or inside EMAIL-VOICE-DRAFTER-1 (#2373, code task ct_4ydc5qetubsa66 holds the file). Done when a cold, non-solicitation inbound row is escalate at insert with a [handoff] notice in emails sent to the owner.
code-task: repo=qnfo-workers path=qnfo-email/worker.js
code-anchor: cold sender not in contact_ledger: no owner notice (NOTICE-REPLY-1)',
 'session:COLD-HUMAN-ESCALATE-1', 'reliability', 'high', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'NOTICE-REPLY-COLD-HUMAN-1:%' AND status = 'open');

-- Open parse failures, closed with their evidence (no silent drop): 796's correspondent wrote again on 2026-09-30 (emails 890,
-- same thread, stored text, replied); 802 (unverified freemail, possible lead-gen) never re-sent in 22 days after the resend draft.
UPDATE email_parse_failures SET resolved_at = datetime('now'), notes = COALESCE(notes, '') || ' | COLD-HUMAN-ESCALATE-1 2026-10-12: resolved, the sender wrote again in the same thread (emails 890, text stored, replied).'
WHERE email_id = 796 AND resolved_at IS NULL AND EXISTS (SELECT 1 FROM emails WHERE id = 890 AND length(COALESCE(body_text, '')) > 0 AND status = 'replied');
UPDATE email_parse_failures SET resolved_at = datetime('now'), notes = COALESCE(notes, '') || ' | COLD-HUMAN-ESCALATE-1 2026-10-12: resolved without a resend; no further mail from this sender in 22 days (unverified freemail, marked spam on 2026-09-24). A new message from the address re-enters the queue as usual.'
WHERE email_id = 802 AND resolved_at IS NULL AND NOT EXISTS (SELECT 1 FROM emails WHERE lower(sender) = 'alexandra_patelkoj@mail.com' AND id > 802);

-- The owner's five email replies to [handoff] notices (email_commands 10-14, emails 927, 942, 943, 967, 968; 2026-10-05..09) were
-- parsed as ops commands and failed with HTTP 401 before qnfo-ops 2.40.0 OPS-INTERNAL-CALLER-1 and qnfo-email NOTICE-REPLY-1
-- (2026-10-09) fixed that path; none was retried. They are questions, answered in the 2026-10-12 session report; the inbox
-- now answers on fleet.qnfo.org (mail, reply, spam). Closed with that note, not left as errors.
UPDATE email_commands SET status = 'closed', updated_at = datetime('now'),
  result = json_object('ok', json('false'), 'closed', 'COLD-HUMAN-ESCALATE-1 2026-10-12: failed with HTTP 401 before the notice-reply fix of 2026-10-09 and was never retried; the question was answered in the session report and the inbox now runs on fleet.qnfo.org', 'was', result)
WHERE id IN (10, 11, 12, 13, 14) AND status = 'error';

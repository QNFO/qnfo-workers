-- SESSION-01QM3-HANDOFF-1 (2026-10-13, pillars personal and autonomy; owner: "Merge all and closeout. Handoff to server-side fleet audit
-- and remediation"). Closeout of session 01QM3YHphoH8u629t4Lg6ifL (PRs 1027 and 1080, both merged and verified live).
-- 1. Owner card zenodo-removal-withdraw: on 2026-10-07 the fleet emailed the Zenodo helpdesk asking it to remove files from 15 of the
--    owner's record versions (ticket 3327646); the owner replied to the notice "you never should have sent this" (email_commands 11,
--    failed with HTTP 401 and never answered). Withdrawing it is a message in the owner's name about the owner's own records, so it is the
--    owner's step (IDENTITY-BOUND). Default in effect: the request stands as Zenodo answered it (emails 940). The card resolves itself
--    when a reply to zenodo.helpdesk@cern.ch is sent (trigger human_actions_zenodo_withdraw_sent: the dashboard's "reply 940 <text>"
--    stores the sent copy in emails); "Not doing" on the card keeps the request.
-- 2. Handoff issue SESSION-01QM3-HANDOFF-1 for the server-side loops: what is live, what watches it, and a d1-query probe that closes it
--    when all five failure-mode detectors this session registered pass.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS human_actions_zenodo_withdraw_sent; DELETE FROM human_actions WHERE slug = 'zenodo-removal-withdraw' AND status = 'open'; UPDATE agent_issues SET status = 'superseded' WHERE title LIKE 'SESSION-01QM3-HANDOFF-1:%' AND status = 'open'

INSERT OR IGNORE INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source)
VALUES ('zenodo-removal-withdraw', 'Decide: withdraw the Zenodo file-removal request sent in your name (ticket 3327646)',
 'On 2026-10-07 the fleet emailed the Zenodo helpdesk asking it to remove files with personal data from 15 of your record versions; Zenodo answered the same day (message 940). You replied to the fleet notice "you never should have sent this". Withdrawing it is a message in your name about your own records. IDENTITY-BOUND: a request to a third party in the owner''s name about the owner''s own records.',
 'The removal request stands as Zenodo answered it; nothing further is sent.',
 'On fleet.qnfo.org, sign in and type: reply 940 <your withdrawal>. "Not doing" keeps the request.',
 'https://fleet.qnfo.org/', 'normal', 'open', 'session:SESSION-01QM3-HANDOFF-1');

CREATE TRIGGER IF NOT EXISTS human_actions_zenodo_withdraw_sent AFTER INSERT ON emails
WHEN NEW.status = 'sent' AND lower(COALESCE(NEW.recipient, '')) LIKE '%zenodo.helpdesk@cern.ch%'
BEGIN
  UPDATE human_actions SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now'),
    resolution = 'SESSION-01QM3-HANDOFF-1: a reply to the Zenodo helpdesk was sent (emails ' || NEW.id || ')'
  WHERE slug = 'zenodo-removal-withdraw' AND status = 'open';
END;

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'SESSION-01QM3-HANDOFF-1: fleet inbox, outreach and CI-watchdog remediation handed to the server-side loops',
 'Charter pillars: autonomy, personal, reach. Handoff from session 01QM3YHphoH8u629t4Lg6ifL (owner: "Merge all and closeout. Handoff to server-side fleet audit and remediation").
Live and verified 2026-10-12/13: qnfo-fleet-dashboard 1.31.3 (direct Workers AI path when qnfo-ai refuses; inbox cards with Reply/Read/Spam; mail, reply, spam console commands; call to qnfo-email, qnfo-cloud-ops, qnfo-fleet-control; sql on q08 and identity read-only), qnfo-cloud-ops 1.26.x (journal call-for-paper mail is a solicitation), migrations 139/140/141/the 2026-10-13 ci-action-identity file ok; email 984 back in Waiting on you; outreach sent 8 first-contact emails on 2026-10-13 (none since 10-08) with 12 candidates queued; PR 1080: 200-only write checks fixed in 8 scripts with guard rule write-200-only, per-action ci-watchdog findings and closes.
Watching it on Cloudflare (no session needed): detectors fm-binding-props-lost-on-dash-secret, fm-cold-human-silent-drop, fm-sla-shorter-than-consumer-cycle (d1-query), fm-write-200-only, fm-watchdog-action-blind (code-read). Owner decisions sit on fleet.qnfo.org: the inbox card for email 984 (a person asking for a signed statement) and card zenodo-removal-withdraw (resolves itself on a sent reply).
Done when all five detectors read pass; this issue''s probe checks exactly that.',
 'session:SESSION-01QM3-HANDOFF-1', 'autonomy', 'medium', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'SESSION-01QM3-HANDOFF-1:%');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''5'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE class IN (''fm-binding-props-lost-on-dash-secret'', ''fm-cold-human-silent-drop'', ''fm-sla-shorter-than-consumer-cycle'', ''fm-write-200-only'', ''fm-watchdog-action-blind'') AND last_verdict = ''pass'') AS TEXT) AS observed'
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'SESSION-01QM3-HANDOFF-1:%' ORDER BY id DESC LIMIT 1);

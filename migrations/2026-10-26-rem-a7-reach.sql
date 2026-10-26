-- REM-A7-REACH-1 (2026-10-26, charter pillars reach and personal; agent_issues 1000179, 2373, 2924). Three reach issues, each read against live state before anything was written.
--   1000179 DASH-API-405-OPAQUE-1: GET https://fleet.qnfo.org/api/cmd now answers 405 with {"error":"method_not_allowed","path":"/api/cmd","allow":["POST"],"hint":...} and an Allow: POST header
--   (curl 2026-10-26 18:08:54Z, qnfo-fleet-dashboard 1.71.2); the fix is on main since 1.61.0 (PR 4130, 2026-10-25T17:20Z), the code loop's own task ct_im1000179 failed on a suite after the fix had
--   already shipped. The issue's contract was born superseded (VACUOUS-PROBE-V3-1), so nothing could ever close it. It now reads the code state the issue named: the 405 site in cmdRoutes must keep
--   the self-describing body. A regression to the bare body makes the probe fail again. (A runner-https probe cannot read a 405 body: the consumer does not read the body of an HTTP error.)
--   2373 EMAIL-VOICE-DRAFTER-1: the drafter and the tiering are live and measured (the contract reads 5 of the first 10 qualifying inbound mails tiered, tier 2 and 3 with a draft); it waits on inbound human
--   mail (about 3 a week) and its probe is real, so it is left alone. The measurement found a send path that was not part of drafting: qnfo-email marks a tier 2 row "cleared for auto-send" and qnfo-cloud-ops
--   runRepliesInternal sends it, in the owner's name, with no owner reply. email_reply_queue 75 and 76 (2026-10-22, the same external recipient of the fleet's cold outreach follow-up) were sent that way,
--   the second one in answer to a mail the classifier itself called "somewhat confrontational". Sending in the owner's name is identity-bound; this file does not touch the send path (it removes and
--   enables nothing) and files the defect with a doer and a code probe: EMAIL-TIER2-GATE-1.
--   2924 INTEG-GSC-1: reach_signals holds no source gsc row (ga4 rows exist since 2026-10-17, from the same service account pattern). Google lets only the property owner add a user to a Search Console
--   property; human_actions 43 (google-identity-one-sitting, resolved 2026-10-06) made the owner the verified owner of qnfo.org, and no card ever asked for the one step that remains. That step is
--   IDENTITY-BOUND (the owner's Google account), so it becomes a card with its closing condition. The ingestion code is not built here (see the issue text).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = 1000179) AS observed', last_verdict = 'superseded:rollback REM-A7-REACH-1' WHERE class = 'issue-1000179' AND module = 'rem-a7-reach-v1'; UPDATE human_actions SET status = 'dismissed', resolution = 'rolled back by REM-A7-REACH-1', updated_at = datetime('now') WHERE slug = 'gsc-service-account-user' AND status = 'open' AND source = 'session:rem-a7-f1'

-- 1000179: a closing probe that measures the defect (the self-describing 405 site is on main) instead of the born-superseded template.
UPDATE remediation_contracts
   SET verify_transport = 'code-read',
       verify_probe = '{"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "error: \"method_not_allowed\", path: path, allow: [\"POST\"]"}',
       status = 'active', module = 'rem-a7-reach-v1', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3,
       precondition = 'qnfo-fleet-dashboard worker.js on main carries the self-describing 405 body in cmdRoutes (PR 4130, version 1.61.0); live: GET https://fleet.qnfo.org/api/cmd answers 405 with error, path, allow and an Allow: POST header',
       action = 'REM-A7-REACH-1: the defect (a bare {"error":"method"} body on GET /api/cmd) was fixed by PR 4130; this contract keeps the fix from regressing. The consumer reads worker.js on main; a pass closes the issue.'
 WHERE class = 'issue-1000179' AND status = 'superseded' AND instr(verify_probe, 'SELECT ''closed'' AS expected') = 1;

-- 2373: the finding goes on the issue; the defect it exposed gets its own issue with a code probe that fails until the guard exists.
UPDATE agent_issues
   SET description = description || char(10) || 'REM-A7-F1 2026-10-26 (measured, qnfo-audit): the contract reads 5 of the first 10 qualifying inbound mails (human_score >= 2, after 2026-10-12 12:00Z) with a tier and, for tier 2 and 3, a draft: the drafting and tiering are live and the issue waits only on inbound human mail (about 3 a week). Tier 3 never sends without the owner. BUT tier 2 sends without the owner: email_reply_queue 75 (2026-10-22 06:01:06) and 76 (2026-10-22 18:15:55) are tier 2, decision sent, to the same external recipient of the fleet''s cold outreach follow-up; 76 answers a mail the classifier called "somewhat confrontational" in the owner''s voice. Sending in the owner''s name is identity-bound; nothing was changed or enabled here. Filed as EMAIL-TIER2-GATE-1 (a code probe and a doer).',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 2373 AND status = 'open' AND instr(description, 'REM-A7-F1 2026-10-26') = 0;

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'EMAIL-TIER2-GATE-1: tier-2 auto-send answered a recipient''s complaint about the fleet''s cold outreach in the owner''s name (email_reply_queue 75 and 76)',
  'Charter pillar: personal (the owner''s mailbox and name; IC-GATE-001). Found while closing out EMAIL-VOICE-DRAFTER-1 (issue 2373), measured 2026-10-26 in qnfo-audit.' || char(10) ||
  'EVIDENCE: email_reply_queue 75 (received 2026-10-22 05:53, sent 06:01:06) and 76 (received 18:03, sent 18:15:55) are tier 2, decision sent, both from the same external named recipient of the fleet''s cold outreach follow-up ("Following up: QNFO ..."). Row 75 asked for the earlier mail to be resent and was answered by re-sending the outreach text; row 76 is a complaint (tier_reason: "a short, personal, somewhat confrontational response from a known human correspondent") and was answered in the owner''s voice ("I see my follow-up landed poorly ..."), which commits the owner to a position (a tier 3 trigger in the voice document). Row 75''s stored draft carries "Best regards," twice although that phrase is on the Never list of VOICE_DEFAULT (the live owner document may differ). The path: qnfo-email tierReplyQueue writes skip_reason "cleared for auto-send" on a tier 2 row and qnfo-cloud-ops runRepliesInternal sends every such row on its cron, with no owner reply.' || char(10) ||
  'CAUSE: tier 2 is one model verdict with a confident flag; tierByRules has no rule for (i) a reply to mail the fleet itself sent (subject carries "Following up:" or the sender is in outreach_queue / outreach_log / contact_ledger as a recipient), (ii) complaint or negative wording, and no owner switch stands between a tier 2 row and the send.' || char(10) ||
  'FIX (qnfo-email/worker.js only; the send path in qnfo-cloud-ops is untouched): (1) tierByRules returns tier 3 (owner handoff with the draft) for a sender that is a recipient of the fleet''s outreach (outreach_queue, outreach_log) or a subject that quotes it, and for complaint wording (annoy, spam, stop writing, unsubscribe, remove me, not interested, rude, harass, poorly, confus, why are you); (2) tier 2 keeps the "cleared for auto-send" marker only while ops_config email_tier2_autosend = on; absent or any other value, a tier 2 row takes the tier 3 handoff with its draft and nothing is sent without the owner; the owner sets the switch (it is his name); (3) the never-list check runs on the final stored draft_text and a hit forces tier 3. Add a qnfo-email suite covering the two rows above (both must classify tier 3) and the switch (off by default). Bump var VERSION, keep deployed-current.worker.js identical.' || char(10) ||
  'Definition of done: qnfo-email on main carries the switch and the outreach-recipient rule, and with the switch absent no email_reply_queue row created after the deploy is tier 2 with decision sent. Nothing is sent or enabled by filing this.' || char(10) ||
  'code-probe: {"paths": ["qnfo-email/worker.js"], "contains": "email_tier2_autosend"}' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-email/worker.js' || char(10) ||
  'code-anchor: if (score >= 2) return { tier: "1", reason: "machine-written markers: " + why.join(", ") };',
  'claude-session:rem-a7-f1', 'personal', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'EMAIL-TIER2-GATE-1:%' AND status = 'open');

-- 2924: the one step that only the owner can take, as a card with its closing condition; the issue keeps its measuring contract (reach_signals source gsc, 0 rows today).
UPDATE agent_issues
   SET description = description || char(10) || 'REM-A7-F1 2026-10-26 (measured): reach_signals has 0 source gsc rows ever (source ga4: 4 metrics, 2026-10-17 to 10-25). qnfo-fleet-dashboard already reads GA4 with the service account in the GA4_SA_KEY secret (ga4AccessToken, scope analytics.readonly); Search Console needs that account as a user of the verified qnfo.org property (human_actions 43, resolved 2026-10-06, made the owner its owner), and only the property owner can add a user: card gsc-service-account-user (IDENTITY-BOUND). Not built here: the ingestion (gscIngest on the daily tick, scope webmasters.readonly, searchAnalytics.query by page, query and site into reach_signals source gsc) and the Bing Webmaster half (an API key only the owner can mint); the code loop''s task ct_im2924 failed 9 times on the Workers standards guard, so a session or the loop rebuilds it with its own offline suite. The contract of this issue stays: it passes when a source gsc row exists.',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 2924 AND status = 'open' AND instr(description, 'REM-A7-F1 2026-10-26') = 0;

INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at)
SELECT 'gsc-service-account-user',
  'Add the fleet''s Google service account as a user of the qnfo.org Search Console property',
  'IDENTITY-BOUND: your own Google account (Search Console > Settings > Users and permissions). Only the owner of a Search Console property can add a user to it, and a service account cannot add itself; card google-identity-one-sitting (resolved 2026-10-06) made you the verified owner of qnfo.org, and no card ever asked for this one step. The fleet already reads Google Analytics with a service account (secret GA4_SA_KEY on qnfo-fleet-dashboard; reach_signals source ga4 has rows since 2026-10-17); the same account can read Search Console once it is a user of the property. Measured 2026-10-26: reach_signals source gsc has 0 rows ever, search_referrals_30d is a referrer count with no query or ranking data, IndexNow submits about 110 papers.qnfo.org URLs a day (accepted 100%). With the access the fleet reads yesterday''s clicks, impressions, click rate and position by page and the top 100 queries once a day and shows them on the Invest page (agent_issues 2924). It sends nothing and changes nothing on the property.',
  'No Search Console data reaches the fleet: the scorecard keeps reading search as a referrer count, and which queries find QNFO stays unknown. Nothing is blocked.',
  'In Search Console (the qnfo.org property) open Settings > Users and permissions > Add user, paste the service account address and choose Restricted. The address is the one you already added to the Google Analytics property (Analytics > Admin > Property access management, the entry that ends in iam.gserviceaccount.com). Then, in the Google Cloud project that owns that service account, enable the Google Search Console API (APIs and services > Library). The step is done when the fleet''s first daily read after it stores a row: SELECT COUNT(*) FROM reach_signals WHERE source = ''gsc'' reads 1 or more (the contract of agent_issues 2924 measures exactly that and closes the issue). Bing Webmaster is a separate, later step and is not part of this card.',
  'https://search.google.com/search-console', 'normal', 'open', 'session:rem-a7-f1', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'gsc-service-account-user');

UPDATE remediation_contracts
   SET action = 'REM-A7-REACH-1: measures the definition of done of INTEG-GSC-1: reach_signals holds at least one source gsc row. It reads 0 until the owner adds the fleet service account to the Search Console property (card gsc-service-account-user, IDENTITY-BOUND) and the daily ingestion exists (not built yet).'
 WHERE class = 'issue-2924' AND instr(action, 'VACUOUS-PROBE-V3-1') = 1 AND instr(verify_probe, 'source=''gsc''') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f1:reach-closeouts',
  'an issue whose defect is fixed gets a probe that measures the fix, not a status flip; an auto-send path in the owner''s name is reported with its evidence and a doer, not changed or extended by a remediation session; a step only the property owner can take is a card with its closing condition',
  'agent_issues 1000179 (contract becomes a code-read probe on the self-describing 405 site), 2373 (finding appended; EMAIL-TIER2-GATE-1 filed), 2924 (finding appended; card gsc-service-account-user filed; contract text corrected) in migrations/2026-10-26-rem-a7-reach.sql',
  'curl 2026-10-26 18:08:54Z GET https://fleet.qnfo.org/api/cmd -> 405, body {"error":"method_not_allowed","path":"/api/cmd","allow":["POST"],...}, header Allow: POST (qnfo-fleet-dashboard 1.71.2); git log -S method_not_allowed: PR 4130, version 1.61.0; email_reply_queue 75 and 76 tier 2 decision sent (qnfo-audit read 18:06Z); reach_signals source gsc 0 rows, ga4 51 rows; human_actions 43 resolved, 3 and 33 dismissed',
  'pending post-apply measurement',
  'one remediation_contracts row (issue-1000179), two issue descriptions, one new issue, one human_actions card; no worker, route, secret, send path or property setting changes',
  'the Rollback line restores the superseded probe and dismisses the card; the filed issue is a record and is dispositioned through its own lifecycle; decision_log stays append-only',
  'a closing probe that can pass for 1000179; the defect behind 2373 has an owner and a code probe; the owner step behind 2924 has a card',
  '1000179 closes on the next consumer cycle; EMAIL-TIER2-GATE-1 closes when qnfo-email carries the switch; gsc-service-account-user resolves when a source gsc row exists',
  NULL,
  'migrations/rem-a7-reach.test.mjs; live curl of /api/cmd; qnfo-audit reads of email_reply_queue, reach_signals, human_actions'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'rem-a7-f1:reach-closeouts');

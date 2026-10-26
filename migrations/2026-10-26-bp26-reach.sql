-- BP26-REACH-1 (2026-10-26, charter pillar reach; owner directive 2026-10-26 "Implement general best practices systemwide across the fleet"; agent_issues 1000347 BP26-EMAIL-AUTH-1, 1000340 BP26-SOCIAL-AUTOMATION-1; breach bp26_metrics_unmeasured, trigger 14541).
-- WHAT WAS WRONG: five BP26 metrics read UNMEASURED: dmarc_aligned_pass_rate, rfc8058_headers_present, unsubscribe_honoured_48h, social_bot_label_enabled, social_unsolicited_mentions. Their input is a DMARC report archive,
-- worker source, a public social profile or DNS, which a D1 trigger cannot read. scripts/bp26_reach.py (collectors run by scripts/bp26_producers.py from the remediation-consumer job, PR 4739) measures each from the real thing;
-- this file registers what they read and records the decision.
-- MEASURED 2026-10-26 about 19:55Z against live data before this file was written (read-only):
--   * DMARC is ALREADY published at p=reject: qnfo.org (sp=reject, rua=mailto:dmarc@qnfo.org), qwav.org and qwav.tech (sp=reject, rua at their own domain) and q08.org (p=reject, NO rua). SPF is v=spf1 include:_spf.mx.cloudflare.net ~all
--     on all four; the DKIM selector cf2024-1 exists on qnfo.org and q08.org. The catalogue assumed p=none first and said tightening waits for measured alignment; the policy was set to reject before the catalogue. No DNS record is
--     changed here or by the collector (a collector reads DNS, it never writes it).
--   * dmarc_aligned_pass_rate 0.9231: 12 of 13 messages in 4 reports of the last 7 days (google.com reports for qnfo.org; q08.org sends no reports; qwav.org and qwav.tech publish a rua tag but sent none in the window). Target 0.99 or more:
--     a real breach (one message in thirteen failed both aligned dkim and spf under p=reject) that the new ticket for the metric owns.
--   * rfc8058_headers_present 0.6667: qnfo-subscribers and q08-signal-engine set List-Unsubscribe and List-Unsubscribe-Post (One-Click), print an unsubscribe link and serve /unsubscribe; personal-companion's reading digest prints a link and
--     serves /unsubscribe but sets neither header. email_send_paths sp-5 (no List-Unsubscribe in qnfo-subscribers) is stale: the headers shipped in qnfo-subscribers 1.1.7.
--   * unsubscribe_honoured_48h 1: 4 opt-outs in the last 30 days (3 reply-stop, 1 unsubscribe link), all processed within 48 h of the request and nothing sent to the address more than 48 h later.
--   * social_bot_label_enabled 0: Bluesky (public AppView profile labels: none) and Mastodon (mstdn.science @QNFO, bot=false) have no bot label; X and LinkedIn cannot be read without credentials and count as not enabled.
--   * social_unsolicited_mentions 0: no automated post of the last 7 days carries an @mention of another account (203 posts, 58 with usable text: full text for Bluesky threads, the first 200 characters for Buffer posts); qnfo-social
--     has two reply objects, both continuing its own thread.
-- WHAT THIS DOES: creates bp26_dns_email_auth (the SPF, DKIM and DMARC state per sending domain, written by the collector; evidence for BP26-EMAIL-AUTH-1, not a metric), points the five metrics' source_of_truth at the real producer
-- (keeping the [BP26] tag, which the framework requires before it writes), files the Google Postmaster Tools registration as an IDENTITY-BOUND owner card (a Google account only the owner holds), and logs the decision.
-- Revert: the Rollback line puts the five source_of_truth texts back, drops the table and removes the card; the metrics then return to being written by nobody.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS bp26_dns_email_auth; DELETE FROM human_actions WHERE slug = 'bp26-postmaster-registration'; UPDATE metric_registry SET source_of_truth = CASE metric WHEN 'dmarc_aligned_pass_rate' THEN 'rua report parser (to build) [BP26]' WHEN 'rfc8058_headers_present' THEN 'mail send log (to compute) [BP26]' WHEN 'unsubscribe_honoured_48h' THEN 'subscriber tables (to compute) [BP26]' WHEN 'social_bot_label_enabled' THEN 'qnfo-social account probe (to build) [BP26]' ELSE 'social_threads posts (to scan) [BP26]' END WHERE metric IN ('dmarc_aligned_pass_rate', 'rfc8058_headers_present', 'unsubscribe_honoured_48h', 'social_bot_label_enabled', 'social_unsolicited_mentions');
-- spof-review: the collectors run in the remediation-consumer job (qnfo-cloud-ops dispatches it when idle for 60 minutes; pushes and workflow_run also start it); a missed run delays these five metrics only, and metric_staleness_breach_rec records the gap. The social profile probes use public endpoints with no credential.

CREATE TABLE IF NOT EXISTS bp26_dns_email_auth (
  domain TEXT PRIMARY KEY,
  spf TEXT,
  spf_ok INTEGER,
  dkim_cf_selector INTEGER,
  dmarc_policy TEXT,
  dmarc_sp TEXT,
  dmarc_rua INTEGER,
  dmarc_pct TEXT,
  checked_at TEXT
);

UPDATE metric_registry SET source_of_truth = 'DMARC aggregate reports (google.com, lolipop.jp, ...) stored as raw MIME in qnfo-audit.email_raw_archive, parsed by scripts/bp26_reach.py collect_dmarc on the remediation-consumer runner: aligned pass (dkim or spf) / all messages, last 7 days; DNS state in bp26_dns_email_auth [BP26]'
  WHERE metric = 'dmarc_aligned_pass_rate';
UPDATE metric_registry SET source_of_truth = 'static scan of the list-mail send paths (qnfo-subscribers, q08-signal-engine, personal-companion) for List-Unsubscribe, List-Unsubscribe-Post One-Click, a footer link and a /unsubscribe route, scripts/bp26_reach.py collect_rfc8058 on the runner; the mail log carries no headers [BP26]'
  WHERE metric = 'rfc8058_headers_present';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.email_suppression (reasons unsubscribe, reply-stop) and subscribers (status unsubscribed) of the last 30 days against emails (request time) and outreach_log, subscribers.last_digest_at (sends after 48 h), scripts/bp26_reach.py collect_unsubscribe on the runner [BP26]'
  WHERE metric = 'unsubscribe_honoured_48h';
UPDATE metric_registry SET source_of_truth = 'public profiles read by scripts/bp26_reach.py collect_social_labels on the runner: Bluesky AppView labels, Mastodon accounts/lookup bot flag; X and LinkedIn unverifiable without credentials and counted as not enabled [BP26]'
  WHERE metric = 'social_bot_label_enabled';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.social_threads.posts, social_media_posts.content_preview and dissemination_tracker.post_text_snippet of the last 7 days scanned for @mentions of non-fleet accounts, plus a reply-site tripwire on qnfo-social/worker.js, scripts/bp26_reach.py collect_social_mentions on the runner [BP26]'
  WHERE metric = 'social_unsolicited_mentions';

INSERT OR IGNORE INTO human_actions (slug, title, why, default_in_effect, action, sev, status, source) VALUES ('bp26-postmaster-registration', 'Register qnfo.org, q08.org and qwav.org in Google Postmaster Tools so the spam rate and domain reputation are visible (BP26-EMAIL-AUTH-1)', 'IDENTITY-BOUND: Postmaster Tools is a Google service tied to the Google account that verifies the domain; verification is a TXT record in the zone and the data (spam rate, domain and IP reputation, authentication results) is readable only by that account. The practice asks for a spam rate under 0.1 percent (0.3 percent ceiling) and for it to be watched. The fleet cannot sign in to Google as you and registers nothing on your behalf. Measured meanwhile: DMARC is already published at p=reject on all four sending domains, and the aligned pass rate from the aggregate reports that reach the rua mailbox is a hourly metric (dmarc_aligned_pass_rate).', 'No registration. Spam-rate monitoring stays unmeasured; DMARC alignment is measured from the aggregate reports and nothing is published or changed.', 'Open Google Postmaster Tools with your Google account, add each domain and put the TXT record it shows into the zone, or reply ''not now'' to keep the default.', 'normal', 'open', 'bp26-reach');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-reach',
  'DMARC enforcement above p=none must wait for measured alignment, but the zones already publish p=reject, so the right move is to measure alignment now and change no DNS record; the brief and the catalogue were written before this was read',
  'BP26-REACH-1: scripts/bp26_reach.py with five collectors (DMARC aggregate reports from the archived raw mail, RFC 8058 header scan of the list-mail paths, opt-outs honoured within 48 h, social bot labels from public profiles, unsolicited mentions in automated posts), the bp26_dns_email_auth table, the Postmaster Tools owner card',
  'DoH 2026-10-26: _dmarc.qnfo.org p=reject sp=reject rua=dmarc@qnfo.org, qwav.org and qwav.tech the same with their own rua, q08.org p=reject without rua; email_raw_archive holds the google.com and lolipop.jp report MIME; collect_dmarc dry run 0.9231 (12 of 13 messages, 4 reports); bsky AppView labels none, mstdn.science @QNFO bot=false',
  'applied by migration; the collectors run on the next remediation-consumer run after merge', 'one new table, five source_of_truth texts, one owner card; no DNS, mail or post change',
  'the Rollback line', 'the fleet reads its own DMARC alignment, list-mail header state, opt-out latency and bot-label state from the real sources',
  'bp26_metrics_unmeasured falls by five; dmarc_aligned_pass_rate 0.92 and social_bot_label_enabled 0 breach their targets and file their tickets', 'none directly; deliverability and platform-rule compliance for the mail and social channels',
  'offline: scripts/bp26_reach.py --selftest and migrations/bp26-reach.test.mjs; live: collector dry runs against qnfo-audit, DoH, the Bluesky AppView and the mstdn.science API 2026-10-26'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-REACH-1:%');

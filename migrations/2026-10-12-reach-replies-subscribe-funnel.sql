-- REACH-SIGNALS-1 (issue 2225) and SUBSCRIBE-FUNNEL-1 (issue 1753), 2026-10-12, pillar reach.
--
-- (1) Replies. social_engagements keeps daily counts per Bluesky post, so how fast a reply arrives and whether it says
--     anything could not be computed. qnfo-social 0.12.0 stores each reply by another account in social_replies (reply uri,
--     hashed author DID, delay from the post in minutes, text length, word count; never the text or the handle; nothing is
--     posted). Three metrics are computed here every hour:
--       social_replies_30d             replies by other accounts created in the last 30 days (a count; 0 is a measurement);
--       reply_velocity_60m_share_30d   of those, the share that arrived within 60 minutes of the post;
--       substantive_reply_share_30d    of those, the share with three or more words.
--     With no reply in the window the two shares have no denominator: last_value stays NULL and state reads UNMEASURED
--     instead of a made-up 0, and their triggers (which read NULL as no hit) stay quiet; the reply count and
--     social_engagement_rate_30d (trigger 404) carry the gap. Sentiment is not measured.
-- (2) Subscribe funnel. Nobody outside the fleet has submitted the form since 2026-09-26 and nothing counted the steps in
--     between. qnfo-subscribers 1.2.0 counts each step in subscribe_funnel (day, stage, source, n: a counter, never an
--     address). Two diagnostics are computed here every hour:
--       subscribe_submits_30d          accepted sign-up submissions in 30 days (stage submit);
--       subscribe_confirm_rate_30d     confirmations / confirmation mails sent in 30 days (NULL until a mail was sent).
--     Trigger exemption (METRIC-CLOSED-LOOP-1): both are leading diagnostics of subscribers_growth_monthly, whose trigger
--     341 already files the gap; a second trigger would file the same gap twice. GET https://qnfo-subscribers.q08.workers.dev/funnel
--     names the largest leak.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS reach_replies_funnel_tick; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('reply_velocity_60m_share_30d', 'substantive_reply_share_30d'); DELETE FROM metric_registry WHERE metric IN ('social_replies_30d', 'reply_velocity_60m_share_30d', 'substantive_reply_share_30d', 'subscribe_submits_30d', 'subscribe_confirm_rate_30d'); DELETE FROM failure_modes WHERE fm_key IN ('subscribe-confirm-mail-unbounded', 'subscribe-send-failure-silent'); DELETE FROM remediation_contracts WHERE class IN ('fm-subscribe-confirm-mail-unbounded', 'fm-subscribe-send-failure-silent'); (social_replies and subscribe_funnel are kept: they hold measurements)

CREATE TABLE IF NOT EXISTS social_replies (reply_uri TEXT PRIMARY KEY, platform TEXT NOT NULL, post_id TEXT NOT NULL, author_hash TEXT, post_created_at TEXT, created_at TEXT, delay_min REAL, text_len INTEGER NOT NULL DEFAULT 0, word_count INTEGER NOT NULL DEFAULT 0, collected_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_social_replies_created ON social_replies (created_at);

CREATE TABLE IF NOT EXISTS subscribe_funnel (day TEXT NOT NULL, stage TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, stage, source));

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('social_replies_30d', 'fleet', 'leading', 'count of social_replies rows (replies by accounts other than the poster) whose created_at is in the last 30 days', 'qnfo-audit.social_replies (qnfo-social REACH-SIGNALS-1, public Bluesky getPostThread, collected daily at 07:00 UTC)', 'not measured before 2026-10-12', 'rising; no fixed number until a month of data exists', 'qnfo-social', 'diagnostic of social_engagement_rate_30d (trigger 404); no trigger of its own', '1h', NULL, NULL, NULL, NULL, 'UNMEASURED', 'computed'),
 ('reply_velocity_60m_share_30d', 'fleet', 'leading', 'replies created within 60 minutes of their post / all replies by other accounts in the last 30 days (social_replies.delay_min <= 60); NULL while there is no reply', 'qnfo-audit.social_replies (qnfo-social REACH-SIGNALS-1)', 'not measured before 2026-10-12', '>= 0.25 once replies exist', 'qnfo-social', 'trigger lt 0.25 (quiet while NULL)', '1h', '< 0.25', NULL, NULL, NULL, 'UNMEASURED', 'computed'),
 ('substantive_reply_share_30d', 'fleet', 'leading', 'replies with three or more words / all replies by other accounts in the last 30 days (social_replies.word_count >= 3); NULL while there is no reply', 'qnfo-audit.social_replies (qnfo-social REACH-SIGNALS-1)', 'not measured before 2026-10-12', '>= 0.5 once replies exist', 'qnfo-social', 'trigger lt 0.5 (quiet while NULL)', '1h', '< 0.5', NULL, NULL, NULL, 'UNMEASURED', 'computed'),
 ('subscribe_submits_30d', 'fleet', 'leading', 'sum of subscribe_funnel.n for stage submit in the last 30 days: sign-up submissions that passed the honeypot, validation, suppression and rate checks', 'qnfo-audit.subscribe_funnel (qnfo-subscribers SUBSCRIBE-FUNNEL-1; GET https://qnfo-subscribers.q08.workers.dev/funnel)', '0 outside submissions between 2026-09-26 and 2026-10-12 (subscribers table)', 'at least the +10 a month subscribers_growth_monthly needs', 'qnfo-subscribers', 'diagnostic of subscribers_growth_monthly (trigger 341); no trigger of its own', '1h', NULL, NULL, NULL, NULL, 'UNMEASURED', 'computed'),
 ('subscribe_confirm_rate_30d', 'fleet', 'leading', 'subscribe_funnel stage confirmed / stage confirm_mail_sent over the last 30 days; NULL until a confirmation mail was sent', 'qnfo-audit.subscribe_funnel (qnfo-subscribers SUBSCRIBE-FUNNEL-1)', '0 of 2 outside sign-ups confirmed (2026-09-26, subscribers table)', '>= 0.5', 'qnfo-subscribers', 'diagnostic of subscribers_growth_monthly (trigger 341); no trigger of its own', '1h', NULL, NULL, NULL, NULL, 'UNMEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS reach_replies_funnel_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM social_replies WHERE datetime(created_at) >= datetime('now', '-30 days')) AS TEXT)
  WHERE metric = 'social_replies_30d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    last_value = (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE CAST(ROUND(1.0 * SUM(delay_min IS NOT NULL AND delay_min <= 60) / COUNT(*), 3) AS TEXT) END FROM social_replies WHERE datetime(created_at) >= datetime('now', '-30 days')),
    state = (SELECT CASE WHEN COUNT(*) = 0 THEN 'UNMEASURED' ELSE 'MEASURED' END FROM social_replies WHERE datetime(created_at) >= datetime('now', '-30 days'))
  WHERE metric = 'reply_velocity_60m_share_30d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    last_value = (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE CAST(ROUND(1.0 * SUM(word_count >= 3) / COUNT(*), 3) AS TEXT) END FROM social_replies WHERE datetime(created_at) >= datetime('now', '-30 days')),
    state = (SELECT CASE WHEN COUNT(*) = 0 THEN 'UNMEASURED' ELSE 'MEASURED' END FROM social_replies WHERE datetime(created_at) >= datetime('now', '-30 days'))
  WHERE metric = 'substantive_reply_share_30d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COALESCE(SUM(n), 0) FROM subscribe_funnel WHERE stage = 'submit' AND day >= date('now', '-30 days')) AS TEXT)
  WHERE metric = 'subscribe_submits_30d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    last_value = (SELECT CASE WHEN COALESCE(SUM(CASE WHEN stage = 'confirm_mail_sent' THEN n END), 0) = 0 THEN NULL ELSE CAST(ROUND(1.0 * COALESCE(SUM(CASE WHEN stage = 'confirmed' THEN n END), 0) / SUM(CASE WHEN stage = 'confirm_mail_sent' THEN n END), 3) AS TEXT) END FROM subscribe_funnel WHERE day >= date('now', '-30 days')),
    state = (SELECT CASE WHEN COALESCE(SUM(CASE WHEN stage = 'confirm_mail_sent' THEN n END), 0) = 0 THEN 'UNMEASURED' ELSE 'MEASURED' END FROM subscribe_funnel WHERE day >= date('now', '-30 days'))
  WHERE metric = 'subscribe_confirm_rate_30d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'reply_velocity_60m_share_30d', 'Reach gap: under a quarter of replies arrive within an hour of the post', 'registry', 'lt', 0.25, 6,
  'Pillar reach (REACH-SIGNALS-1). Fewer than 25% of the replies to the fleet''s Bluesky posts arrive within 60 minutes. Read SELECT post_id, delay_min, word_count FROM social_replies ORDER BY created_at DESC LIMIT 50 and GET https://qnfo-social.q08.workers.dev/learner: late replies mean the post went out when its readers were not there. Lever: let the distribution learner weight the time slot by first-hour replies (social_learner_posts.slot against social_replies.delay_min), inside the cadence caps. Never post replies, likes or follows to move this number. Done: reply_velocity_60m_share_30d >= 0.25 at two refreshes.',
  'qnfo-social', 'agent_issues', 168, 1, 'REACH-SIGNALS-1 (migrations/2026-10-12-reach-replies-subscribe-funnel.sql); NULL while no reply exists, and NULL is no hit'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'reply_velocity_60m_share_30d');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'substantive_reply_share_30d', 'Reach gap: under half of the replies say something (three words or more)', 'registry', 'lt', 0.5, 6,
  'Pillar reach (REACH-SIGNALS-1). Fewer than half of the replies to the fleet''s Bluesky posts have three or more words. Read SELECT post_id, word_count, text_len FROM social_replies ORDER BY created_at DESC LIMIT 50 and compare the posts that drew longer replies with the ones that drew none (social_learner_posts.format). Lever: have the learner credit a reply of three or more words above a bare reaction when it scores a format, inside the cadence caps and the content gates. Never post replies to move this number. Done: substantive_reply_share_30d >= 0.5 at two refreshes.',
  'qnfo-social', 'agent_issues', 168, 1, 'REACH-SIGNALS-1 (migrations/2026-10-12-reach-replies-subscribe-funnel.sql); NULL while no reply exists, and NULL is no hit'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'substantive_reply_share_30d');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('subscribe-confirm-mail-unbounded', 'the sign-up form could send confirmation mails to one address without limit',
  'the per-network limit counted new subscribers rows; a repeat submit of an existing pending address created no row and sent another mail each time',
  'SUBSCRIBE-RESEND-BOUND-1 (qnfo-subscribers 1.2.0): a pending address is mailed at most once an hour (subscribers.welcomed_at), repeats are counted as stage submit_repeat',
  'on no day in the last 7 are more confirmation mails sent than sign-ups accepted', 'fm-subscribe-confirm-mail-unbounded', '2026-10-12', 1753,
  'the same address submitted repeatedly', 'several confirmation mails to one inbox', 'a person who never asked for mail; the sending domain''s reputation'),
 ('subscribe-send-failure-silent', 'a sign-up whose confirmation mail failed still told the visitor to check the inbox',
  'handleSubscribe answered ok with confirmation_sent false and the site''s box reads only ok',
  'SUBSCRIBE-SEND-HONEST-1 (qnfo-subscribers 1.2.0): a failed send answers 502 with a retry message and is counted as stage confirm_mail_failed',
  'confirmation mails that failed in the last 7 days', 'fm-subscribe-send-failure-silent', '2026-10-12', 1753,
  'the mail binding refuses or fails a send', 'a pending row that can never confirm', 'every sign-up while the mail path is down');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-subscribe-confirm-mail-unbounded', NULL, 'SUBSCRIBE-FUNNEL-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT day FROM subscribe_funnel WHERE day >= date(''now'', ''-7 days'') GROUP BY day HAVING SUM(CASE WHEN stage = ''confirm_mail_sent'' THEN n ELSE 0 END) > SUM(CASE WHEN stage = ''submit'' THEN n ELSE 0 END))) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-subscribe-send-failure-silent', NULL, 'SUBSCRIBE-FUNNEL-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COALESCE(SUM(n), 0) FROM subscribe_funnel WHERE stage = ''confirm_mail_failed'' AND day >= date(''now'', ''-7 days'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji', 'the subscriber gap sits before the form is submitted, and neither that step nor reply quality was measured',
  'REACH-SIGNALS-1 and SUBSCRIBE-FUNNEL-1: reply ledger and three reply metrics (qnfo-social 0.12.0), step counters, a sign-up page and two funnel diagnostics (qnfo-subscribers 1.2.0)',
  'qnfo-audit 2026-10-12: subscribers holds 3 rows (1 fleet test confirmed, 2 outside pending since 2026-09-26, none since); cloud_ops_events holds no confirm send to an outside domain since 1.1.7; social_engagement_rate_30d = 0; no table held a reply',
  'each funnel step and each reply is counted from the deploy on', 'qnfo-social and qnfo-subscribers, two tables, five metrics, one tick trigger', 'the Rollback line and a revert of the PR',
  'the fleet can see where sign-ups are lost and how fast and how fully readers reply', 'within 7 days of the deploy GET /funnel shows page or box views and names a leak, and social_replies_30d has a value', 'none by itself: measurement, an accurate subscribe line and a linkable sign-up page', 'D1 qnfo-audit, public Bluesky AppView getPostThread, live qnfo.org form'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REACH-SIGNALS-1 and SUBSCRIBE-FUNNEL-1%');

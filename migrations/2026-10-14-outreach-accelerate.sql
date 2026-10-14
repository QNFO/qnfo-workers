-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE pipeline_flags SET value = '{"linkedin":3,"mastodon":7,"twitter":7}', updated_at = datetime('now') WHERE key = 'social_channel_caps'; UPDATE pipeline_flags SET value = '0', updated_at = datetime('now') WHERE key = 'social_share_floor'; DROP TRIGGER IF EXISTS outreach_impact_tick; DROP VIEW IF EXISTS v_channel_impact_7d; UPDATE analytics_metric_triggers SET enabled = 0 WHERE notes LIKE 'OUTREACH-ACCELERATE-1%'; UPDATE metric_registry SET state = 'RETIRED' WHERE metric IN ('social_posts_7d', 'outreach_human_clicks_7d', 'social_channels_silent_7d', 'outreach_clicks_per_post_7d', 'outreach_emails_sent_7d')
-- spof-review: no new single point of failure; the metrics are computed by the existing fleet_tick heartbeat (two producers); Mastodon keeps Buffer as its second transport when the direct token is absent or refused
--
-- OUTREACH-ACCELERATE-1 (charter pillar reach). Owner directive 2026-10-14, verbatim: "Accelerate all social media and all external
-- outreach, communication, and promotion. All available channels shall be fully utilized as appropriate and effective, including email,
-- Buffer, Mastodon, Bluesky, Substack, and all other channels. Audit whether to replace Mastodon with Substack for 3-free-channel Buffer
-- posts. Identify impact metrics and maximize/optimize fleet outreach accordingly: measure and track"
-- Read 2026-10-14 06:30Z:
--   posts in 7 days: Bluesky 1 (attention share 0 = STOP, one slot a week; 142 papers queued), Mastodon 5, X 5, LinkedIn 2 (drafts);
--   pipeline_flags.social_channel_caps {"linkedin":3,"mastodon":7,"twitter":7}, scaled down by attention shares 0.5 for Mastodon and X;
--   human utm clicks in 30 days: Mastodon 25, X 13, LinkedIn 9, Bluesky 7 (reach_signals source utm), so Mastodon is the best social
--   channel and is kept; Buffer's free plan holds 3 channels (LinkedIn, Mastodon, X) and supports Substack Notes through its API;
--   email: 61 first mails and 16 follow-ups in 30 days, 1 reply (cap 8 a day Mon-Fri, about 40 a week), so the cap is not the limit:
--   contact lookup is (12 queue rows wait for an address). The email cap is unchanged; its throughput is now measured.
-- This file: the owner's caps rise (LinkedIn 7, Mastodon 14, X 14, Substack 14; Bluesky 14 is the qnfo-social 0.15.0 default), the
-- attention share steers between a floor of half the cap and the cap (pipeline_flags.social_share_floor), and five impact metrics with
-- a per-channel view measure output, human attention and email throughput on every 10-minute tick.
INSERT INTO pipeline_flags (key, value, updated_at) VALUES ('social_channel_caps', '{"linkedin":7,"mastodon":14,"twitter":14,"substack":14}', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
INSERT INTO pipeline_flags (key, value, updated_at) VALUES ('social_share_floor', '0.5', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- Per channel in 7 days: posts, human utm clicks (bot clicks excluded), clicks per post, platform engagements on Bluesky and Mastodon.
CREATE VIEW IF NOT EXISTS v_channel_impact_7d AS
WITH posts AS (
  SELECT 'bluesky' AS channel, (SELECT COUNT(*) FROM social_threads WHERE status = 'posted' AND posted_at >= datetime('now', '-7 days'))
    + (SELECT COUNT(*) FROM dissemination_tracker WHERE action = 'posted' AND channel = 'bluesky' AND posted_at >= datetime('now', '-7 days')) AS posts_7d
  UNION ALL SELECT CASE platform WHEN 'buffer-x' THEN 'x' ELSE substr(platform, 8) END, COUNT(*) FROM social_media_posts
    WHERE platform LIKE 'buffer-%' AND status = 'published' AND published_at >= datetime('now', '-7 days') GROUP BY platform
  UNION ALL SELECT 'email', COUNT(*) FROM outreach_log WHERE status IN ('sent', 'followup') AND sent_at >= datetime('now', '-7 days')
), clicks AS (
  SELECT channel, SUM(value) AS human_clicks_7d FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') GROUP BY channel
)
SELECT p.channel, SUM(p.posts_7d) AS posts_7d, COALESCE(c.human_clicks_7d, 0) AS human_clicks_7d,
  ROUND(1.0 * COALESCE(c.human_clicks_7d, 0) / MAX(1, SUM(p.posts_7d)), 2) AS clicks_per_post_7d
FROM posts p LEFT JOIN clicks c ON c.channel = p.channel GROUP BY p.channel;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('social_posts_7d', 'external', 'target', 'posts on every social channel in 7 days: Bluesky (social_threads + dissemination_tracker) plus each Buffer or direct channel (social_media_posts buffer-*)',
  'qnfo-audit.v_channel_impact_7d (OUTREACH-ACCELERATE-1)', '13 on 2026-10-14 06:30Z (Bluesky 1, Mastodon 5, X 5, LinkedIn 2)',
  '>= 40 a week (caps: Bluesky 14, LinkedIn 7, Mastodon 14, X 14, Substack 14 once connected)', 'qnfo-social', 'trigger lt 25', '10m', '< 40', '< 15', NULL, NULL, 'MEASURED', 'computed'),
 ('outreach_human_clicks_7d', 'external', 'target', 'human utm clicks in 7 days from every outreach channel (reach_signals source utm, metric clicks_human; probe traffic excluded)',
  'qnfo-audit.reach_signals (UTM-CLICK-LEDGER-1; OUTREACH-ACCELERATE-1)', 'about 13 a week in the 30 days to 2026-10-14 (social 54 in 30 days)',
  'rising; >= 50 a week by 2026-12-31 (the impact headline: people who came because of a post or mail)', 'qnfo-social', 'trigger lt 5', '10m', '< 20', '< 5', NULL, NULL, 'MEASURED', 'computed'),
 ('social_channels_silent_7d', 'external', 'target', 'connected outreach channels (Bluesky plus every connected Buffer channel in social_channels) with no post in 7 days',
  'qnfo-audit.social_channels, v_channel_impact_7d (OUTREACH-ACCELERATE-1)', 'first refresh after apply',
  '0 (every available channel is used)', 'qnfo-social', 'trigger gt 0', '10m', '> 0', '> 1', NULL, NULL, 'MEASURED', 'computed'),
 ('outreach_clicks_per_post_7d', 'external', 'target', 'outreach_human_clicks_7d / social and email posts in 7 days',
  'qnfo-audit.v_channel_impact_7d (OUTREACH-ACCELERATE-1)', 'about 1.0 in the 30 days to 2026-10-14',
  '>= 1 (exempt from its own trigger: volume and clicks each have one; this ratio steers the attention shares and the learner)', 'qnfo-social', 'exempt', '10m', '< 1', '< 0.3', NULL, NULL, 'MEASURED', 'computed'),
 ('outreach_emails_sent_7d', 'external', 'target', 'cold outreach mails sent in 7 days (outreach_log status sent or followup)',
  'qnfo-audit.outreach_log (qnfo-cloud-ops jobOutreach; OUTREACH-ACCELERATE-1)', '61 first mails and 16 follow-ups in the 30 days to 2026-10-14 (about 18 a week)',
  '>= 30 a week (the cap allows 40: the gap is contact lookup, not the cap)', 'qnfo-cloud-ops', 'trigger lt 10', '10m', '< 30', '< 10', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS outreach_impact_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(SUM(posts_7d), 0) FROM v_channel_impact_7d WHERE channel <> 'email') AS TEXT)
  WHERE metric = 'social_posts_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(CAST((
      SELECT COALESCE(SUM(value), 0) FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') AND COALESCE(channel, '') <> 'probe') AS INTEGER) AS TEXT)
  WHERE metric = 'outreach_human_clicks_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM (SELECT 'bluesky' AS ch UNION SELECT CASE WHEN service = 'twitter' THEN 'x' WHEN lower(service) LIKE '%substack%' THEN 'substack' ELSE service END FROM social_channels WHERE connected = 1) a
      WHERE NOT EXISTS (SELECT 1 FROM v_channel_impact_7d v WHERE v.channel = a.ch AND v.posts_7d > 0)) AS TEXT)
  WHERE metric = 'social_channels_silent_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * COALESCE((SELECT SUM(value) FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') AND COALESCE(channel, '') <> 'probe'), 0)
        / MAX(1, (SELECT COALESCE(SUM(posts_7d), 0) FROM v_channel_impact_7d)), 2)) AS TEXT)
  WHERE metric = 'outreach_clicks_per_post_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM outreach_log WHERE status IN ('sent', 'followup') AND sent_at >= datetime('now', '-7 days')) AS TEXT)
  WHERE metric = 'outreach_emails_sent_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'social_posts_7d', 'Outreach output: fewer than 25 social posts in 7 days', 'registry', 'lt', 25, 2,
  'Pillar reach (owner directive 2026-10-14: accelerate all outreach). Read SELECT * FROM v_channel_impact_7d and the newest social_runs rows (run_kind channels and drain): each held channel names its reason (held:weekly-cap, held:spacing, held:no-content, held:link-*, held:content-gate:*, error:*). Levers in order: (1) held:no-content: queue papers (dissemination_tracker action queued) or approve held drafts (recheckDrafts); (2) error:* on Buffer: check social_engagements buffer auth_status and the channel in social_channels; (3) caps: pipeline_flags.social_channel_caps and social_share_floor. Done: social_posts_7d >= 25 at two refreshes.',
  'qnfo-social', 'agent_issues', 2, 1, 'OUTREACH-ACCELERATE-1 (migrations/2026-10-14-outreach-accelerate.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'social_posts_7d');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'outreach_human_clicks_7d', 'Outreach impact: fewer than 5 human visits from outreach in 7 days', 'registry', 'lt', 5, 2,
  'Pillar reach. Read SELECT * FROM v_channel_impact_7d ORDER BY clicks_per_post_7d DESC. Levers in order: (1) a channel with posts and no clicks: check that its links carry utm tags (social_media_posts.content_preview) and that the gateway records them (reach_signals source utm, UTM-CLICK-LEDGER-1); (2) shift volume to the channel with the most clicks per post (pipeline_flags.social_channel_caps); (3) content: the learner topic arm (social_learner_posts) and the lede rule (LEDE-SOCIAL-1). Done: outreach_human_clicks_7d >= 5 at two refreshes.',
  'qnfo-social', 'agent_issues', 2, 1, 'OUTREACH-ACCELERATE-1 (migrations/2026-10-14-outreach-accelerate.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'outreach_human_clicks_7d');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'social_channels_silent_7d', 'Outreach coverage: a connected channel posted nothing in 7 days', 'registry', 'gt', 0, 2,
  'Pillar reach (owner directive 2026-10-14: all available channels fully utilized). Read the silent channel: SELECT service, connected FROM social_channels; SELECT * FROM v_channel_impact_7d. Then the newest social_runs channels row names why it held (held:no-channel = Buffer reports it disconnected; held:attention-stop; held:cap-0 = pipeline_flags.social_channel_caps sets 0). Done: social_channels_silent_7d = 0 at two refreshes.',
  'qnfo-social', 'agent_issues', 2, 1, 'OUTREACH-ACCELERATE-1 (migrations/2026-10-14-outreach-accelerate.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'social_channels_silent_7d');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'outreach_emails_sent_7d', 'Email outreach: fewer than 10 mails sent in 7 days', 'registry', 'lt', 10, 2,
  'Pillar reach. The cap (8 a day Mon-Fri, qnfo-cloud-ops jobOutreach) allows 40 a week; the limit is addresses. Read SELECT status, COUNT(*) FROM outreach_queue GROUP BY status and the newest cloud_ops_events rows of job outreach and outreach-lookup. Levers in order: (1) needs-contact rows: the lookup (outreach-lookup, every 120 min) finds no address; widen its sources; (2) learner-stopped segments (ops_config outreach_learner_resume:<segment>); (3) external_sends_enabled in pipeline_state. Consent, suppression and opt-out rules are unchanged. Done: outreach_emails_sent_7d >= 10 at two refreshes.',
  'qnfo-cloud-ops', 'agent_issues', 2, 1, 'OUTREACH-ACCELERATE-1 (migrations/2026-10-14-outreach-accelerate.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'outreach_emails_sent_7d');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, reviewed_at)
VALUES ('social-weekly-caps', 'qnfo-social CHANNEL_WEEKLY_CAP, weeklyCap; pipeline_flags.social_channel_caps', 'cap', 'posting volume that reads as spam on a personal account or breaks platform norms', 'outreach',
  'demote', 'applied',
  'BSKY-SPACING-1 spacing and the channel drain spacing keep posts spread; the attention share steers inside the cap', NULL,
  'raised by owner directive 2026-10-14 (OUTREACH-ACCELERATE-1): Bluesky 14, LinkedIn 7, Mastodon 14, X 14, Substack 14 a week, Bluesky one post per run and 7 days / cap minus 1 h apart. Before: posts 7d Bluesky 1, Mastodon 5, X 5, LinkedIn 2; human utm clicks per post in 7 days Bluesky 7, Mastodon 5, LinkedIn 3, X 2.6', datetime('now')),
 ('attention-share-throttle', 'qnfo-social shareCap; ops_config attention_channel_share (qnfo-fleet-dashboard ATTENTION-LOOP-1)', 'cap', 'spending posts on a channel nobody notices', 'outreach',
  'demote', 'applied',
  'the per-channel metrics in v_channel_impact_7d and the learner channel arm', NULL,
  'floor 0.5 (pipeline_flags.social_share_floor): STOP keeps half the cap instead of one post a week. Bluesky was STOP on 2026-10-13 (engagements per item) while its one post that week drew 7 human utm clicks, the most per post of any channel; 142 papers waited in its queue', datetime('now'));

-- The two steps only the owner can take (their own accounts). Each card's default is in effect, and each closes on its own probe.
INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at)
SELECT 'mastodon-direct-token', 'Create a Mastodon app token for @QNFO@mstdn.science so Mastodon posts without Buffer (frees a Buffer slot for Substack)',
  'IDENTITY-BOUND: an access token on the owner''s own Mastodon account; only the account holder can create it. Mastodon is the fleet''s best social channel (25 human clicks in 30 days, 5 per post) and has an open API, so it does not need one of Buffer''s 3 free channel slots. qnfo-social 0.15.0 (MASTODON-DIRECT-1) posts directly as soon as the secret exists.',
  'Mastodon keeps posting through Buffer (14 a week); Substack cannot take a Buffer slot until Mastodon leaves Buffer.',
  'mstdn.science > Preferences > Development > New application: name qnfo-social, scope write:statuses only, Submit, copy "Your access token". Then dash.cloudflare.com > Workers > qnfo-social > Settings > Variables and Secrets > Add > Secret MASTODON_TOKEN = the token. After the first direct post (social_media_posts buffer-mastodon with transport mastodon-direct), disconnect Mastodon in Buffer. Closes when: SELECT COUNT(*) FROM social_media_posts WHERE platform = ''buffer-mastodon'' AND engagement_metrics LIKE ''%mastodon-direct%'' reads 1 or more.',
  'https://mstdn.science/settings/applications', 'medium', 'open', 'session:OUTREACH-ACCELERATE-1', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'mastodon-direct-token');
INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at)
SELECT 'buffer-connect-substack', 'Connect a Substack account in Buffer so the fleet posts Substack Notes (14 a week)',
  'IDENTITY-BOUND: signing in to the owner''s own Substack account (or creating one) and authorising Buffer. Buffer supports Substack Notes on the free plan and through its API (support.buffer.com, Using Substack with Buffer); qnfo-social 0.15.0 (SUBSTACK-CHANNEL-1) drains a connected Substack channel with no further change. Free plan: 3 channels; with Mastodon moved to direct posting the slots are LinkedIn, X, Substack.',
  'No Substack posts; the other channels carry the volume.',
  'Do this after Mastodon posts directly (card mastodon-direct-token), or upgrade Buffer to keep all four. buffer.com > Channels > Connect a channel > Substack > sign in and authorise. qnfo-social reads the channel on its next 2-hourly run (social_channels). Closes when: SELECT COUNT(*) FROM social_media_posts WHERE platform = ''buffer-substack'' reads 1 or more.',
  'https://publish.buffer.com/channels/connect', 'medium', 'open', 'session:OUTREACH-ACCELERATE-1', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'buffer-connect-substack');
INSERT INTO fleet_tick (source) VALUES ('migration:outreach-accelerate');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01AEEBcczeW1o2nKSUBtXnUL', 'the owner directive to fully use every channel replaces the earlier 1-2 a week personal-account cadence; volume rises inside platform norms (spaced posts, LinkedIn ToS draft rule kept), and impact is judged by human clicks, not by posts',
  'OUTREACH-ACCELERATE-1: social caps Bluesky 14, LinkedIn 7, Mastodon 14, X 14, Substack 14 a week; attention floor 0.5; impact metrics social_posts_7d, outreach_human_clicks_7d, social_channels_silent_7d, outreach_clicks_per_post_7d, outreach_emails_sent_7d with v_channel_impact_7d; Mastodon kept (best clicks), moved to direct posting when MASTODON_TOKEN exists so Substack can take its Buffer slot',
  '2026-10-14 06:30Z: posts 7d 13; utm human clicks 30d Mastodon 25, X 13, LinkedIn 9, Bluesky 7; Buffer support: Substack Notes on the free plan through the API (support.buffer.com, using-substack-with-buffer)',
  'merged through the canonical path (migration runner)', 'pipeline_flags two rows; metric_registry five rows, four triggers, one view, one fleet_tick trigger writing metric_registry only; control_registry two rows', 'the Rollback header',
  'outreach volume and impact are measured per channel on every tick, and the channel set can grow to Substack without losing Mastodon',
  'social_posts_7d >= 40 within 7 days of the qnfo-social 0.15.0 deploy, and outreach_human_clicks_7d higher than the 13 a week baseline after 14 days',
  'Bluesky from 1 to up to 14 posts a week; Mastodon and X from about 3 to 14; LinkedIn 3 to 7', 'd1:social_media_posts, social_threads, dissemination_tracker, reach_signals, outreach_log, social_channels, ops_config attention_channel_share; web:support.buffer.com Substack article'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'OUTREACH-ACCELERATE-1:') = 1);

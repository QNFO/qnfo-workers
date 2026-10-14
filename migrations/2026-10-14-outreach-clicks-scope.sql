-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_outreach_clicks_scope
-- Rollback: DROP TRIGGER IF EXISTS outreach_impact_tick; then run the sql column of bak_20261014_outreach_clicks_scope (the trigger from migrations/2026-10-14-outreach-accelerate.sql)
-- spof-review: no new dependency; the same fleet_tick trigger, recreated with a narrower channel filter
--
-- OUTREACH-CLICKS-SCOPE-1 (charter pillar reach). outreach_human_clicks_7d read 117 at its first refresh (2026-10-14 06:55Z) because it
-- summed every utm source in reach_signals (q08 44, qnfo.org 13, ipatent 9 and chatgpt.com 3 in 30 days are site and referral tags, not
-- outreach). It now counts only the outreach channels (Bluesky, Mastodon, X, LinkedIn, Substack, Threads, email), as v_channel_impact_7d
-- does per channel; outreach_clicks_per_post_7d uses the same numerator.
CREATE TABLE IF NOT EXISTS bak_20261014_outreach_clicks_scope AS SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'outreach_impact_tick';
DROP TRIGGER IF EXISTS outreach_impact_tick;
CREATE TRIGGER outreach_impact_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(SUM(posts_7d), 0) FROM v_channel_impact_7d WHERE channel <> 'email') AS TEXT)
  WHERE metric = 'social_posts_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(CAST((
      SELECT COALESCE(SUM(value), 0) FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') AND channel IN ('bluesky', 'mastodon', 'x', 'linkedin', 'substack', 'threads', 'email')) AS INTEGER) AS TEXT)
  WHERE metric = 'outreach_human_clicks_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM (SELECT 'bluesky' AS ch UNION SELECT CASE WHEN service = 'twitter' THEN 'x' WHEN lower(service) LIKE '%substack%' THEN 'substack' ELSE service END FROM social_channels WHERE connected = 1) a
      WHERE NOT EXISTS (SELECT 1 FROM v_channel_impact_7d v WHERE v.channel = a.ch AND v.posts_7d > 0)) AS TEXT)
  WHERE metric = 'social_channels_silent_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * COALESCE((SELECT SUM(value) FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') AND channel IN ('bluesky', 'mastodon', 'x', 'linkedin', 'substack', 'threads', 'email')), 0)
        / MAX(1, (SELECT COALESCE(SUM(posts_7d), 0) FROM v_channel_impact_7d)), 2)) AS TEXT)
  WHERE metric = 'outreach_clicks_per_post_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM outreach_log WHERE status IN ('sent', 'followup') AND sent_at >= datetime('now', '-7 days')) AS TEXT)
  WHERE metric = 'outreach_emails_sent_7d';
END;
UPDATE metric_registry SET formula = 'human utm clicks in 7 days from the outreach channels (reach_signals source utm, metric clicks_human, channel bluesky, mastodon, x, linkedin, substack, threads or email)',
  baseline = '51 in the 7 days to 2026-10-14 (Mastodon 25, X 13, Bluesky 7, LinkedIn 6)'
WHERE metric = 'outreach_human_clicks_7d' AND instr(formula, 'outreach channels') = 0;
INSERT INTO fleet_tick (source) VALUES ('migration:outreach-clicks-scope');

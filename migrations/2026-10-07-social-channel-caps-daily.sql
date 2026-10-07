-- SOCIAL-CADENCE-DAILY-1 (2026-10-07, pillar reach, agent_issues 2107). Owner, 2026-10-07 10:13 and 13:02 local: "Why isn't
-- social media posting and Buffer queue kept continuously full? ... How will anyone know about sites, posts, papers?"
-- Measured before: since 2026-10-01 one Buffer post (LinkedIn, 10-06) and 5 Bluesky threads (last 10-03); 28 papers
-- published 09-30..10-06 reached no channel; Bluesky is held at 0 by the attention scorecard (STOP, 0 engagement);
-- LinkedIn, Mastodon and X read INSUFFICIENT (too few posts to judge). Decision: Mastodon and X go to the code's
-- maximum of 7 a week (one a day, spaced ~24h by the drain); LinkedIn stays at 3, because LinkedIn's API terms 3.1 bar
-- automated posting and the low cadence keeps the Buffer route defensible. The attention scorecard still multiplies
-- these caps by each channel's measured share and stops a channel nobody notices, so more posts on the unmeasured
-- channels buy a faster verdict, not permanent volume. Prediction: attention_per_post_7d leaves 0 or the scorecard
-- returns STOP for mastodon/x within 14 days; either outcome is a measurement the fleet does not have today.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM pipeline_flags WHERE key = 'social_channel_caps';
INSERT OR REPLACE INTO pipeline_flags (key, value, updated_at) VALUES
 ('social_channel_caps', '{"linkedin":3,"mastodon":7,"twitter":7}', datetime('now'));

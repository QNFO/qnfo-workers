-- LEARNER-ARMS-3 (2026-10-26, agent_issues 2722, charter pillar reach). The attention learner credits a Bluesky post from the 72 hours that open at its posted_at. A paper the Bluesky roll-up
-- thread carries keeps the posted_at of the Substack roll-up that announced it (dissemination_tracker mode rollup:bluesky) and the thread carries it days later, so its learner row was anchored
-- before the post existed (qnfo-audit, read 2026-10-26 17:50Z: 152 of the 193 Bluesky rows are anchored on 2026-10-14 and went out on Bluesky from 10-14 to 10-25, decoded from their record
-- keys; every row from 10-17 on reads no-data). 135 rows read no-data with a topic and a link slug, and every one of the 135 has reach_signals source utm rows (channel bluesky, its own
-- campaign) inside the window that opens at its real post time: Bluesky is the channel with the most human clicks (496 in 7 days, v_channel_impact_7d), and the learner learned from none of them.
-- qnfo-social 0.19.4 files new rows under the key's time. This file re-files the rows already stored: for a Bluesky roll-up row that is no-data or pending and whose record key (a TID, 13
-- base32-sortable characters, the first 11 hold the creation time in microseconds) decodes to a time more than an hour later than its stored posted_at and not in the future, posted_at and slot
-- follow the key, a roll-up thread post is filed with n_posts 2 (the next post of the thread is the fleet's own reply and is not engagement), and the row returns to pending, so the daily credit
-- step (07:30Z, up to 60 rows a run) credits it on its real window like a new row. Credited and not-arm rows are not touched (a credit is final; pillar 4 and q08 stay out of the arms).
-- The old values of every changed row are kept in bak_20261026_learner_anchor and the Rollback line restores them. The guard on the update is the old posted_at, so a replay (or a row the credit
-- step has since credited) changes nothing. Prediction: credited plus pending rows of the last 7 days (chosen_by not learner) rise from 12 to about 100 at apply and the contract issue-2722 passes
-- once three topic arms hold three credited rows each, about two daily credit runs later.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_learner_anchor
-- Rollback: UPDATE social_learner_posts SET posted_at = (SELECT b.old_posted_at FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key), slot = (SELECT b.old_slot FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key), n_posts = (SELECT b.old_n_posts FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key), status = (SELECT b.old_status FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key), reward_detail = (SELECT b.old_reward_detail FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key), credited_at = (SELECT b.old_credited_at FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key) WHERE post_key IN (SELECT post_key FROM bak_20261026_learner_anchor) AND status = 'pending' AND posted_at = (SELECT b.new_posted_at FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key)

CREATE TABLE IF NOT EXISTS bak_20261026_learner_anchor AS
SELECT x.post_key, x.posted_at AS old_posted_at, x.slot AS old_slot, x.n_posts AS old_n_posts, x.status AS old_status, x.reward_detail AS old_reward_detail, x.credited_at AS old_credited_at,
  x.new_ms,
  strftime('%Y-%m-%dT%H:%M:%S', x.new_ms / 1000, 'unixepoch') || '.' || printf('%03d', x.new_ms % 1000) || 'Z' AS new_posted_at,
  CASE WHEN CAST(strftime('%H', x.new_ms / 1000, 'unixepoch') AS INTEGER) >= 8 AND CAST(strftime('%H', x.new_ms / 1000, 'unixepoch') AS INTEGER) < 12 THEN 'eu-morning'
       WHEN CAST(strftime('%H', x.new_ms / 1000, 'unixepoch') AS INTEGER) >= 14 AND CAST(strftime('%H', x.new_ms / 1000, 'unixepoch') AS INTEGER) < 18 THEN 'us-morning'
       WHEN CAST(strftime('%H', x.new_ms / 1000, 'unixepoch') AS INTEGER) >= 18 AND CAST(strftime('%H', x.new_ms / 1000, 'unixepoch') AS INTEGER) < 22 THEN 'us-afternoon'
       ELSE NULL END AS new_slot,
  CASE WHEN EXISTS (SELECT 1 FROM dissemination_tracker d WHERE 'dissem:' || d.id = x.post_key AND d.mode = 'rollup:bluesky') THEN 2 ELSE x.n_posts END AS new_n_posts
FROM (
  SELECT l.*, CAST(strftime('%s', l.posted_at) AS INTEGER) * 1000 AS old_ms,
    ((instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 1, 1)) - 1) * 1125899906842624
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 2, 1)) - 1) * 35184372088832
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 3, 1)) - 1) * 1099511627776
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 4, 1)) - 1) * 34359738368
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 5, 1)) - 1) * 1073741824
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 6, 1)) - 1) * 33554432
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 7, 1)) - 1) * 1048576
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 8, 1)) - 1) * 32768
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 9, 1)) - 1) * 1024
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 10, 1)) - 1) * 32
   + (instr('234567abcdefghijklmnopqrstuvwxyz', substr(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19), 11, 1)) - 1)) / 1000 AS new_ms
  FROM social_learner_posts l
  WHERE l.channel = 'bluesky' AND l.chosen_by = 'scheduler' AND l.post_key LIKE 'dissem:%' AND l.status IN ('no-data', 'pending')
    AND l.bsky_uri LIKE 'at://%/app.bsky.feed.post/%' AND length(substr(l.bsky_uri, instr(l.bsky_uri, 'app.bsky.feed.post/') + 19)) = 13
    AND l.posted_at IS NOT NULL
) x
WHERE x.new_ms > x.old_ms + 3600000 AND x.new_ms <= CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 3600000 AND x.new_ms > 1672531200000;

UPDATE social_learner_posts SET
  posted_at = (SELECT b.new_posted_at FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key),
  slot = (SELECT b.new_slot FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key),
  n_posts = (SELECT b.new_n_posts FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key),
  status = 'pending',
  reward_detail = '{"re_anchored_from":"' || posted_at || '","basis":"bluesky record key time (LEARNER-ARMS-3, qnfo-social 0.19.4)"}',
  credited_at = NULL
WHERE post_key IN (SELECT post_key FROM bak_20261026_learner_anchor)
  AND status IN ('no-data', 'pending')
  AND posted_at = (SELECT b.old_posted_at FROM bak_20261026_learner_anchor b WHERE b.post_key = social_learner_posts.post_key);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f1:learner-anchor-repair',
  'a learner row anchored before its post existed teaches the posterior nothing; the post time is in the Bluesky record key, so the rows can be re-filed without inventing data',
  'agent_issues 2722: re-anchor the Bluesky roll-up rows of social_learner_posts at the record key time, slot and n_posts to match, status back to pending (migrations/2026-10-26-learner-anchor-repair.sql); qnfo-social 0.19.4 files new rows the same way',
  'read 2026-10-26: 152 of 193 Bluesky learner rows anchored on 2026-10-14, true post days 10-14 to 10-25 from the record keys; 135 no-data rows with a topic, all 135 with utm rows (channel bluesky) in the window of their real day; v_channel_impact_7d bluesky 8 posts, 496 human clicks, 62 per post; probe clause "credited or pending, chosen_by not learner, 7 days" read 12 of 20',
  'pending post-apply measurement',
  'social_learner_posts rows of channel bluesky, chosen_by scheduler, status no-data or pending with a TID record key (the old values are in bak_20261026_learner_anchor); no post text, schedule, channel or cap changes',
  'the Rollback line restores the old values from bak_20261026_learner_anchor; decision_log stays append-only',
  'a learner row is filed under the time its post went out, from the record key',
  'credited plus pending rows (7 days, not learner-chosen) about 100 at apply; three topic arms with three credited rows each within two daily credit runs; contract issue-2722 passes and closes',
  'the posterior learns from Bluesky, the channel with the most human clicks',
  'qnfo-social/learner-anchor.test.mjs; migrations/learner-anchor-repair.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'rem-a7-f1:learner-anchor-repair');

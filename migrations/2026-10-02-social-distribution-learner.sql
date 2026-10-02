-- SOCIAL-DISTRIBUTION-LEARNER-1 (2026-10-02, pillar: reach). qnfo-social 0.7.28. Idempotent (safe to re-run).
-- Not applied by the session that wrote it (no D1 writes from that session); to be applied to qnfo-audit at integration.
--
-- What it registers. metric_registry social_engagement_rate_30d: engagements per Bluesky post in its first 72h (likes +
-- reposts + quotes + replies from others), over posts since 2026-10-02 in the 30 days ending 74h ago. qnfo-social
-- computes it daily at 07:00Z (learnerEngagementRate) and creates the same row itself with INSERT OR IGNORE, so whichever
-- runs first defines it identically (qnfo-social/social-learner.test.mjs checks that this file and the worker agree).
-- Until a post's 72h window has closed the value is 'n/a: ...', which v_metric_trigger_state reads as unreadable, never 0.
--
-- Its trigger (METRIC-CLOSED-LOOP-1: a change that registers a metric adds its trigger). Threshold 0.2 engagements per
-- post: twice the 2026-10-01 audit baseline (1 reaction across the last 10 posts, about 0.1), the first doubling STRATEGY
-- 9 asks for. The lever is the learner and the queue it chooses from, never more posts: the weekly cap
-- (SOCIAL_WEEKLY_CAP, 2) and the owner-voice gates stay as they are.
--
-- No other change: no new worker, cron, binding or secret. The learner's own tables (social_learner_posts, ops_config
-- social_learner_pending) are created by qnfo-social on first use.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('social_engagement_rate_30d', 'fleet', 'leading',
  'mean, over Bluesky posts (social_threads + dissemination_tracker) posted since 2026-10-02 and in the 30 days ending 74h ago that have a social_engagements snapshot inside their first 72h, of likes + reposts + quotes + replies from others (a thread''s own first reply subtracted) at the last daily snapshot within 72h of posting; engagements per post, since Bluesky reports no impressions',
  'qnfo-audit.social_engagements x social_threads.post_uri / dissemination_tracker.post_id (qnfo-social SOCIAL-DISTRIBUTION-LEARNER-1, GET https://qnfo-social.q08.workers.dev/learner)',
  'about 0.1 (2026-10-01 audit: 1 reaction across the last 10 posts); reset from the first full week of 72h-window data (STRATEGY 6.3)',
  '>= 0.2 engagements per post, then x2 on the first-week baseline by 2026-12-31 (STRATEGY 9); never by volume or paid attention',
  'qnfo-social',
  'qnfo-social distribution learner: Thompson sampling over topic, format and time slot inside the cadence caps (STRATEGY 6.4)',
  'daily', '< 0.2', '< 0.05', 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'social_engagement_rate_30d', 'Reach gap: Bluesky posts earn under 0.2 engagements each in their first 72h', 'registry', 'lt', 0.2, 6,
  'Pillar reach. social_engagement_rate_30d is under 0.2 engagements per post (twice the 2026-10-01 baseline). Read GET https://qnfo-social.q08.workers.dev/learner and act on what it shows: (1) recent posts all no-data: the engagement collector is not snapshotting post ids (WATCHMAKER social-engagement, social_engagements rows per post_uri); fix collection first, the learner cannot learn without it. (2) The learner is off (enabled false) or its weekly update stalled (cloud_ops_events social-learner-update-*): turn ops_config social_learner_enabled back on or restart the update. (3) The queue holds only non-arm rows (pillar 4 or unlisted topics, see pending and the decision events): have the composer queue posts for the selected works (STRATEGY 2.4), each with its claim, test and status lines and a UTM link. (4) The posterior favours a topic or format the queue lacks (next_week_allocation): compose that kind of post for a selected work. Never raise SOCIAL_WEEKLY_CAP, never post outside the owner-voice gates, never buy attention. Definition of done: social_engagement_rate_30d in metric_registry is back at 0.2 or more; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).',
  'qnfo-social', 'agent_issues', 168, 1, 'SOCIAL-DISTRIBUTION-LEARNER-1 2026-10-02'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'social_engagement_rate_30d' AND x.enabled = 1);

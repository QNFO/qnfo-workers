-- WORK-WITH-ME-TRIGGERS-1 (2026-10-02, pillar: reach). METRIC-CLOSED-LOOP-1 rule: a change that registers a metric adds its
-- trigger. qnfo-fleet-dashboard 1.17.2 registers inbound_contacts_30d (distinct senders of tagged mail from
-- qnfo.org/work-with-me, 30d) and work_with_me_pageviews_30d (Cloudflare RUM views of the page, 30d) on its daily reach
-- ingest. Idempotent; applied by the session that wrote it. A trigger whose metric has no numeric value yet never fires
-- (v_metric_trigger_state.hit is NULL), so applying this before the first ingest is safe.
WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner, cooldown) AS (VALUES
  ('inbound_contacts_30d', 'Reach gap: the work-with-me page brought no contact in 30 days', 'registry', 'lt', 1, 6,
   'Pillar reach. No tagged message ([work-with-me:<offer>]) reached rowan.quni@qnfo.org in 30 days. Read work_with_me_pageviews_30d first: if the page is barely seen, link it from the next selected-works post and from the profile bios the fleet can write (Bluesky, GitHub); if it is seen but nobody writes, change one thing on the page (the order of the offers, or the first offer''s "how to start" line) and measure the next 30 days. Never add claims the record does not support (STRATEGY 2.2).',
   'qnfo-fleet-dashboard', 336),
  ('work_with_me_pageviews_30d', 'Reach gap: the work-with-me page is seen fewer than 30 times in 30 days', 'registry', 'lt', 30, 5,
   'Pillar reach. qnfo.org/work-with-me had under 30 RUM page views in 30 days. Link it from the home page hero, the about page and the selected-works posts; check that the sitemap lists it and that the page returns 200.',
   'qnfo-social', 336)
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority,
  v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy does not move the metric within 7 days, say so on the issue and try a different lever.',
  v.owner, 'agent_issues', v.cooldown, 1, 'WORK-WITH-ME-TRIGGERS-1 (migrations/2026-10-02-work-with-me-triggers.sql)'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

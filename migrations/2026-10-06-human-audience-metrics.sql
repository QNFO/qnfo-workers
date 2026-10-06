-- HUMAN-AUDIENCE-1 (2026-10-06, pillar: reach). Owner directive 2026-10-06: "do real human people that are not AI crawler
-- bots actually find out about and visit Quniverse pages, and are they interested enough to want to keep reading more?
-- Metrics say clear no so far." Measured live before this change (Cloudflare RUM GraphQL, 7 days to 2026-10-06, bot: 0,
-- dimensions requestHost x refererHost): 1,750 human-classed page loads on the fleet's hosts, of which 1,210 carried no
-- referrer (490 on papers.qnfo.org alone, where the fleet's own headless renders land), 30 came from a host outside the
-- fleet (t.co 10, www.google.com 20), and about 370 were a second page inside the public sites. pageviews_30d (6,570)
-- hides this. qnfo-fleet-dashboard 1.22.3 registers two metrics from that read every hour (refreshHumanAudience):
--   external_referred_pageviews_7d  readers who arrived from a host the fleet does not own (direct excluded on purpose)
--   continuation_pageviews_7d       page loads whose referrer is another public page: the reader clicked on
-- This file adds their triggers (METRIC-CLOSED-LOOP-1: a metric is registered with its trigger; the registry rows are
-- INSERT OR IGNOREd by the worker and here, so either order works). Idempotent; applied by the session that wrote it.
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key IN ('external_referred_pageviews_7d','continuation_pageviews_7d');
--   DELETE FROM metric_registry WHERE metric IN ('external_referred_pageviews_7d','continuation_pageviews_7d');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
  ('external_referred_pageviews_7d', 'fleet', 'leading',
   'Cloudflare Web Analytics (RUM) page loads in the last 7 days with the Exclude-bots filter (bot: 0) on the public properties (qnfo.org, papers.qnfo.org, archive/legal/ipatent.qnfo.org, q08.org, reading.q08.org, ask.qwav.tech, qwav.tech/.org) whose referrer host is outside every fleet-owned domain: readers who found a page from a search engine, a social platform or another site. Direct loads (no referrer) are excluded: that is where the fleet''s own renders and probes and the owner''s typed URLs land (qnfo-fleet-dashboard HUMAN-AUDIENCE-1, hourly)',
   'CF GraphQL rumPageloadEventsAdaptiveGroups filter bot: 0, dimensions requestHost refererHost (qnfo-fleet-dashboard, CF_TOKEN); breakdown in cloud_ops_events human-audience-<day>; series in reach_signals source cf-rum-human',
   '30 (2026-10-06 live read: t.co 10, www.google.com 20)', '>= 100 a week by 2026-12-31, rising (STRATEGY s6.3 engaged humans; s9 review gate)',
   'qnfo-social', 'trigger lt 50 -> METRIC-TRIGGER issue (migrations/2026-10-06-human-audience-metrics.sql)', 'hourly', '< 50', '< 20', 'MEASURED', 'computed'),
  ('continuation_pageviews_7d', 'fleet', 'leading',
   'Cloudflare Web Analytics (RUM) page loads in the last 7 days with the Exclude-bots filter (bot: 0) on the public properties whose referrer host is itself one of those public hosts: a second page in the same visit, so the reader chose to keep reading. The owner''s surfaces (fleet.qnfo.org, ideas.qnfo.org) and the workers.dev hosts count neither as pages nor as referrers (qnfo-fleet-dashboard HUMAN-AUDIENCE-1, hourly)',
   'CF GraphQL rumPageloadEventsAdaptiveGroups filter bot: 0, dimensions requestHost refererHost (qnfo-fleet-dashboard, CF_TOKEN); breakdown in cloud_ops_events human-audience-<day>; series in reach_signals source cf-rum-human',
   '370 (2026-10-06 live read; includes the owner''s own reading, which RUM cannot separate)', 'rising; >= 500 a week by 2026-12-31 (STRATEGY s6.3 attention, not hits)',
   'qnfo-gateway', 'trigger lt 150 (a floor below the live value, so a breach is a real decline) -> METRIC-TRIGGER issue (migrations/2026-10-06-human-audience-metrics.sql)', 'hourly', '< 200', '< 150', 'MEASURED', 'computed');

WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner) AS (VALUES
  ('external_referred_pageviews_7d', 'Reach gap: fewer than 50 human page loads a week arrived from outside the fleet', 'registry', 'lt', 50, 7,
   'Pillar reach (HUMAN-AUDIENCE-1, owner directive 2026-10-06). Fewer than 50 bot-filtered page loads in 7 days on the public sites came from a referrer the fleet does not own (search, social, other sites). This is the honest "do humans find us" number; pageviews_30d is not. Read SELECT meta FROM cloud_ops_events WHERE id LIKE ''human-audience-%'' ORDER BY ts DESC LIMIT 7 for the referrer breakdown, then pull the levers in order and measure each for 7 days: (1) is the per-channel distribution running: cloud_ops_events social-channels-<day> status ok and social_media_posts rows this week for buffer-linkedin, buffer-mastodon, buffer-x (DAILY-DISTRIBUTION-1, qnfo-social); if a channel is held at weekly-cap or spacing that is the STRATEGY s4 cadence, not a defect; (2) search: the top referrers are google and bing; every papers.qnfo.org paper page needs citation_title, citation_author, citation_publication_date and an absolute citation_pdf_url (Google Scholar inclusion, STRATEGY s4), the sitemap must list every paper page and the indexnow-submit workflow (cf-ops / .github/workflows/indexnow-submit.yml) submits new pages to Bing and partners; (3) outreach continuity: outreach_log sends on every weekday (qnfo-cloud-ops jobOutreach, 8 a day, 3 a domain, never raised); (4) the subscribe offer in distribution posts (agent_issues 1753). Never buy attention, never raise a cadence cap, never add a model call while a fleet_budget cap is breached.',
   'qnfo-social'),
  ('continuation_pageviews_7d', 'Reach gap: human readers stopped clicking on to a second page (under 150 a week)', 'registry', 'lt', 150, 6,
   'Pillar reach (HUMAN-AUDIENCE-1, owner directive 2026-10-06: are visitors interested enough to keep reading). Bot-filtered page loads whose referrer is another public page fell under 150 in 7 days (370 on 2026-10-06). Levers, in order: (1) check the read itself: cloud_ops_events human-audience-<day> rows exist for the last 2 days (a failed RUM read leaves the metric stale, never zero); (2) every paper page links to related papers (same selected-works pillar) and to the next and previous paper, and the home page leads with the selected works (qnfo-gateway, STRATEGY 2.4); (3) q08 and reading.q08.org pages link to each other and to their index (q08-signal-engine); (4) a page that lost its internal links after a template change (render_defects, paper_render_defect_pages).',
   'qnfo-gateway')
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority,
  v.action || ' Definition of done: the metric is back inside its threshold in metric_registry on two consecutive days; record the before and after values in issue_triage.close_evidence. If the remedy does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).',
  v.owner, 'agent_issues', 24, 1, 'HUMAN-AUDIENCE-1 (migrations/2026-10-06-human-audience-metrics.sql)'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key);

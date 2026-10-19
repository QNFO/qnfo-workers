-- REACH-METRIC-CADENCE-1 (2026-10-19, pillar core; issue 2192 METRIC-REGISTRY-STALENESS-1)
--
-- MEASURED 2026-10-19T14:00Z: 7 of 251 metrics read "300m stale vs 120m cadence": gsc_verified, search_referrals_30d, google_referrals_30d,
-- googlebot_sitemaps_ok, googlebot_requests_7d, googlebot_error_pct_7d and reach_ideas_shipped_30d. All seven were last written at
-- 2026-10-19T09:00:4x-59Z by one feeder, the qnfo-fleet-control reach tick, which the worker documents as "every 6 hours" (worker.js, REACH-IDEATION-6H and
-- the CRAWL-HEALTH-1 / SEARCH-REFERRALS-1 / GOOGLE-IDENTITY-DETECT-1 comments: "Runs on the reach tick (every 6 hours)"). Their registry rows declared
-- refresh_cadence '2h'. The declaration was false, not the feeder: a metric that is only written every 6 hours reads stale for 4 of every 6 hours by
-- its own declaration, and the stale-metric rule files this issue each time. The data (Search Console DNS verification, search and Google referral
-- counts over 30 days, Googlebot requests over 7 days, ideas shipped over 30 days) does not move on an hourly scale.
--
-- THE FIX is to make the declaration true: refresh_cadence '6h' (a canonical token), so the rule's twice-the-cadence threshold is 12 hours. Nothing is
-- hidden: the next reach tick (15:00Z) refreshes all seven, and if it stops, the rule files the issue 12 hours after the last write instead of never.
-- The metric values, targets and triggers are untouched.
--
-- Revert: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric IN (<the seven above>);
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric IN ('gsc_verified','search_referrals_30d','google_referrals_30d','googlebot_sitemaps_ok','googlebot_requests_7d','googlebot_error_pct_7d','reach_ideas_shipped_30d');

UPDATE metric_registry SET refresh_cadence = '6h'
 WHERE metric IN ('gsc_verified', 'search_referrals_30d', 'google_referrals_30d', 'googlebot_sitemaps_ok', 'googlebot_requests_7d', 'googlebot_error_pct_7d', 'reach_ideas_shipped_30d')
   AND refresh_cadence = '2h';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'the reach tick writes these seven metrics every 6 hours, as its own code comments say, so a 2h declaration is a false belief and not a stalled feeder',
  'REACH-METRIC-CADENCE-1: declare refresh_cadence 6h for gsc_verified, search_referrals_30d, google_referrals_30d, googlebot_sitemaps_ok, googlebot_requests_7d, googlebot_error_pct_7d and reach_ideas_shipped_30d',
  'metric_registry last_refreshed 2026-10-19T09:00:47-09:00:59Z for all seven (one tick); qnfo-fleet-control worker.js documents the reach tick as every 6 hours; issue 2192 text "300m stale vs 120m cadence" for exactly these seven',
  'merged to main (pending the parent session)',
  'seven metric_registry rows; the stale-metric rule now allows 12 hours before it files for these metrics',
  'UPDATE metric_registry SET refresh_cadence = ''2h'' for the seven metrics (Rollback header)',
  'a metric states how often it is really written, so a staleness filing means a stopped feeder',
  'metrics_stale_count = 0 within 7 h',
  'none', 'metric_registry, qnfo-fleet-control worker.js comments and cron table, cloud_ops_events'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REACH-METRIC-CADENCE-1: declare refresh_cadence 6h') = 1);

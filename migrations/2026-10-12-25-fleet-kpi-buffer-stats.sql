-- FLEET-KPI-1 (2026-10-12, pillar reach; owner request: "Fleet dashboard needs more metrics and performance indicators,
-- including total open issues and more granular analytics/impressions ... tied into social accounts and Buffer").
-- qnfo-fleet-dashboard 1.30.0 serves fleet.qnfo.org/kpi and /api/kpi from tables that already exist; this file adds the one
-- number that was not registered anywhere:
--   buffer_posts_with_stats_7d   Buffer posts that have at least one per-post statistic collected in the last 7 days
--                                (social_engagements, platform 'buffer', any metric but auth_status). 0 is a measurement.
-- Measured 2026-10-12: 0. The fleet posts through Buffer (13 published buffer-* rows in social_media_posts) but the only
-- statistics collector runs in qnfo-cloud-ops, which has no Buffer token (cloud_ops_events job engagement: "buffer":"no token").
-- Trigger exemption (METRIC-CLOSED-LOOP-1): agent_issues 2374 (BUFFER-POST-STATS-1) carries this gap with a code-task for
-- qnfo-social and a d1-query probe on the same rows (remediation_contracts class issue-2374); a trigger on this metric would
-- file the same gap a second time. The Metrics tab shows the value on every load, and attention_events_7d (its own trigger)
-- falls when Buffer rows stop arriving after they have started.
-- Every other figure on the tab is computed at request time from its source table and is not a registry metric:
-- open_agent_issues, issues_open_over_24h, pageviews_30d, subscribers_growth_monthly, social_engagement_rate_30d and
-- code_task_success_rate_30d already cover those subjects with their own triggers.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS fleet_kpi_buffer_stats_tick; DELETE FROM metric_registry WHERE metric = 'buffer_posts_with_stats_7d';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('buffer_posts_with_stats_7d', 'fleet', 'leading', 'count of distinct social_engagements.post_id with platform buffer, a metric other than auth_status and collected_at in the last 7 days', 'qnfo-audit.social_engagements (shown at https://fleet.qnfo.org/kpi, JSON https://fleet.qnfo.org/api/kpi buffer.statistics_collector)', '0 on 2026-10-12 (no Buffer statistic was ever collected)', '>= 1 once agent_issues 2374 lands; then every Buffer post older than a day', 'qnfo-social', 'diagnostic carried by agent_issues 2374 (trigger exemption, see migrations/2026-10-12-25-fleet-kpi-buffer-stats.sql)', '1h', NULL, NULL, NULL, NULL, 'UNMEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS fleet_kpi_buffer_stats_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(DISTINCT post_id) FROM social_engagements WHERE platform = 'buffer' AND metric <> 'auth_status' AND collected_at >= date('now', '-7 days')) AS TEXT)
  WHERE metric = 'buffer_posts_with_stats_7d';
END;

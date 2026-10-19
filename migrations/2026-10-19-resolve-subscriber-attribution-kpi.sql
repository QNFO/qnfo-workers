-- SUBSCRIBER-ATTRIBUTION-KPI-1 (2026-10-19, RESOLVE-ALL-OPEN-1, agent_issues 2899, pillar reach)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS subscriber_attribution_metric_tick; DROP VIEW IF EXISTS v_subscriber_attribution_by_campaign; DELETE FROM metric_registry WHERE metric = 'subscribers_attributed_total';
--
-- qnfo-subscribers SUBSCRIBE-UTM-METRIC-1 writes a snapshot of confirmed subscribers by utm campaign into reach_signals
-- (source 'subscriber-attribution', metric 'subscribers_confirmed_attributed') and nothing read it. This adds the consumer:
-- a view by campaign/source for the dashboard and a metric, subscribers_attributed_total, refreshed on the hourly
-- fleet_tick (first 10 minutes, same pattern as digest_transport_metric_tick). Trigger exemption: the metric is an
-- attribution breakdown of subscribers_growth_monthly, whose trigger (METRIC-TRIGGER-341) already acts on the shortfall.

CREATE VIEW IF NOT EXISTS v_subscriber_attribution_by_campaign AS
SELECT entity_id AS campaign, channel, SUM(value) AS subscribers, MAX(date) AS snapshot_date
  FROM reach_signals
 WHERE source = 'subscriber-attribution' AND metric = 'subscribers_confirmed_attributed'
 GROUP BY entity_id, channel;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner,
  disposition_actor, refresh_cadence, state, refresh_class) VALUES
('subscribers_attributed_total', 'outcome', 'leading',
 'sum of reach_signals.value for source subscriber-attribution, metric subscribers_confirmed_attributed: confirmed subscribers whose sign-up carried a utm_campaign or utm_source (by campaign: v_subscriber_attribution_by_campaign)',
 'qnfo-audit.reach_signals (qnfo-subscribers SUBSCRIBE-UTM-METRIC-1 snapshot)', '0 on 2026-10-19', '> 0', 'qnfo-subscribers',
 'exempt from its own trigger: subscribers_growth_monthly (METRIC-TRIGGER-341) acts on the shortfall', 'hourly', 'PENDING', 'd1-trigger');

CREATE TRIGGER IF NOT EXISTS subscriber_attribution_metric_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COALESCE(SUM(value), 0) FROM reach_signals
                       WHERE source = 'subscriber-attribution' AND metric = 'subscribers_confirmed_attributed') AS TEXT)
  WHERE metric = 'subscribers_attributed_total';
END;

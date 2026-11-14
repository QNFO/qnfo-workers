-- GA4-CONSENT-SHARE-1 (2026-11-14, charter pillar reach; issue 11799). BP26-CONSENT-1 (2026-11-04) loads Google Analytics only after a visitor presses Allow, so GA4 host page views fell from 233-591 a day to
-- 0-14 while the cookie-free Cloudflare RUM counter (cf-rum-human) held about 3000 a day. This metric is the 7-day share GA4 sees of the cookie-free page views: a share near 0 with RUM steady is the consent gate,
-- a share that drops from a higher value or GA4 rows that stop while consent is allowed is a tag fault. It is informational (no trigger): the dashboard headline already says it counts visitors who allowed analytics.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'ga4-consent-share-hourly'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'ga4-consent-share'; UPDATE metric_registry SET state = 'RETIRED' WHERE metric = 'ga4_consent_share_7d';

-- CAUSE-MAPPED: ga4_consent_share_7d is informational with no trigger; the consent gate (BP26-CONSENT-1) makes a low share expected, and the GA4 ingest freshness is already read by the ga4-ingest cloud_ops_events probe.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES ('ga4_consent_share_7d', 'external', 'target', 'SUM(reach_signals ga4 host screenPageViews, 7d) / SUM(reach_signals cf-rum-human host pageviews, 7d)', 'qnfo-audit.reach_signals (GA4-CONSENT-SHARE-1)', '>= 0', 'manager:reach', 'agent:ga4-consent-share', 'hourly', 'MEASURED', NULL, NULL);

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('ga4-consent-share', 'GA4-CONSENT-SHARE-1: refresh the GA4 share of cookie-free page views (SQL only)', 'workflow', '{"steps": [{"type": "sql", "name": "refresh", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = printf(''%.4f'', COALESCE((SELECT SUM(value) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'' AND date >= date(''now'',''-7 days'')), 0) * 1.0 / NULLIF((SELECT SUM(value) FROM reach_signals WHERE source = ''cf-rum-human'' AND entity_type = ''host'' AND metric = ''pageviews'' AND date >= date(''now'',''-7 days'')), 0)), last_refreshed = datetime(''now'') WHERE metric = ''ga4_consent_share_7d''"}]}', 30000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('ga4-consent-share-hourly', '47 * * * *', 'ga4-consent-share', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

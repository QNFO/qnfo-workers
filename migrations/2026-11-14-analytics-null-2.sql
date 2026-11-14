-- ANALYTICS-NULL-2 (2026-11-14, charter pillar reach; issue #11829, the two review-gate findings on PR 11827). The GA4 export lands one to two days late, so with cookie-free
-- page views present and no GA4 rows yet, ga4_consent_share_7d read 0.0000: a measured-looking zero for "not landed yet". It now reads NULL until a GA4 row exists in the window.
-- The task is replaced without touching its enabled flag (INSERT OR IGNORE, then UPDATE of definition and version only), so an operator who disabled it keeps it disabled
-- when this file is applied again. The merged files are not edited (MIGRATION-NO-CLOBBER-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET enabled = 0 WHERE id = 'ga4-consent-share';

INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('ga4-consent-share', 'GA4-CONSENT-SHARE-1: refresh the GA4 share of cookie-free page views (SQL only)', 'workflow', '{"steps": []}', 30000, 1, 0, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

UPDATE fleet_tasks SET definition = '{"steps": [{"type": "sql", "name": "refresh", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CASE WHEN COALESCE((SELECT SUM(value) FROM reach_signals WHERE source = ''cf-rum-human'' AND entity_type = ''host'' AND metric = ''pageviews'' AND date >= date(''now'',''-7 days'')), 0) > 0 AND EXISTS (SELECT 1 FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'' AND date >= date(''now'',''-7 days'')) THEN printf(''%.4f'', (SELECT SUM(value) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'' AND date >= date(''now'',''-7 days'')) * 1.0 / (SELECT SUM(value) FROM reach_signals WHERE source = ''cf-rum-human'' AND entity_type = ''host'' AND metric = ''pageviews'' AND date >= date(''now'',''-7 days''))) ELSE NULL END, last_refreshed = datetime(''now'') WHERE metric = ''ga4_consent_share_7d''"}]}', version = 3, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = 'ga4-consent-share';

UPDATE metric_registry SET last_value = NULL, last_refreshed = datetime('now') WHERE metric = 'ga4_consent_share_7d' AND last_value = '0.0000' AND NOT EXISTS (SELECT 1 FROM reach_signals WHERE source = 'ga4' AND entity_type = 'host' AND metric = 'screenPageViews' AND date >= date('now','-7 days'));

-- SEO-METRIC-REFRESH-BRIDGE-1 (agent_issues 2192, GitHub #1503, charter pillar autonomy).
-- qnfo-gateway seoPublishMetrics upserts analytics_dash_meta each hourly tick, but no live trigger
-- forwards those readings to metric_registry (four SEO rows last refreshed 2026-10-25T09:45:00Z).
-- Do not backfill: analytics_dash_meta has no timestamp proving when its cached value was measured.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS seo_metric_refresh_ai; DROP TRIGGER IF EXISTS seo_metric_refresh_au; DELETE FROM remediation_contracts WHERE class = 'fm-seo-metric-refresh-bridge'; DELETE FROM failure_modes WHERE fm_key = 'seo-metric-refresh-bridge';
-- spof-review: no new executor; the gateway hourly publisher remains the source and issue-2192 independently audits freshness.

CREATE TRIGGER IF NOT EXISTS seo_metric_refresh_ai
AFTER INSERT ON analytics_dash_meta
WHEN NEW.key IN ('seo_crawl_googlebot_7d', 'seo_crawl_bingbot_7d', 'seo_indexnow_engines_ok', 'seo_sitemap_urls')
BEGIN
  UPDATE metric_registry
  SET last_value = NULLIF(trim(NEW.value), ''),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
      state = CASE WHEN NULLIF(trim(NEW.value), '') IS NULL THEN 'UNMEASURED' ELSE 'MEASURED' END
  WHERE metric = NEW.key;
END;

CREATE TRIGGER IF NOT EXISTS seo_metric_refresh_au
AFTER UPDATE OF value ON analytics_dash_meta
WHEN NEW.key IN ('seo_crawl_googlebot_7d', 'seo_crawl_bingbot_7d', 'seo_indexnow_engines_ok', 'seo_sitemap_urls')
BEGIN
  UPDATE metric_registry
  SET last_value = NULLIF(trim(NEW.value), ''),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
      state = CASE WHEN NULLIF(trim(NEW.value), '') IS NULL THEN 'UNMEASURED' ELSE 'MEASURED' END
  WHERE metric = NEW.key;
END;

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('seo-metric-refresh-bridge', 'SEO readings remain stale in metric_registry while the gateway publishes metadata',
   'seoPublishMetrics writes analytics_dash_meta but the registry has no metadata refresh bridge',
   'SEO-METRIC-REFRESH-BRIDGE-1: forward new and repeated gateway readings through scoped insert and update triggers',
   'both SEO refresh triggers exist and the four registry rows have a reading within 120 minutes',
   'fm-seo-metric-refresh-bridge', '2026-11-01', 2192,
   'a metadata bridge is absent or the gateway hourly publisher stops writing',
   'four SEO metrics remain stale despite metadata values being present',
   'SEO registry freshness and metric breach evaluation');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES
  ('fm-seo-metric-refresh-bridge', NULL, 'SEO-METRIC-REFRESH-BRIDGE-1', 'failure-mode detector',
   'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name IN (''seo_metric_refresh_ai'', ''seo_metric_refresh_au'')) = 2 AND (SELECT COUNT(*) FROM metric_registry WHERE metric IN (''seo_crawl_googlebot_7d'', ''seo_crawl_bingbot_7d'', ''seo_indexnow_engines_ok'', ''seo_sitemap_urls'') AND julianday(last_refreshed) >= julianday(''now'', ''-120 minutes'')) = 4 THEN ''ok'' ELSE ''pending: SEO registry refresh bridge'' END AS observed',
   'd1-query', 3, 'qnfo-gateway', 1, 'active', 'failure-mode');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:issue-2192',
  'An unchanged gateway reading is still a new measurement; cached metadata alone does not prove freshness.',
  'SEO-METRIC-REFRESH-BRIDGE-1: bridge scoped gateway metadata inserts and updates to metric_registry.',
  'Live qnfo-audit 2026-11-01: issue 2192 lists 14 stale metrics; four SEO registry rows date to October 25, metadata holds 522/618/3/715, and analytics_dash_meta has no triggers.',
  'Await the next gateway reading and the independent issue-2192 freshness probe; do not close on migration alone.',
  'Two triggers on analytics_dash_meta, four existing registry metrics, one failure mode and its detector.',
  'Drop seo_metric_refresh_ai and seo_metric_refresh_au; remove the added detector and failure mode; retain measurements and this append-only decision.',
  'Every gateway SEO reading reaches the registry, including unchanged counts and explicitly unknown values.',
  'Four of the 14 observed stale rows recover after the next hourly gateway publish; other stale writers remain visible.',
  'No direct reach gain; SEO diagnosis uses current readings.',
  'Live registry, metadata and trigger schema reads; offline insert/upsert/unknown/rollback tests.'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SEO-METRIC-REFRESH-BRIDGE-1:') = 1);

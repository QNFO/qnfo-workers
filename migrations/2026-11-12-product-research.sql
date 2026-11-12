-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS product_research_tick; DROP VIEW IF EXISTS v_product_research_freshness; DELETE FROM analytics_metric_triggers WHERE metric_key = 'product_research_stale_apps' AND notes = 'PRODUCT-RESEARCH-1 2026-11-12'; DELETE FROM metric_breach_cause WHERE metric_key = 'product_research_stale_apps'; DELETE FROM metric_registry WHERE metric = 'product_research_stale_apps'; DELETE FROM ops_config WHERE key IN ('OWNER_DIRECTIVE_2026_11_12_PRODUCT_RESEARCH_1', 'app_research'); DROP TABLE IF EXISTS product_research_apps; DROP TABLE IF EXISTS product_research_runs;
-- spof-review: two tables, one view, one measuring trigger on the fleet_tick heartbeat, one metric with its trigger, two ops_config rows. The research runs inside
-- personal-companion's existing hourly tick (no new cron, binding, host or credential); a stopped trigger delays detection only.
-- CAUSE-MAPPED: product_research_stale_apps maps to the existing cause key `code-loop` in this same file.
--
-- PRODUCT-RESEARCH-1 (Rowan, 2026-11-12, charter pillar autonomy): "Research and development and competitive analysis is a key part of improving a
-- product ... These virtual agents should be doing what a product manager would do." _shared/product-research.js reads best-practice and competitor
-- sources once a day per app, diffs them against what the app ships and the backlog, files one agent_issues row per gap for the code loop, and writes
-- a dated run here. A new app is registered in product_research_apps by the run itself; the view lists every app whose last good run is older than 26 hours.

CREATE TABLE IF NOT EXISTS product_research_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, app TEXT NOT NULL, run_at TEXT NOT NULL, version TEXT, sources_ok INTEGER NOT NULL DEFAULT 0, sources_failed INTEGER NOT NULL DEFAULT 0, sources_json TEXT, gaps_json TEXT, ideas_json TEXT, players_json TEXT, usage_json TEXT, digest TEXT, filed INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE INDEX IF NOT EXISTS product_research_runs_app ON product_research_runs(app, run_at);
CREATE TABLE IF NOT EXISTS product_research_apps (app TEXT PRIMARY KEY, host TEXT, registered_at TEXT NOT NULL, note TEXT);
INSERT OR IGNORE INTO product_research_apps (app, host, registered_at, note) VALUES
 ('companion', 'me.q08.org', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seeded by migrations/2026-11-12-product-research.sql'),
 ('mind', 'mind.q08.org', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'seeded by migrations/2026-11-12-product-research.sql');

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_12_PRODUCT_RESEARCH_1',
  'Research and development and competitive analysis is a key part of improving a product. This is all what should be baked in here. These virtual agents should be doing what a product manager would do. Implement it, code it.',
  'PRODUCT-RESEARCH-1: _shared/product-research.js (personal-companion hourly tick), product_research_runs, v_product_research_freshness, metric product_research_stale_apps, companion self-check research-stale, _shared/product-research.test.mjs (every phone-journey app is registered).');
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('app_research', 'on', 'PRODUCT-RESEARCH-1 kill switch: off stops the daily product research; the freshness metric then breaches by design.');

CREATE VIEW IF NOT EXISTS v_product_research_freshness AS
  SELECT a.app, a.host, MAX(CASE WHEN r.error IS NULL THEN r.run_at END) AS last_ok,
    CAST(ROUND((julianday('now') - julianday(MAX(CASE WHEN r.error IS NULL THEN r.run_at END))) * 24) AS INTEGER) AS age_h
  FROM product_research_apps a LEFT JOIN product_research_runs r ON r.app = a.app
  GROUP BY a.app, a.host
  HAVING last_ok IS NULL OR (julianday('now') - julianday(last_ok)) * 24 > 26;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('product_research_stale_apps', 'system', 'guard', 'COUNT(*) FROM v_product_research_freshness: registered apps with no good product research run in 26 hours (PRODUCT-RESEARCH-1)', 'qnfo-audit.v_product_research_freshness', '2 on 2026-11-12 before the first run', '= 0', 'personal-companion', 'analytics_metric_triggers product_research_stale_apps', '1h', '> 0', '> 2', 'UNMEASURED', 'd1-trigger');

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('product_research_stale_apps', 'code-loop', 'PRODUCT-RESEARCH-1: the daily product research did not run for an app');

CREATE TRIGGER IF NOT EXISTS product_research_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM v_product_research_freshness) AS TEXT)
  WHERE metric = 'product_research_stale_apps';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'product_research_stale_apps', 'PRODUCT-RESEARCH-1: the daily product research did not run for an app', 'registry', 'gt', 0, 2,
  'Pillar personal. Read SELECT * FROM v_product_research_freshness and the latest product_research_runs.error for the app. Find why personal-companion PR.researchTick did not write a good run (a source fetch that throws, a D1 error, ops_config app_research = off) and fix it in _shared/product-research.js, then regenerate the inline block with node scripts/inline-pipeline-modules.mjs. Definition of done: product_research_stale_apps = 0 at a refresh.
code-task: repo=qnfo-workers path=personal-companion/worker.js
code-anchor: async function companionUsage(db, nowMs) {',
  'personal-companion', 'agent_issues', 6, 1, 'PRODUCT-RESEARCH-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'product_research_stale_apps' AND enabled = 1);

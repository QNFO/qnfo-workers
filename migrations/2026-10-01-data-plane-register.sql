-- DATA-PLANE-REGISTER-1 (2026-10-01): dispositions for declared data planes that have no producer.
-- Covers #1638, #1645, #1650, #1651, #1656 and #1657; see docs/DATA-PLANE-DISPOSITIONS-2026-10-01.md. Applied live.
-- Audits that find an empty table should check this register before filing a "dead table" issue.
CREATE TABLE IF NOT EXISTS data_plane_register (db TEXT NOT NULL, tbl TEXT NOT NULL, producer TEXT, live_readers TEXT,
  rows_at_decision INTEGER, disposition TEXT NOT NULL, superseded_by TEXT, issue_id INTEGER, decided_at TEXT DEFAULT (datetime('now')),
  evidence TEXT, PRIMARY KEY (db, tbl));
INSERT OR REPLACE INTO data_plane_register (db, tbl, producer, live_readers, rows_at_decision, disposition, superseded_by, issue_id, evidence) VALUES
  ('qnfo-graph', 'qacp_agents', 'none in repo', 'none', 1, 'UNBUILT-DESIGN', '', 1638, 'Agent-communication protocol schema; no worker in the repo writes or reads qacp_*. Inter-worker calls use service bindings and HTTP routes (taxonomy consumer evidence).'),
  ('qnfo-graph', 'qacp_schemas', 'none in repo', 'none', 5, 'UNBUILT-DESIGN', '', 1638, 'see qacp_agents'),
  ('qnfo-graph', 'qacp_trust', 'none in repo', 'none', 1, 'UNBUILT-DESIGN', '', 1638, 'see qacp_agents'),
  ('qnfo-audit', 'experiments', 'none in repo (4 manual rows, last 2026-09-02)', 'none', 4, 'UNBUILT-DESIGN', 'metric_triggers + fleet_worker_census + deploy gates', 1645, 'No A/B consumer exists. Fleet changes are measured by metric triggers (METRIC-TRIGGER-LOOP-1), the daily worker census and the deploy gates, not by controlled experiments.'),
  ('portfolio-state', 'pipeline_runs', 'none in repo', 'none', 1, 'UNBUILT-DESIGN', '', 1650, 'No worker writes pipeline_runs. program_registry is read live by qnfo-cloud-ops and qnfo-infra; pipeline execution is not a live process in portfolio-state.'),
  ('living-paper', 'citations', 'none in repo', 'qnfo-fleet-dashboard (until 1.7.44)', 0, 'SUPERSEDED', 'qnfo-audit.citation_stats (openalex cited_by_count, crossref, zenodo; qnfo-paper-indexer daily)', 1651, 'Dashboard re-pointed to citation_stats in 1.7.44 (LINEAGE-TRUTH-1).'),
  ('living-paper', 'citation_edges', 'none in repo', 'none', 4, 'SUPERSEDED', 'qnfo-audit.citation_stats', 1651, 'see citations'),
  ('living-paper', 'paper_versions', 'none in repo', 'qnfo-fleet-dashboard (until 1.7.44)', 1, 'SUPERSEDED', 'qnfo-audit.paper_revision_log (new_doi) + citation_stats metric=versions (Zenodo relations.version)', 1651, '41 papers with a published new version; top papers have 5-9 Zenodo versions.'),
  ('qnfo-audit', 'prompt_provenance', 'none in repo (4 rows, last 2026-07-13)', 'none', 4, 'SUPERSEDED', 'qnfo-audit.ops_ai_log (per-call model/tokens) + AI Gateway caller metadata; research claims traced via research_queue + cloud_ops_events', 1656, 'meta_claims and meta_changes stay live (written by qnfo-kaizen).'),
  ('qnfo-cms', 'content', 'none in repo', 'none', 0, 'UNBUILT-DESIGN', 'qnfo-cms.content_entries (145 rows; ad-hoc reads only, via qnfo-ops ops_d1_query db=cms)', 1657, 'The CMS publish lane (publish_queue) last ran 2026-06-25 and has no live producer; content was never populated. No live worker reads content or content_entries.'),
  ('qnfo-cms', 'publish_queue', 'none in repo (last 2026-06-25)', 'none', 8, 'RETIRED-LANE', '', 1657, 'see content');

-- CAPABILITY-LOOP-1 (#1675). Adds three steps to the daily fleet task cf-catalog-sync:
--   1. prune capability_catalog rows for services that left service_registry;
--   2. re-sync capability_catalog from service_registry (previously a one-off snapshot);
--   3. a daily cf-capability-discovery event listing the not_considered and proposed Cloudflare products.
UPDATE fleet_tasks SET definition = json_insert(json_insert(json_insert(definition,
    '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "DELETE FROM capability_catalog WHERE service NOT IN (SELECT service FROM service_registry)"}')),
    '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "INSERT OR REPLACE INTO capability_catalog (service, kind, version, base_url, capabilities, routes, tools, models, state, source, synced_at) SELECT service, kind, version, base_url, capabilities, routes, tools, models, state, ''service_registry'', datetime(''now'') FROM service_registry"}')),
    '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''cf-catalog-discovery-''||strftime(''%Y%m%d'',''now''), datetime(''now''), ''cf-capability-discovery'', ''CAPABILITY-LOOP-1: ''||(SELECT COUNT(*) FROM capability_catalog)||'' fleet services in capability_catalog (re-synced from service_registry); Cloudflare products not yet considered: ''||COALESCE((SELECT group_concat(slug, '', '') FROM cloudflare_capability_catalog WHERE status=''not_considered''),''none'')||''; proposed: ''||COALESCE((SELECT group_concat(slug, '', '') FROM cloudflare_capability_catalog WHERE status=''proposed''),''none''), NULL, ''cf-catalog-sync'', ''ok''"}')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = 'cf-catalog-sync' AND instr(definition, 'CAPABILITY-LOOP-1') = 0;

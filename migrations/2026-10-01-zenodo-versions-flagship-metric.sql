-- ZENODO-VERSIONS-FLAGSHIP-METRIC-1 (#1621, 2026-10-01). Applied live.
--
-- The problem. metric_registry.zenodo_versions_per_flagship read 1 (refreshed 2026-09-29), but nothing computed it:
--   - the metric-refresh task covered only D1-derivable metrics;
--   - "flagship" was not defined anywhere.
-- Zenodo itself showed the top 5 papers by downloads at 8, 5, 5, 9 and 5 versions (relations.version index + 1).
-- 41 papers carry a published revision (paper_revision_log.new_doi). DataCite confirms 10.5281/zenodo.22758789 is
-- findable at version 2.0.0, IsVersionOf 10.5281/zenodo.21208367.
--
-- The fix:
--   - qnfo-paper-indexer 3.0.6 records citation_stats (source=zenodo, metric=versions) daily.
--   - This adds a second step to fleet_tasks 'metric-refresh': min(versions) over the 10 most-downloaded papers.
--     A flagship with no versions row counts as 1. The step writes only once versions rows exist.
UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST(CAST((SELECT MIN(COALESCE(v,1)) FROM (SELECT (SELECT MAX(c2.value) FROM citation_stats c2 WHERE c2.doi = d.doi AND c2.source=''zenodo'' AND c2.metric=''versions'' AND c2.collected_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-3 days'')) AS v FROM (SELECT doi, MAX(value) AS dl FROM citation_stats WHERE source=''zenodo'' AND metric=''downloads'' AND collected_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-3 days'') GROUP BY doi ORDER BY dl DESC LIMIT 10) d)) AS INTEGER) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'',''now''), state = ''OK'', formula = ''min(Zenodo versions) over the 10 most-downloaded papers (flagships); versions = relations.version index+1 recorded by qnfo-paper-indexer in citation_stats metric=versions; a flagship with no versions row counts as 1'' WHERE metric = ''zenodo_versions_per_flagship'' AND (SELECT COUNT(*) FROM citation_stats WHERE source=''zenodo'' AND metric=''versions'' AND collected_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-3 days'')) > 0"}')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = 'metric-refresh' AND instr(definition, 'zenodo_versions_per_flagship') = 0;

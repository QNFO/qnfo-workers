-- NOZ-DOI-1 (2026-10-11, charter pillar: reach). Owner decision: the owner's deposit-registrar account is blocked and every
-- 10.5281 DOI is dead, so nothing may measure, score or show data collected from it. Four metrics counted that data:
-- zenodo_versions_per_flagship, zenodo_views_total, zenodo_downloads_total and selected_works_citation_coverage (the seven
-- selected works are all 10.5281 DOIs). Their collectors are removed in the code PRs of the same change (qnfo-cloud-ops, qnfo-paper-indexer,
-- qnfo-fleet-control, qnfo-fleet-dashboard 1.28.2); this file retires the registry rows, their triggers and the stored reach rows.
-- Convention followed: a metric is removed from metric_registry and analytics_metric_triggers (2026-10-06-attention-loop.sql and
-- siblings), an impact threshold is marked RETIRED in its target (charterEvaluate reads /^retired/i), a backup table is created
-- first (MIGRATION-RUNNER-1). Not touched: the zenodo_stats table, citation_stats, and every doi / zenodo_doi / zenodo_url column
-- (internal join keys). No open agent_issues row names these metrics (read 2026-10-11), so none is left dangling.
-- The fleet_tasks metric-refresh steps that UPDATE these rows become no-ops once the rows are gone.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: INSERT OR REPLACE INTO metric_registry SELECT * FROM bak_noz_metric_registry_20261011; INSERT OR REPLACE INTO analytics_metric_triggers SELECT * FROM bak_noz_amt_20261011; INSERT OR REPLACE INTO impact_thresholds SELECT * FROM bak_noz_impact_20261011; INSERT OR REPLACE INTO reach_signals SELECT * FROM bak_noz_reach_20261011;
-- BACKUP: bak_noz_metric_registry_20261011

CREATE TABLE IF NOT EXISTS bak_noz_metric_registry_20261011 AS SELECT * FROM metric_registry WHERE metric IN ('zenodo_versions_per_flagship', 'zenodo_views_total', 'zenodo_downloads_total', 'selected_works_citation_coverage');

CREATE TABLE IF NOT EXISTS bak_noz_amt_20261011 AS SELECT * FROM analytics_metric_triggers WHERE metric_key IN ('zenodo_versions_per_flagship', 'zenodo_views_total', 'zenodo_downloads_total', 'selected_works_citation_coverage');

CREATE TABLE IF NOT EXISTS bak_noz_impact_20261011 AS SELECT * FROM impact_thresholds WHERE metric IN ('zenodo_versions_per_flagship', 'zenodo_views_total', 'zenodo_downloads_total', 'selected_works_citation_coverage');

CREATE TABLE IF NOT EXISTS bak_noz_reach_20261011 AS SELECT * FROM reach_signals WHERE lower(source) = 'zenodo';

DELETE FROM analytics_metric_triggers WHERE metric_key IN ('zenodo_versions_per_flagship', 'zenodo_views_total', 'zenodo_downloads_total', 'selected_works_citation_coverage') AND (SELECT COUNT(*) FROM bak_noz_amt_20261011) > 0;

DELETE FROM metric_registry WHERE metric IN ('zenodo_versions_per_flagship', 'zenodo_views_total', 'zenodo_downloads_total', 'selected_works_citation_coverage') AND (SELECT COUNT(*) FROM bak_noz_metric_registry_20261011) > 0;

UPDATE impact_thresholds SET target = 'RETIRED 2026-10-11 (NOZ-DOI-1): the deposit registrar is gone, so versions per flagship is no longer measured' WHERE metric = 'zenodo_versions_per_flagship' AND target NOT LIKE 'RETIRED%';

DELETE FROM reach_signals WHERE lower(source) = 'zenodo' AND (SELECT COUNT(*) FROM bak_noz_reach_20261011) > 0;

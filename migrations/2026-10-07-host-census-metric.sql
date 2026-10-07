-- HOST-CENSUS-1 (2026-10-07, pillar core). Registers public_hosts_broken, written by scripts/host_census.py (run inside
-- scripts/remediation_consumer.py on the GitHub runner, every 6h): the number of the account's public hostnames that are
-- paused, have no address record, serve a parking page, or answer 5xx/404/TLS/DNS errors from outside Cloudflare. The
-- census files and closes HOST-CENSUS-BROKEN-1 itself, so no analytics_metric_triggers row (it would file a duplicate);
-- the runner's own liveness is already guarded by runtime_verified_share_24h. Idempotent (INSERT OR IGNORE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'public_hosts_broken';
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('public_hosts_broken', 'surface', 'guard', 'Count of account hostnames (zone apexes, A/AAAA/CNAME names, Workers route hosts) that are zone-paused, lack an address record, are parked, or fail from the GitHub runner (5xx, 404, TLS, DNS, timeout); 410 Gone counts as intended', 'qnfo-audit cloud_ops_events kind host-census', 'by hand on 2026-10-07: at least 17 (12 retired qnfo.org hosts 522, qwave.tech/www/q-wave.tech parked, ipatent.me no record, empoweringchange.today paused)', '0', 'host-census', 'scripts/host_census.py (agent_issues HOST-CENSUS-BROKEN-1)', '6h', '>= 1', '>= 5', 'UNMEASURED', NULL);

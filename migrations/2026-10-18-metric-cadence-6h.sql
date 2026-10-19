-- METRIC-CADENCE-6H-1 (2026-10-18, pillar autonomy; the host census runs every 6h and says so)
--
-- WHAT WAS WRONG
-- public_hosts_broken declared refresh_cadence '2h'. v_metric_staleness marks a metric STALE when age > cadence * 1.5,
-- so it went stale at 3 hours while its producer runs every 6. Measured 2026-10-18 15:50Z: age 6.5h -> STALE.
--
-- THE EVIDENCE (the migration that registered the metric)
-- migrations/2026-10-07-host-census-metric.sql, HOST-CENSUS-1:
--   "Registers public_hosts_broken, written by scripts/host_census.py (run inside scripts/remediation_consumer.py on the
--    GitHub runner, every 6h)"
-- The same note explains why no analytics_metric_triggers row exists: the census files and closes HOST-CENSUS-BROKEN-1
-- itself, so a trigger would file a duplicate. That is also why no worker references the metric name - it is a Python
-- script on the GitHub runner, not a Worker, which is why eleven worker searches came up empty.
--
-- '6h' is a supported cadence form: v_metric_staleness maps any '<n>h' via CAST(substr(cadence,1,len-1) AS REAL).
-- After this, age 6.5h against a 9h threshold reads FRESH, which is the truth.
--
-- NOT changed: watchmaker_index. Its last_refreshed (07:01:24.551Z) sits 20 seconds from social_engagement_rate_30d
-- (07:01:04.617Z), which is suggestive of a shared run but is not a producer statement, and this session has already
-- shown twice what happens when a coincidence is treated as proof. It stays flagged until its writer states a cadence.

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric = 'public_hosts_broken';

UPDATE metric_registry
   SET refresh_cadence = '6h'
 WHERE metric = 'public_hosts_broken'
   AND lower(refresh_cadence) <> '6h';

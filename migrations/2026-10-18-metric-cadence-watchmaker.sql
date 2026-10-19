-- METRIC-CADENCE-WATCHMAKER-1 (2026-10-18, pillar autonomy; the last stale metric, and its writer is explicit)
--
-- WHAT WAS WRONG
-- watchmaker_index declared refresh_cadence '2h'. v_metric_staleness marks STALE when age > cadence * 1.5, so it went
-- stale at 3 hours. Measured 2026-10-18 15:55Z: age 8.8h -> the last STALE metric in the registry.
--
-- THE WRITER (found at last; it is in qnfo-fleet-dashboard, not where I first looked)
-- function watchmakerDaily(env, opts):
--   if (!(opts && opts.force) && d.getUTCHours() < WATCHMAKER_AFTER_UTC_HOUR) return { skipped: "before ...Z" };
--   const have = SELECT day FROM watchmaker_runs WHERE day = ?           // one row per UTC day
--   if (have && !(opts && opts.force)) return { skipped: "already measured " + day };
--   ... INSERT OR REPLACE INTO watchmaker_runs (day, index_value, counted, json) ...
--   UPDATE metric_registry SET last_value = ?, last_refreshed = ? WHERE metric = 'watchmaker_index'
-- and the route comment: "WATCHMAKER-INDEX-1: the latest daily count of recurring operations that still need a person
-- or a session". A day-keyed table, a per-day "already measured" guard and an after-07:00Z gate are a daily schedule;
-- the 2h claim could never be met by it.
--
-- This corrects the PROMISE, not the VALUE: watchmakerDaily keeps writing last_value and last_refreshed unchanged.
--
-- NOTE on why this took so long: searching worker sources for the literal string 'watchmaker_index' matched only the
-- changelog, because the metric name appears in the code as a SQL literal split across the INSERT and the UPDATE on
-- adjacent lines. Searching 'watchmaker' (97 hits) found the writer immediately. Exact-string search fails on generated
-- or line-wrapped identifiers.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric = 'watchmaker_index';

UPDATE metric_registry
   SET refresh_cadence = 'daily'
 WHERE metric = 'watchmaker_index'
   AND lower(refresh_cadence) <> 'daily';

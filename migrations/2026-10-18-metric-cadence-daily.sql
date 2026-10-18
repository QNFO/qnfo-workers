-- METRIC-CADENCE-DAILY-1 (2026-10-18, pillar autonomy; makes v_metric_staleness_verdict truthful for the reach ingest)

-- WHAT WAS WRONG
-- v_metric_staleness_verdict marks a metric STALE when age_hours > cadence_hours * 2 (v_metric_staleness.sql).
-- Two reach metrics declared refresh_cadence '2h', so they went STALE at 4 hours. Measured 2026-10-18 15:02Z:
--   inbound_contacts_30d        refresh_cadence '2h'  last_refreshed 2026-10-18T02:01:15Z  age 13.1h  -> STALE
--   work_with_me_pageviews_30d  refresh_cadence '2h'  last_refreshed 2026-10-18T02:01:15Z  age 13.1h  -> STALE
-- They were never broken. qnfo-fleet-dashboard's source documents the producer explicitly (WORK-WITH-ME-METRIC-1,
-- qnfo-fleet-dashboard/deployed-current.worker.js ~line 3510):
--   "Once a day, inside the reach ingest (same throttle, same day), this counts it over the 30 UTC days ..."
-- The two rows even share the identical timestamp 02:01:15.454Z, i.e. one statement wrote both - one ingest run, once
-- a day. A 2-hour freshness promise that the producer never made can only ever be false, and a permanently false alarm
-- is not an alarm. This file corrects the PROMISE, not the VALUE: both metrics are still refreshed by the same daily
-- ingest and their values are untouched.

-- WHAT THIS IS NOT
-- A judgement that these metrics should be daily. It is the cadence the producer's own code states. The other sixteen
-- metrics currently flagged STALE are NOT changed here: for them the declared cadence may be right and the producer
-- may be genuinely late, which is a different defect and needs its own evidence per metric.

-- SCOPE OF EVIDENCE
-- metric_history is a daily snapshot table (one row per metric per day, column 'day'), so a run of daily rows proves
-- how long a metric has existed, NOT how often it refreshes. It was used that way once in this session and the
-- inference was wrong; the cadence above comes from the producer's source text, not from that table.

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric IN ('inbound_contacts_30d','work_with_me_pageviews_30d');

UPDATE metric_registry
   SET refresh_cadence = 'daily'
 WHERE metric IN ('inbound_contacts_30d', 'work_with_me_pageviews_30d')
   AND lower(refresh_cadence) <> 'daily';

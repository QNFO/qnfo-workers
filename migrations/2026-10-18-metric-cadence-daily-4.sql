-- METRIC-CADENCE-DAILY-4 (2026-10-18, pillar autonomy; three metrics whose own producers state a daily cadence)

-- WHAT WAS WRONG
-- Three metrics declared refresh_cadence '2h', so v_metric_staleness_verdict (STALE when age_hours > cadence_hours * 2)
-- flagged them at four hours while their producers run once a day. Measured 2026-10-18 15:33Z:
--   social_engagement_rate_30d    age 8.6h  last 2026-10-18T07:01:xxZ
--   signal_source_families_7d     age 6.7h  last 2026-10-18T09:00:34Z
--   paper_math_browser_fail_pages age 9.2h  last 2026-10-18T06:30:37Z

-- THE EVIDENCE (the producers say so themselves)
-- social_engagement_rate_30d - qnfo-social/deployed-current.worker.js, the learner block:
--   "metric_registry social_engagement_rate_30d is refreshed daily in the same cron, whatever the switch says
--    (it is measurement only)."
--
-- signal_source_families_7d - radar-hub/deployed-current.worker.js, the signal-intake block:
--   "It runs in the existing 08:30Z daily slot (CRON_TABLE unchanged, no new cron) ... Metric
--    signal_source_families_7d: distinct families with an accepted item in 7 days"
--
-- paper_math_browser_fail_pages - qnfo-paper-indexer/deployed-current.worker.js:
--   "MATH-BROWSER-2 (3.0.12, #1890): the gateway's 06:00 cron loads five live pages in a real browser ...
--    This publishes the failing count as paper_math_browser_fail_pages (trigger 798). A sample older than
--    two days, or none, leaves the metric unmeasured (null) rather than passing."
--   Its data source is a 06:00 daily sample and a sample older than two days is treated as unmeasured, so a day is
--   the unit of the measure. Observed last_refreshed 06:30:37Z matches a post-06:00 run.

-- WHAT THIS IS NOT
-- No value is touched. Each producer writes last_value and last_refreshed exactly as before; this corrects only the
-- promise, the same way METRIC-CADENCE-DAILY-1 (2447), -2 (2455) and -3 (2458) corrected theirs.

-- NOT CHANGED, still open
--   watchmaker_index, public_hosts_broken, process_path_gaps keep their declared cadences.
--   process_path_gaps is not written by a metric writer at all: qnfo-evolve's pathGapCandidates READS
--   v_process_path_gaps to build issues, so whoever writes the registry row has not been located yet.
--   watchmaker_index and public_hosts_broken appear in no producer searched so far.

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric IN ('social_engagement_rate_30d','signal_source_families_7d','paper_math_browser_fail_pages');

UPDATE metric_registry
   SET refresh_cadence = 'daily'
 WHERE metric IN (
         'social_engagement_rate_30d',
         'signal_source_families_7d',
         'paper_math_browser_fail_pages'
       )
   AND lower(refresh_cadence) <> 'daily';

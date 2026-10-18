-- METRIC-CADENCE-DAILY-2 (2026-10-18, pillar autonomy; the attention scorecard is daily by its own comment)

-- WHAT WAS WRONG
-- Five attention metrics declared refresh_cadence '2h', so v_metric_staleness_verdict (STALE when age > cadence*2) flagged
-- them at 4 hours. Measured 2026-10-18 15:20Z they all shared the identical last_refreshed 2026-10-18T02:01:34.414Z,
-- age 13.3h - one statement run, one job, once a day.

-- THE EVIDENCE (code, not inference)
-- qnfo-fleet-dashboard/deployed-current.worker.js, reachIngestTick, immediately above the call:
--   "ATTENTION-LOOP-1: the daily scorecard follows the day's ingest (its own ledger row keeps it to once a day)."
-- The scorecard also writes a per-day ledger row cloud_ops_events 'attention-scorecard-<day>' and grades decisions on a
-- 7-day verify_at, so a day is its natural unit. A 2-hour freshness promise the producer never made can only read false,
-- and a permanently false alarm is not an alarm.

-- WHAT THIS IS NOT
-- It does not touch any value: attentionScorecard writes last_value and last_refreshed exactly as before. It corrects the
-- PROMISE, the same way METRIC-CADENCE-DAILY-1 (PR 2447) corrected the reach ingest pair.

-- NOT CHANGED, still open
-- The remaining 11 flagged metrics keep their declared cadences. They group into seven further job runs owned by
-- qnfo-evolve, qnfo-paper-indexer, qnfo-social, radar-hub, qnfo-fleet-dashboard and one with no located producer; each
-- needs its producer's own statement before its cadence is moved.

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric IN ('attention_events_7d','attention_per_post_7d','pages_noticed_7d','attention_channels_stopped','attention_decision_efficacy_30d');

UPDATE metric_registry
   SET refresh_cadence = 'daily'
 WHERE metric IN (
         'attention_events_7d',
         'attention_per_post_7d',
         'pages_noticed_7d',
         'attention_channels_stopped',
         'attention_decision_efficacy_30d'
       )
   AND lower(refresh_cadence) <> 'daily';

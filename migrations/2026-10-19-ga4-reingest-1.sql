-- GA4-REINGEST-1 (2026-10-19, pillar reach; issue 2935 GA4-PROPERTY-MISMATCH-1)
--
-- WHAT IS WRONG: the daily GA4 ingest reads the wrong property. ga4-ingest-2026-10-17 and -10-18 each wrote 6 rows: one
-- pageview on qnfo-publications.pages.dev against 1,264 (10-17) and 2,155 (10-18) human pageviews measured by RUM
-- (reach_signals cf-rum-human, host rows). The site tag G-LV7RHRVW6R is served by Zaraz on qnfo.org, q08.org, qwav.tech,
-- ipatent.me and empoweringchange.today, so GA4 should see the same traffic within 30%.
--
-- WHAT IS ALREADY FIXED: qnfo-fleet-dashboard ga4Ingest() carries GA4-PROPERTY-MISMATCH-1: with no pinned
-- ops_config ga4_property_id it lists accountSummaries, reads each property's dataStreams, keeps the one whose web stream
-- measurementId is G-LV7RHRVW6R, saves it to ops_config and reads that property. It is on main and live (the dashboard
-- /health reads 1.51.2-standby-proof-1). It has not run since: the ingest is once per day per UTC day, and the 10-18 row
-- read status ok at 2026-10-19T02:01Z, before the fix was live, so every later tick answered "throttled".
--
-- WHAT THIS FILE DOES (both statements are reversible UPDATEs):
--   1 marks the 2026-10-18 ledger row as a failed first attempt (attempts 1) so the next dashboard cron tick re-reads that
--     day through the discovery path. Only while no ga4_property_id has been saved, so it cannot loop once discovery works;
--     attempts stays below GA4_MAX_ATTEMPTS (3). The row is rewritten by the retry itself.
--   2 gives issue 2935 a closing probe that measures the definition of done: a property id was found and saved, and the
--     latest GA4 host pageviews total is within 30% of the RUM human host total for the same day. Until then it reports
--     what is missing, including the last ledger line (which carries the discovery warning when the service account cannot
--     read the property; that case needs the property's owner to add the service account as a viewer and is an
--     IDENTITY-BOUND step on the owner's own Google account, to be filed as a card with this probe as its closer).
--
-- Revert: UPDATE cloud_ops_events SET status = 'ok' WHERE id = 'ga4-ingest-2026-10-18' (the retry rewrites it anyway);
-- the probe text is the only thing 2 changes.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE cloud_ops_events SET status = 'ok' WHERE id = 'ga4-ingest-2026-10-18';

UPDATE cloud_ops_events
   SET status = 'error',
       meta = json_set(CASE WHEN json_valid(meta) THEN meta ELSE '{}' END, '$.attempts', 1,
                       '$.reason', 'GA4-REINGEST-1: re-read through property discovery (GA4-PROPERTY-MISMATCH-1)')
 WHERE id = 'ga4-ingest-2026-10-18'
   AND status = 'ok'
   AND NOT EXISTS (SELECT 1 FROM ops_config WHERE key = 'ga4_property_id');

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''ga4_property_id'') THEN ''pending: no ga4_property_id saved yet; last ledger: '' || COALESCE((SELECT substr(text, 1, 220) FROM cloud_ops_events WHERE kind = ''ga4-ingest'' ORDER BY ts DESC LIMIT 1), ''none'') WHEN (SELECT COALESCE(SUM(value), 0) FROM reach_signals WHERE source = ''cf-rum-human'' AND entity_type = ''host'' AND metric = ''pageviews'' AND date = (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'')) = 0 THEN ''pending: no RUM human host pageviews for the latest GA4 day'' WHEN ABS((SELECT COALESCE(SUM(value), 0) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'' AND date = (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'')) - (SELECT SUM(value) FROM reach_signals WHERE source = ''cf-rum-human'' AND entity_type = ''host'' AND metric = ''pageviews'' AND date = (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews''))) <= 0.3 * (SELECT SUM(value) FROM reach_signals WHERE source = ''cf-rum-human'' AND entity_type = ''host'' AND metric = ''pageviews'' AND date = (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'')) THEN ''ok'' ELSE ''pending: GA4 host pageviews are not within 30% of RUM human host pageviews on '' || (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND metric = ''screenPageViews'') END AS observed',
       status = 'active',
       next_due_at = datetime('now'),
       max_attempts = 24
 WHERE class = 'issue-2935';

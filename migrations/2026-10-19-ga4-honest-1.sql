-- GA4-HONEST-1 (2026-10-19, pillar reach; issue 2935 GA4-PROPERTY-MISMATCH-1)
--
-- WHAT THE RE-READ FOUND (ga4-ingest-2026-10-18 re-run at 2026-10-19T13:16Z by GA4-REINGEST-1, PR 2896):
--   "GA4 ingest 2026-10-18: 6 rows (property discovery failed: accountSummaries 403; reading 486253526)".
--   The service account can read property 486253526 (qnfo-publications.pages.dev, 2 pageviews on 2026-10-18) but is refused the Analytics Admin API,
--   so it cannot list the property behind the site tag G-LV7RHRVW6R and the Data API needs that property id. Granting it is a step in the owner's own
--   Google console: the owner decided on 2026-10-01 (human_actions card 3 ga4-gsc-access, dismissed: "GA4/Search Console grants happen only in the
--   owner's Google console ... the fleet does not re-ask") and again on 2026-10-04 (no new manual Google console steps). The discovery code stays armed:
--   the day a grant exists, the next ingest finds and saves the property by itself.
--
-- WHAT WAS STILL WRONG, AND IS FIXED: the rows of the other property were stored as quality human beside 2,155 human RUM pageviews (10-18), so a
--   reader of reach_signals saw a second measurement of the site that is not one. qnfo-fleet-dashboard 1.51.3 (GA4-HONEST-1) stores GA4 rows as
--   quality unknown when the property's host report carries none of the site hosts, and the ledger line says so. This file applies the same
--   rule to the two days already stored and appends the reason to their ledger lines, then gives issue 2935 a probe that measures the honest state
--   instead of the unreachable one (GA4 within 30% of RUM): the latest GA4 day holds no human-quality host row that is not a site host, and when it
--   carries no site host its ledger line says quality unknown. Property discovered later: the site host rows are human and the probe still passes.
--   The 30%-of-RUM comparison returns with that grant; this probe replaces the one from GA4-REINGEST-1 only for as long as the grant is absent.
--
-- Revert: UPDATE reach_signals SET quality = 'human' WHERE source = 'ga4' AND quality = 'unknown' AND date IN ('2026-10-17', '2026-10-18');
--         restore the GA4-REINGEST-1 probe from migrations/2026-10-19-ga4-reingest-1.sql.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE reach_signals SET quality = 'human' WHERE source = 'ga4' AND quality = 'unknown' AND date IN ('2026-10-17', '2026-10-18');

UPDATE reach_signals SET quality = 'unknown'
 WHERE source = 'ga4' AND quality = 'human'
   AND date IN (SELECT date FROM reach_signals WHERE source = 'ga4' AND entity_type = 'host'
                 GROUP BY date
                HAVING SUM(CASE WHEN (entity_id LIKE '%qnfo.org' OR entity_id LIKE '%q08.org' OR entity_id LIKE '%qwav.tech' OR entity_id LIKE '%ipatent.me' OR entity_id LIKE '%empoweringchange.today') THEN 1 ELSE 0 END) = 0);

UPDATE cloud_ops_events
   SET text = text || ' (GA4-HONEST-1: the property read carries none of the site hosts, rows stored as quality unknown)'
 WHERE kind = 'ga4-ingest' AND id IN ('ga4-ingest-2026-10-17', 'ga4-ingest-2026-10-18')
   AND instr(text, 'quality unknown') = 0
   AND NOT EXISTS (SELECT 1 FROM reach_signals r WHERE r.source = 'ga4' AND r.entity_type = 'host' AND r.date = substr(cloud_ops_events.id, 12)
                    AND (r.entity_id LIKE '%qnfo.org' OR r.entity_id LIKE '%q08.org' OR r.entity_id LIKE '%qwav.tech' OR r.entity_id LIKE '%ipatent.me' OR r.entity_id LIKE '%empoweringchange.today'));

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'') IS NULL THEN ''pending: no GA4 host rows'' WHEN EXISTS (SELECT 1 FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND date = (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'') AND quality = ''human'' AND NOT (entity_id LIKE ''%qnfo.org'' OR entity_id LIKE ''%q08.org'' OR entity_id LIKE ''%qwav.tech'' OR entity_id LIKE ''%ipatent.me'' OR entity_id LIKE ''%empoweringchange.today'')) THEN ''pending: GA4 stores a human-quality host row that is not a site host on '' || (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'') WHEN NOT EXISTS (SELECT 1 FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'' AND date = (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'') AND (entity_id LIKE ''%qnfo.org'' OR entity_id LIKE ''%q08.org'' OR entity_id LIKE ''%qwav.tech'' OR entity_id LIKE ''%ipatent.me'' OR entity_id LIKE ''%empoweringchange.today'')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''ga4-ingest'' AND id = ''ga4-ingest-'' || (SELECT MAX(date) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''host'') AND instr(text, ''quality unknown'') > 0) THEN ''pending: the latest GA4 day carries no site host and its ledger line does not say quality unknown'' ELSE ''ok'' END AS observed',
       status = 'active', next_due_at = datetime('now'), max_attempts = 24
 WHERE class = 'issue-2935';

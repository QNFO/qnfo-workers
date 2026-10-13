-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE id IS NULL AND COALESCE(kind, '''') NOT IN (''obs-ingest'', ''obs-reassert'', ''dispose-blocked'')) + (SELECT COUNT(*) FROM cloud_ops_events WHERE kind IN (''obs-ingest'', ''obs-reassert'', ''dispose-blocked'', ''metric-write-audit'') AND ts >= strftime(''%Y-%m-%d'', ''now'', ''-1 day'') AND substr(ts, 11, 1) = '' '') AS TEXT) AS observed' WHERE class = 'fm-coe-null-id'
--
-- COE-NULL-ID-WRITER-1 (agent_issues 2519, 2026-10-13, pillar autonomy). qnfo-fleet-control 0.26.4 gives its six cloud_ops_events
-- writes (obs-ingest, obs-reassert, dispose-blocked, disposed-worker) an id ('fc-' || hex) and an ISO ts, so the exemption that
-- fm-coe-null-id carried for those three kinds while the writer was unfixed ends here: an id-less row of those kinds written after
-- 2026-10-14T00:30Z (the 0.26.4 deploy plus margin) counts again. Older id-less rows stay exempt; their ts is earlier than the cut.
-- A row written after the cut with no id means the writer regressed or 0.26.4 is not live, which is what the detector is for.
-- spof-review: one probe text; the writer and the other detector term are unchanged.

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE id IS NULL AND (COALESCE(kind, '''') NOT IN (''obs-ingest'', ''obs-reassert'', ''dispose-blocked'') OR replace(substr(COALESCE(ts, ''''), 1, 19), '' '', ''T'') >= ''2026-10-14T00:30:00'')) + (SELECT COUNT(*) FROM cloud_ops_events WHERE kind IN (''obs-ingest'', ''obs-reassert'', ''dispose-blocked'', ''metric-write-audit'') AND ts >= strftime(''%Y-%m-%d'', ''now'', ''-1 day'') AND substr(ts, 11, 1) = '' '') AS TEXT) AS observed'
WHERE class = 'fm-coe-null-id';

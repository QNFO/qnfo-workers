-- METRIC-CADENCE-FLOOR-2 (2026-10-18, pillar autonomy; two more metrics whose declared cadence was never achievable)
--
-- WHAT WAS WRONG. Measured 2026-10-18 19:47Z, these were the only two STALE metrics in the registry (229 total):
--   spof_alternates_untested_24h    cadence 2h   last_refreshed 14:01:16Z   age 5.8h
--   probe_review_refused_share_7d   cadence 2h   last_refreshed 13:10:17Z   age 6.6h
--
-- THE EVIDENCE IS EACH ROW'S OWN source_of_truth.
--   spof_alternates_untested_24h: "qnfo-fleet-control chaosDrill (hourly tick, runs every 6 h)" - it says every 6 h.
--     v_metric_staleness uses age > cadence * 1.5, so 6h cadence gives a 9h threshold and 5.8h reads FRESH.
--   probe_review_refused_share_7d: "refreshed by the D1 triggers metric_probe_review_refused_ai and _au" - EVENT-DRIVEN.
--     It moves only when a probe-review event arrives, so a fixed 2h promise is unachievable by construction. Same class
--     as process_path_gaps, and it takes the same fix: a scheduled floor on the same expression the triggers use, then
--     the cadence its schedule actually delivers.
--
-- The floor recomputes with the trigger's own formula, copied verbatim, so the value cannot drift from what the trigger
-- would have written. Only last_refreshed is guaranteed to move.
--
-- This extends fleet_tasks event-metric-recompute 1 -> 2 with a third step. Every step carries type:"sql", which is the
-- field the runner dispatches on and the one BREACH-TICKET-REOPEN-1 omitted.

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET refresh_cadence='2h' WHERE metric IN ('spof_alternates_untested_24h','probe_review_refused_share_7d');

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at) VALUES (
  'event-metric-recompute',
  'EVENT-METRIC-RECOMPUTE: a freshness floor for metrics whose only writer is an event',
  'workflow',
  '{"steps":[
    {"type":"sql","db":"AUDIT","name":"recompute-process-path-gaps","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_process_path_gaps WHERE no_sla = 1 OR single_path = 1) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'',''now''), state = ''MEASURED'' WHERE metric = ''process_path_gaps''"},
    {"type":"sql","db":"AUDIT","name":"recompute-probe-review-refused","sql":"UPDATE metric_registry SET last_value = (SELECT CASE WHEN COUNT(*) >= 5 THEN CAST(ROUND(1.0 * SUM(CASE WHEN e.status = ''refused'' THEN 1 ELSE 0 END) / COUNT(*), 3) AS TEXT) END FROM cloud_ops_events e WHERE e.kind = ''probe-review'' AND e.ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND (CASE WHEN json_valid(e.meta) THEN json_extract(e.meta, ''$.verdict'') END) IS NOT NULL), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'',''now''), state = ''MEASURED'' WHERE metric = ''probe_review_refused_share_7d''"},
    {"type":"sql","db":"AUDIT","name":"ledger","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''event-metric-recompute-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''event-metric-recompute'', ''EVENT-METRIC-RECOMPUTE: freshened process_path_gaps and probe_review_refused_share_7d using the exact expressions their triggers use'', NULL, ''event-metric-recompute'', ''ok''"}
  ]}',
  30000, 1, 2, 1, datetime('now')
);

UPDATE metric_registry SET refresh_cadence = '6h'   WHERE metric = 'spof_alternates_untested_24h'  AND lower(refresh_cadence) <> '6h';
UPDATE metric_registry SET refresh_cadence = 'daily' WHERE metric = 'probe_review_refused_share_7d' AND lower(refresh_cadence) <> 'daily';

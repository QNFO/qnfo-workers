-- EVENT-METRIC-RECOMPUTE-1 (2026-10-18, pillar autonomy; a metric whose only writer is an event has no cadence)
--
-- THE PROBLEM
-- process_path_gaps is written ONLY by the triggers process_path_metric_ai/au on process_path_registry. It refreshes when
-- that registry is EDITED and never otherwise, so its last_refreshed says more about editorial activity than about health.
-- It declared refresh_cadence '2h' and sat STALE indefinitely between edits - a permanent false signal, which is not a
-- signal. v_metric_staleness does not support an event-driven cadence either: its ELSE branch maps any unknown string to
-- 1.0 hour, so inventing one would make the reading worse, not better.
--
-- THE FIX
-- Give the metric a real, scheduled recompute, then declare the cadence that schedule actually delivers. The recompute is
-- the SAME expression the triggers use (COUNT(*) FROM v_process_path_gaps WHERE no_sla=1 OR single_path=1), so the value
-- cannot drift from the trigger's own reading; it only adds a floor of freshness between edits.
--
-- Scope: process_path_gaps only. watchmaker_index and public_hosts_broken are NOT included - their writers are still
-- unlocated, and a recompute would be me guessing what they should contain.

-- SUPERSEDED: 2026-10-18-metric-cadence-floor-2.sql rewrote fleet_tasks 'event-metric-recompute' to version 2 (applied
--             19:52:13Z); that file is the live definition now. This v1 file's steps carry no "type", which aborts a run
--             with "unsupported step type: undefined", so it is deliberately NOT opted in to APPLY-BY. Fixing the steps
--             in place would change this file's sha256, and the runner would then re-apply v1 over the live v2 definition.
-- DB: qnfo-audit
-- Rollback: DELETE FROM fleet_crons WHERE name = 'event-metric-recompute-daily'; DELETE FROM fleet_tasks WHERE id = 'event-metric-recompute'; UPDATE metric_registry SET refresh_cadence = '2h' WHERE metric = 'process_path_gaps';

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('event-metric-recompute',
        'Event-driven metric recompute',
        'workflow',
        '{"steps":[{"name":"recompute-process-path-gaps","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_process_path_gaps WHERE no_sla = 1 OR single_path = 1) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'',''now''), state = ''MEASURED'' WHERE metric = ''process_path_gaps''"},{"name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''event-metric-recompute-'' || strftime(''%Y%m%d'', ''now''), datetime(''now''), ''event-metric-recompute'', ''EVENT-METRIC-RECOMPUTE-1: process_path_gaps refreshed from v_process_path_gaps (value '' || COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''process_path_gaps''), ''null'') || '') so an event-only metric still has a freshness floor between edits'', NULL, ''event-metric-recompute'', ''ok''"}]}',
        30000, 1, 1, 1, datetime('now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, last_fired, next_fire, updated_at)
VALUES ('event-metric-recompute-daily', '25 6 * * *', 'event-metric-recompute', 1, 'UTC', NULL, NULL, datetime('now'));

UPDATE metric_registry
   SET refresh_cadence = 'daily'
 WHERE metric = 'process_path_gaps'
   AND lower(refresh_cadence) <> 'daily';

-- SESSION-EFFECTIVENESS-1 (2026-10-02, pillar: autonomy). Applied live.
--
-- The problem. Agent sessions build the fleet, but nothing measured them: session_records had the right columns
-- (total_tasks, completed_tasks, execution_ratio) and no row since 2026-07-16, and no registered metric read it.
--
-- The fix:
--   - two registered metrics computed from session_records, so session effectiveness gets a target, a warning band
--     and the same staleness watch as every other metric;
--   - one step on fleet_tasks 'metric-refresh' (hourly, fleet-exec) that computes both. No session is needed to
--     refresh them. With no record in the window the ratio reads 'n/a' and the count reads 0.
--   - Sessions write their own session_records row at closeout; a rule for that in CLAUDE.md is left to the owner.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('session_execution_ratio_30d', 'system', 'leading', 'AVG(session_records.execution_ratio) over rows created in the last 30 days (completed_tasks / total_tasks as each session reported it)', 'qnfo-audit.session_records', '0.12', '>= 0.8', 'fleet-exec', 'qnfo-fleet-control', 'hourly', '< 0.6', '< 0.3', 'MEASURED', 'computed'),
 ('session_records_30d', 'system', 'leading', 'count(session_records) created in the last 30 days: how many agent sessions reported their own outcome', 'qnfo-audit.session_records', '1', '>= 4', 'fleet-exec', 'qnfo-fleet-control', 'hourly', '< 2', '< 1', 'MEASURED', 'computed');

UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CASE metric WHEN ''session_execution_ratio_30d'' THEN COALESCE(CAST((SELECT ROUND(AVG(execution_ratio), 2) FROM session_records WHERE execution_ratio IS NOT NULL AND created_at >= datetime(''now'', ''-30 days'')) AS TEXT), ''n/a'') ELSE CAST((SELECT COUNT(*) FROM session_records WHERE created_at >= datetime(''now'', ''-30 days'')) AS TEXT) END, last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric IN (''session_execution_ratio_30d'', ''session_records_30d'')"}')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = 'metric-refresh' AND instr(definition, 'session_execution_ratio_30d') = 0;

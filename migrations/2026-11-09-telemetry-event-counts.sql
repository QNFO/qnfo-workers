-- W2-J-OBS-2 (agent_issues 1002055, GitHub 8072; roadmap RM-BS-SELF-REPORTING-PLATFORM-1, charter pillar reliability): telemetry_event_counts.
-- WHAT  qnfo-ops errorDetailCapture (>= 2.59.0) runs a second Workers Observability telemetry query (view calculations, count of error events grouped by
--       $metadata.service) and upserts one row per worker and hour here: platform_events (the platform's count) beside copied_rows (worker_logs rows for the same
--       hour). v_telemetry_event_agreement marks an hour `agree` when copied_rows is within 5 percent of platform_events; v_telemetry_copy_stop_candidates lists the
--       workers whose last 168 hours all agree. The copy for such a worker stops only while ops_config edc_copy_stop = 'on' (default absent = off; revert: DELETE the key).
-- FAIL-OPEN  a stopped worker's hours are written with copy_state 'off' and copied_rows NULL; the copy resumes the moment its counts query fails, its hourly platform_events
--       exceed the 200-event page the console can read, or the key is deleted.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_telemetry_copy_stop_candidates; DROP VIEW IF EXISTS v_telemetry_event_agreement; DROP TABLE IF EXISTS telemetry_event_counts;

CREATE TABLE IF NOT EXISTS telemetry_event_counts (
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  script TEXT NOT NULL,
  platform_events INTEGER NOT NULL,
  copied_rows INTEGER,
  copy_state TEXT NOT NULL DEFAULT 'on',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, hour, script)
);

CREATE VIEW IF NOT EXISTS v_telemetry_event_agreement AS
SELECT day, hour, script, platform_events, copied_rows, copy_state,
  CASE
    WHEN copy_state = 'off' THEN 1
    WHEN copied_rows IS NULL THEN 0
    WHEN ABS(copied_rows - platform_events) <= 0.05 * MAX(platform_events, 1) THEN 1
    ELSE 0
  END AS agree
FROM telemetry_event_counts;

CREATE VIEW IF NOT EXISTS v_telemetry_copy_stop_candidates AS
SELECT script, COUNT(*) AS hours, SUM(agree) AS agreeing_hours, MAX(platform_events) AS max_hourly_events
FROM v_telemetry_event_agreement
WHERE (day || printf('%02d', hour)) >= strftime('%Y-%m-%d', 'now', '-7 days') || strftime('%H', 'now')
GROUP BY script
HAVING COUNT(*) >= 168 AND SUM(agree) = COUNT(*) AND MAX(platform_events) <= 200;

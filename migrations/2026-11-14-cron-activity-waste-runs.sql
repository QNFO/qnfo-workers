-- CRON-WATCH-OWN-RUNS-2 (2026-11-14, charter pillar autonomy; RED-DRAIN-1 dispatch)
-- Replaces per‑worker CASE arms in v_cron_activity with a run‑table registry.
-- A registry table cron_run_sources (worker, run_table, ts_column) is seeded for
-- fleet‑exec, qnfo‑evolve and qnfo‑waste‑agent. A 5‑minute fleet task populates
-- cron_run_marks (worker, last_run_ms) with the MAX(ts) from each source.
-- The view now reads own_ms from cron_run_marks, making the design scalable.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_view_defs_20261114_cron_activity
-- Rollback: DROP VIEW IF EXISTS v_cron_activity; then run the sql column of
-- bak_view_defs_20261114_cron_activity (the previous definition; the view holds no data).

CREATE TABLE IF NOT EXISTS bak_view_defs_20261114_cron_activity AS
  SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_cron_activity';

-- ----------------------------------------------------------------------
-- Registry of run tables for workers that maintain their own run timestamps
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cron_run_sources (
  worker    TEXT PRIMARY KEY,
  run_table TEXT NOT NULL,
  ts_column TEXT NOT NULL
);

INSERT OR REPLACE INTO cron_run_sources (worker, run_table, ts_column) VALUES
  ('fleet-exec',      'fleet_runs',   'started_at'),
  ('qnfo-evolve',     'evolve_runs',  'ts'),
  ('qnfo-waste-agent','waste_runs',   'ts');

-- ----------------------------------------------------------------------
-- Table populated by a periodic fleet task (outside of this migration)
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cron_run_marks (
  worker        TEXT PRIMARY KEY,
  last_run_ms   INTEGER NOT NULL
);

DROP VIEW IF EXISTS v_cron_activity;
CREATE VIEW v_cron_activity AS
WITH w AS (
  SELECT
    worker,
    MIN(gap_min) AS gap_min,
    CASE worker
      WHEN 'qnfo-ai-calibration' THEN 'ai-health-prober'
      ELSE worker
    END AS hb_name
  FROM v_cron_schedule
  WHERE kind = 'cf'
  GROUP BY worker
),
a AS (
  SELECT
    w.worker,
    w.gap_min,
    w.hb_name,
    (
      SELECT MAX(l.fired_epoch_ms)
      FROM cron_fire_log l
      WHERE l.source = 'worker:' || w.worker
        AND l.fired_epoch_ms > (CAST(strftime('%s', 'now') AS INTEGER) - 7 * 86400) * 1000
    ) AS grid_ms,
    (
      SELECT CAST(strftime('%s', substr(h.ts, 1, 19)) AS INTEGER) * 1000
      FROM fleet_heartbeat h
      WHERE h.worker = w.hb_name
    ) AS hb_ms,
    (
      SELECT h.ok
      FROM fleet_heartbeat h
      WHERE h.worker = w.hb_name
    ) AS hb_ok,
    (
      SELECT m.last_run_ms
      FROM cron_run_marks m
      WHERE m.worker = w.worker
    ) AS own_ms
  FROM w
)
SELECT
  worker,
  gap_min,
  hb_name,
  grid_ms,
  hb_ms,
  hb_ok,
  own_ms,
  NULLIF(
    MAX(COALESCE(grid_ms, 0), COALESCE(hb_ms, 0), COALESCE(own_ms, 0)),
    0
  ) AS last_ms
FROM a;

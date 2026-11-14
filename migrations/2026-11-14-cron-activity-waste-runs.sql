-- CRON-WATCH-OWN-RUNS-1 (2026-11-14, charter pillar autonomy; CRON-FAULT-1 agent_issues 1003343 and CODE-MERGE-REFUSED-1 1003551 / GitHub #11873).
-- cron-watch filed worker-silent:qnfo-waste-agent ("no run recorded since ...") while the worker ran every hour without error: waste_runs holds a row at
-- 13:05, 14:05 and 15:05Z on 2026-11-14. v_cron_activity reads only cron_fire_log, fleet_heartbeat and two named run tables (fleet-exec, qnfo-evolve), and the
-- waste agent's heartbeat row was stale, so its own run record was never seen. The code loop's patch for the issue (ct_im1003343: drop the node:crypto import)
-- did not address the cause (the worker has nodejs_compat and answers /health 1.0.1) and was refused for VERSION-AHEAD-1. The view now reads waste_runs too.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_view_defs_20261114_cron_activity
-- Rollback: DROP VIEW IF EXISTS v_cron_activity; then run the sql column of bak_view_defs_20261114_cron_activity (the previous definition; the view holds no data).
-- CAUSE-MAPPED: registers no metric.

CREATE TABLE IF NOT EXISTS bak_view_defs_20261114_cron_activity AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_cron_activity';
DROP VIEW IF EXISTS v_cron_activity;
CREATE VIEW v_cron_activity AS
WITH w AS (
  SELECT worker, MIN(gap_min) AS gap_min,
    CASE worker WHEN 'qnfo-ai-calibration' THEN 'ai-health-prober' ELSE worker END AS hb_name
  FROM v_cron_schedule WHERE kind = 'cf' GROUP BY worker
),
a AS (
  SELECT w.worker, w.gap_min, w.hb_name,
    (SELECT MAX(l.fired_epoch_ms) FROM cron_fire_log l WHERE l.source = 'worker:' || w.worker
       AND l.fired_epoch_ms > (CAST(strftime('%s', 'now') AS INTEGER) - 7 * 86400) * 1000) AS grid_ms,
    (SELECT CAST(strftime('%s', substr(h.ts, 1, 19)) AS INTEGER) * 1000 FROM fleet_heartbeat h WHERE h.worker = w.hb_name) AS hb_ms,
    (SELECT h.ok FROM fleet_heartbeat h WHERE h.worker = w.hb_name) AS hb_ok,
    CASE w.worker
      WHEN 'fleet-exec' THEN (SELECT CAST(strftime('%s', substr(MAX(r.started_at), 1, 19)) AS INTEGER) * 1000 FROM fleet_runs r
                               WHERE r.id > (SELECT MAX(id) FROM fleet_runs) - 500)
      WHEN 'qnfo-evolve' THEN (SELECT CAST(strftime('%s', substr(MAX(e.ts), 1, 19)) AS INTEGER) * 1000 FROM evolve_runs e)
      WHEN 'qnfo-waste-agent' THEN (SELECT CAST(strftime('%s', substr(MAX(x.ts), 1, 19)) AS INTEGER) * 1000 FROM waste_runs x)
    END AS own_ms
  FROM w
)
SELECT worker, gap_min, hb_name, grid_ms, hb_ms, hb_ok, own_ms,
  NULLIF(MAX(COALESCE(grid_ms, 0), COALESCE(hb_ms, 0), COALESCE(own_ms, 0)), 0) AS last_ms
FROM a;

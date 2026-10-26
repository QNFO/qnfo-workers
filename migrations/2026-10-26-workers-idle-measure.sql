-- WORKERS-IDLE-MEASURE-1 (2026-10-26, pillar cost). workers_idle_7d read 2 while no worker was idle:
--   qnfo-backlog-exec is service_registry kind 'member' (a route of qnfo-lifecycle, https://qnfo-lifecycle.q08.workers.dev/backlog),
--   never a Cloudflare script, so worker_usage_daily can never hold a row for it; and qnfo-agents was first deployed on
--   2026-10-26, after the 00:01Z usage snapshot, so it had no row yet. Every one of the 36 scripts in the 2026-10-26 snapshot
--   served 647 or more requests in 7 days. The tick now counts only kind 'worker' and skips a worker whose first fleet_deploys
--   row is younger than 7 days and that has no row in the snapshot (too new to judge; it is counted once it has a row).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_workers_idle_tick
-- Rollback: DROP TRIGGER IF EXISTS workers_idle_tick; then re-run the CREATE TRIGGER text saved in bak_20261026_workers_idle_tick.sql

CREATE TABLE IF NOT EXISTS bak_20261026_workers_idle_tick AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'trigger' AND name = 'workers_idle_tick';

DROP TRIGGER IF EXISTS workers_idle_tick;

CREATE TRIGGER IF NOT EXISTS workers_idle_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = (
      SELECT CASE WHEN snap.n >= 10 AND replace(substr(snap.ts, 1, 19), 'T', ' ') > datetime('now', '-36 hours')
               THEN CAST((SELECT COUNT(*) FROM service_registry s WHERE s.state = 'live' AND s.kind = 'worker'
                            AND NOT EXISTS (SELECT 1 FROM worker_usage_daily u WHERE u.script = s.service AND u.day = snap.day AND COALESCE(u.requests_7d, 0) >= 3)
                            AND NOT (NOT EXISTS (SELECT 1 FROM worker_usage_daily u2 WHERE u2.script = s.service AND u2.day = snap.day)
                                     AND COALESCE((SELECT MIN(replace(substr(d.ts, 1, 19), 'T', ' ')) FROM fleet_deploys d WHERE d.worker = s.service AND d.ok = 1), '9999') > datetime('now', '-7 days'))) AS TEXT) END
      FROM (SELECT MAX(day) AS day, COUNT(*) AS n, MAX(ts) AS ts FROM worker_usage_daily WHERE day = (SELECT MAX(day) FROM worker_usage_daily)) snap)
  WHERE metric = 'workers_idle_7d';
END;

UPDATE metric_registry SET formula = 'service_registry rows with kind worker and state live that have fewer than 3 requests in 7 days in the newest worker_usage_daily snapshot, or no row in it; a worker first deployed less than 7 days ago with no row yet is not counted; NULL when the snapshot is older than 36 hours or holds fewer than 10 scripts (WORKERS-IDLE-MEASURE-1)'
WHERE metric = 'workers_idle_7d';

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, first_seen)
SELECT 'idle-metric-counts-non-scripts', 'workers_idle_7d counted a registry member and a brand-new worker as idle',
  'the tick counted every live service_registry row, including kind member (a route inside another worker) and a worker deployed after the daily usage snapshot',
  'WORKERS-IDLE-MEASURE-1: count kind worker only and skip a worker younger than 7 days with no snapshot row',
  'metric workers_idle_7d against SELECT service FROM service_registry WHERE kind <> ''worker'' AND state = ''live''', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'idle-metric-counts-non-scripts');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01RdDA76KLvqYHYBjL9C2be5', 'a member route and a worker younger than the usage snapshot are not idle workers',
  'WORKERS-IDLE-MEASURE-1: workers_idle_7d counts kind worker only and skips workers first deployed in the last 7 days with no snapshot row',
  'read 2026-10-26 09:40Z: the two counted were qnfo-backlog-exec (kind member) and qnfo-agents (first deploy 2026-10-26); all 36 scripts in the snapshot served >= 647 requests in 7 days',
  'the idle alarm reads only real idle workers', 'one fleet_tick trigger and one metric row (old trigger text kept in bak_20261026_workers_idle_tick)',
  'the Rollback line', 'the idle-worker alarm no longer fires on non-scripts', 'workers_idle_7d = 0 within 70 min', NULL, 'SQLite run against the live schema'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'WORKERS-IDLE-MEASURE-1:%');

INSERT INTO fleet_tick (source) VALUES ('migration:workers-idle-measure');

-- FLEET-EXEC-SEMANTICS-DECLARED-1 (#1660 FLEET-TASK-ENGINE-PARTIAL-COVERAGE-1, 2026-10-01).
--
-- The problem. fleet_tasks (timeout_ms / retries / version) covers only the fleet-exec task engine. Every other scheduled
-- worker runs on native Cloudflare cron triggers, and nothing recorded their failure behaviour.
--
-- Why not move every cron into fleet-exec. That would put 50 schedules behind one dispatcher and turn it into a single
-- point of failure. Instead, the native-cron semantics are declared per scheduled worker, and each one names the
-- detectors that catch its failure modes:
--   - Engine: native Cloudflare cron. A failed or timed-out invocation is not retried. The next scheduled tick is the
--     retry, so handlers must be idempotent per tick.
--   - Timeout: the platform limit for scheduled invocations (15 min wall clock; CPU per the script's limits.cpu_ms or
--     the plan default).
--   - Version: the deployed VERSION (fleet_heartbeat.version / worker_live_audit.live_version).
--   - Detectors:
--       qnfo-fleet-control cronDrift: declared vs live triggers, missing schedules restored automatically.
--       workerCensus (daily): FIRING-NO-OUTPUT when a scheduled worker produced no output rows in 7d; DEGRADED on
--         heartbeat ok=0.
--       qnfo-fleet-dashboard scheduled-no-run: 0 invocations in 24h against the expected fires (workersInvocationsAdaptive).
--
-- fleet-exec keeps the task-engine semantics, which are declared per task in fleet_tasks. The fleet_execution_coverage
-- view lists every scheduled worker with its declared engine, so a scheduled worker without semantics is visible as a
-- NULL row. Applied live.
-- The defaults are the native-cron semantics, so a worker that the dashboard schedule refresh adds later is covered on insert.
ALTER TABLE worker_schedules ADD COLUMN exec_engine TEXT DEFAULT 'cf-native-cron';
ALTER TABLE worker_schedules ADD COLUMN retry_policy TEXT DEFAULT 'no platform retry; the next scheduled tick is the retry (handler idempotent per tick)';
ALTER TABLE worker_schedules ADD COLUMN timeout_policy TEXT DEFAULT 'scheduled-invocation platform limit (15 min wall; CPU per limits.cpu_ms or plan default)';
ALTER TABLE worker_schedules ADD COLUMN failure_detectors TEXT DEFAULT 'fleet-control cronDrift (trigger drift, auto-restore) + workerCensus daily (FIRING-NO-OUTPUT / DEGRADED) + fleet-dashboard scheduled-no-run (0 invocations vs expected fires)';

UPDATE worker_schedules SET
  exec_engine = CASE WHEN name = 'fleet-exec' THEN 'fleet-exec task engine + native cron dispatcher' ELSE 'cf-native-cron' END,
  retry_policy = CASE WHEN name = 'fleet-exec'
    THEN 'per task: fleet_tasks.retries; the dispatcher tick itself is native cron (next tick re-dispatches)'
    ELSE 'no platform retry; the next scheduled tick is the retry (handler idempotent per tick)' END,
  timeout_policy = CASE WHEN name = 'fleet-exec'
    THEN 'per task: fleet_tasks.timeout_ms; dispatcher bound by the scheduled-invocation platform limit'
    ELSE 'scheduled-invocation platform limit (15 min wall; CPU per limits.cpu_ms or plan default)' END,
  failure_detectors = 'fleet-control cronDrift (trigger drift, auto-restore) + workerCensus daily (FIRING-NO-OUTPUT / DEGRADED) + fleet-dashboard scheduled-no-run (0 invocations vs expected fires)';

DROP VIEW IF EXISTS fleet_execution_coverage;
CREATE VIEW fleet_execution_coverage AS
  SELECT s.name AS worker, s.crons_json, s.exec_engine, s.retry_policy, s.timeout_policy, s.failure_detectors,
         c.worker_class, f.verdict AS census_verdict, f.ts AS census_ts
  FROM worker_schedules s
  LEFT JOIN worker_output_contracts c ON c.worker = s.name
  LEFT JOIN fleet_worker_census f ON f.worker = s.name;

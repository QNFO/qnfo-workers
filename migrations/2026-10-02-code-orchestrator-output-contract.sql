-- HEARTBEAT-ATTRIBUTION-GAP-1 (agent_issues 1831, 2026-10-02, pillar: autonomy). Record of a row applied live; idempotent.
--
-- The issue read "qnfo-code-orchestrator, qnfo-kaizen and qnfo-fleet-control have zero fleet_heartbeat rows" as these
-- loops being invisible to health checks. Measured 2026-10-02 10:55Z, that was not the gap. fleet_heartbeat is read only
-- as the fallback for workers HTTP cannot see (qnfo-fleet-control CRON-ONLY-HEARTBEAT-1; 7 of 44 workers write it). All
-- three are workers_dev and answered /health 200, and worker_live_audit probed them at 10:53:54Z (http 200, SYNC).
-- code_tasks has exactly one writer, qnfo-code-orchestrator/worker.js (INSERT INTO code_tasks).
--
-- The real gap: the orchestrator's */10 cron had no worker_output_contracts row, so the worker census reported it
-- UNMEASURED and nothing proved its cron produces output; qnfo-kaizen and qnfo-fleet-control already have contracts.
-- The contract counts the code-task.* events the tick writes to cloud_ops_events (108 in the 24h before 11:00Z).
--
-- Rollback: DELETE FROM worker_output_contracts WHERE worker = 'qnfo-code-orchestrator';

INSERT OR IGNORE INTO worker_output_contracts (worker, workflow, output, verify, state, output_sql, worker_class, class_disposition)
VALUES ('qnfo-code-orchestrator',
        'cron */10: code-loop tick (intake, plan, edit, verify, publish)',
        'cloud_ops_events code-task.* rows (job=qnfo-code-orchestrator) and code_tasks transitions',
        'COUNT of code-task.* events in the census window > 0',
        'ACTIVE',
        'SELECT COUNT(*) AS n FROM cloud_ops_events WHERE job = ''qnfo-code-orchestrator'' AND kind LIKE ''code-task.%'' AND ts >= :since_iso',
        'executor',
        'keep: the code loop, the ACT-BRIDGE-1 doer (sole writer of code_tasks)');

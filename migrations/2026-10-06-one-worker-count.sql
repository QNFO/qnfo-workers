-- ONE-WORKER-COUNT-1 (2026-10-06, pillar core, transformation lever T5.10). Measured 2026-10-06 08:35Z: fleet_budget.workers
-- read 31 (qnfo-fleet-control budgetAudit, the live Cloudflare scripts census), metric_registry.worker_count read 32
-- (qnfo-lifecycle runMetricFreshness: COUNT(*) of service_registry whatever the row's state) and the transformation tick of
-- 08:01Z judged wave W1 on the registry figure. One census from now on: qnfo-fleet-control 0.4.138 writes worker_count from
-- the same live scripts list it writes fleet_budget.workers from, in the same tick, and worker_count_disagreement (guard,
-- INTEGRITY-GUARDS-1) counts the names present in only one of the two lists (live scripts vs service_registry rows with
-- state live), naming them in cloud_ops_events worker-count-<day>. qnfo-lifecycle stops writing worker_count (code task on
-- qnfo-lifecycle/worker.js). Idempotent: INSERT OR IGNORE and guarded UPDATEs.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'worker_count_disagreement'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'worker_count_disagreement'; DELETE FROM remediation_contracts WHERE class = 'one-worker-count-1'; UPDATE metric_registry SET formula = 'count(service_registry) (fleet_tasks metric-refresh and qnfo-lifecycle, hourly)', owner = 'qnfo-fleet-control' WHERE metric = 'worker_count';

UPDATE metric_registry
SET formula = 'Live Cloudflare Workers scripts on the account (CF API workers/scripts, the census qnfo-fleet-control budgetAudit writes to fleet_budget.workers in the same hourly tick; ONE-WORKER-COUNT-1). service_registry rows with state live are compared to it in worker_count_disagreement; qnfo-lifecycle no longer writes this row',
    source_of_truth = 'CF API /accounts/<acct>/workers/scripts via qnfo-fleet-control budgetAudit (hourly); equals fleet_budget.workers.current',
    owner = 'qnfo-fleet-control',
    disposition_actor = 'qnfo-fleet-control scan + optimizeFleet (hourly); retirements under OWNER-STANDING-GRANT-1'
WHERE metric = 'worker_count';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('worker_count_disagreement', 'fleet', 'guard',
  'Names present in only one of the two worker lists: live Cloudflare scripts (CF API workers/scripts) and service_registry rows with kind worker and state live; the symmetric difference, written by qnfo-fleet-control budgetAudit in the tick that writes worker_count and fleet_budget.workers (ONE-WORKER-COUNT-1). The names are in cloud_ops_events worker-count-<day> (only_live, only_registry)',
  'qnfo-audit.cloud_ops_events kind worker-count (id worker-count-<day>); metric_registry.worker_count; fleet_budget.workers',
  '1 on 2026-10-06 (32 registry rows against 31 live scripts, read by hand before the writer landed)',
  '0 at every tick (the three readers agree)',
  'qnfo-fleet-control',
  'trigger gt 0 -> METRIC-TRIGGER issue naming the only_live / only_registry names (migrations/2026-10-06-one-worker-count.sql)',
  'hourly', '> 0', '> 2', 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'worker_count_disagreement', 'Core gap: the live scripts census and service_registry disagree on which workers exist', 'registry', 'gt', 0, 5,
  'Pillar core (ONE-WORKER-COUNT-1, lever T5.10). The live Cloudflare scripts list and service_registry (state live) name different workers, so fleet_budget.workers, metric_registry.worker_count and the transformation program''s wave exits cannot all be right. Read cloud_ops_events worker-count-<day> (kind worker-count): only_live names a script with no live registry row (qnfo-ops registryRefresh inserts missing scripts on its */30 tick; a script whose directory carries RETIRED or FOLDED is a non-canonical deploy: delete it with cf-ops-actions delete-worker after the dependency check of OWNER-STANDING-GRANT-1); only_registry names a registry row with no script (qnfo-fleet-control disposeRetired marks it deleted at 03:00Z; or set service_registry.state = ''retired'' when its directory carries a marker). Never delete a script whose directory has no marker, never raise a cap (STRATEGY s4). Definition of done: worker_count_disagreement reads 0 on two consecutive hourly ticks; record both name lists before and after in issue_triage.close_evidence.',
  'qnfo-fleet-control', 'agent_issues', 168, 1, 'ONE-WORKER-COUNT-1 (migrations/2026-10-06-one-worker-count.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'worker_count_disagreement');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
VALUES ('one-worker-count-1', NULL,
  'qnfo-fleet-control 0.4.138+ deployed (budgetAudit writes worker_count and worker_count_disagreement)',
  'observe only: the hourly budgetAudit writes metric_registry.worker_count from the live scripts census and worker_count_disagreement from its comparison with service_registry',
  'SELECT ''0'' AS expected, CASE WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''worker_count_disagreement'') IS NULL THEN ''pending: not measured yet'' WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''worker_count_disagreement'') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'') THEN ''stale: last write older than 3h'' ELSE (SELECT trim(last_value) FROM metric_registry WHERE metric = ''worker_count_disagreement'') END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 24, 'active');

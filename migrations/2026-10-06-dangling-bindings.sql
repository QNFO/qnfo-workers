-- DANGLING-BINDINGS-1 (2026-10-06, pillar core, transformation lever T9.4). A binding whose target no longer exists (a D1
-- database or KV namespace deleted under D1-FOLD-1, a queue or Vectorize index removed, a service binding to a retired
-- worker) fails at the first request that touches it, and nothing in the fleet counted it. qnfo-fleet-control 0.4.141 runs
-- a census on the daily 03:00Z tick (every live script's settings against the account's D1, KV, R2, queue, Vectorize and
-- script lists; cloud_ops_events dangling-bindings-<day> names them). Guard metric with its trigger and a contract probe.
-- Idempotent: INSERT OR IGNORE.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'dangling_bindings'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'dangling_bindings'; DELETE FROM remediation_contracts WHERE class = 'dangling-bindings-1';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('dangling_bindings', 'fleet', 'guard',
  'Bindings of live Workers scripts whose target no longer exists on the account: d1 (database id), kv_namespace (namespace id), r2_bucket (name), queue (name), vectorize (index name), service and cross-script durable_object_namespace / workflow (script name), read daily from CF API workers/scripts/<name>/settings and the account lists (qnfo-fleet-control DANGLING-BINDINGS-1, 03:00Z). Unverifiable types (ai, browser, analytics_engine, secrets, hyperdrive, assets) and unreadable lists count as unchecked, never as dangling; the names are in cloud_ops_events dangling-bindings-<day>',
  'qnfo-audit.cloud_ops_events kind dangling-bindings (id dangling-bindings-<day>); CF API account lists',
  'n/a until the first 03:00Z census after 0.4.141',
  '0 at every census',
  'qnfo-fleet-control',
  'trigger gt 0 -> METRIC-TRIGGER issue naming the script, binding and missing target (migrations/2026-10-06-dangling-bindings.sql)',
  'daily', '> 0', '> 3', 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'dangling_bindings', 'Core gap: a live worker binds a D1, KV, R2, queue, Vectorize index or service that no longer exists', 'registry', 'gt', 0, 5,
  'Pillar core (DANGLING-BINDINGS-1, lever T9.4). A live script carries a binding whose target is gone, so the first request that touches it fails with an error no probe attributes. Read cloud_ops_events dangling-bindings-<day> (kind dangling-bindings): meta.dangling lists script, binding, kind and target. Levers, in order: (1) the target was retired on purpose (D1-FOLD-1, a retired worker): remove the binding from the script''s wrangler.toml by PR; the canonical deploy installs the declared bindings, so the next deploy drops it (a code loop task on wrangler.toml is refused by DENY_PATH: a session or the fold kit does it); (2) the target was deleted by mistake and a verified backup exists (cf-ops-actions d1-backup rows, R2 ops-workspace): restore it and record the restore on the issue; (3) a service binding names a worker that was folded: point it at the host (FOLDED marker names it) with props.member. Never delete data without a verified backup, never create the missing resource to silence the count. Definition of done: dangling_bindings reads 0 on two consecutive censuses; record the bindings before and after in issue_triage.close_evidence.',
  'qnfo-fleet-control', 'agent_issues', 168, 1, 'DANGLING-BINDINGS-1 (migrations/2026-10-06-dangling-bindings.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'dangling_bindings');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
VALUES ('dangling-bindings-1', NULL,
  'qnfo-fleet-control 0.4.141+ deployed with CF_DEPLOY_TOKEN',
  'observe only: the 03:00Z tick runs danglingBindingsCensus and writes dangling_bindings and cloud_ops_events dangling-bindings-<day>',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''dangling_bindings'') IS NULL THEN ''pending: no census yet'' WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''dangling_bindings'') < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 hours'') THEN ''stale: last census older than 30h'' ELSE ''ok'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 24, 'active');

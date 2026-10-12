-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key = 'migrations_unapplied'; DELETE FROM metric_registry WHERE metric = 'migrations_unapplied'; DELETE FROM remediation_contracts WHERE class = 'fm-migration-run-cancelled'; DELETE FROM failure_modes WHERE fm_key = 'migration-run-cancelled-by-concurrency'
-- MIGRATION-UNAPPLIED-1 (2026-10-12, pillar autonomy; scripts/remediation_consumer.py and .github/workflows/apply-migrations.yml in
-- the same PR). Measured 2026-10-12T17:07Z: three migrations merged to main on 2026-10-12 had no migration_runs row at all:
-- 2026-10-12-reach-replies-subscribe-funnel.sql (PR 951, 09:01Z; its social_replies table and two reach metrics never existed,
-- so issue 2225 could not close), 2026-10-12-code-multi-file-gate.sql and 2026-10-12-merge-side-root-causes.sql (PRs 960 and
-- 1000, 13:01Z, lane merges a minute apart). The apply-migrations runs for the last two (93, 94) were cancelled by the workflow's
-- single concurrency group, which keeps only one pending run; the first had no run. MIGRATION-APPLY-FAILED-1 covers a run that
-- fails, not a run that never happens. The three were dispatched by hand at 17:07Z; the fix is structural: the runner's
-- concurrency group is per run, and the remediation consumer applies any opted-in file with no ok or superseded row on every
-- run, writing this metric and a migration-sweep event.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('migrations_unapplied', 'operational', 'guard',
  'opted-in migrations/*.sql files on main (header -- APPLY-BY: ci) with no migration_runs row of status ok or superseded after the consumer tried to apply them (MIGRATION-UNAPPLIED-1)',
  'scripts/remediation_consumer.py migrations_sweep on every remediation-consumer run; cloud_ops_events kind migration-sweep',
  '3 on 2026-10-12T17:07Z (found by hand)', '0', 'remediation-consumer', 'qnfo-ops', 'hourly', '> 0', '> 2', NULL, NULL, 'REGISTERED', 'runner');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'migrations_unapplied', 'Migration runner gap: a merged migration still has no run after the consumer tried it', 'registry', 'gt', 0, 1,
  'Pillar autonomy (MIGRATION-UNAPPLIED-1). Read the newest cloud_ops_events row of kind migration-sweep: its text names the files the consumer could not apply and migration_runs holds the error row the applier wrote (MIGRATION-APPLY-FAILED-1 is filed for each). Causes in order: (1) the file fails on D1 (a statement error): fix the file and merge again, a new sha256 runs again; (2) the file refuses its own header check (--check): fix the header; (3) the consumer run itself did not reach the sweep (read ci-status/remediation-consumer.json). DoD: the metric reads 0 after the next consumer run.',
  'qnfo-ops', 'agent_issues', 3, 1, 'MIGRATION-UNAPPLIED-1 (migrations/2026-10-12-40-migration-unapplied.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'migrations_unapplied');
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('migration-run-cancelled-by-concurrency', 'a migration merged to main never ran and nothing said so',
  'apply-migrations.yml used one concurrency group for every push; GitHub keeps one pending run per group, so the middle of three quick merges was cancelled (runs 93, 94); a cancelled run writes no migration_runs row and MIGRATION-APPLY-FAILED-1 fires only on a failing statement',
  'MIGRATION-UNAPPLIED-1: one concurrency group per run in apply-migrations.yml; scripts/remediation_consumer.py applies any opted-in file with no ok or superseded row on every run (metric migrations_unapplied, event migration-sweep)',
  'metric migrations_unapplied reads 0 and was refreshed in the last 3 hours', 'fm-migration-run-cancelled', '2026-10-12', NULL,
  'two or more merges to main within the runner''s window', 'a table, metric, trigger or contract a merged migration should have created is absent; the issue it serves cannot close', 'every change a migration carries: metrics, triggers, probes, guards');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-migration-run-cancelled', NULL, 'MIGRATION-UNAPPLIED-1', 'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''migrations_unapplied'') = ''0'' AND (SELECT last_refreshed FROM metric_registry WHERE metric = ''migrations_unapplied'') > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'') THEN ''ok'' ELSE ''migrations_unapplied reads '' || COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''migrations_unapplied''), ''null'') || '' refreshed '' || COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = ''migrations_unapplied''), ''never'') END AS observed',
  'd1-query', 3, 'qnfo-ops', 1, 'active', 'failure-mode', 45000, 5, 0);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a migration that merges must run; a runner that can be cancelled needs a second path that reads the ledger',
   'MIGRATION-UNAPPLIED-1: per-run concurrency group for apply-migrations.yml; the remediation consumer applies merged migrations with no run; metric migrations_unapplied, failure mode migration-run-cancelled-by-concurrency',
   'migration_runs read 2026-10-12T17:07Z against the 129 opted-in files on main: 3 with no row (reach-replies, code-multi-file-gate, merge-side-root-causes); apply-migrations runs 93 and 94 cancelled; the three dispatched by hand (HTTP 204)',
   'merged and deployed through the canonical path', 'the migration runner and the consumer; both idempotent (sha256 skip)', 'the Rollback line of migration 2026-10-12-40 and a revert of the PR',
   'a merged migration is applied within the hour even when its push run is lost', 'the next consumer run reads migrations_unapplied = 0 (the three were applied by the dispatched run) and no migration-sweep event with status error appears in 7 days', 'none', 'github:actions, d1:qnfo-audit');

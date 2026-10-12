-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS spof_alternate_probes; DELETE FROM analytics_metric_triggers WHERE metric_key = 'spof_alternates_untested_24h'; DELETE FROM metric_registry WHERE metric = 'spof_alternates_untested_24h'; DELETE FROM loop_watch_state WHERE key = 'chaos_drill_last'
-- CHAOS-DRILL-1 (2026-10-12, agent_issues 2180, pillar autonomy; doctrine section 10, chaos verification; qnfo-fleet-control 0.22.0
-- in the same PR). spof_registry and spof_registry_resolved record alternate_tested_at, but nothing re-ran an alternate after its
-- first run, so "tested" decayed. This table gives every resolved single point of failure a probe the hourly tick runs every 6 h:
-- a D1 query in the remediation-contract shape (one row, expected = observed passes) that reads the alternate's own evidence,
-- and for the two standby paths an exercise the tick forces first (the qnfo-pdf relay batch; the qnfo-ai router-down drill, which
-- answers 503 and writes a router-drill event). A pass stamps alternate_tested_at on both registers; a failure files
-- CHAOS-DRILL-FAILED-1: <component> and the next pass closes it. window_note says how far back the evidence may be: a path that
-- runs on its own every tick is held to 24 h; an event-driven path (a relapse reopened, a lane merge) to 7 days, because the drill
-- cannot manufacture a relapse without harm; the probe still runs every 6 h and the stamp is the run, not the evidence age.
CREATE TABLE IF NOT EXISTS spof_alternate_probes (
  component TEXT PRIMARY KEY,
  probe_sql TEXT NOT NULL,
  exercise TEXT,
  window_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_pass INTEGER,
  last_pass_at TEXT,
  last_observed TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT OR IGNORE INTO spof_alternate_probes (component, probe_sql, exercise, window_note, enabled) VALUES
 ('fleet cron scheduler (fleet_crons)',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM fleet_tick WHERE source LIKE ''cron:qnfo-fleet-dashboard%'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) > 0 THEN ''ok'' ELSE ''no fleet_tick from the dashboard producer in 24 h'' END AS observed',
  NULL, '24 h: the dashboard inserts fleet_tick on its own */15 cron', 1),
 ('the fleet tick (10-minute fixer, age ladder, scorecard)',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(DISTINCT source) FROM fleet_tick WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) >= 2 THEN ''ok'' ELSE ''fewer than two fleet_tick producers in 24 h'' END AS observed',
  NULL, '24 h: two direct producers (code orchestrator */10, dashboard */15)', 1),
 ('issue history in one table',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM issue_lifecycle WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) > 0 AND (SELECT COUNT(*) FROM agent_issues_tombstone) >= 1 THEN ''ok'' ELSE ''no issue_lifecycle row in 24 h or no tombstone table rows'' END AS observed',
  NULL, '24 h: every status change writes issue_lifecycle; deletes keep a tombstone', 1),
 ('remediation reopen on relapse',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM recurrence_guard_actions WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) > 0 THEN ''ok'' ELSE ''no recurrence_guard_actions row in 7 days'' END AS observed',
  NULL, '7 days: the D1 path acts only when a closure relapses; the drill does not manufacture a relapse', 1),
 ('qnfo-fleet-control remediation tick',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_verifications WHERE COALESCE(verifier, '''') NOT LIKE ''qnfo-fleet-control%'' AND verified_at > datetime(''now'', ''-24 hours'')) > 0 THEN ''ok'' ELSE ''no verification by the runner consumer in 24 h'' END AS observed',
  NULL, '24 h: scripts/remediation_consumer.py writes verifications from the GitHub runner', 1),
 ('qnfo-audit D1',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM continuity_snapshots WHERE ok = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'')) > 0 THEN ''ok'' ELSE ''no ok continuity snapshot in 48 h'' END AS observed',
  NULL, '48 h: the daily logical snapshot to R2 and the artifact (scripts/continuity_snapshot.py)', 1),
 ('qnfo-pdf cron */10 (SCHOLAR-PDF-ALL-1)',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''pdf-backlog-relay'' AND status = ''ok'' AND text LIKE ''relayed%'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'')) > 0 THEN ''ok'' ELSE ''the forced relay batch left no relayed event in 2 h'' END AS observed',
  'pdf-relay', '2 h after the forced relay batch (exercise pdf-relay)', 1),
 ('qnfo-ai router',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''router-drill'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'')) > 0 THEN ''ok'' ELSE ''the router-down drill left no router-drill event in 2 h'' END AS observed',
  'router-drill', '2 h after the forced router-down drill (exercise router-drill; qnfo-ai answers 503 by design)', 1),
 ('qnfo-code-orchestrator',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM branch_hygiene_log WHERE action = ''merge-stale-pr'' AND ok = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) > 0 THEN ''ok'' ELSE ''no lane merge of a session pull request in 7 days'' END AS observed',
  NULL, '7 days: the stale-PR lane merges session pull requests when the code loop cannot', 1),
 ('qnfo-deploy-guard work claims',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT version FROM fleet_heartbeat WHERE worker = ''qnfo-code-orchestrator'') GLOB ''0.[4-9].*'' OR (SELECT version FROM fleet_heartbeat WHERE worker = ''qnfo-code-orchestrator'') GLOB ''0.[1-9][0-9].*'' OR (SELECT version FROM fleet_heartbeat WHERE worker = ''qnfo-code-orchestrator'') GLOB ''[1-9]*'' THEN ''ok'' ELSE ''the orchestrator heartbeat is older than 0.3.21 (CLAIMS-FIRST-1 fail-open)'' END AS observed',
  NULL, 'code state: the fail-open is code in qnfo-code-orchestrator 0.3.21+; the heartbeat proves the version is live', 1),
 ('Zenodo deposit',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status = ''published'' AND published_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-48 hours'')) > 0 THEN ''ok'' ELSE ''no in-house publication in 48 h'' END AS observed',
  NULL, '48 h: in-house publication is the only path since NO-ZENODO-DOI-0', 1),
 ('qnfo-ops /ops/deploy',
  'SELECT ''ok'' AS expected, ''no D1 evidence: the direct_content_deploy fallback writes no ledger row'' AS observed',
  NULL, 'disabled until DEPLOY-SECOND-PATH-LEDGER-1 lands: scripts/direct_content_deploy.py writes a deployment_history row (action deploy-direct) so the drill can read it', 0);
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('spof_alternates_untested_24h', 'operational', 'target',
  'spof_alternate_probes rows (enabled) whose last pass is older than 24 h or that never passed: resolved single points of failure whose alternate path the 6-hourly chaos drill could not confirm (CHAOS-DRILL-1)',
  'qnfo-fleet-control chaosDrill (hourly tick, runs every 6 h); cloud_ops_events kind chaos-drill',
  'unmeasured before 2026-10-12 (alternates were tested once, by hand)', '0', 'qnfo-fleet-control', 'qnfo-fleet-control', '6h', '> 0', '> 3', NULL, NULL, 'REGISTERED', 'worker');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'spof_alternates_untested_24h', 'Chaos drill: a resolved single point of failure has an alternate the drill could not confirm in 24 h', 'registry', 'gt', 0, 2,
  'Pillar autonomy (CHAOS-DRILL-1, agent_issues 2180). Read SELECT component, last_observed, last_pass_at, window_note FROM spof_alternate_probes WHERE enabled = 1 AND (last_pass IS NOT 1 OR last_pass_at < datetime(''now'', ''-24 hours'')): each row names the alternate whose evidence is missing and the CHAOS-DRILL-FAILED-1 issue the drill filed carries the same text. Causes in order: (1) the alternate really stopped (the dashboard cron, the runner consumer, the continuity snapshot, the relay): repair that loop; (2) the exercise could not run (no SVC binding, qnfo-ai answered other than 503): read the chaos-drill event; (3) the evidence table or column changed: fix probe_sql by migration. DoD: the metric reads 0 after the next drill (every 6 h; POST /chaos-drill?force=1 on qnfo-fleet-control runs one now).',
  'qnfo-fleet-control', 'agent_issues', 6, 1, 'CHAOS-DRILL-1 (migrations/2026-10-12-39-chaos-drill-probes.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'spof_alternates_untested_24h');
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'DEPLOY-SECOND-PATH-LEDGER-1: the direct_content_deploy fallback writes no deployment_history row, so its drill cannot be read from D1',
  'Charter pillar: core. CHAOS-DRILL-1 (migration 2026-10-12-39) probes every resolved single point of failure from D1 evidence; the alternate of qnfo-ops /ops/deploy (canonical-deploy.yml falling back to scripts/direct_content_deploy.py, drilled 2026-10-09 run 37903533048 on idea-hub 1.8.1) leaves no row anywhere in qnfo-audit, so its probe row is disabled (spof_alternate_probes.enabled = 0). Change: scripts/direct_content_deploy.py writes one deployment_history row per deploy (resource_type worker, resource_name <worker>, action deploy-direct, deployed_by canonical-deploy/direct_content_deploy, status success|failed, notes with the version and the reason the fallback ran) through the D1 REST API with the repository token it already holds, then the probe row is enabled with SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM deployment_history WHERE action = ''deploy-direct'' AND deployed_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 days'')) THEN ''ok'' ELSE ''no deploy-direct row in 30 days'' END AS observed, and a monthly forced fallback drill on a low-risk worker follows. Definition of done: a deploy-direct row exists after the next fallback run and the probe row is enabled by migration.' || char(10) || 'code-task: repo=qnfo-workers path=scripts/direct_content_deploy.py',
  'migration-2026-10-12-39', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'DEPLOY-SECOND-PATH-LEDGER-1:%' AND status = 'open');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'an alternate path counts as tested only while its own evidence is fresh; a date written once decays',
   'CHAOS-DRILL-1: qnfo-fleet-control 0.22.0 re-tests every resolved SPOF alternate every 6 h from spof_alternate_probes, forcing the two standby paths first; metric spof_alternates_untested_24h, issue CHAOS-DRILL-FAILED-1 per failing component',
   'spof_registry_resolved 12 rows with alternate_tested_at between 2026-10-06 and 2026-10-12, none re-tested since; evidence tables read 2026-10-12T16:58Z: dashboard fleet_tick 49/24h, recurrence_guard_actions 12/7d, consumer verifications 5891/24h, continuity snapshots 2/48h, relay events 3/7d, router-drill 1/7d',
   'merged and deployed through the canonical path', 'one hourly step; two forced exercises per 6 h (one PDF relay batch, one 503 from qnfo-ai)', 'the Rollback line of migration 2026-10-12-39 and a revert of the PR',
   'the fleet proves its alternate paths on a schedule instead of once', 'the first drill passes 10 of 11 enabled probes (the lane-merge probe depends on a session PR merged by the lane within 7 days) and files at most one CHAOS-DRILL-FAILED-1 issue; spof_alternates_untested_24h reads 0 or 1', 'none', 'd1:qnfo-audit, binding:SVC_QNFO_PDF, binding:SVC_QNFO_AI');

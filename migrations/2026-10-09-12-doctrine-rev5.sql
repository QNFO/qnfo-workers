-- DOCTRINE-REV5-1 (2026-10-09, pillar autonomy). Owner directive 2026-10-09: Autonomous Operation Doctrine revision 5,
-- adopted verbatim in docs/AUTONOMOUS-OPERATION-DOCTRINE.md with readings (a)-(d), (f)-(l). Revision 5 adds Part I (the
-- tick, default action, backlog as driver, executor roster, no user routing) and four scorecard headlines (section 24).
-- DOCTRINE-HEADLINE-1 (#847, merged 09:53Z) already measures three section 24 lines: tick_completion_24h (heartbeat slots),
-- initiation_rate_7d (work items by filer label, a proxy) and owner_dispatch_7d. This file adds what is still unmeasured
-- and files a builder for each clause with no machinery:
--   mttr_h_7d = mean hours from created_at to the close of agent_issues closed in 7 days (section 24 "MTTR <= 1 cycle").
--               407.6 h over 467 closes at authoring; trigger floor 24 h, doctrine target one cycle. Refreshed hourly by
--               D1 trigger doctrine_rev5_tick on the first fleet_tick row of each hour (no metric_registry trigger, so no
--               deep chain, agent_issues #2210).
--   Builders (each with a closing probe on its metric): TICK-SEQUENCE-LEDGER-1 (section 1 per-step evidence; the same
--   title and probe as open PR 848, so whichever lands first files it once), BACKLOG-DRIVER-1 (section 3 priority
--   function and driver drain), EXECUTOR-ROSTER-1 (section 4 roster and member health).
--   No worker, cron or model call is added: the metric is a pure D1 read on an existing tick.
--   Every statement is idempotent; no compound SELECT (D1-COMPOUND-LIMIT-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS doctrine_rev5_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'mttr_h_7d'; DELETE FROM metric_registry WHERE metric = 'mttr_h_7d' (the builder issues and the decision_log row stay; they hold evidence)

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('mttr_h_7d', 'operational', 'target', 'mean hours from created_at to close (updated_at) of agent_issues with status closed or resolved whose close falls in the last 7 days (doctrine rev 5 section 24 MTTR)', 'qnfo-audit.agent_issues (DOCTRINE-REV5-1, migrations/2026-10-09-12-doctrine-rev5.sql)', '407.6 h over 467 closes at authoring (2026-10-09)', '<= 1 cycle (doctrine section 24); trigger floor 24 h', 'qnfo-kaizen', 'trigger gt 24', '1h', '> 24', '> 168', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS doctrine_rev5_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(ROUND(AVG((updated_at - created_at) / 3600000.0), 1), 0) FROM agent_issues
      WHERE status IN ('closed', 'resolved') AND typeof(updated_at) = 'integer' AND typeof(created_at) = 'integer'
        AND updated_at >= (CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000) AND updated_at >= created_at) AS TEXT)
  WHERE metric = 'mttr_h_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'mttr_h_7d', 'Doctrine breach: issues take more than a day to close on average', 'registry', 'gt', 24, 5,
  'Pillar autonomy (doctrine rev 5 sections 3 and 24). Group the closes of 7 days by title prefix and by owner (issue_triage.owner) and find the families with the longest open-to-close time; the lever is the loop that owns the slowest family (drain it, or give its issues a closing probe so the hourly remediation tick closes them on recovery). Do not close issues to lower this metric (guard issue_wontfix_share_7d). Done = mttr_h_7d <= 24 at two refreshes.',
  'qnfo-kaizen', 'agent_issues', 72, 1, 'DOCTRINE-REV5-1 (migrations/2026-10-09-12-doctrine-rev5.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'mttr_h_7d');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'TICK-SEQUENCE-LEDGER-1: no ledger records which of the eleven tick steps ran',
  'Charter pillar: autonomy (doctrine rev 5 sections 1 and 24). fleet_tick gets a row per cron or heartbeat, so "the tick ran" is evidenced, but nothing records the sequence section 1 requires (reconcile, pull, dispatch or execute, verify, compare, log, report, probe, refresh, advance, emit tick evidence), so tick completion as section 24 defines it cannot be measured. Machine owner: qnfo-fleet-control. Build, inside an existing hourly path and with no new cron or paid call: a tick_runs table (tick id, step, ok, evidence, ts) written by the loop that already does each step (drop detector, v_issue_queue pull, code loop dispatch, remediation verify, decision_outcomes compare, decision_log, digest, fm-* probe, freshness refresh, horizon objective); then metric tick_sequence_completion_24h = ticks with all 11 steps ok / ticks in 24 h, with its analytics_metric_triggers row (tick_completion_24h from #847 measures heartbeat slots only). Trigger: this issue is open. Verification: the closing probe reads tick_sequence_completion_24h with a value.',
  'claude-chat-doctrine-rev5-20261009', 'autonomy', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'TICK-SEQUENCE-LEDGER-1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BACKLOG-DRIVER-1: the queue orders by priority then age, not by the doctrine priority function, and drain is not measured',
  'Charter pillar: autonomy (doctrine rev 5 section 3). v_issue_queue orders critical, high, medium, low, then oldest first (PRIORITY-QUEUE-1, owner directive 2026-10-03: no due dates). Section 3 asks for impact x probability x (capability_gain + reach_gain) x (1 / remediation_cost), recomputed on every pull, with anything older than one tick pulled ahead of newer items, and section 24 grades driver drain (items pulled per tick / items eligible). Neither the factors nor the pulls are recorded. Machine owner: qnfo-fleet-control (queue) with qnfo-code-orchestrator (the main puller). Build: score columns on issue_triage (impact, probability, capability_gain, reach_gain, remediation_cost, each 1-5, filled at triage with defaults from priority and category), a v_issue_queue_v2 ordered by the product with the age escalation, pullers record each pull in a queue_pulls ledger, and metric driver_drain_24h = pulls / eligible items, with its trigger. Aging is not a due date, so PRIORITY-QUEUE-1 still holds. Trigger: this issue is open. Verification: the closing probe reads driver_drain_24h with a value.',
  'claude-chat-doctrine-rev5-20261009', 'autonomy', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'BACKLOG-DRIVER-1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'EXECUTOR-ROSTER-1: no single executor roster with member health',
  'Charter pillar: autonomy and core (doctrine rev 5 section 4). capability_ledger names the worker holding each capability, worker_live_audit probes workers, and the model roster lives in the routers (7 of 18 roster models absent from the catalog, #2147), but there is no one roster of who can execute what with dead or degraded members flagged, so "lookup before escalating" has no table to read and roster SPOFs are invisible. Machine owner: qnfo-fleet-control. Build: v_executor_roster joining capability_ledger, worker_live_audit (http, probed_at) and the model routes, one row per (capability, executor) with healthy = probe ok in 24 h; metrics roster_capabilities_single_executor (capabilities with one healthy executor, target 0, a section 15 SPOF) and roster_members_degraded (target 0), each with its trigger. Trigger: this issue is open. Verification: the closing probe reads roster_members_degraded with a value.',
  'claude-chat-doctrine-rev5-20261009', 'autonomy', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'EXECUTOR-ROSTER-1:%');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''tick_sequence_completion_24h'') IS NOT NULL THEN ''1'' ELSE ''0'' END AS observed'
WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'TICK-SEQUENCE-LEDGER-1:%');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''driver_drain_24h'') IS NOT NULL THEN ''1'' ELSE ''0'' END AS observed'
WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'BACKLOG-DRIVER-1:%');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''roster_members_degraded'') IS NOT NULL THEN ''1'' ELSE ''0'' END AS observed'
WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'EXECUTOR-ROSTER-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-chat-doctrine-rev5-20261009', 'revision 5 binds once each new clause has machinery or a filed builder with a closing probe', 'adopted doctrine revision 5 verbatim with readings (a)-(d), (f)-(l); metric mttr_h_7d with trigger; builders TICK-SEQUENCE-LEDGER-1, BACKLOG-DRIVER-1, EXECUTOR-ROSTER-1; repaired the revision 3 metric refresh (#2210)', 'owner upload 2026-10-09; at authoring mttr_h_7d = 407.6 h over 467 closes; #847 had already registered tick completion, initiation rate and owner dispatch; the revision 3 metrics were frozen since 07:37Z (#2210)', 'every section 24 headline is measured or has a builder', 'metric_registry, analytics_metric_triggers, one fleet_tick trigger, three agent_issues', 'the Rollback line', 'the fleet grades MTTR; three doctrine gaps have owners and closing probes', 'mttr_h_7d breaches at its first refresh and files one METRIC-TRIGGER issue; the three builders stay open until their metrics exist', 'none directly; MTTR is an autonomy lever', 'doctrine file, D1 metric loop, migration runner'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'adopted doctrine revision 5%');

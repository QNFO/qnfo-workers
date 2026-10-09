-- DOCTRINE-HEADLINE-1 (2026-10-09, pillar autonomy; owner text of 2026-10-09 that adds Part I "The operating loop" and the
-- section 24 headline lines). Revision 4 machinery (2026-10-09-09-doctrine-rev4.sql) measures autonomy_rate_7d, calibration,
-- depth, continuity and freshness; nothing measured the three lines the new text calls headline:
--   initiation_rate_7d       decisions initiated without instruction / total decisions. Measured on agent_issues opened in
--                            7 days: 1 - (owner-instructed rows / rows). Owner-instructed = source names the owner or a chat
--                            session, or title OWNER-TASK-*. Baseline 2026-10-09T10:00Z: 0.851 (about 61 of 408), live dry run of the refresh expression.
--                            Guard: an owner request is direction, never a defect. The lever is anticipation (a detector
--                            that files the item before the owner has to), never relabelling, suppressing or delaying an
--                            owner request; a fall in owner rows with no new detector is not a remedy.
--   tick_slot_coverage_24h   ticks that ran / scheduled ticks. The fleet tick is the 10-minute slot; measured as slots in the
--                            last 24 h (from the first fleet_tick row if younger) holding at least one cron: fleet_tick row.
--                            Baseline 105 of 105 slots (two independent cron sources). This proves the heartbeat ran, not
--                            that all eleven steps of section 1 ran inside it; TICK-SEQUENCE-LEDGER-1 (filed below) builds
--                            the per-step ledger so the stronger claim becomes measurable.
--   owner_dispatched_items_7d  the user's side of the dispatch rate (target 0): human_actions cards opened in 7 days that
--                            v_human_action_gate classes as fleet work and that were not rerouted, i.e. fleet items that
--                            reached the owner's queue. Baseline 20 (18 resolved, 2 done; all opened before or around the
--                            AUTONOMY-FIRST gate of 2026-10-08), so it breaches at first refresh and decays as the gate holds.
-- Refresh: trigger doctrine_headline_tick on the fleet tick in the first ten minutes of each hour (metric_registry writes only,
-- no issue insert, so no deep chain: D1-TRIGGER-DEPTH-1). No compound SELECT has more than three terms (D1-COMPOUND-LIMIT-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS doctrine_headline_tick; DELETE FROM analytics_metric_triggers WHERE notes LIKE 'DOCTRINE-HEADLINE-1%'; DELETE FROM metric_registry WHERE metric IN ('initiation_rate_7d','tick_slot_coverage_24h','owner_dispatched_items_7d') (the TICK-SEQUENCE-LEDGER-1 issue stays; it is evidence)

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('initiation_rate_7d', 'operational', 'target', '1 - agent_issues opened in 7 days whose source names the owner or a chat session (or title OWNER-TASK-*) / agent_issues opened in 7 days (doctrine section 24 headline: initiation rate). Never moved by relabelling or suppressing owner requests.', 'qnfo-audit.agent_issues', '0.851 (2026-10-09)', '>= 0.95, rising to 1', 'qnfo-fleet-control', 'trigger lt 0.90', '1h', '< 0.95', '< 0.7', NULL, NULL, 'MEASURED', 'computed'),
 ('tick_slot_coverage_24h', 'operational', 'target', '10-minute slots in the last 24 h (from the first fleet_tick row if younger) with at least one cron: fleet_tick row / slots elapsed (doctrine section 24 tick completion, heartbeat level)', 'qnfo-audit.fleet_tick', '1.0 (105 of 105, 2026-10-09)', '>= 0.98', 'qnfo-fleet-control', 'trigger lt 0.95', '1h', '< 0.98', '< 0.8', NULL, NULL, 'MEASURED', 'computed'),
 ('owner_dispatched_items_7d', 'operational', 'target', 'human_actions opened in 7 days that v_human_action_gate classes as fleet work and were not rerouted (doctrine section 24 dispatch rate, the user number)', 'qnfo-audit.human_actions, v_human_action_gate', '20 (2026-10-09)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 10', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS doctrine_headline_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT CASE WHEN COUNT(*) = 0 THEN 1 ELSE ROUND(1.0 - 1.0 * SUM(CASE WHEN COALESCE(source, '') LIKE '%owner%' OR COALESCE(source, '') LIKE 'chat%'
                OR COALESCE(title, '') LIKE 'OWNER-TASK-%' THEN 1 ELSE 0 END) / COUNT(*), 3) END
      FROM agent_issues WHERE created_at > CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000) AS TEXT)
  WHERE metric = 'initiation_rate_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(MIN(1.0, 1.0 * COUNT(DISTINCT substr(ts, 1, 15)) / MAX(1.0,
               (julianday('now') - julianday(replace(replace(MIN(ts), 'T', ' '), 'Z', ''))) * 144)), 3)
      FROM fleet_tick WHERE source LIKE 'cron:%' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS TEXT)
  WHERE metric = 'tick_slot_coverage_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM v_human_action_gate g JOIN human_actions h ON h.id = g.id
      WHERE g.gate = 'fleet' AND COALESCE(h.status, '') <> 'rerouted' AND h.created_at > datetime('now', '-7 days')) AS TEXT)
  WHERE metric = 'owner_dispatched_items_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.k, v.t, 'registry', v.op, v.th, 2, v.a, v.o, 'agent_issues', 24, 1, 'DOCTRINE-HEADLINE-1 (migrations/2026-10-09-10-doctrine-headline-metrics.sql)'
FROM (
  SELECT 'initiation_rate_7d' AS k, 'Initiation gap: the owner is filing work the fleet should have found first' AS t, 'lt' AS op, 0.90 AS th, 'Pillar autonomy (doctrine section 24 headline: initiation rate). Read agent_issues of the last 7 days whose source names the owner or a chat session. For each, name the detector that should have filed it first (a metric trigger, a fm- probe, a LOOP-WATCH-1 check, a queue_sla row) and build the missing one, recording it in failure_modes with its fm- contract. Never relabel, suppress or delay an owner request to move this number. Done: initiation_rate_7d >= 0.90 at two refreshes with at least one new detector named on this issue.' AS a, 'qnfo-fleet-control' AS o
  UNION ALL SELECT 'tick_slot_coverage_24h', 'Heartbeat gap: 10-minute fleet ticks are missing', 'lt', 0.95, 'Pillar core (doctrine section 1 and section 24 tick completion). fleet_tick is written by the crons of qnfo-code-orchestrator and qnfo-fleet-dashboard. Find the slots with no row (GROUP BY substr(ts,1,15)), read each source''s cron log and worker_schedules, and restore the missing source or add a third writer so no single cron is the heartbeat. Done: tick_slot_coverage_24h >= 0.98.', 'qnfo-fleet-control'
  UNION ALL SELECT 'owner_dispatched_items_7d', 'Dispatch gap: fleet work reached the owner''s queue', 'gt', 0, 'Pillar autonomy (doctrine section 5 no user routing, section 24 dispatch rate: the user number is 0). Read human_actions opened in 7 days that v_human_action_gate classes fleet and were not rerouted. For each, find the writer (source) and make it file an agent_issues row instead, or fix the gate pattern that let it through (autonomy_first_gate). Done: owner_dispatched_items_7d = 0.', 'qnfo-fleet-control'
) v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.k);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'TICK-SEQUENCE-LEDGER-1: no ledger records which of the eleven tick steps ran',
  'Charter pillar: autonomy (doctrine section 1 The Tick, section 24 tick completion: ticks that ran their full sequence / scheduled ticks). fleet_tick proves the heartbeat (tick_slot_coverage_24h), not the sequence: reconcile, pull, dispatch, verify, compare, log, report, probe, refresh, advance, emit. Build: a tick_steps table (tick_id, step, ran 0/1, evidence) written by the fleet_tick triggers and the qnfo-fleet-control tick for the steps the fleet already runs (v_issue_accounting refresh = reconcile, v_issue_queue pull, code-task dispatch, remediation probe = verify, decision_outcomes = compare, decision_log = log, fm- detector run = probe, asset refresh, horizon objective step); a step with no machinery is recorded ran = 0 so the gap shows. Then metric tick_sequence_completion_24h (ticks whose eleven steps all ran / ticks) with its analytics_metric_triggers row. Machine owner: qnfo-fleet-control. Closes when the metric exists with a value.',
  'session_01Q8KgEhSEjrdmGHeWLQA2WE', 'autonomy', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'TICK-SEQUENCE-LEDGER-1:%');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM metric_registry WHERE metric = ''tick_sequence_completion_24h'' AND last_value IS NOT NULL) = 1 THEN ''1'' ELSE ''0'' END AS observed'
WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'TICK-SEQUENCE-LEDGER-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Q8KgEhSEjrdmGHeWLQA2WE', 'the doctrine text with Part I (tick loop) binds once its section 24 headline lines are measured; the doctrine file itself is held by the rev5 claim holder, so this change adds only the measurement', 'registered initiation_rate_7d, tick_slot_coverage_24h and owner_dispatched_items_7d with triggers and refresh; filed TICK-SEQUENCE-LEDGER-1 for the per-step tick ledger', 'live reads 2026-10-09T10:00Z: 408 issues in 7 days, about 61 owner-instructed (0.851); fleet_tick 105 of 105 slots since 2026-10-08T16:00Z; 20 fleet-gated owner cards in 7 days', 'every section 24 headline line has a measured number or a builder', 'metric_registry, analytics_metric_triggers, one agent_issues row', 'the Rollback line', 'the fleet grades its own initiation, heartbeat and owner routing', 'first refresh: initiation_rate_7d 0.851 (breach at 0.90, files the anticipation issue), tick_slot_coverage_24h 1.0, owner_dispatched_items_7d 20 (breach, files its issue)', 'none directly', 'D1 metric loop, doctrine file claim (observed, not written)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'registered initiation_rate_7d%');

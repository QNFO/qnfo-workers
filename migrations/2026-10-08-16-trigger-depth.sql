-- D1-TRIGGER-DEPTH-1 (2026-10-08, pillar autonomy; incident record). D1 refuses a write whose trigger programs nest more
-- than 10 levels ("triggers nested too deep"), and it counts at compile time: a trigger whose WHEN is never true counts, and
-- so does an INSERT ... WHERE 0 (measured on scratch tables zz_depth_*: a 10-trigger chain compiles, 11 fails; dropped after).
-- Incident: 2026-10-08-10-queue-sla.sql (applied 15:33Z) fed fleet_tick from AFTER INSERT/UPDATE triggers on cron_fire_log and
-- fleet_heartbeat. fleet_crons.last_fired -> cron_fire_log -> fleet_tick -> the tick triggers -> agent_issues and
-- metric_registry chains went past the limit, so qnfo-code-orchestrator's fleet_crons update, every cron log row and every
-- worker heartbeat failed from 15:33 to 16:05Z, and no fleet_tick row was ever written. 2026-10-08-13 (15:56Z) added
-- agent_issues triggers that UPDATE agent_issues, which put cloud_ops_events and metric_registry inserts over it too
-- (15:56-16:00Z). session_01CWLpf5v1NjC9GXbM6rnH4k dropped the five triggers by hand (their SQL is in
-- bak_20261008_incident_triggers), verified real writes on cloud_ops_events, cron_fire_log, fleet_heartbeat, fleet_tick and
-- metric_registry, and a zero-row write on every core table.
-- Remedies, all in this change: scripts/apply_migrations.py compiles a zero-row INSERT, UPDATE and DELETE on every table
-- upstream of each new trigger and drops the trigger at once when D1 refuses one; qnfo-code-orchestrator 0.9.0 (*/10) and
-- qnfo-fleet-dashboard (*/15) insert fleet_tick directly, one row per 9 minutes at most (two producers, no trigger feeder);
-- 2026-10-08-13 normalises unmapped issue enums on the tick instead of in a self-updating trigger.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261008_incident_triggers
-- Rollback: none for the drops (recreating the feeders re-creates the incident); DELETE FROM failure_modes WHERE fm_key = 'trigger-depth'; DELETE FROM remediation_contracts WHERE class = 'fm-trigger-depth'

DROP TRIGGER IF EXISTS fleet_tick_from_cron;
DROP TRIGGER IF EXISTS fleet_tick_from_heartbeat_ins;
DROP TRIGGER IF EXISTS fleet_tick_from_heartbeat_upd;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('trigger-depth', 'fleet writes refused with "triggers nested too deep" (cron log, heartbeats, events, metrics; 15:33-16:05Z)', 'D1 limits trigger nesting to 10 levels at compile time; trigger feeders on cron_fire_log/fleet_heartbeat and self-updating agent_issues triggers made chains deeper', 'feeders and self-updating triggers dropped; fleet_tick fed by two workers directly; migration runner canary drops any new trigger that makes a write too deep', 'cron_fire_log and fleet_tick each have a row in the last 25 minutes', 'fm-trigger-depth', '2026-10-08', 'a new trigger anywhere upstream of a deep chain', 'writes fail with SQLITE_ERROR; cron log and heartbeats go silent', 'every worker write on the affected tables');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-trigger-depth', NULL, 'D1-TRIGGER-DEPTH-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cron_fire_log WHERE fired_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-25 minutes'')) > 0 AND (SELECT COUNT(*) FROM fleet_tick WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-25 minutes'')) > 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

UPDATE spof_registry SET alternate_path = 'fleet_tick is inserted directly by two workers on their own crons: qnfo-code-orchestrator (*/10) and qnfo-fleet-dashboard (*/15); no trigger feeds it (D1-TRIGGER-DEPTH-1)', evidence = 'the trigger feeders (cron log, heartbeats) exceeded D1''s 10-level trigger nesting and were dropped 2026-10-08 16:05Z; tested when rows with both sources are recorded', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE component = 'the fleet tick (10-minute fixer, age ladder, scorecard)';
UPDATE spof_registry SET alternate_path = 'qnfo-fleet-dashboard (*/15) also inserts fleet_tick directly, so the 10-minute fixers run while the fleet_crons dispatcher is down', evidence = 'the heartbeat feeder was a D1 trigger and was dropped (D1-TRIGGER-DEPTH-1); tested when a dashboard-sourced fleet_tick row is recorded', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE component = 'fleet cron scheduler (fleet_crons)';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a D1 trigger is a free way to fan one write out to more work', 'dropped the fleet_tick trigger feeders and the self-updating agent_issues triggers; fleet_tick fed by two workers; migration runner gains a trigger-depth canary', 'D1 refused writes with triggers nested too deep at 11 levels (scratch-table measurement); cron log silent 15:33-16:05Z', 'writes restored 16:05Z; canary in scripts/apply_migrations.py', 'every qnfo-audit write whose trigger chain is deep', 'bak_20261008_incident_triggers holds every trigger''s SQL as of 16:00Z'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'dropped the fleet_tick trigger feeders%');

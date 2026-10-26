-- TRIGGER-DEPTH-AUDIT-LEAF-1 (2026-10-26, charter pillar autonomy; agent_issues 1000447 TRIGGER-DEPTH-COMPILE-1, 1000449 and 1000450 LOOP-BREAKER-1; metrics tick_slot_coverage_24h, tick_completion_24h, tick_sequence_completion_24h).
-- WHAT BROKE: since 2026-10-26 16:28:45Z every `INSERT INTO fleet_tick` and `INSERT INTO fleet_tick_heavy` is refused with "D1_ERROR: triggers nested too deep: SQLITE_ERROR" (cloud_ops_events kind
-- fleet-cron-tick-error, 19 pairs by 17:07Z; the compile-time sweep filed 1000447 with the refused statements). D1 counts trigger nesting at COMPILE time, so a WHEN clause that never holds does not help.
-- The tick rows of 16:3xZ onwards exist only because the OR IGNORE retry of FLEET-TICK-ISOLATE-1 commits them (sources cron:qnfo-code-orchestrator:isolated and cron:qnfo-fleet-dashboard:isolated):
-- the heartbeat is alive, the fixers behind it are not run as designed.
-- CAUSE: migrations/2026-10-26-research-config-audit.sql (applied 16:27:57Z) added AFTER INSERT / AFTER UPDATE triggers on ops_config that INSERT INTO cloud_ops_events. Three fleet_tick triggers
-- (research_parallel_autorevert, _autoraise, _autolower) and breach_selfheal_heavy_tick write ops_config research_* keys, and cloud_ops_events carries 17 triggers whose tail runs
-- tool_error_rate_filer_v3_ins -> agent_issues -> owner_request_requires_card -> human_actions -> human_actions_default_adopt_ai -> decision_log -> decision_predictions_parse. The live fleet graph
-- (qnfo-graph, trigger-depth finding, 16:32Z) names the new longest cascade: fleet_tick -> research_parallel_autorevert -> ops_config -> ops_config_research_audit_ins -> cloud_ops_events ->
-- tool_error_rate_filer_v3_ins -> agent_issues -> owner_request_requires_card -> human_actions -> human_actions_default_adopt_ai -> decision_log -> decision_predictions_parse: 6 trigger programs.
-- Before the audit it was 5 (fleet_tick -> retention_prune_tick_v2 -> cloud_ops_events -> ... -> decision_predictions_parse) and every tick statement compiled.
-- FIX: the audit stays, its target moves. The two triggers keep their names, WHEN clauses and row contents but INSERT INTO config_change_events, a leaf table with no trigger, so the cascade through
-- ops_config ends at depth 2. v_config_change_events unions the one event already in cloud_ops_events (the positive control of 16:27:48Z) with the leaf, and the two probes that read config-change events
-- (contract issue-100626, detector fm-research-config-unlogged) read the view, so what they measure is unchanged and they cannot flap. No forwarder trigger is added: a forwarder from fleet_tick_heavy into
-- cloud_ops_events would sit at the same depth the audit just broke, and nothing else reads the events (git grep config-change: the audit migration and its suite only).
-- The audit is not weakened: every research_* insert or value change still leaves one row with old value, new value and note (warn without a note), now in config_change_events.
-- This file does not edit the other session's migration (its suite replays that file and stays valid); it supersedes the trigger bodies on live data. Detector fm-audit-trigger-writes-event-table keeps it
-- from coming back: no trigger on ops_config may insert into cloud_ops_events.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_config_audit_triggers
-- Rollback: DROP TRIGGER IF EXISTS ops_config_research_audit_ins; DROP TRIGGER IF EXISTS ops_config_research_audit_upd; UPDATE remediation_contracts SET verify_probe = replace(replace(verify_probe, 'FROM v_config_change_events e WHERE e.kind', 'FROM cloud_ops_events e WHERE e.kind'), 'FROM v_config_change_events WHERE kind', 'FROM cloud_ops_events WHERE kind') WHERE class IN ('issue-100626', 'fm-research-config-unlogged'); DROP VIEW IF EXISTS v_config_change_events
-- Rollback note: after the line above, run the two CREATE TRIGGER texts saved in bak_20261026_config_audit_triggers to get the previous behaviour back. They insert into cloud_ops_events directly and put the fleet_tick cascade at 6 programs again, so restore them only together with a shorter tail. config_change_events keeps its rows.
-- spof-review: removes a single point of failure (one trigger body could stop the 10-minute heartbeat from running its fixers); adds none

CREATE TABLE IF NOT EXISTS bak_20261026_config_audit_triggers AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'trigger' AND name IN ('ops_config_research_audit_ins', 'ops_config_research_audit_upd');

CREATE TABLE IF NOT EXISTS config_change_events (id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'config-change', text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE INDEX IF NOT EXISTS idx_config_change_events_ts ON config_change_events (ts);

DROP TRIGGER IF EXISTS ops_config_research_audit_ins;
DROP TRIGGER IF EXISTS ops_config_research_audit_upd;

CREATE TRIGGER IF NOT EXISTS ops_config_research_audit_ins AFTER INSERT ON ops_config WHEN NEW.key LIKE 'research_%' AND NEW.key NOT IN ('research_repo_sync_cursor', 'research_repo_catchup_at') BEGIN INSERT INTO config_change_events (id, ts, kind, text, meta, job, status) VALUES ('cfg-' || lower(hex(randomblob(8))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'config-change', 'CONFIG-CHANGE-AUDIT-1: ' || NEW.key || ' set to ' || substr(COALESCE(NEW.value, 'NULL'), 1, 120) || ' (insert or replace), note: ' || COALESCE(NULLIF(substr(NEW.note, 1, 160), ''), 'none'), json_object('key', NEW.key, 'new', substr(COALESCE(NEW.value, 'NULL'), 1, 400), 'note', NEW.note, 'op', 'insert'), 'ops_config', CASE WHEN COALESCE(NEW.note, '') = '' THEN 'warn' ELSE 'ok' END); END;

CREATE TRIGGER IF NOT EXISTS ops_config_research_audit_upd AFTER UPDATE ON ops_config WHEN NEW.key LIKE 'research_%' AND NEW.key NOT IN ('research_repo_sync_cursor', 'research_repo_catchup_at') AND NEW.value IS NOT OLD.value BEGIN INSERT INTO config_change_events (id, ts, kind, text, meta, job, status) VALUES ('cfg-' || lower(hex(randomblob(8))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'config-change', 'CONFIG-CHANGE-AUDIT-1: ' || NEW.key || ' changed from ' || substr(COALESCE(OLD.value, 'NULL'), 1, 120) || ' to ' || substr(COALESCE(NEW.value, 'NULL'), 1, 120) || ', note: ' || COALESCE(NULLIF(substr(NEW.note, 1, 160), ''), 'none'), json_object('key', NEW.key, 'old', substr(COALESCE(OLD.value, 'NULL'), 1, 400), 'new', substr(COALESCE(NEW.value, 'NULL'), 1, 400), 'note', NEW.note, 'old_note', OLD.note, 'op', 'update'), 'ops_config', CASE WHEN COALESCE(NEW.note, '') = '' OR NEW.note IS OLD.note THEN 'warn' ELSE 'ok' END); END;

CREATE VIEW IF NOT EXISTS v_config_change_events AS
SELECT id, ts, kind, text, meta, job, status FROM cloud_ops_events WHERE kind = 'config-change'
UNION ALL
SELECT id, ts, kind, text, meta, job, status FROM config_change_events;

UPDATE remediation_contracts
   SET verify_probe = replace(replace(verify_probe, 'FROM cloud_ops_events WHERE kind = ''config-change''', 'FROM v_config_change_events WHERE kind = ''config-change'''), 'FROM cloud_ops_events e WHERE e.kind = ''config-change''', 'FROM v_config_change_events e WHERE e.kind = ''config-change''')
 WHERE class IN ('issue-100626', 'fm-research-config-unlogged')
   AND instr(verify_probe, 'config-change') > 0 AND instr(verify_probe, 'v_config_change_events') = 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('audit-trigger-writes-event-table',
  'a trigger on a table that fleet_tick triggers write inserts into cloud_ops_events, so the static trigger cascade of fleet_tick passes D1''s limit and the heartbeat statement is refused',
  'D1 counts trigger nesting at compile time: fleet_tick -> research_parallel_* -> ops_config -> ops_config_research_audit_* -> cloud_ops_events -> tool_error_rate_filer_v3_ins -> agent_issues -> owner_request_requires_card -> human_actions -> human_actions_default_adopt_ai -> decision_log -> decision_predictions_parse is 6 programs against 5 that compiled; the audit migration of 16:27:57Z on 2026-10-26 added the two ops_config triggers and 19 fleet_tick and fleet_tick_heavy statements were refused by 17:07Z',
  'TRIGGER-DEPTH-AUDIT-LEAF-1 (migrations/2026-10-26-config-audit-leaf.sql): the audit triggers insert into the leaf table config_change_events; a trigger on ops_config never inserts into cloud_ops_events; a new trigger that writes a table with a long tail is checked with scripts/fleet_graph.mjs triggerDepth (at most 5) before it merges',
  'fm-audit-trigger-writes-event-table: no trigger on ops_config inserts into cloud_ops_events',
  'fm-audit-trigger-writes-event-table', '2026-10-26', 1000447,
  'a trigger on ops_config whose body inserts into cloud_ops_events',
  'fleet-cron-tick-error "triggers nested too deep" for fleet_tick and fleet_tick_heavy; tick rows only from the OR IGNORE retry (source ending :isolated)',
  'every 10-minute fixer behind fleet_tick and the heavy self-heal steps behind fleet_tick_heavy, the heartbeat metrics and the SLA ladder');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-audit-trigger-writes-event-table', NULL, 'TRIGGER-DEPTH-AUDIT-LEAF-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND tbl_name = ''ops_config'' AND sql LIKE ''%INTO cloud_ops_events%'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-infra-breach-remediation',
  'an audit that must fire from inside the heartbeat cascade writes to a leaf table, because D1 counts trigger nesting at compile time and the tail of cloud_ops_events is five programs long',
  'TRIGGER-DEPTH-AUDIT-LEAF-1: ops_config_research_audit_ins and _upd insert into config_change_events (no trigger); v_config_change_events unions the old event; the two config-change probes read the view',
  'cloud_ops_events fleet-cron-tick-error "triggers nested too deep" 16:28:45Z to 17:07Z for fleet_tick and fleet_tick_heavy; tick sources :isolated from 16:3xZ; qnfo-graph trigger-depth finding 16:32Z: longest cascade 6 through ops_config_research_audit_ins (5 before); agent_issues 1000447',
  'applied by migration', 'two trigger bodies, one leaf table and one view, two probe texts; no worker change', 'the Rollback line (the previous trigger texts are in bak_20261026_config_audit_triggers)',
  'a research_* config change is logged without lengthening the heartbeat cascade', 'no fleet-cron-tick-error "triggers nested too deep" after the apply, tick sources without the :isolated suffix at the next ticks, issue 1000447 closed by its own sweep, tick_slot_coverage_24h and tick_completion_24h recover as the 04:40-06:10 gap leaves the window', NULL,
  'node migrations/config-audit-leaf.test.mjs; scripts/fleet_graph.mjs triggerDepth over the live cascade shape'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'TRIGGER-DEPTH-AUDIT-LEAF-1:%');

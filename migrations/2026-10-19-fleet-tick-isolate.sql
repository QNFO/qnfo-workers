-- FLEET-TICK-ISOLATE-1 (2026-10-19, charter pillar: autonomy; agent_issues 2600, METRIC-TRIGGER 3452 tick_completion_24h; qnfo-code-orchestrator 0.18.30).
-- Measured 2026-10-19 10:20Z: tick_completion_24h 90.3 against 95 is 130 of 144 ten-minute slots, and all 14 missing slots are one gap, 2026-10-18
-- 12:14Z to 14:38Z (144 minutes). The orchestrator logged "UNIQUE constraint failed: index 'idx_agent_issues_open_title_ci'" every two minutes
-- (cloud_ops_events kind fleet-cron-tick-error): the fleet_tick insert fans out through D1 AFTER INSERT triggers, one of them violated that
-- index, the whole insert rolled back, the tick row was never written and every other fixer skipped the slot. qnfo-fleet-dashboard's
-- fallback producer runs the same insert through the same triggers (it recorded fleet_heartbeat ok 0 in the same window), so it did not cover.
-- The orchestrator now retries a failed insert once with INSERT OR IGNORE under the source cron:qnfo-code-orchestrator:isolated: the outer
-- statement's conflict clause governs the trigger statements it fires, so the tick commits, the other fixers run, and only the violating
-- statement is skipped. The first error is still logged. A degraded tick is therefore visible and countable: this detector reads 0 while the
-- fan-out is healthy and names the failure the moment a fixer starts violating a constraint, instead of the heartbeat dying with it.
-- It does not claim the metric: tick_completion_24h returns above 95 when the 10-18 gap leaves the 24 h window (about 14:40Z today) whatever this does.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-fleet-tick-fanout-abort'; DELETE FROM failure_modes WHERE fm_key = 'fleet-tick-fanout-abort'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('fleet-tick-fanout-abort',
  'a statement inside one D1 trigger on fleet_tick fails and rolls back the heartbeat row, so no fixer runs for the slot and the tick stays missing for as long as the statement keeps failing',
  'the fleet_tick insert is the root of a trigger fan-out (queue SLA, age ladder, reconcile, doctrine metrics, issue normalisation); SQLite aborts the whole insert when any trigger statement raises a constraint error, and the fallback producer in qnfo-fleet-dashboard uses the same insert, so both producers failed together on 2026-10-18 12:14Z to 14:38Z (UNIQUE idx_agent_issues_open_title_ci, 144 minutes)',
  'qnfo-code-orchestrator 0.18.30 FLEET-TICK-ISOLATE-1: after a failed insert (logged as fleet-cron-tick-error) the producer retries once with INSERT OR IGNORE under the source cron:qnfo-code-orchestrator:isolated, so a constraint violation in one trigger statement skips that statement and nothing else; the failing fixer stays visible through this detector and the logged error',
  'fm-fleet-tick-fanout-abort: any fleet_tick row from an :isolated source in the last 120 minutes (zero while the fan-out is healthy)',
  'fm-fleet-tick-fanout-abort', '2026-10-18T12:14:08Z', 2600,
  'a D1 trigger on fleet_tick that inserts or updates agent_issues (or another unique-indexed table) hits a duplicate, as the issue reopen and refile paths do',
  'tick_completion_24h under 95 with one long gap; fleet-cron-tick-error events every two minutes naming the constraint',
  'every fixer behind fleet_tick for the length of the failure: queue SLA actions, issue age ladder, reconcile, doctrine scorecards, failure-mode metrics');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-fleet-tick-fanout-abort', NULL, 'FLEET-TICK-ISOLATE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fleet_tick WHERE source LIKE ''%:isolated'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

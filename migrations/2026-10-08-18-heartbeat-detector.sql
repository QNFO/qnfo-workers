-- FM-SINGLE-HEARTBEAT-PROBE-2 (2026-10-08, pillar autonomy). The fm-single-heartbeat detector (2026-10-08-13) still
-- required a fleet_tick row with source 'heartbeat:%', which only the D1 trigger feeders wrote; D1-TRIGGER-DEPTH-1
-- (2026-10-08-16) dropped them because they pushed writes past D1's trigger nesting limit. The tick now has two worker
-- producers (cron:qnfo-code-orchestrator */10, cron:qnfo-fleet-dashboard */15), so the detector reads "recurring" on a
-- healthy fleet. It now passes when the tick is fresh (20 min) and both producers wrote at least one row in 24 h, which is
-- the redundancy the failure mode is about.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tick WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-20 minutes'')) AND EXISTS (SELECT 1 FROM fleet_tick WHERE source LIKE ''heartbeat:%'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'fm-single-heartbeat'

UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tick WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-20 minutes'')) AND EXISTS (SELECT 1 FROM fleet_tick WHERE source = ''cron:qnfo-code-orchestrator'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AND EXISTS (SELECT 1 FROM fleet_tick WHERE source = ''cron:qnfo-fleet-dashboard'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) THEN ''1'' ELSE ''0'' END AS observed', next_due_at = datetime('now')
WHERE class = 'fm-single-heartbeat';

UPDATE failure_modes SET detector = 'fleet_tick fresh within 20 minutes and written by both worker producers (qnfo-code-orchestrator, qnfo-fleet-dashboard) within 24 hours', remediation = remediation || '; 2026-10-08: trigger feeders replaced by two worker producers (D1-TRIGGER-DEPTH-1)'
WHERE fm_key = 'single-heartbeat' AND instr(detector, 'both worker producers') = 0;

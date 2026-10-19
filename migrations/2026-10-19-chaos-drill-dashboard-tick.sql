-- CHAOS-DRILL-TICK-ALT-1 (2026-10-19, pillar autonomy; agent_issues 100136 CHAOS-DRILL-FAILED-1: fleet cron scheduler).
-- The drill's probe for the fleet cron scheduler's alternate path asked for a fleet_tick row from the dashboard producer in 24 h.
-- The dashboard inserts its tick only when no tick landed in the last 9 minutes, and qnfo-code-orchestrator has ticked every
-- 5 minutes since 2026-10-18 (223 rows in 48 h), so the alternate stays silent because the primary is healthy, and the drill
-- read that as a failure (last dashboard tick 2026-10-18T10:00:07Z; dashboard heartbeat ok at 2026-10-19T11:00Z, */15).
-- The probe now passes when the alternate shows itself (a dashboard tick in 24 h) or when it is armed and was not needed: the
-- dashboard's own cron reported ok within 30 minutes and no gap between fleet_tick rows in 24 h exceeded 24 minutes (its */15
-- cadence plus its 9-minute guard). A real outage of the primary with a dead alternate still fails both branches: read live on
-- 2026-10-19T11:20Z the new probe fails on the 2026-10-18 12:14Z-14:38Z gap (both producers' inserts threw; the dashboard's
-- FALLBACK-HEARTBEAT-PROOF-1 records that shape now) and passes once that gap leaves the 24 h window, so issue 100136 closes on
-- the first passing drill after 2026-10-19T14:38Z without a manual close.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE spof_alternate_probes SET probe_sql = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM fleet_tick WHERE source LIKE ''cron:qnfo-fleet-dashboard%'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) > 0 THEN ''ok'' ELSE ''no fleet_tick from the dashboard producer in 24 h'' END AS observed', window_note = '24 h: the dashboard inserts fleet_tick on its own */15 cron' WHERE component = 'fleet cron scheduler (fleet_crons)'; DELETE FROM remediation_contracts WHERE class = 'fm-chaos-drill-alternate-idle'; DELETE FROM failure_modes WHERE fm_key = 'chaos-drill-alternate-idle'

UPDATE spof_alternate_probes SET
  probe_sql = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM fleet_tick WHERE source LIKE ''cron:qnfo-fleet-dashboard%'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) > 0 THEN ''ok'' WHEN (SELECT COUNT(*) FROM fleet_heartbeat WHERE worker = ''qnfo-fleet-dashboard'' AND ok = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) > 0 AND COALESCE((SELECT MAX(gap_s) FROM (SELECT CAST(strftime(''%s'', substr(ts, 1, 19)) AS INTEGER) - LAG(CAST(strftime(''%s'', substr(ts, 1, 19)) AS INTEGER)) OVER (ORDER BY ts) AS gap_s FROM fleet_tick WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours''))), 99999) <= 1440 THEN ''ok'' ELSE ''the dashboard producer neither ticked in 24 h nor is armed (cron ok within 30 min and no tick gap over 24 min)'' END AS observed',
  window_note = '24 h: the dashboard inserts fleet_tick on its */15 cron only when no tick landed in 9 minutes; armed-and-unneeded (heartbeat ok within 30 min, no gap over 24 min) passes (CHAOS-DRILL-TICK-ALT-1)'
WHERE component = 'fleet cron scheduler (fleet_crons)';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('chaos-drill-alternate-idle', 'a chaos drill fails a standby alternate path because the healthy primary keeps it idle',
  'the drill probe asked for output the standby produces only when the primary is silent (the dashboard fleet_tick guard skips when a tick landed in 9 minutes)',
  'probe the standby as armed (its own cron ok recently) and the primary as gap-free, or as active (it produced output) (CHAOS-DRILL-TICK-ALT-1)',
  'the fleet cron scheduler drill passes while qnfo-code-orchestrator ticks every 5 minutes', 'fm-chaos-drill-alternate-idle', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 100136,
  'spof_alternate_probes last_pass = 0 for the fleet cron scheduler with the dashboard heartbeat ok', 'CHAOS-DRILL-FAILED-1 re-files every 6 hours for a healthy pair',
  'the chaos drill queue and the high-priority issue count');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-chaos-drill-alternate-idle', NULL, 'CHAOS-DRILL-TICK-ALT-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CAST((SELECT COUNT(*) FROM spof_alternate_probes WHERE component = ''fleet cron scheduler (fleet_crons)'' AND window_note LIKE ''%CHAOS-DRILL-TICK-ALT-1%'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

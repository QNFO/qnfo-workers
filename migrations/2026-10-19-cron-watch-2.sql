-- CRON-WATCH-2 (2026-10-19, pillar autonomy): red-team follow-up to CRON-WATCH-1 (migrations/2026-10-19-cron-watch.sql, PR 2824,
-- applied 2026-10-19T11:16:28Z). Its second path, the fleet_tick trigger cron_watch_exec_silent_tick, inserted an agent_issues row
-- inside the fleet_tick insert when fleet-exec was quiet for 15 minutes. It was the only fleet_tick trigger that writes
-- agent_issues, and an aborted issue write aborts the fleet_tick insert itself (failure mode tick-reopen-dup-title: the unique
-- open-title index, a guard trigger or the trigger depth), so the path meant to report a fleet-exec outage could stop the
-- 10-minute D1 fixers at that very moment. The trigger now only refreshes metric fleet_exec_silent_min (the pattern every other
-- fleet_tick refresher uses), and analytics_metric_triggers row fleet_exec_silent_min (gt 15, priority 1) lets
-- qnfo-fleet-control's hourly metric loop, which runs on its own Cloudflare cron and not on fleet-exec, file the breach.
-- BACKUP: bak_20261019_cron_watch_trigger
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS cron_watch_exec_silent_tick; UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'fleet_exec_silent_min' (the CRON-WATCH-1 body is kept in bak_20261019_cron_watch_trigger.sql)

CREATE TABLE IF NOT EXISTS bak_20261019_cron_watch_trigger AS SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'cron_watch_exec_silent_tick';

DROP TRIGGER IF EXISTS cron_watch_exec_silent_tick;

CREATE TRIGGER IF NOT EXISTS cron_watch_exec_silent_tick AFTER INSERT ON fleet_tick
WHEN NEW.source <> 'cron:fleet-exec'
BEGIN
  UPDATE metric_registry SET
    last_value = CAST(COALESCE((CAST(strftime('%s', 'now') AS INTEGER) - (SELECT CAST(strftime('%s', substr(MAX(r.started_at), 1, 19)) AS INTEGER) FROM fleet_runs r WHERE r.id > (SELECT MAX(id) FROM fleet_runs) - 200)) / 60, 9999) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'fleet_exec_silent_min';
END;

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES
  ('fleet_exec_silent_min', 'operational', 'guard',
   'minutes since fleet-exec last started a fleet_runs row (9999 when none); fleet-exec fires every 5 minutes and runs every fleet_crons workflow, CRON-WATCH-1 included',
   'qnfo-audit.fleet_runs, refreshed on every fleet_tick insert by another producer (trigger cron_watch_exec_silent_tick)', '0', 'qnfo-fleet-control', 'agent:cron-watch', '10m', 'MEASURED', NULL, NULL);

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('fleet_exec_silent_min', 'fleet-exec has stopped: no fleet_crons workflow (cron-watch included) ran for 15 minutes',
   'gt', 15, 1,
   'Pillar core (CRON-WATCH-1 second path). fleet-exec runs every fleet_crons workflow, so while it is down cron failures are neither filed nor retried. Read SELECT * FROM fleet_heartbeat WHERE worker = ''fleet-exec''; SELECT task_id, status, error, started_at FROM fleet_runs ORDER BY id DESC LIMIT 10; SELECT * FROM v_cron_health ORDER BY overdue_min DESC LIMIT 10. Typical causes: a deploy that broke its scheduled handler (revert through the canonical path), a cron trigger dropped from the account (redeploy fleet-exec by workflow_dispatch workers=fleet-exec), a step that exceeds the CPU limit on every fire (disable that fleet_tasks row). Definition of done: fleet_exec_silent_min reads 15 or less.',
   'qnfo-fleet-control', 'agent_issues', 1, 1, 'CRON-WATCH-1: the cron-failure loop must not depend on its own runner');

UPDATE spof_registry SET alternate_path = 'the fleet_tick trigger cron_watch_exec_silent_tick, fed by qnfo-code-orchestrator and the dashboard fallback producer, refreshes metric fleet_exec_silent_min and qnfo-fleet-control''s hourly metric loop files it above 15 minutes; the cron_outcomes triggers only append a ledger row and cannot block a heartbeat write (no RAISE)',
  evidence = 'migrations/2026-10-19-cron-watch.sql, migrations/2026-10-19-cron-watch-2.sql, migrations/cron-watch.test.mjs'
WHERE component = 'CRON-WATCH-1 runner (fleet-exec)';

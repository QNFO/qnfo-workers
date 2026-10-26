-- METRIC-REFRESHER-CF-AGENT-1 (2026-10-26, charter pillar: autonomy; METRIC-UNMEASURED-1 issue 1000387 qnfo-agents; BREACH-DOCTOR-1 family METRIC, rule MD-5 "registered metric with no producer").
-- Measured 2026-10-26 10:05Z on qnfo-audit: metric_registry.cf_agent_requests_over_120m (CF-AGENTS-LOOPS-1, migrations/2026-10-26-cf-agent-requests.sql) was registered UNMEASURED with
-- source_of_truth v_cf_agent_requests_health and an enabled trigger, but nothing writes its value: it has last_value NULL and last_refreshed NULL for as long as it exists, so the trigger can
-- never breach or improve and the quality audit files METRIC-UNMEASURED-1 for qnfo-agents every hour. Its two siblings that read a health view (personal_calendar_delivery_over_120m,
-- prd_funnel_monitor_stale) each have a fleet_tasks workflow plus a 10-minute fleet_crons row that runs one UPDATE; this file adds the same pair for the cf-agent queue. It is the only
-- view-sourced metric with no refresher (a SELECT over metric_registry found 1 row: last_refreshed IS NULL, state UNMEASURED, source_of_truth a view name), and the detector below keeps it so.
-- The value is never written by hand: the task reads over_120m from the view every 10 minutes, so a queue that stops draining shows as a number above 0 and the metric trigger files its own issue.
-- decision_log is append-only, so the Rollback leaves the decision row.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'cf-agent-requests-monitor-10m'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'cf-agent-requests-monitor'; DELETE FROM remediation_contracts WHERE class = 'fm-metric-view-never-refreshed' AND module = 'failure-mode'; DELETE FROM failure_modes WHERE fm_key = 'metric-view-never-refreshed';

INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('cf-agent-requests-monitor', 'cf-agent request queue age observer', 'workflow',
  json_object('steps', json_array(json_object('name', 'measure', 'type', 'sql', 'db', 'AUDIT', 'sql',
    'UPDATE metric_registry SET last_value = CAST((SELECT over_120m FROM v_cf_agent_requests_health) AS TEXT), last_refreshed = datetime(''now''), state = ''MEASURED'' WHERE metric = ''cf_agent_requests_over_120m'''))),
  30000, 1, 1, 1, datetime('now'));

INSERT OR IGNORE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('cf-agent-requests-monitor-10m', '*/10 * * * *', 'cf-agent-requests-monitor', 1, 'UTC', datetime('now'));

-- First reading now, so the metric does not wait ten minutes for the cron (replay-safe: only while it has never been read).
UPDATE metric_registry SET last_value = CAST((SELECT over_120m FROM v_cf_agent_requests_health) AS TEXT), last_refreshed = datetime('now'), state = 'MEASURED'
WHERE metric = 'cf_agent_requests_over_120m' AND last_refreshed IS NULL AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'v_cf_agent_requests_health');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('metric-view-never-refreshed',
  'a guard metric is registered over a health view and has an enabled trigger, but no task ever writes its value, so it stays UNMEASURED with no refresh time',
  'METRIC-REGISTRATION-NO-PRODUCER: the migration that registers the metric adds the view, the registry row and the trigger, and relies on a refresher that nobody creates. The siblings that work (personal_calendar_delivery_over_120m, prd_funnel_monitor_stale) each carry a fleet_tasks workflow and a 10-minute fleet_crons row in the same migration',
  'METRIC-REFRESHER-CF-AGENT-1 (this file) adds the task and cron for cf_agent_requests_over_120m. The detector below counts view-sourced metrics with last_refreshed NULL, state UNMEASURED and must read 0; a future registration without a refresher is found within the hour and the BREACH-DOCTOR-1 metric family (rule MD-5) owns the repair',
  'the d1-query contract fm-metric-view-never-refreshed counts metric_registry rows with last_refreshed NULL, state UNMEASURED and a source_of_truth that is a single v_ view name (expected 0)',
  'fm-metric-view-never-refreshed', '2026-10-26', 1000387,
  'a migration registers a metric whose source_of_truth is a view and adds no fleet_tasks/fleet_crons refresher',
  'METRIC-UNMEASURED-1 is filed every hour for the owner of the metric; the trigger of the metric can never breach or improve',
  'one guard metric per occurrence reads UNMEASURED; no data loss');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-metric-view-never-refreshed', NULL, 'METRIC-REFRESHER-CF-AGENT-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM metric_registry WHERE last_refreshed IS NULL AND state = ''UNMEASURED'' AND source_of_truth GLOB ''v_[a-z]*'' AND source_of_truth NOT LIKE ''% %'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a metric that has a trigger but no producer is a missing producer, not a metric to hide: the task that reads its own view every ten minutes is the same mechanism the two working siblings use',
  'METRIC-REFRESHER-CF-AGENT-1: fleet_tasks cf-agent-requests-monitor and fleet_crons cf-agent-requests-monitor-10m write cf_agent_requests_over_120m from v_cf_agent_requests_health; failure mode metric-view-never-refreshed with its d1-query detector',
  'qnfo-audit 2026-10-26 10:05Z: cf_agent_requests_over_120m last_value NULL, last_refreshed NULL, state UNMEASURED since registration; fleet_crons holds personal-calendar-monitor-10m and prd-funnel-monitor-10m and no cf-agent entry; v_cf_agent_requests_health returns over_120m 0 with 49 request rows; the only view-sourced metric with no refresh time is this one',
  'recorded through the canonical path on merge; the metric reads MEASURED with value 0 at the first cron run and METRIC-UNMEASURED-1 for qnfo-agents stops being filed for it',
  'one fleet_tasks row, one fleet_crons row, one metric_registry reading and one failure mode with its detector in qnfo-audit; no worker, trigger, secret or schedule change in code',
  'run the migration Rollback header: it disables the cron and the task and removes the detector and the failure mode (decision_log is append-only and keeps this row)',
  'a registered view-sourced guard metric gets a producer and a detector finds the next one without a session',
  'cf_agent_requests_over_120m state MEASURED within 15 minutes of the apply and fm-metric-view-never-refreshed reads 0',
  'none',
  'metric_registry, fleet_crons, fleet_tasks, v_cf_agent_requests_health, migrations/2026-10-25-personal-invite-reminders.sql, migrations/2026-10-26-cf-agent-requests.sql'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'METRIC-REFRESHER-CF-AGENT-1:') = 1);

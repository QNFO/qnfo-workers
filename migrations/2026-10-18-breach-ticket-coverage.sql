-- BREACH-TICKET-COVERAGE-1 (2026-10-18, SLA-AND-PATHS-1: every step needs two independent paths)
--
-- WHAT WAS WRONG
-- "A live breach must have an open ticket" had exactly ONE enforcement path: fleet_tasks 'breach-ticket-reopen'
-- (cron */30), which reopens closed twins whose trigger is hit=1. If that task is disabled, its cron breaks, or its SQL
-- starts failing, nothing in the fleet notices: metric metrics_in_breach keeps reading the number of breaching triggers
-- (54 on 2026-10-18T20:02Z) whether or not any ticket exists, and the only trace of the gap is its own ledger row
-- ceasing to appear in cloud_ops_events. A component cannot be the witness of its own failure.
--
-- Measured 2026-10-18T20:02:34Z, breach-ticket-reopen ledger: 54 triggers breaching, 53 with an open ticket, 1 with
-- none. That 1 is trigger 6123 (human_wait_oldest_min) whose queue_target is 'alerts', not 'agent_issues' - it is out
-- of scope here by registration and is served by the alerts table (rows 2409 at 126 min, 2411 at 252 min).
--
-- THE SECOND PATH
-- A view that reads the gap straight from v_metric_trigger_state + agent_issues, and a metric written by its OWN task,
-- so the number rises the moment the reopener stops working - whether or not the reopener is alive to say so.
--
-- THE PREDICATE, and why each clause is there
--   hit = 1                     the metric is breaching now
--   queue_target='agent_issues' alert-routed triggers have no ticket by design (6123); counting them would make the
--                               number permanently non-zero and therefore useless
--   no OPEN ticket for it       the invariant itself
--   a CLOSED ticket older than 2 hours
--                               the reopener runs every 30 minutes, so a 2-hour-old closed ticket means it has had four
--                               ticks and did not act. Without this clause the metric would fire on the normal
--                               up-to-30-minute window between a breach and the next reopen, i.e. on its own schedule.
--   updated_at compared in both ms and s
--                               agent_issues.updated_at is milliseconds in current rows, but the fleet has carried
--                               mixed formats before (sla_due_at, 2026-10-18); both comparisons are kept so a seconds-era
--                               row cannot hide a real gap.
--
-- BOUNDED and honest: this file writes no issue itself. It registers a metric and a trigger, so the existing metric
-- filer (the one that files METRIC-TRIGGER-* tickets and dedupes on open titles) does the filing. The task only
-- maintains the value and a ledger row, so a failure here cannot file anything by accident.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_breaches_without_ticket; DELETE FROM fleet_crons WHERE name='breach-ticket-coverage-30m'; DELETE FROM fleet_tasks WHERE id='breach-ticket-coverage'; DELETE FROM analytics_metric_triggers WHERE metric_key='breaches_without_ticket'; DELETE FROM metric_registry WHERE metric='breaches_without_ticket';

CREATE VIEW IF NOT EXISTS v_breaches_without_ticket AS
SELECT s.id AS trigger_id, s.metric_key, s.val, s.threshold
FROM v_metric_trigger_state s
WHERE s.hit = 1
  AND s.queue_target = 'agent_issues'
  AND NOT EXISTS (SELECT 1 FROM agent_issues a
                   WHERE a.status = 'open'
                     AND a.title LIKE 'METRIC-TRIGGER-' || s.id || '-%')
  AND EXISTS (SELECT 1 FROM agent_issues c
               WHERE c.status <> 'open'
                 AND c.title LIKE 'METRIC-TRIGGER-' || s.id || '-%'
                 AND (c.updated_at < CAST(strftime('%s','now','-2 hours') AS INTEGER) * 1000
                      OR c.updated_at < CAST(strftime('%s','now','-2 hours') AS INTEGER)));

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES
  ('breaches_without_ticket', 'operational', 'guard',
   'COUNT of triggers with hit=1 and queue_target agent_issues whose every METRIC-TRIGGER ticket has been closed for over 2 hours',
   'qnfo-audit.v_breaches_without_ticket (BREACH-TICKET-COVERAGE-1), written every 30 minutes by fleet_tasks breach-ticket-coverage',
   '0', 'fleet', 'agent:breach-ticket-coverage', '30m', 'MEASURED', '0', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('breaches_without_ticket', 'A live metric breach has no open ticket: the reopener has stopped working',
   'gt', 0, 9,
   'Find why fleet_tasks breach-ticket-reopen (cron */30) stopped reopening closed METRIC-TRIGGER tickets. Check its cron row, its last ledger row in cloud_ops_events (kind breach-ticket-reopen), and the agent_issues_reopen_open_twin_guard trigger. Do NOT close this issue by reopening tickets by hand: the metric only falls when the task itself works again.',
   'fleet', 'agent_issues', 2, 1,
   'BREACH-TICKET-COVERAGE-1 second path: independent of the reopener task it watches');

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('breach-ticket-coverage', 'BREACH-TICKET-COVERAGE-1: measure live breaches that have no open ticket', 'workflow',
  '{"steps":[
    {"type":"sql","name":"measure","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_breaches_without_ticket) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'',''now''), state = ''MEASURED'' WHERE metric = ''breaches_without_ticket''"},
    {"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''breach-ticket-coverage-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''breach-ticket-coverage'', ''BREACH-TICKET-COVERAGE-1: '' || (SELECT COUNT(*) FROM v_breaches_without_ticket) || '' live breaches (queue_target agent_issues) have had no open ticket for over 2 hours | '' || (SELECT COUNT(*) FROM v_metric_trigger_state WHERE hit=1) || '' triggers breaching in total'', NULL, ''breach-ticket-coverage'', ''ok''"}
  ]}', 60000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('breach-ticket-coverage-30m', '5,35 * * * *', 'breach-ticket-coverage', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

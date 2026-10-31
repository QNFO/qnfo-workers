-- BREACH-TICKET-COVERAGE-WINDOW-1 (QNFO.OPS, charter pillar autonomy; #2736, agent_issues 100088).
-- Live reads on 2026-10-30: the enabled reopener runs every 10 minutes and its 09:21 ledger reports
-- zero uncovered breaches. Coverage sampled a gap at 09:06, however, and trigger 8888 still reads 1.
-- The old view ages a gap from a ticket's closure, so a newly recurring breach with an old closed
-- ticket alarms before the next reopen tick. Observe missing coverage itself, independently of the reopener.
-- Observations spanning 110 minutes at a 10-minute cadence detect persistent gaps within
-- 120 minutes. Recovery, an intervening reopen, or a missed observation window resets that clock.
-- No agent_issues or issue_triage rows are changed; the standing reopener and twin guard are preserved.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261030_breach_coverage_view
-- Rollback: DROP VIEW IF EXISTS v_breaches_without_ticket; CREATE VIEW v_breaches_without_ticket AS SELECT s.id AS trigger_id, s.metric_key, s.val, s.threshold FROM v_metric_trigger_state s WHERE s.hit=1 AND s.queue_target='agent_issues' AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status='open' AND a.title LIKE 'METRIC-TRIGGER-' || s.id || '-%') AND (SELECT MAX(MAX(datetime(CASE WHEN c.updated_at>100000000000 THEN c.updated_at/1000 ELSE c.updated_at END,'unixepoch'),COALESCE((SELECT MAX(replace(replace(l.ts,'T',' '),'Z','')) FROM issue_lifecycle l WHERE l.issue_id=c.id AND l.to_status<>'open'),''))) FROM agent_issues c WHERE c.title LIKE 'METRIC-TRIGGER-' || s.id || '-%')<datetime('now','-2 hours'); UPDATE fleet_tasks SET definition=b.definition, version=b.version, updated_at=b.updated_at FROM bak_20261030_breach_coverage_task b WHERE fleet_tasks.id=b.id; UPDATE fleet_crons SET cron_expr=b.cron_expr, next_fire=NULL, updated_at=b.updated_at FROM bak_20261030_breach_coverage_cron b WHERE fleet_crons.id=b.id; UPDATE metric_registry SET formula=b.formula, source_of_truth=b.source_of_truth, refresh_cadence=b.refresh_cadence FROM bak_20261030_breach_coverage_metric b WHERE metric_registry.metric=b.metric;
-- Closing probe (after CI apply and at least 120 minutes of fleet observations):
-- SELECT COUNT(*) FROM v_breaches_without_ticket; -- 0, with fresh coverage and reopener ledgers

CREATE TABLE IF NOT EXISTS bak_20261030_breach_coverage_view AS
  SELECT name, sql FROM sqlite_master WHERE name = 'v_breaches_without_ticket';
CREATE TABLE IF NOT EXISTS bak_20261030_breach_coverage_task AS
  SELECT id, definition, version, updated_at FROM fleet_tasks WHERE id = 'breach-ticket-coverage';
CREATE TABLE IF NOT EXISTS bak_20261030_breach_coverage_cron AS
  SELECT id, cron_expr, updated_at FROM fleet_crons WHERE task_id = 'breach-ticket-coverage';
CREATE TABLE IF NOT EXISTS bak_20261030_breach_coverage_metric AS
  SELECT metric, formula, source_of_truth, refresh_cadence FROM metric_registry WHERE metric = 'breaches_without_ticket';

CREATE TABLE IF NOT EXISTS breach_ticket_coverage_gaps (
  trigger_id INTEGER PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS v_breach_ticket_coverage_candidates AS
SELECT s.id AS trigger_id, s.metric_key, s.val, s.threshold
FROM v_metric_trigger_state s
WHERE s.hit = 1 AND s.queue_target = 'agent_issues'
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.title LIKE 'METRIC-TRIGGER-' || s.id || '-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = 'open' AND a.title LIKE 'METRIC-TRIGGER-' || s.id || '-%');

DROP VIEW IF EXISTS v_breaches_without_ticket;
CREATE VIEW v_breaches_without_ticket AS
SELECT c.*
FROM v_breach_ticket_coverage_candidates c
JOIN breach_ticket_coverage_gaps g ON g.trigger_id = c.trigger_id
WHERE g.first_seen <= datetime('now', '-110 minutes')
  AND g.last_seen >= datetime('now', '-20 minutes')
  AND NOT EXISTS (
    SELECT 1 FROM agent_issues a JOIN issue_lifecycle l ON l.issue_id = a.id
    WHERE a.title LIKE 'METRIC-TRIGGER-' || c.trigger_id || '-%'
      AND l.to_status = 'open' AND replace(substr(l.ts, 1, 19), 'T', ' ') >= g.first_seen
  );

UPDATE fleet_tasks SET definition = '{"steps":[
  {"type":"sql","name":"clear-covered","db":"AUDIT","sql":"DELETE FROM breach_ticket_coverage_gaps WHERE trigger_id NOT IN (SELECT trigger_id FROM v_breach_ticket_coverage_candidates)"},
  {"type":"sql","name":"observe-gaps","db":"AUDIT","sql":"INSERT INTO breach_ticket_coverage_gaps (trigger_id, first_seen, last_seen) SELECT trigger_id, datetime(''now''), datetime(''now'') FROM v_breach_ticket_coverage_candidates WHERE 1 ON CONFLICT(trigger_id) DO UPDATE SET first_seen = CASE WHEN breach_ticket_coverage_gaps.last_seen < datetime(''now'', ''-20 minutes'') OR EXISTS (SELECT 1 FROM agent_issues a JOIN issue_lifecycle l ON l.issue_id = a.id WHERE a.title LIKE ''METRIC-TRIGGER-'' || excluded.trigger_id || ''-%'' AND l.to_status = ''open'' AND replace(substr(l.ts, 1, 19), ''T'', '' '') >= breach_ticket_coverage_gaps.first_seen) THEN datetime(''now'') ELSE breach_ticket_coverage_gaps.first_seen END, last_seen = datetime(''now'')"},
  {"type":"sql","name":"measure","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_breaches_without_ticket) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'',''now''), state = ''MEASURED'' WHERE metric = ''breaches_without_ticket''"},
  {"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''breach-ticket-coverage-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''breach-ticket-coverage'', ''BREACH-TICKET-COVERAGE-WINDOW-1: '' || (SELECT COUNT(*) FROM v_breaches_without_ticket) || '' sustained uncovered breaches | '' || (SELECT COUNT(*) FROM breach_ticket_coverage_gaps) || '' gaps under observation'', NULL, ''breach-ticket-coverage'', ''ok''"}
]}', version = MAX(version, 2), updated_at = datetime('now')
WHERE id = 'breach-ticket-coverage';

UPDATE fleet_crons SET cron_expr = '5,15,25,35,45,55 * * * *', next_fire = NULL, updated_at = datetime('now')
WHERE task_id = 'breach-ticket-coverage';
UPDATE metric_registry SET
  formula = 'COUNT of agent_issues-routed breaches with a previously filed ticket and continuously observed missing coverage for 110 minutes (10-minute samples; detection within 120 minutes)',
  source_of_truth = 'qnfo-audit.v_breaches_without_ticket; independent fleet_tasks breach-ticket-coverage observations',
  refresh_cadence = '10m'
WHERE metric = 'breaches_without_ticket';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES
  ('breach-ticket-closure-age', 'healthy reopener accused when an old closed ticket breaches again',
   'closure age was mistaken for the duration of the current uncovered breach',
   'BREACH-TICKET-COVERAGE-WINDOW-1: independently observe each gap and reset on recovery or reopen',
   'sustained uncovered breaches', 'fm-breach-ticket-coverage-window', '2026-10-30', 100088);
INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('fm-breach-ticket-coverage-window', 'BREACH-TICKET-COVERAGE-WINDOW-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_breaches_without_ticket',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');
INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot-2736', 'an old closure is not evidence of a continuously uncovered breach',
  'BREACH-TICKET-COVERAGE-WINDOW-1', '2026-10-30 live cron and reopener ledger healthy; coverage view empty while sampled metric reads 1',
  'pending CI apply and live observation', 'breach-ticket-coverage only',
  'Rollback in migrations/2026-10-30-breach-ticket-coverage-window.sql',
  'distinguish fresh recurrence from sustained coverage failure',
  'zero alarms for a fresh recurrence; persistent gaps detected within 120 minutes', 'none',
  'live D1 reads and offline SQLite regression suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action = 'BREACH-TICKET-COVERAGE-WINDOW-1');

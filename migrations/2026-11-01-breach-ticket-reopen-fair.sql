-- BREACH-TICKET-REOPEN-4 (QNFO.OPS, charter pillar autonomy; #2736, agent_issues 100088).
-- Live 2026-11-01 reads: the enabled 10-minute cron and 08:51 ledger are healthy (0 uncovered breaches).
-- Version 3 nevertheless takes the highest ticket IDs first on every bounded tick. Twenty recurring
-- newer tickets can indefinitely starve an older uncovered trigger. Keep the newest non-superseded
-- twin per trigger, but order triggers by their last ticket update (seconds or milliseconds).
-- The triage step must also recognize all seven closure states used by TRIAGE-STATE-NORMALISE-1.
-- No tickets are reopened by this migration; the fleet task remains the writer.
-- Prediction: the oldest uncovered trigger is served on the next tick despite twenty newer relapses;
-- every reopened ticket has non-terminal triage, while the batch limit, cadence and twin guard remain.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_breach_reopen_task
-- Rollback: UPDATE fleet_tasks SET definition=b.definition, version=b.version, updated_at=b.updated_at FROM bak_20261101_breach_reopen_task b WHERE fleet_tasks.id=b.id; DELETE FROM remediation_contracts WHERE class='fm-breach-ticket-reopen-starvation'; DELETE FROM failure_modes WHERE fm_key='breach-ticket-reopen-starvation';
-- Closing probe: SELECT COUNT(*) FROM v_breaches_without_ticket; -- 0 with fresh breach-ticket-reopen ledgers after CI apply.

CREATE TABLE IF NOT EXISTS bak_20261101_breach_reopen_task AS
SELECT id, definition, version, updated_at FROM fleet_tasks WHERE id='breach-ticket-reopen';

UPDATE fleet_tasks SET definition=json_set(
  definition,
  '$.steps[0].sql', replace(json_extract(definition, '$.steps[0].sql'),
    'ORDER BY MAX(a.id) DESC LIMIT 20',
    'ORDER BY MAX(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at ELSE a.updated_at * 1000 END) ASC, MAX(a.id) ASC LIMIT 20'),
  '$.steps[1].sql', replace(json_extract(definition, '$.steps[1].sql'),
    'triage_state IN (''resolved'', ''closed'')',
    'triage_state IN (''closed'', ''closed-refuted'', ''closed-by-classification'', ''closed-verified-fixed'', ''resolved'', ''resolved-refuted'', ''wontfix'')')
), version=MAX(version, 4), updated_at=datetime('now')
WHERE id='breach-ticket-reopen';

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id)
VALUES ('breach-ticket-reopen-starvation', 'older uncovered breaches starve behind recurring newer tickets',
  'highest-ID-first bounded reopening and incomplete terminal triage normalization',
  'BREACH-TICKET-REOPEN-4: least recently updated trigger first; normalize all closure states',
  'sustained uncovered breaches or breaching open tickets with terminal triage',
  'fm-breach-ticket-reopen-starvation', '2026-11-01', 100088);

INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('fm-breach-ticket-reopen-starvation', 'BREACH-TICKET-REOPEN-4', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_breaches_without_ticket) + (SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id=a.id WHERE a.status=''open'' AND t.triage_state IN (''closed'', ''closed-refuted'', ''closed-by-classification'', ''closed-verified-fixed'', ''resolved'', ''resolved-refuted'', ''wontfix'') AND EXISTS (SELECT 1 FROM v_metric_trigger_state s WHERE s.hit=1 AND s.queue_target=''agent_issues'' AND a.title LIKE ''METRIC-TRIGGER-'' || s.id || ''-%'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot-2736', 'a healthy recent tick does not prove bounded reopening is fair under repeated relapses',
  'BREACH-TICKET-REOPEN-4', 'live task version 3 orders by highest ID and normalizes only resolved/closed; offline regression models repeated newer relapses',
  'pending CI apply and live verification', 'breach-ticket-reopen task only',
  'Rollback in migrations/2026-11-01-breach-ticket-reopen-fair.sql',
  'fair bounded reopening and complete terminal triage normalization',
  'oldest uncovered trigger served next tick; no terminal triage on reopened breaching tickets',
  'none', 'live read-only D1 diagnosis and offline SQLite regression suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action='BREACH-TICKET-REOPEN-4');

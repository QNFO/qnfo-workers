-- BREACH-TICKET-REOPEN-3 (2026-10-19, pillar autonomy; issue 100088 METRIC-TRIGGER-8888-BREACHES-WITHOUT-TICKET)
--
-- WHAT THE ISSUE SAID: "the reopener has stopped working". MEASURED 2026-10-19T12:53Z: it had not. fleet_runs for
-- 'breach-ticket-reopen' read status ok at 10:01, 10:31, 11:01, 11:31, 12:02 and 12:31 (cloud_ops_events kind
-- breach-ticket-reopen carries the same six rows). The metric read 1 because v_breaches_without_ticket was wrong in
-- three ways, and the reopener had one weakness that made a flapping breach spend most of a half hour with no ticket.
--
-- DEFECT 1 (the view): "a CLOSED ticket older than 2 hours" tested EXISTS(any non-open twin with updated_at < now-2h).
--   * trigger 3452 (tick_completion_24h) has twin 2875 (status monitoring, updated 2026-10-18 12:19) AND twin 2600, which
--     was closed at 2026-10-19 12:47:41. The stale parked twin satisfied the clause although the live twin had left
--     'open' five minutes earlier, so a normal reopen window read as a stopped reopener.
--   * agent_issues.updated_at is not bumped by every close: issue 2040 left 'open' at 11:43:23 (issue_lifecycle) while its
--     updated_at still read 10:31:34, so a close 70 minutes old looked 2 h 20 min old.
--   The view now asks the real question: when did ANY ticket for this trigger last leave 'open'? It takes the later of
--   updated_at (ms or s) and the newest non-open issue_lifecycle row for each twin, and counts a breach only when that moment
--   is over two hours old. Re-measured against live D1 before this file was written: triggers 1820 and 3452 read
--   11:43:23 and 12:47:41, i.e. inside the window; the count falls to 0 and rises again only for a breach whose every ticket
--   has been parked for two hours, which is four missed reopen ticks at the 30-minute cadence and twelve at the new one.
--
-- DEFECT 2 (which twin reopens): step 1 took the lowest ids first and relied on the BEFORE UPDATE guard
--   agent_issues_reopen_open_twin_guard to ignore the second twin. It reopened an eight-day-old ticket in preference to
--   the current one (2607 over 2040 for trigger 1820) and it could reopen a 'superseded' issue, which breaks section 6
--   accounting (a superseded issue names its successor). It now reopens exactly the NEWEST non-superseded twin of each
--   breaching trigger, keyed on the trigger id in the title rather than on identical title text, so a ticket whose title
--   was edited cannot leave a second open ticket behind.
--
-- DEFECT 3 (cadence): the reopener ran every 30 minutes. A trigger that flaps around its threshold (tick_completion_24h
--   moved 95.2 -> 92.4 inside a day) spent up to a half hour with no ticket after each close. SLAs are measured at 10-minute
--   resolution (owner directive 2026-10-14), so the task runs every 10 minutes; its SQL is three bounded statements.
--
-- The ledger line now states the number the invariant is about (agent_issues-routed breaches without an open ticket after
-- the tick); the previous text counted alert-routed trigger 6123 as a gap although it has no ticket by design.
--
-- Revert: restore fleet_tasks.breach-ticket-reopen from migrations/2026-10-18-breach-ticket-reopen-2.sql, set the cron
-- back to '*/30 * * * *', and re-create v_breaches_without_ticket from migrations/2026-10-18-breach-ticket-coverage.sql.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: agent_issues
-- Rollback: DROP VIEW IF EXISTS v_breaches_without_ticket; -- then re-run the CREATE VIEW in 2026-10-18-breach-ticket-coverage.sql
--           UPDATE fleet_crons SET cron_expr='*/30 * * * *', next_fire=NULL WHERE name='breach-ticket-reopen-30m';
--           -- and re-apply the INSERT OR REPLACE INTO fleet_tasks of 2026-10-18-breach-ticket-reopen-2.sql (version 2).

DROP VIEW IF EXISTS v_breaches_without_ticket;

CREATE VIEW v_breaches_without_ticket AS
SELECT s.id AS trigger_id, s.metric_key, s.val, s.threshold
FROM v_metric_trigger_state s
WHERE s.hit = 1
  AND s.queue_target = 'agent_issues'
  AND NOT EXISTS (SELECT 1 FROM agent_issues a
                   WHERE a.status = 'open'
                     AND a.title LIKE 'METRIC-TRIGGER-' || s.id || '-%')
  AND (SELECT MAX(MAX(datetime(CASE WHEN c.updated_at > 100000000000 THEN c.updated_at / 1000 ELSE c.updated_at END, 'unixepoch'),
                      COALESCE((SELECT MAX(replace(replace(l.ts, 'T', ' '), 'Z', ''))
                                  FROM issue_lifecycle l
                                 WHERE l.issue_id = c.id AND l.to_status <> 'open'), '')))
         FROM agent_issues c
        WHERE c.title LIKE 'METRIC-TRIGGER-' || s.id || '-%') < datetime('now', '-2 hours');

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at) VALUES (
  'breach-ticket-reopen',
  'BREACH-TICKET-REOPEN-1: a live breach must have an open ticket',
  'workflow',
  '{"steps":[{"type":"sql","name":"reopen-closed-twins","db":"AUDIT","sql":"UPDATE agent_issues SET status=''open'', updated_at = CAST(strftime(''%s'',''now'') AS INTEGER)*1000 WHERE id IN (SELECT MAX(a.id) FROM agent_issues a JOIN v_metric_trigger_state s ON s.hit = 1 AND s.queue_target = ''agent_issues'' AND a.title LIKE ''METRIC-TRIGGER-'' || s.id || ''-%'' WHERE a.status NOT IN (''open'',''superseded'') AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = ''open'' AND o.title LIKE ''METRIC-TRIGGER-'' || s.id || ''-%'') GROUP BY s.id ORDER BY MAX(a.id) DESC LIMIT 20)"},{"type":"sql","name":"normalise-triage","db":"AUDIT","sql":"UPDATE issue_triage SET triage_state=''triaged'', triaged_at = datetime(''now''), reopened_count = COALESCE(reopened_count,0) + 1, close_evidence = COALESCE(close_evidence,'' '') || char(10) || ''REOPENED '' || datetime(''now'') || '' (BREACH-TICKET-REOPEN-1): this issue tracks a metric trigger with hit=1 and must stay open until the breach clears. Reopened with evidence rather than refiled.'' WHERE issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status = ''open'' AND a.title LIKE ''METRIC-TRIGGER-%'' AND EXISTS (SELECT 1 FROM v_metric_trigger_state s WHERE s.hit = 1 AND s.id = CAST(substr(a.title, 16, instr(substr(a.title, 16), ''-'') - 1) AS INTEGER))) AND triage_state IN (''resolved'', ''closed'')"},{"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''breach-ticket-reopen-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''breach-ticket-reopen'', ''BREACH-TICKET-REOPEN-1: '' || (SELECT COUNT(*) FROM v_metric_trigger_state WHERE hit=1) || '' triggers breaching | '' || (SELECT COUNT(*) FROM v_metric_trigger_state s WHERE s.hit=1 AND s.queue_target=''agent_issues'' AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.status=''open'' AND a.title LIKE ''METRIC-TRIGGER-'' || s.id || ''-%'')) || '' agent_issues-routed with an open ticket | '' || (SELECT COUNT(*) FROM v_metric_trigger_state s WHERE s.hit=1 AND s.queue_target=''agent_issues'' AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status=''open'' AND a.title LIKE ''METRIC-TRIGGER-'' || s.id || ''-%'')) || '' without one after this tick (alert-routed triggers have no ticket by design)'', NULL, ''breach-ticket-reopen'', ''ok''"}]}',
  30000, 1, 3, 1, datetime('now')
);

UPDATE fleet_crons SET cron_expr = '*/10 * * * *', next_fire = NULL, updated_at = datetime('now') WHERE name = 'breach-ticket-reopen-30m';

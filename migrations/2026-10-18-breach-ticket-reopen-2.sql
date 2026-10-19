-- BREACH-TICKET-REOPEN-2 (2026-10-18, pillar autonomy; a live breach must have an open ticket)
--
-- THE INVARIANT THIS RESTORES
-- For every metric trigger with hit=1 there should be exactly one OPEN issue tracking it. Measured 2026-10-18 16:15Z,
-- four breaching triggers had no open ticket:
--     open_agent_issues 276>260            -> issue 1798 closed/triaged
--     issues_unaccounted 96888>40          -> issue 2200 closed/closed
--     roster_capabilities_single_executor  -> issue 2447 closed/closed
--     human_wait_oldest_min 126>120        -> NO ISSUE AT ALL
--
-- WHY NOTHING CAUGHT THEM
--   * ISSUE-DISPOSITION-RELAPSE-1 carries "WHERE a.status='open'": it repairs the inconsistent state (open issue whose
--     disposition says resolved) and never a closed issue.
--   * the metric filer dedupes against a twin and only acts on a transition; a metric that keeps breaching while its
--     issue is closed is invisible to it.
--   * an earlier attempt at widening the relapse pass moved issue_triage.triage_state only and never set
--     agent_issues.status, which produced 19 rows of inverse drift and was reverted the same hour. This migration sets
--     BOTH, in that order.
--
-- THE MECHANISM (three steps, all idempotent)
--   1 reopen-closed-twins    a closed or parked METRIC-TRIGGER issue whose trigger is hit=1 and which has no open twin
--                            becomes status='open'. Reopening costs exactly the open slot that filing a duplicate would,
--                            and leaves no duplicate behind.
--   2 normalise-triage       any OPEN METRIC-TRIGGER issue tracking a live breach whose disposition still says
--                            resolved/closed becomes 'triaged' with reopened_count+1 and dated evidence. Once triaged it
--                            no longer matches, so it cannot flap.
--   3 ledger                 records how many breaches still have no ticket at all (the human_wait_oldest_min class,
--                            where no issue has ever existed and inventing a title would be fabricating a finding).
--
-- BOUNDED: step 1 takes at most 20 rows per tick, so a mass close cannot cause a mass reopen in one second.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM fleet_tasks WHERE id='breach-ticket-reopen'; DELETE FROM fleet_crons WHERE name='breach-ticket-reopen-30m';

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at) VALUES (
  'breach-ticket-reopen',
  'BREACH-TICKET-REOPEN-1: a live breach must have an open ticket',
  'workflow',
  '{"steps":[
    {"type":"sql","name":"reopen-closed-twins","db":"AUDIT","sql":"UPDATE agent_issues SET status=''open'', updated_at = CAST(strftime(''%s'',''now'') AS INTEGER)*1000 WHERE status <> ''open'' AND title LIKE ''METRIC-TRIGGER-%'' AND id IN (SELECT a.id FROM agent_issues a WHERE a.status <> ''open'' AND a.title LIKE ''METRIC-TRIGGER-%'' AND EXISTS (SELECT 1 FROM v_metric_trigger_state s WHERE s.hit = 1 AND s.id = CAST(substr(a.title, 16, instr(substr(a.title, 16), ''-'') - 1) AS INTEGER)) AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = ''open'' AND lower(trim(o.title)) = lower(trim(a.title))) ORDER BY a.id LIMIT 20)"},
    {"type":"sql","name":"normalise-triage","db":"AUDIT","sql":"UPDATE issue_triage SET triage_state=''triaged'', triaged_at = datetime(''now''), reopened_count = COALESCE(reopened_count,0) + 1, close_evidence = COALESCE(close_evidence,'' '') || char(10) || ''REOPENED '' || datetime(''now'') || '' (BREACH-TICKET-REOPEN-1): this issue tracks a metric trigger with hit=1 and must stay open until the breach clears. Reopened with evidence rather than refiled.'' WHERE issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status = ''open'' AND a.title LIKE ''METRIC-TRIGGER-%'' AND EXISTS (SELECT 1 FROM v_metric_trigger_state s WHERE s.hit = 1 AND s.id = CAST(substr(a.title, 16, instr(substr(a.title, 16), ''-'') - 1) AS INTEGER))) AND triage_state IN (''resolved'', ''closed'')"},
    {"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''breach-ticket-reopen-'' || strftime(''%Y%m%d%H%M%S'',''now''), datetime(''now''), ''breach-ticket-reopen'', ''BREACH-TICKET-REOPEN-1: '' || (SELECT COUNT(*) FROM v_metric_trigger_state WHERE hit=1) || '' triggers breaching | '' || (SELECT COUNT(*) FROM v_metric_trigger_state s WHERE s.hit=1 AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.status=''open'' AND ((a.title LIKE ''METRIC-TRIGGER-'' || s.id || ''-%'') OR (a.title LIKE ''METRIC-TRIGGER-%'' AND lower(trim(substr(a.title, instr(a.title, '': '') + 2))) = lower(s.metric_key)))) ) || '' with an open ticket | '' || (SELECT COUNT(*) FROM v_metric_trigger_state s WHERE s.hit=1 AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status=''open'' AND ((a.title LIKE ''METRIC-TRIGGER-'' || s.id || ''-%'') OR (a.title LIKE ''METRIC-TRIGGER-%'' AND lower(trim(substr(a.title, instr(a.title, '': '') + 2))) = lower(s.metric_key)))) ) || '' with none (no issue ever filed - needs a title, not a reopen)'', NULL, ''breach-ticket-reopen'', ''ok''"}
  ]}',
  30000, 1, 2, 1, datetime('now')
);

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, next_fire, updated_at) VALUES (
  'breach-ticket-reopen-30m', '*/30 * * * *', 'breach-ticket-reopen', 1, 'UTC', NULL, datetime('now')
);

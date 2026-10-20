-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN (SELECT class FROM bak_20261020_terminal_rearmed_new); INSERT OR REPLACE INTO remediation_contracts SELECT * FROM bak_20261020_terminal_rearmed; UPDATE remediation_contracts SET status = 'active', last_verdict = NULL WHERE last_verdict LIKE 'superseded:TERMINAL-REARMED-1%'
-- BACKUP: bak_20261020_terminal_rearmed
-- RESEARCH-TERMINAL-REARMED-1 (2026-10-20, charter pillar: autonomy; owner directive 2026-10-20: "The system shall always clear all open issues server-side automatically within 24 hours";
-- agent_issues 100026, 100043, 100049, 100051, 100153, 100165 and every other open RESEARCH-TERMINAL notice whose queue row is unambiguous).
-- Read 2026-10-20 06:0xZ: six RESEARCH-TERMINAL issues were open with no doer and a closing probe that expects the row to be `published`. Four of the six rows had already been re-armed
-- (FLOOR-REARM-1 / PARK-REARM-1: deferred or queued, terminal_rearms 1), so the defect "the row went terminal" no longer held and nothing closed the issue; the other two were parked again after their
-- one re-arm ("revise: no applicable edit"). qnfo-research-exec 0.29.0 gives every terminal issue the self-closing contract at birth (RESEARCH-TERMINAL-REARMED-1), re-grounds a parked row with a fresh
-- draft (PARKED-REGROUND-1) and dedupes the issue against open issues only. This file does the same for the notices that are already open:
--   * each open notice whose queue row is unambiguous (exactly one research_queue row with the title's 8-character prefix) gets research-terminal-<prefix>, written with the same text the worker writes
--     (terminalResolveProbe in qnfo-research-exec/worker.js; migrations/research-terminal-rearmed.test.mjs holds the two equal). It resolves when the row left the terminal state (re-armed and
--     back in the pipeline, or published), when a content reason is parked with the queue moving, or when both automatic recoveries are spent (terminal_rearms >= 2). A row that is parked with
--     recoveries left stays pending: a pipeline fault keeps its issue open. An older contract of the same class (the HARD-review and mismatch ones) is replaced by this superset; its row is in the backup.
--   * the unreachable `published` probe (class issue-<id>) of an issue that gains the contract is superseded: a row that is re-armed, parked or deferred is not published, so that probe can only fail,
--     and a failing contract on a closed issue is what the relapse trigger reopens on (99913 was reopened that way).
-- The signal is kept: the queue row, its error and terminal_rearms, and the terminal-issue / rerun-route events stay; a row that goes terminal again files or reopens its issue.
CREATE TABLE IF NOT EXISTS bak_20261020_terminal_rearmed AS SELECT * FROM remediation_contracts WHERE issue_id IN (SELECT id FROM agent_issues WHERE status = 'open' AND title LIKE 'RESEARCH-TERMINAL %');
CREATE TABLE IF NOT EXISTS bak_20261020_terminal_rearmed_new AS SELECT class FROM remediation_contracts WHERE 0;

INSERT INTO bak_20261020_terminal_rearmed_new (class)
SELECT 'research-terminal-' || substr(a.title, 19, 8) FROM agent_issues a
WHERE a.status = 'open' AND a.title LIKE 'RESEARCH-TERMINAL %'
  AND (SELECT COUNT(*) FROM research_queue r WHERE r.id LIKE substr(a.title, 19, 8) || '%') = 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = 'research-terminal-' || substr(a.title, 19, 8))
  AND NOT EXISTS (SELECT 1 FROM bak_20261020_terminal_rearmed_new n WHERE n.class = 'research-terminal-' || substr(a.title, 19, 8));

INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at)
SELECT 'research-terminal-' || substr(a.title, 19, 8), a.id,
  CASE WHEN instr(a.title, 'HARD findings unresolved after') > 0 THEN 'row parked for HARD review findings unresolved after the revise cycles'
       WHEN substr(a.title, -20) = 'mismatch=true gates=' THEN 'row parked for a verify mismatch with every gate passing'
       ELSE 'row parked for a failure that may be a pipeline fault' END,
  'none: the row is re-armed by the park sweeps (FLOOR-REARM-1, PARK-REARM-1, PARKED-REGROUND-1) and the issue closes when it is back in the pipeline, published, or every recovery is spent',
  'SELECT ''resolved'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM research_queue WHERE id = ''' || q.id || ''' AND status <> ''wontfix'' AND COALESCE(stage, '''') <> ''parked'') OR (EXISTS (SELECT 1 FROM research_queue WHERE id = ''' || q.id || ''' AND stage = ''parked'' AND terminal_rearms >= 2) AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND status = ''ok'' AND text LIKE ''%->%'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-6 hours'')))'
    || CASE WHEN instr(a.title, 'HARD findings unresolved after') > 0 THEN ' OR (EXISTS (SELECT 1 FROM research_queue WHERE id = ''' || q.id || ''' AND stage = ''parked'' AND instr(error, ''HARD findings unresolved after'') > 0) AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND status = ''ok'' AND text LIKE ''%->%'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-6 hours'')))'
            WHEN substr(a.title, -20) = 'mismatch=true gates=' THEN ' OR (EXISTS (SELECT 1 FROM research_queue WHERE id = ''' || q.id || ''' AND stage = ''parked'' AND error LIKE ''PARKED-POISON-1:%mismatch=true%'') AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND status = ''ok'' AND text LIKE ''%->%'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-6 hours'')))'
            ELSE '' END
    || ' THEN ''resolved'' ELSE ''pending'' END AS observed',
  'd1-query', 3, 'qnfo-research-exec', 1, 'active', datetime('now')
FROM agent_issues a JOIN research_queue q ON q.id LIKE substr(a.title, 19, 8) || '%'
WHERE a.status = 'open' AND a.title LIKE 'RESEARCH-TERMINAL %'
  AND (SELECT COUNT(*) FROM research_queue r WHERE r.id LIKE substr(a.title, 19, 8) || '%') = 1
ON CONFLICT (class) DO UPDATE SET issue_id = excluded.issue_id, precondition = excluded.precondition, action = excluded.action, verify_probe = excluded.verify_probe, status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now');

UPDATE remediation_contracts SET status = 'superseded',
  last_verdict = 'superseded:TERMINAL-REARMED-1 (unreachable: the row is re-armed, parked or deferred and is not published; research-terminal-<prefix> measures the terminal state and closes the issue)'
WHERE status = 'active' AND class LIKE 'issue-%' AND instr(verify_probe, '''published'' AS expected') > 0
  AND issue_id IN (SELECT c.issue_id FROM remediation_contracts c WHERE c.class LIKE 'research-terminal-%' AND c.action LIKE 'none: the row is re-armed by the park sweeps%' AND c.issue_id IN (SELECT id FROM agent_issues WHERE status = 'open' AND title LIKE 'RESEARCH-TERMINAL %'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a RESEARCH-TERMINAL issue states that a queue row went terminal; once the row is back in the pipeline, published, or has spent both automatic recoveries, the defect it names no longer holds, and the row, its reason and its events remain as the signal',
  'RESEARCH-TERMINAL-REARMED-1: every terminal issue gets a self-closing contract (worker 0.29.0 for new rows, this file for the open notices); PARKED-REGROUND-1 gives a parked content failure a second automatic recovery',
  'qnfo-audit 2026-10-20 read-only: of the open notices 100026, 100043, 100049, 100051, 100153, 100165 four rows were re-armed (terminal_rearms 1, deferred or queued) and two parked again after "revise: no applicable edit"; all six carried a probe expecting published',
  'migration merged',
  'up to one remediation_contracts row per open RESEARCH-TERMINAL issue (replaced rows copied to bak_20261020_terminal_rearmed) and the unreachable published-probes of those issues superseded',
  'the Rollback header of migrations/2026-10-20-research-terminal-rearmed.sql',
  'RESEARCH-TERMINAL notices close when their row is recovered or its recoveries are spent, without a person',
  'RESEARCH-TERMINAL net inflow drains within the contract cadence; parked rows get a second recovery',
  'none',
  'd1:qnfo-audit read-only counts, node:sqlite replay in migrations/research-terminal-rearmed.test.mjs, qnfo-research-exec/terminal-rearmed.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'RESEARCH-TERMINAL-REARMED-1:%');

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'active', last_verdict = NULL WHERE last_verdict LIKE 'superseded:HARD-REVIEW-SELFCLOSE-1%'; DELETE FROM remediation_contracts WHERE class LIKE 'research-terminal-%' AND precondition = 'row parked for HARD review findings unresolved after the revise cycles';
-- BACKUP: bak_20261020_terminal_contracts
-- RESEARCH-TERMINAL-HARD-REVIEW-SELFCLOSE-1 (2026-10-20, charter pillar: autonomy; agent_issues 100294 lever 1, ISSUE-THROUGHPUT-1, and the open notices 100290, 100210, 100049, 100043).
-- qnfo-research-exec 0.28.7 gives the RESEARCH-TERMINAL issue of a row parked for "review: N HARD findings unresolved after M revise cycles" the self-closing contract that a verify mismatch has had since
-- RESEARCH-TERMINAL-SELFCLOSE-1: the row is parked with its reason and the queue is advancing, so the issue closes itself with that evidence. This file does the same for the notices that are already open.
-- Read 2026-10-20 05:1xZ: of 11 open RESEARCH-TERMINAL issues four are this reason (100290, 100210, 100049, 100043); in the last 3 days 14 of the 15 closed had no close channel, after about 54 h.
--   * For each open notice of that reason whose queue row is unambiguous (exactly one research_queue row with the title's 8-character prefix, parked, error naming the HARD findings) a contract
--     research-terminal-<prefix> is added (INSERT OR IGNORE) with the same probe the worker writes, in the instr() form (no LIKE literal over D1's 50 bytes).
--   * The older notices also hold a contract whose probe expects the row to become published (class issue-<id>): a row parked wontfix never is, so it can only fail, and a failing contract on a closed
--     issue is what the relapse trigger reopens on. Those unreachable contracts (only for an issue that gains the new one) are set superseded with the reason; the monitoring ones are left alone.
-- A row parked for any other reason ("revise: no applicable edit", a gate failure, a verify mismatch with a gate failing) is not touched: it can be a pipeline fault and stays open for a fix.
CREATE TABLE IF NOT EXISTS bak_20261020_terminal_contracts AS SELECT * FROM remediation_contracts WHERE issue_id IN (SELECT id FROM agent_issues WHERE status = 'open' AND title LIKE 'RESEARCH-TERMINAL %' AND instr(title, ': review: ') > 0 AND instr(title, 'HARD findings unresolved after') > 0);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at)
SELECT 'research-terminal-' || substr(a.title, 19, 8), a.id,
  'row parked for HARD review findings unresolved after the revise cycles',
  'none: the integrity gate withheld the paper; evidence is the parked row and an advancing queue',
  'SELECT ''parked+queue-moving'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM research_queue WHERE id = ''' || q.id || ''' AND stage = ''parked'' AND instr(error, ''HARD findings unresolved after'') > 0) AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND status = ''ok'' AND text LIKE ''%->%'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-6 hours'')) THEN ''parked+queue-moving'' ELSE ''pending'' END AS observed',
  'd1-query', 3, 'qnfo-research-exec', 1, 'active', datetime('now')
FROM agent_issues a JOIN research_queue q ON q.id LIKE substr(a.title, 19, 8) || '%'
WHERE a.status = 'open' AND a.title LIKE 'RESEARCH-TERMINAL %' AND instr(a.title, ': review: ') > 0 AND instr(a.title, 'HARD findings unresolved after') > 0
  AND q.stage = 'parked' AND instr(q.error, 'HARD findings unresolved after') > 0
  AND (SELECT COUNT(*) FROM research_queue r WHERE r.id LIKE substr(a.title, 19, 8) || '%') = 1;

UPDATE remediation_contracts SET status = 'superseded',
  last_verdict = 'superseded:HARD-REVIEW-SELFCLOSE-1 (unreachable: the row is parked wontfix and is never published; research-terminal-<prefix> measures the withheld state and closes the issue)'
WHERE status = 'active' AND class LIKE 'issue-%' AND instr(verify_probe, '''published'' AS expected') > 0
  AND issue_id IN (SELECT c.issue_id FROM remediation_contracts c WHERE c.class LIKE 'research-terminal-%' AND c.precondition = 'row parked for HARD review findings unresolved after the revise cycles');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a paper withheld by the review gate is the gate working, so its notice closes itself with the parked row as evidence; a model that could not apply a fix may be a pipeline fault and stays open',
  'RESEARCH-TERMINAL-HARD-REVIEW-SELFCLOSE-1: HARD-review terminal rows get the self-closing contract (worker 0.28.7 for new rows, this file for the open notices)',
  'qnfo-audit 2026-10-20 read-only: 4 of 11 open RESEARCH-TERMINAL issues are this reason; 14 of the last 15 closed with no channel after about 54 h; the older ones hold a probe expecting published for a wontfix row',
  'migration merged',
  'up to four new remediation_contracts rows and the unreachable published-probes of those issues superseded (copied to bak_20261020_terminal_contracts)',
  'the Rollback header of migrations/2026-10-20-research-terminal-hard-review.sql',
  'RESEARCH-TERMINAL notices of the HARD-review kind close without a person',
  'RESEARCH-TERMINAL net inflow falls by the HARD-review share (about 5 a day)',
  'none',
  'd1:qnfo-audit read-only counts, node:sqlite fixtures in migrations/research-terminal-hard-review.test.mjs and qnfo-research-exec/poison-park.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'RESEARCH-TERMINAL-HARD-REVIEW-SELFCLOSE-1:%');

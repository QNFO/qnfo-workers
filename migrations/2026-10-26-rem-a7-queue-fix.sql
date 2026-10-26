-- REM-A7-QUEUE-2 (2026-10-26, rem-a7 fork F3): two corrections to the close evidence that migrations/2026-10-26-rem-a7-queue.sql wrote, found by re-reading its numbers against the tables after it applied
-- (migration_runs 666, 18:33:35Z).
--   * Issue 1000094 said "233 implemented, which means routed". errata_queue holds 234 rows in status implemented: 233 from internal_audit (the routed ones, one per errata_actions row in status routed)
--     and one inbound-email row of 2026-08-28.
--   * Issue 1000457 said the pipeline claims the queued idea row "when the daily neuron budget reopens at 00:00 UTC". claimNew takes re-armed proposals older than 72 hours, then revision rows, then
--     resumable-stage rows, then source idea, chat and operator-prime, so the row is claimed in that rank order while the day's budget lasts; the 00:00 UTC reopening is when the budget is available, not
--     a promise that the row is first. The decision_log row below records the corrected expectation (one to three budget days), because the first row is append-only.
-- Only issue_triage.close_evidence of the two closed issues changes, by replace() of the exact sentence; a replay changes nothing.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_triage SET close_evidence = (SELECT b.close_evidence FROM bak_20261026_rem_a7_queue_fix b WHERE b.issue_id = issue_triage.issue_id) WHERE issue_id IN (SELECT issue_id FROM bak_20261026_rem_a7_queue_fix)

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_queue_fix AS
  SELECT issue_id, close_evidence
  FROM issue_triage
  WHERE issue_id IN (1000094, 1000457);

UPDATE issue_triage
   SET close_evidence = replace(close_evidence, '233 implemented, which means routed', '234 implemented (233 internal_audit rows, which means routed, and one inbound-email row of 2026-08-28)')
 WHERE issue_id = 1000094 AND instr(close_evidence, '233 implemented, which means routed') > 0;

UPDATE issue_triage
   SET close_evidence = replace(close_evidence, 'the pipeline claims it when the daily neuron budget reopens at 00:00 UTC (', 'the pipeline claims it in rank order, after re-armed proposals, revision rows and resumable-stage rows, while the daily neuron budget lasts (the budget reopens at 00:00 UTC; ')
 WHERE issue_id = 1000457 AND instr(close_evidence, 'the pipeline claims it when the daily neuron budget reopens at 00:00 UTC (') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f3',
  'a closed issue whose evidence carries a wrong number or an over-strong promise is corrected in the evidence, where the owner reads it, and the expectation is restated in the ledger',
  'REM-A7-QUEUE-2: close evidence of issues 1000094 (234 implemented errata_queue rows, 233 routed) and 1000457 (claim in rank order) corrected',
  'qnfo-audit 2026-10-26 18:45Z: errata_queue status implemented 234 = 233 internal_audit + 1 inbound-email; errata_actions status routed 233; qnfo-research-exec claimNew ORDER BY tiers (proposal attempt 0 older than 72 h, revision:, resumable stage, source idea/chat/operator-prime, FIFO older than 72 h)',
  'applied by migration',
  'issue_triage.close_evidence of two closed issues; nothing else',
  'the Rollback line restores both texts from bak_20261026_rem_a7_queue_fix',
  'evidence of the stalled-queue closes matches the tables',
  'the idea row idea-int-022429ffmvpihdfe is claimed within one to three budget days of 2026-10-26 (rank order, not first); this replaces the one budget day of the REM-A7-QUEUE-1 row',
  'none',
  'd1:qnfo-audit errata_queue, errata_actions (SELECT only); qnfo-research-exec/worker.js claimNew read on main; offline node:sqlite suite migrations/rem-a7-queue-fix.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A7-QUEUE-2:%');

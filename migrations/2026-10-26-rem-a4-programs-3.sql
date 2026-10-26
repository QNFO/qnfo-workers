-- REM-A4-PROGRAMS-3 (2026-10-26, charter pillar autonomy; session rem-a4 fork F5): an unmet definition of done is a failure, not a deferral.
-- Read from scripts/remediation_consumer.py after migrations/2026-10-26-rem-a4-programs.sql went live: a d1-query read whose observed text starts with "pending" is a deferral (no verification row, verdict deferred, never fail)
-- unless it carries a number and a bound word or operator (CONSUMER-PENDING-IS-DEFERRAL-1). The first read of the new contracts (remediation-consumer, 19:46:58Z) stamped issue-100294, issue-100318 and issue-100366 "deferred"
-- and issue-100279 "deferred", while issue-100299 (a plain count) stamped "fail". Deferral is the convention for "the probe cannot judge yet" (a loop that owns the issue for 48 hours, a time gate). It is wrong for these three,
-- whose definition of done is unmet and needs work (a family leak, a staged path that is not built, a metric that is not registered): a deferral shows no failure, writes no verification row, and after 7 days files a
-- VERIFICATION-DEFERRED-7D-1 escalation, the family that issue 100294 itself tracks. The goal-dod contracts already use the prefix "unmet:" for an unmet condition (observed "unmet: after-event questions sent 4 of 6 needed", verdict fail).
-- This file turns the unmet messages of issue-100294, issue-100318 and issue-100366 into "unmet: ..." and the three unmet messages of issue-100279 (lever not landed, no verified control-plane merge, no METRIC-TRIGGER
-- origin task); the 7-day follow-up message of issue-100279 stays "pending:" (a time gate that clears by itself at 2026-10-27T04:00Z, the case deferral is for). No clause, threshold or condition changes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, '''unmet: ', '''pending: ') WHERE class IN ('issue-100294', 'issue-100318', 'issue-100366'); UPDATE remediation_contracts SET verify_probe = replace(replace(replace(verify_probe, '''unmet: lever TP-1.23 is not landed''', '''pending: lever TP-1.23 is not landed'''), '''unmet: no control-plane code task merged', '''pending: no control-plane code task merged'), '''unmet: no code task from a METRIC-TRIGGER', '''pending: no code task from a METRIC-TRIGGER') WHERE class = 'issue-100279'

UPDATE remediation_contracts SET verify_probe = replace(verify_probe, '''pending: ', '''unmet: '), next_due_at = datetime('now')
 WHERE class IN ('issue-100294', 'issue-100318', 'issue-100366') AND instr(verify_probe, '''pending: ') > 0;

UPDATE remediation_contracts SET verify_probe = replace(replace(replace(verify_probe, '''pending: lever TP-1.23 is not landed''', '''unmet: lever TP-1.23 is not landed'''), '''pending: no control-plane code task merged', '''unmet: no control-plane code task merged'), '''pending: no code task from a METRIC-TRIGGER', '''unmet: no code task from a METRIC-TRIGGER'), next_due_at = datetime('now')
 WHERE class = 'issue-100279' AND instr(verify_probe, '''pending: lever TP-1.23 is not landed''') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a4-programs',
  'a read that says pending is a deferral and is hidden from the verification ledger; a definition of done that is unmet and needs work must read as a failure so that it is counted, probed on its cadence and not escalated as a stale deferral',
  'REM-A4-PROGRAMS-3: the unmet messages of the probes of issue-100294, issue-100318, issue-100366 and (three of four) issue-100279 read "unmet:" instead of "pending:"',
  'remediation_consumer.py is_deferred_read (CONSUMER-PENDING-IS-DEFERRAL-1): pending without a bound word or operator is a deferral; remediation_contracts after the first consumer read 19:46:58Z: issue-100294, issue-100318, issue-100366 and issue-100279 last_verdict deferred, issue-100299 fail; goal-dod contracts use "unmet:" with verdict fail',
  'applied by migration',
  'the text of four probes; no clause, bound or condition changed',
  'the Rollback line turns the messages back',
  'the three unmet contracts count as failures and write verification rows; the one time-gated message stays a deferral',
  'no VERIFICATION-DEFERRED-7D-1 escalation for 100294, 100318 or 100366; 100279 reads pending only until 2026-10-27T04:00Z',
  '0', 'offline replay of the three files in order on node:sqlite and the consumer rule mirrored in the suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A4-PROGRAMS-3:%');

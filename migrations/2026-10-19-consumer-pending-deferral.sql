-- CONSUMER-PENDING-IS-DEFERRAL-1 (2026-10-19, charter pillar: autonomy; agent_issues 2954, 2826, 2880, 2881, 2953). Companion to the scripts/remediation_consumer.py change.
-- Measured 2026-10-19 to 12:10Z: the consumer wrote 223 pass = 0 rows in 24 hours for d1-query reads that began with 'pending' (203 plain, 20 in the
-- measured-pending shape), and stamped the contract last_verdict 'fail'. qnfo-fleet-control's tick has treated 'pending' as a deferral since 0.33.11
-- (verdict 'deferred', no row), so the two loops probing the same contracts disagreed. The loop-owned contracts issue-2826, issue-2880 and issue-2881
-- ("pending: filed by qnfo-fleet-control, which owns it for 48h") sat at 'fail', which remediation_verification_autoclose_ins reads as a failing
-- verdict (cb.last_verdict IN ('fail', ...)) to refuse the filing loop's own close. The consumer now defers a plain pending read exactly as the tick does;
-- the measured-pending shape that remediation_reopen_on_relapse_d1 counts (a number against a ceiling, target, threshold, limit or operator) stays a failure.
-- The detector below counts plain-pending pass = 0 rows written by a consumer run after this migration plus a 90 minute grace for runs in flight at
-- the merge (the anchor is fixed when the file is applied), and holds that at 0.
-- Re-measured 2026-10-19T14:44Z before landing (package LA): 433 pass = 0 rows in 24 hours begin with 'pending' (393 plain, 40 measured-pending),
-- all from remediation-consumer@*, across 88 contract classes, so the defect is live and larger than at 12:10Z. The live D1 trigger
-- remediation_reopen_on_relapse_d1 carries the same measured-pending expression as migrations/2026-10-17-measured-pending-triggers.sql.
-- Rows this file writes: failure_modes 1, remediation_contracts 1, decision_log 1 (none exist yet; every statement is INSERT OR IGNORE or WHERE NOT EXISTS).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-consumer-pending-recorded-as-failure'; DELETE FROM failure_modes WHERE fm_key = 'consumer-pending-recorded-as-failure'
-- Rollback scope: the registry rows only; the behaviour is the scripts/remediation_consumer.py change (revert that file).

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('consumer-pending-recorded-as-failure',
  'a d1-query probe that reads ''pending: <reason>'' (it cannot judge yet) is recorded by the consumer as a failed verification and stamps its contract last_verdict fail',
  'scripts/remediation_consumer.py classified every observed that differed from expected as fail. The deferral convention (REMEDIATION-PENDING-PREFIX-1) was honoured by qnfo-fleet-control''s tick (DEFERRAL-NOT-A-FAILURE-1) but never by the consumer, which probes the same d1-query contracts every 22 minutes, so each pending read wrote a pass = 0 row and a fail stamp',
  'scripts/remediation_consumer.py CONSUMER-PENDING-IS-DEFERRAL-1: a pending read is verdict deferred, counted as skipped, with no verification row; the measured-pending shape the D1 trigger remediation_reopen_on_relapse_d1 counts (a number and a ceiling, target, threshold, limit, fewer than, more than or a comparison operator) stays a failure; scripts/remediation_consumer_pending_test.py compares the carve-out with the trigger''s own expression',
  'fm-consumer-pending-recorded-as-failure: plain-pending pass = 0 rows from remediation-consumer@* written after this migration (90 minute grace)',
  'fm-consumer-pending-recorded-as-failure', '2026-10-19T12:10:00Z', 2954,
  'a contract''s probe returns observed ''pending'' or ''pending: <reason>'' without a measurement (a loop-owned issue inside its 48 hour window, a window not yet open) and the consumer is the loop that reads it',
  'pass = 0 rows and last_verdict fail on contracts that have not failed; the filing loop''s own close is refused by the autoclose trigger while an active contract of the issue reads fail; the failure share and the runtime-share denominator are inflated by about 220 rows a day',
  'every d1-query contract with a pending branch (75 distinct contracts read pending in the 24 hours to 12:10Z, 176 of the 223 rows on issue contracts); the issues they guard cannot close while the stamp reads fail');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-consumer-pending-recorded-as-failure', NULL, 'CONSUMER-PENDING-IS-DEFERRAL-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_verifications WHERE verified_at > ''' || strftime('%Y-%m-%d %H:%M:%S', 'now', '+90 minutes') || ''' AND pass = 0 AND verifier LIKE ''remediation-consumer@%'' AND lower(trim(observed)) LIKE ''pending%'' AND NOT (observed GLOB ''*[0-9]*'' AND (observed LIKE ''%ceiling%'' OR lower(observed) LIKE ''%target%'' OR lower(observed) LIKE ''%threshold%'' OR lower(observed) LIKE ''%limit%'' OR lower(observed) LIKE ''%fewer than%'' OR lower(observed) LIKE ''%more than%'' OR observed LIKE ''% <= %'' OR observed LIKE ''% >= %'' OR observed LIKE ''% < %'' OR observed LIKE ''% > %''))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'the worker tick''s reading of a pending observation (a deferral, no verdict) is the fleet''s convention (REMEDIATION-PENDING-PREFIX-1, DEFERRAL-NOT-A-FAILURE-1), so the consumer that probes the same d1-query contracts follows it; the measured-pending shape stays a failure because the D1 triggers that reopen and close issues already count it so',
  'CONSUMER-PENDING-IS-DEFERRAL-1: scripts/remediation_consumer.py consume_d1 records a plain pending read as verdict deferred (skipped, no verification row, last_verdict deferred); failure mode consumer-pending-recorded-as-failure and its detector registered',
  'qnfo-audit 2026-10-19 to 12:10Z: 223 pass = 0 pending rows in 24 h from remediation-consumer@* (203 plain, 20 measured); issue-2826, issue-2880, issue-2881 at last_verdict fail on a pending read; remediation_reopen_on_relapse_d1 read from sqlite_master; scripts/remediation_consumer_pending_test.py fails against the previous consumer and passes after',
  'merged to main', 'the consumer verdict path for d1-query contracts only; runner-https and code-read are unchanged; a pending read no longer counts as a failure, an attempt still counts, and a measured-pending read still does',
  'revert scripts/remediation_consumer.py; the Rollback header removes the failure mode and its detector',
  'a contract that cannot judge yet reads deferred in both loops, so a loop-owned issue can be closed by the loop that filed it',
  'within 24 hours of the merge fm-consumer-pending-recorded-as-failure reads 0, contracts issue-2826, issue-2880 and issue-2881 read last_verdict deferred, and plain pending pass = 0 rows from remediation-consumer@* stop',
  'none', 'offline: scripts/consumer-pending.test.mjs (real consume_one on sqlite, parity with the trigger expression over a corpus), remediation_consumer.py --selftest, migrations/consumer-pending-deferral.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CONSUMER-PENDING-IS-DEFERRAL-1:') = 1);

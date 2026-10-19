-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_rc_2007
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_rc_2007 b WHERE b.class = 'issue-2007'), max_attempts = (SELECT b.max_attempts FROM bak_20261019_rc_2007 b WHERE b.class = 'issue-2007'), attempts = (SELECT b.attempts FROM bak_20261019_rc_2007 b WHERE b.class = 'issue-2007') WHERE class = 'issue-2007'; UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_rc_2007 b WHERE b.class = 'issue-2008') WHERE class = 'issue-2008'; DELETE FROM remediation_contracts WHERE class = 'fm-probe-unemitted-kind'; DELETE FROM failure_modes WHERE fm_key = 'probe-unemitted-kind'
-- spof-review: none added
--
-- ANCHOR-PROBE-REACHABLE-1 (2026-10-19, pillar autonomy; issue 2007 TP-1c-ANCHOR-REPAIR-NOT-NEEDS-HUMAN-1, plan
-- docs/handoff/2026-10-19-closeout.md "code-loop-probe-contracts-parked-and-unsatisfiable"). The issue-2007 probe could never pass:
-- branch 1 waits for a cloud_ops_events kind 'code-task.anchor-repaired' that has 0 rows ever (read 2026-10-19 15:30Z), and branch 2
-- needs no code_tasks.last_error containing 'anchor occurs' updated since 2026-10-06, but closed rows ct_2daxzx8qdcy4nq and
-- ct_byjl72gcsckxag match for good. The contract had re-run 400 times against max_attempts 15. The new probe measures the issue's
-- real definition of done on a rolling 14-day window: the locator is live (code-task.anchor-located events) and no code task read
-- step failed on an anchor. Read live at 15:30Z it returns 'pending: 15 task read-steps failed on an anchor in the last 14 days',
-- so the issue stays open on a probe that can close it. The bar is not lowered: issue 2007 closes only when anchor failures stop.
-- The class row exists from birth (ORPHAN-GUARD-BIRTH-1), so this is an UPDATE. failure_modes probe-unemitted-kind records the
-- defect shape (a probe that waits on an event kind nobody writes) with a detector for this kind.
-- DEFECT-NOT-DEFERRAL-1 (same file; issues 100194 and 100195, VERIFICATION-PATH-1 escalations): a probe that has measured the defect
-- reports it as a failure, not as 'pending'. 'pending' is the deferral convention (the probe cannot judge yet), so a present defect
-- worded 'pending: ...' left both contracts deferred for 13 days and blind to the 7-day escalation's definition of done. The new
-- issue-2007 probe says 'defect: ...'; the issue-2008 branch that has seen a failed required check says 'defect: ...' too. Its
-- 'pending: measuring 14 days from 2026-10-13' branch is a real, finite wait (ends 2026-10-27) and stays a deferral.

CREATE TABLE IF NOT EXISTS bak_20261019_rc_2007 AS SELECT * FROM remediation_contracts WHERE class IN ('issue-2007', 'issue-2008');

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''code-task.anchor-located'' AND status = ''ok'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-14 days'')) = 0 THEN ''defect: no anchor-located event in 14 days'' WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''code-task.fail'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-14 days'') AND instr(lower(text), ''anchor'') > 0) > 0 THEN ''defect: '' || (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''code-task.fail'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-14 days'') AND instr(lower(text), ''anchor'') > 0) || '' task read-steps failed on an anchor in the last 14 days'' ELSE ''ok'' END AS observed /* ANCHOR-PROBE-REACHABLE-1 */',
  verify_transport = 'd1-query',
  status = 'active',
  attempts = 0,
  max_attempts = 15,
  next_due_at = datetime('now'),
  last_verdict = 'rearmed: ANCHOR-PROBE-REACHABLE-1 (old probe branches unreachable)'
WHERE class = 'issue-2007' AND instr(verify_probe, 'ANCHOR-PROBE-REACHABLE-1') = 0;

UPDATE remediation_contracts SET
  verify_probe = replace(verify_probe, 'THEN ''pending: a code-loop pull request failed a required check in the last 14 days''', 'THEN ''defect: a code-loop pull request failed a required check in the last 14 days'' /* DEFECT-NOT-DEFERRAL-1 */')
WHERE class = 'issue-2008' AND instr(verify_probe, 'DEFECT-NOT-DEFERRAL-1') = 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, symptom, blast_radius)
VALUES ('probe-unemitted-kind',
  'a closing probe waits on a cloud_ops_events kind that no code writes, so the issue can never close',
  'issue-2007 probe branch 1 required kind code-task.anchor-repaired (0 rows ever); branch 2 matched permanent closed code_tasks rows',
  'ANCHOR-PROBE-REACHABLE-1: probe the definition of done on a rolling window over events that are written (code-task.anchor-located, code-task.fail)',
  'fm-probe-unemitted-kind: no live contract references code-task.anchor-repaired while that kind has 0 rows',
  'fm-probe-unemitted-kind', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 2007,
  'contract issue-2007 at 400 attempts against max_attempts 15, verdict fail forever',
  'one open issue (2007) and its owner loop; issues_unprobed and fix metrics read a stuck contract');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at)
VALUES ('fm-probe-unemitted-kind', NULL, 'always', 'detector for failure mode probe-unemitted-kind',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status IN (''active'', ''holding'') AND substr(class, 1, 3) <> ''fm-'' AND instr(verify_probe, ''code-task.anchor-repaired'') > 0 AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''code-task.anchor-repaired'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'));

UPDATE roadmap_implementation SET evidence = evidence || ' | 2026-10-19 ANCHOR-PROBE-REACHABLE-1: files up to 6,000,000 chars via anchor window (LARGE-FILE-WINDOW-1), JavaScript verification deferred to the publisher (VERIFY-DEFER-PUBLISHER-1, PUBLISH-SUITE-CHECK-1), issue-to-task bridge live. Open: anchor read-step failures (issue 2007, rolling 14-day probe) and the 14-day gate window (issue 2008).'
WHERE id = 11 AND instr(COALESCE(evidence, ''), 'ANCHOR-PROBE-REACHABLE-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01EFM65CoycWBmyc1XeocwDL',
  'a closing probe must be able to pass when the defect is fixed',
  'ANCHOR-PROBE-REACHABLE-1: replace the unsatisfiable issue-2007 probe with a rolling 14-day probe on anchor-located and code-task.fail events',
  'live 2026-10-19 15:30Z: 0 code-task.anchor-repaired rows ever; contract at 400 attempts; new probe reads defect: 15 anchor failures in 14 days',
  'applied', 'one remediation_contracts row, one failure_modes row, one fm contract, roadmap_implementation id 11 evidence text',
  'the Rollback header restores the contract from bak_20261019_rc_2007',
  'issue 2007 can now close on its own when anchor failures stop',
  'contracts issue-2007 and issue-2008 stop deferring (deferred_since cleared) within 2 h and escalations 100194 and 100195 close; issue 2007 closes once 14 days pass with no anchor failure',
  'none', 'cloud_ops_events kinds, code_tasks.last_error, remediation_contracts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'ANCHOR-PROBE-REACHABLE-1:%');

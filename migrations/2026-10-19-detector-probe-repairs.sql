-- DETECTOR-PROBE-REPAIR-1 (2026-10-19, charter pillar autonomy; METRIC-TRIGGER-3072 failure_modes_recurring; OWNER-NO-LOOSE-ENDS-1; fm-probe-dynamic-like-too-complex)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'lower(trim(o.title)) = lower(trim(''VERIFICATION-DEFERRED-7D-1: '' || c.class))', 'o.title LIKE ''VERIFICATION-DEFERRED-7D-1: '' || c.class || ''%''') WHERE class = 'fm-verification-deferral-unaged'; UPDATE remediation_contracts SET verify_probe = '{"paths": ["scripts/remediation_consumer.py"], "contains": "if passed != 1 and newer_than_checkout(c.get(\"ts\"), checkout_epoch()):"}' WHERE class = 'fm-code-read-stale-checkout'; DELETE FROM remediation_contracts WHERE class = 'fm-probe-dynamic-like-too-complex'; DELETE FROM failure_modes WHERE fm_key = 'probe-dynamic-like-too-complex'
-- Rollback scope: the two verify_probe texts and the registry rows; the decision_log row stays (append-only).
-- spof-review: none added. Both detectors keep their own contract row; the new detector fm-probe-dynamic-like-too-complex is the second path for the first defect (it reads the contract table, not the probe's result).
--
-- MEASURED (qnfo-audit, 2026-10-19 15:40Z, SELECT only). v_failure_mode_status read 12 recurring and 2 unprobed (metric failure_modes_recurring 13 then 14). Nine are real
-- recurrences of a live condition (unprobed-issues 79 > 10, open-issue-no-doer 7, unbounded-ready-queue 4, wai-spend-per-paper 63.2 USD / 38 papers against 0.75 USD a paper,
-- reasoning-starves-small-answer glm-5.3-flash 17010 ms, health-ok-but-empty 1, unknown-model-id nemotron-3-120b from qnfo-model-eval, q08-analysis-marker-rejected 2,
-- research-revise-shrink): their remediation did not hold or has not landed, and they stay. Two are detectors that cannot read what they claim to read:
--   1. fm-verification-deferral-unaged (qnfo-fleet-control 0.39.0, migrations/2026-10-19-contract-deferred-since.sql): its probe errors in D1 with
--      "LIKE or GLOB pattern too complex" (last_verdict probe-error, no verification row, so the view says unprobed). D1 refuses a LIKE pattern longer than 50 bytes and the
--      probe builds the pattern from a column: 'VERIFICATION-DEFERRED-7D-1: ' || c.class || '%'. The worker's own sweep (RT_DEFERRAL_ISSUE_PREFIX in qnfo-fleet-control) already compares with
--      lower(trim(title)) = lower(trim(prefix || class)); the probe now does the same. Run read-only with that change the probe returns expected 0, observed 0 (1.16 s).
--   2. fm-code-read-stale-checkout: its code-read marker `if passed != 1 and newer_than_checkout(c.get("ts"), checkout_epoch()):` left scripts/remediation_consumer.py when
--      CODE-LOOP-CONTROL-PLANE-1 (b3ce5e4) moved the guard into checkout_behind_contract(), which also asks whether the checkout is the tip. The guard is still there, so the
--      detector reads missing-marker for a defect that is fixed. The new marker is that function's return line (once in the file on main and once on the open PR 2966 branch).
-- A third pair is not touched: fm-relapse-judged-against-target-not-trigger is a contract born with next_due_at two hours out and has never run, so the view says unprobed until
-- 16:47Z; fm-steward-protection-answer-dropped probed 15:09Z, before qnfo-github-steward wrote main_rules, and reads yes at the next run (latest run now reads required_checks no).
--
-- WHAT THIS FILE DOES
--   1. replaces the dynamic LIKE in fm-verification-deferral-unaged with the equality the worker uses; sets both repaired contracts due now.
--   2. points fm-code-read-stale-checkout at the refactored guard.
--   3. registers failure mode probe-dynamic-like-too-complex with detector fm-probe-dynamic-like-too-complex: an active contract whose probe has LIKE '<text>' || <column>
--      and whose last verdict is probe-error. It reads 0 today and 1 for the pre-repair probe.
--   4. appends one decision_log row.

UPDATE remediation_contracts
   SET verify_probe = replace(verify_probe, 'o.title LIKE ''VERIFICATION-DEFERRED-7D-1: '' || c.class || ''%''', 'lower(trim(o.title)) = lower(trim(''VERIFICATION-DEFERRED-7D-1: '' || c.class))'),
       next_due_at = datetime('now'), last_verdict = NULL
 WHERE class = 'fm-verification-deferral-unaged'
   AND instr(verify_probe, 'o.title LIKE ''VERIFICATION-DEFERRED-7D-1: '' || c.class || ''%''') > 0;

UPDATE remediation_contracts
   SET verify_probe = '{"paths": ["scripts/remediation_consumer.py"], "contains": "return newer_than_checkout(ts, checkout_epoch(root)) and checkout_is_tip(root) is not True"}',
       next_due_at = datetime('now'), last_verdict = NULL
 WHERE class = 'fm-code-read-stale-checkout'
   AND instr(verify_probe, 'if passed != 1 and newer_than_checkout(c.get(\"ts\"), checkout_epoch()):') > 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('probe-dynamic-like-too-complex',
  'a d1-query probe builds a LIKE pattern from a column, D1 refuses a pattern over 50 bytes, and the contract reads probe-error for ever',
  'D1 limits LIKE and GLOB patterns to 50 bytes; fm-verification-deferral-unaged compared agent_issues.title LIKE ''VERIFICATION-DEFERRED-7D-1: '' || c.class || ''%'' (27 bytes of prefix plus a class name of any length), so it failed on the first class longer than 22 bytes and never wrote a row; the offline suite ran on node:sqlite, which has no such limit',
  'DETECTOR-PROBE-REPAIR-1 (migrations/2026-10-19-detector-probe-repairs.sql): the probe compares with lower(trim(title)) = lower(trim(prefix || class)); a probe that must match a prefix against a column uses substr(col, 1, n) = prefix or instr(col, prefix) = 1',
  'no active contract has a probe with LIKE <text> || <column> and last_verdict probe-error',
  'fm-probe-dynamic-like-too-complex', '2026-10-19', NULL,
  'a probe pattern is longer than 50 bytes after the column is bound',
  'v_failure_mode_status says unprobed for a detector that has run; remediation_contracts.last_verdict probe-error; no remediation_verifications row',
  'the failure mode the probe guards is unwatched (fm-verification-deferral-unaged: a deferral older than 7 days would file no issue and nothing would say so)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-probe-dynamic-like-too-complex', NULL, 'DETECTOR-PROBE-REPAIR-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE status = ''active'' AND verify_transport = ''d1-query'' AND last_verdict = ''probe-error'' AND verify_probe GLOB ''*LIKE ''''*'''' || *'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a failure-mode detector that cannot read what it claims to read is a false recurrence, not a measurement; the repair keeps the detector and changes only how it reads',
  'DETECTOR-PROBE-REPAIR-1: fm-verification-deferral-unaged compares with equality instead of a dynamic LIKE; fm-code-read-stale-checkout reads the refactored guard; failure mode probe-dynamic-like-too-complex and its detector registered',
  'qnfo-audit 2026-10-19 15:40Z: the deferral probe errors with "LIKE or GLOB pattern too complex" and the repaired text returns expected 0 observed 0; git grep on origin/main: the old marker occurs 0 times, the new return line once',
  'migration merged', 'two verify_probe texts and two registry rows; failure_modes_recurring falls by two once the detectors run (the other 12 are live conditions)',
  'the Rollback header restores both probe texts and deletes the registry rows',
  'a detector that errors or points at moved code is caught by a second detector',
  'failure_modes_recurring <= 12 within 2 h',
  'none',
  'd1:qnfo-audit remediation_contracts and v_remediation_evidence_all (SELECT only); offline node:sqlite suite migrations/detector-measurement-repairs.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'DETECTOR-PROBE-REPAIR-1:') = 1);

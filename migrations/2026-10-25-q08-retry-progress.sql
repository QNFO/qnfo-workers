-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-q08-retry-cycle', 'belief-q08-retry-cycle'); DELETE FROM belief_registry WHERE belief_key = 'q08-retry-cycle'; DELETE FROM failure_modes WHERE fm_key = 'q08-retry-cycle';
-- Q08-RETRY-PROGRESS-1 (2026-10-25, charter pillar: cost): exhaust an exact failed-draft cycle, not a spend budget or a changed draft. No control disposition or publication threshold changes.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES ('q08-retry-cycle',
  'an unchanged or restored rejected draft can spend another full fact verification and obtain a different verdict without improving its text',
  'verifyAndRevise bounded time, rounds and model revisions, but retained claim classes rather than the exact texts already rejected in the invocation',
  'Q08-RETRY-PROGRESS-1: retain the at-most-nine reviewed texts locally; an exact repeat ends as an accuracy failure with its repair trail before another verification; changed drafts retain full verification',
  'hourly code-read fm-q08-retry-cycle plus retry-progress.test.mjs differential provider-call coverage',
  'fm-q08-retry-cycle', '2026-10-25',
  'a repair returns text already rejected by the same verifyAndRevise invocation',
  'Live run 955 used 7 compose, 3 panel and 16 fact-check calls over 642524 ms with no publication. Its trail shows repeated repairs, not the intermediate texts; exact-cycle incidence and live savings are unmeasured.',
  'q08-signal-engine repair exhaustion only; no new state store, model, binding, cron, spend-stop, control disposition or publication gate');

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('q08-retry-cycle',
  'Re-verifying exactly the same rejected text within one repair does not improve that draft; changed text must still be verified independently',
  0.95,
  'retry-progress.test.mjs uses real verifyAndRevise and provider-call sites, comparing only the cycle check removed: a no-op revision uses 4 rather than 8 fact-check calls and still fails; an improving revision uses all 8 and can pass; repeated text cannot shop for a passing verdict. No live savings attributed.',
  'belief-q08-retry-cycle', 'Q08-RETRY-PROGRESS-1');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-q08-retry-cycle', NULL,
  'Q08-RETRY-PROGRESS-1 has landed on main; runtime deployment is checked separately against q08.org/health minimum version 0.35.1',
  'Restore the invocation-local exact-text cycle check if absent; retain every verifier and publication gate. Run retry-progress.test.mjs before a canonical redeploy.',
  '{"paths":["q08-signal-engine/worker.js"],"contains":"if (reviewedDrafts.indexOf(cand.text) >= 0) { trail.push(\"r\" + (round + 1) + \" stopped: repair repeated an already rejected draft\"); return fail(); }"}',
  'code-read', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
SELECT 'belief-q08-retry-cycle', NULL,
  'Q08-RETRY-PROGRESS-1 code is on main; this checks the mechanism, not a live cost reduction',
  'belief probe', verify_probe, verify_transport, 3, 'q08-signal-engine', 1, 'active', 'belief', datetime('now', '+60 minutes')
FROM remediation_contracts WHERE class = 'fm-q08-retry-cycle';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_a2e8b8f1-8f5e-48d5-a565-eb6bec8f5f3b:q08-retry-progress-1',
  'Exact repeated failed text is an unproductive repair; equal claim counts or recurring claim classes alone are not evidence of no progress',
  'Q08-RETRY-PROGRESS-1: exhaust only exact failed-text cycles in one repair invocation; no cached pass or cross-run history; retain independent reviewers and final publication checks',
  'q08.org/health 2026-10-25T19:02Z: version 0.35.0, 261 finished runs, 4 published, gate pass rate 0.015, 1391873.741969 neurons and 347968.435 neurons per published piece. Run 955: 7 compose, 3 panel, 16 fact-check calls, 642524 ms, gate_failed. Existing Q08-YIELD-1 only stops repeated claim classes when the prune is below the floor. Intermediate live drafts are unavailable, so run-955 cycle savings are not asserted.',
  'Differential offline fixtures verify four calls saved on a no-op revision and no calls skipped on improving repairs; post-deploy incidence remains to be measured',
  'q08-signal-engine verifyAndRevise only, shared by essay, forecast and audit repair; no other worker or spend/control disposition changed',
  'Revert worker and mirror through canonical deployment; run migration Rollback for new evidence rows; decision_log remains append-only',
  'none; correction to existing bounded repair behavior',
  'A no-op repair spends no second verification and cannot pass by a changed verdict. Improving repairs retain the same calls and thresholds. Live neuron reduction depends on exact-cycle incidence.',
  'none claimed; prevents redundant review spend without lowering publication quality',
  'current main and open PR versions; prior yield and ledger controls; q08.org/health and /api/runs; retry-progress.test.mjs and existing Q08 suites; canonical deployment only'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'Q08-RETRY-PROGRESS-1:%');

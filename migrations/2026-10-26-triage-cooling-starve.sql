-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-triage-batch-starved-by-cooling-rows'; DELETE FROM failure_modes WHERE fm_key = 'triage-batch-starved-by-cooling-rows';
--
-- IDEA-TRIAGE-COOLING-STARVE-1 (2026-10-26, charter pillar autonomy, agent_issues 1000411; companion to idea-hub 1.14.4 in the same pull request).
-- decision_log is append-only, so the Rollback line leaves the decision row. No DELETE or DROP runs in this file, so it names no BACKUP table.
--
-- WHAT WAS WRONG (read 2026-10-26 from live qnfo-audit, read-only): idea-hub triage selected the TRIAGE_BATCH (6) oldest-created rows among the marked ones ("[scoring-error N ISO]")
--   and skipped the ones still cooling afterwards in JS. Five rows past their third failure (one try a day) sat at the head of that order, so 19 rows that had failed once waited
--   untried for days, behind rows that were never going to be scored that hour. idea-hub 1.14.4 moves the cooling test into the SELECT (the rows are counted, not selected) and orders
--   the marked rows that are selected by the age of their last failure, oldest first.
-- WHAT THIS FILE DOES: registers the failure mode and a code-read detector (the old ORDER BY must stay absent, the SQL-side cooling clause must stay present) and records the decision.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('triage-batch-starved-by-cooling-rows',
  'a batch that takes the oldest rows of a queue and skips the ones that are not yet due afterwards lets rows that are never due this cycle hold every slot, so due rows behind them wait',
  'idea-hub triage selected the TRIAGE_BATCH oldest-created rows among those carrying a scoring-error marker and applied the 24-hour cooling test after the select. On 2026-10-26 five rows past their third failure were the five oldest marked rows, so they took five of the six slots every cycle while 19 once-failed rows (some since 2026-10-22) were never tried',
  'IDEA-TRIAGE-COOLING-STARVE-1 (idea-hub 1.14.4): the cooling test is part of the SELECT (a row with SCORING_RETRY_FAST or more failures whose last failure is under SCORING_RETRY_SLOW_MS old is counted into scoring_cooling and not selected), and marked rows are ordered by the age of their last failure, oldest first. idea-hub/scoring-failure.test.mjs holds the two cases (n cooling rows older than three once-failed rows; more marked rows than the batch holds)',
  'the code-read contract fm-triage-batch-starved-by-cooling-rows reads idea-hub/worker.js on main for the removed ORDER BY, which must stay absent, and idea-hub/scoring-failure.test.mjs runs in CI',
  'fm-triage-batch-starved-by-cooling-rows', '2026-10-26', 1000411,
  'a selection takes the oldest rows by creation time from a queue where some rows have a retry time in the future and the due test runs after the selection',
  'rows that are due stay untried while the batch is full of rows that are not, the queue does not drain although capacity exists, and the event meta shows scoring_cooling at the batch size',
  'idea-hub triage: 19 once-failed idea_proposals rows waited untried for up to four days; nothing was dropped and no score was wrong, the rows were late');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-triage-batch-starved-by-cooling-rows', NULL, 'IDEA-TRIAGE-COOLING-STARVE-1', 'failure-mode detector',
  '{"paths":["idea-hub/worker.js"],"absent":"ORDER BY (CASE WHEN rationale LIKE ''[scoring-error %'' THEN 1 ELSE 0 END) ASC, created_at ASC LIMIT ?1"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'a follow-up this session filed with a doer and a closing probe is better closed by the session that understands the defect than left for the code loop to plan, when it is a one-select change and no claim or code task is on the file',
  'IDEA-TRIAGE-COOLING-STARVE-1: idea-hub 1.14.4 puts the cooling test in the triage SELECT (rows counted, not selected) and orders marked rows by their last failure, oldest first; this file adds the failure mode triage-batch-starved-by-cooling-rows, its code-read detector and this row',
  'read 2026-10-26: 24 of 33 new idea_proposals carried a scoring-error marker, 5 were past their third failure and were the five oldest marked rows, the batch is 6; no code task and no work claim on idea-hub/worker.js for issue 1000411; scoring-failure.test.mjs holds the two new cases and fails 3 assertions against the old select',
  'applied through the canonical path on merge: the migration runner applies this file and canonical-deploy deploys idea-hub 1.14.4',
  'one failure_modes row, one code-read contract and one decision row in qnfo-audit; idea-hub triage only, one extra COUNT per cycle. No agent_issues or issue_triage change, no secret, no binding',
  'revert the idea-hub deploy to 1.14.3 and run the Rollback line of this file',
  'once-failed idea rows are tried within a cycle instead of waiting behind rows that are cooling',
  'the code-read detector passes on main and the cloud_ops_events idea-triage-budget meta reports scoring_cooling without the batch being filled by it',
  'queued ideas reach scoring and the research queue in the cycle they are due; no change for any outside audience',
  'repository read of idea-hub/worker.js, node:sqlite replay in idea-hub/scoring-failure.test.mjs, d1:qnfo-audit idea_proposals (SELECT only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'IDEA-TRIAGE-COOLING-STARVE-1:') = 1);

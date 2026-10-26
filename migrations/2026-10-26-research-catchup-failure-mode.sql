-- RESEARCH-CATCHUP-FAILED-1 (2026-10-26, pillar research; agent_issues 1000331): the first ensemble-catchup run in QNFO/qnfo-research failed and nothing in the fleet noticed.
--
-- WHAT HAPPENED. qnfo-research-exec 0.35.0 (repoCatchupTick, migration 2026-10-26-research-provenance-ledger.sql) dispatches .github/workflows/ensemble-catchup.yml
-- while the imported ensemble history is not an ancestor of qnfo-research main or the legacy repository holds newer cycles. The first run (40290498423, 2026-10-26 08:11Z)
-- linked the history, then stopped on a conflict in runs/README.md: qnfo-ensemble-research#1 had turned that repository's README into a "moved" notice (merged 08:03Z) and
-- under -Xsubtree=runs it lands on this repository's runs/README.md, the index of the runs. The rehearsal had only added a cycle. Nothing was pushed. The worker records
-- the dispatch time and paces the next at 6 hours; it does not read the run's result. Found by reading the run, not by a detector.
--
-- WHAT THIS ADDS. A failure_modes row and the detector contract fm-research-catchup-failed: an external-https probe (api.github.com is outside the fleet; the repository is
-- public) that passes while the latest completed run of ensemble-catchup.yml concluded success. The fix itself is QNFO/qnfo-research#5 (tools/ensemble_catchup.sh, tested).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'research-catchup-failed'; DELETE FROM remediation_contracts WHERE class = 'fm-research-catchup-failed'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('research-catchup-failed',
  'the workflow that links the imported ensemble history to qnfo-research main and imports newer legacy cycles fails, and the fleet does not notice: the first run (40290498423) stopped on a runs/README.md conflict',
  'the catch-up was a plain git merge of the legacy repository main under -Xsubtree=runs; the legacy root files (README.md, LICENSE, PROVENANCE.md, RESEARCH-PROCEDURE.md) map onto runs/ and conflict with what the consolidated repository replaced them with, and qnfo-research-exec dispatches the workflow and records the time but never reads the run result',
  'qnfo-research tools/ensemble_catchup.sh (QNFO/qnfo-research#5): a conflict outside runs/cycle-* resolves for the consolidated side, a file it dropped stays dropped, a conflict inside a cycle still stops the run; tools/test_catchup.py builds the situation with throwaway repositories; the detector below reads the latest completed run',
  'the latest completed run of ensemble-catchup.yml concluded success (fm-research-catchup-failed, external-https)', 'fm-research-catchup-failed', '2026-10-26', 1000331,
  'the legacy repository changes a file at its root, or two sides edit a run in different ways, while the history is unlinked or a newer cycle is waiting',
  'ensemble-catchup runs end failure; 5e41f98 is not an ancestor of qnfo-research main; the archive request for qnfo-ensemble-research never files',
  'the third-party copy of the 396 cycles (Software Heritage reaches them through the link); the archive of qnfo-ensemble-research; newer legacy cycles missing from runs/');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-research-catchup-failed', NULL, 'RESEARCH-CATCHUP-FAILED-1', 'failure-mode detector',
  '{"url": "https://api.github.com/repos/QNFO/qnfo-research/actions/workflows/ensemble-catchup.yml/runs?per_page=1&status=completed", "method": "GET", "check": "json:workflow_runs.0.conclusion", "expected": "success"}',
  'external-https', 3, 'qnfo-research-exec', 1, 'active', 'failure-mode');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_01LZjc7uUB8m8Nz9UBDuVGUY',
  'a dispatched workflow whose result nothing reads is an unobserved path; the first run of ensemble-catchup failed and was found only by reading it',
  'make the catch-up a tested script (qnfo-research#5) and add a detector that reads the latest completed run (fm-research-catchup-failed)',
  'run 40290498423 failed on runs/README.md at 2026-10-26 08:11Z; reproduced on a scratch worktree of main; tools/test_catchup.py: 5 cases, 4 fail against the old merge',
  'qnfo-research draft PR 5 (verify, reproduce, CodeQL green); this migration',
  'ensemble-catchup.yml in qnfo-research and one failure_modes row plus one contract in qnfo-audit',
  'revert qnfo-research#5; run the Rollback line of this migration',
  'the fleet sees a failed history-link run within the hour (an external-https contract) instead of by reading the run',
  'the latest completed ensemble-catchup run concludes success within 2 hours of the merge of qnfo-research#5',
  'the third-party copy of the ensemble history (Software Heritage) and the archive of the legacy repository',
  'the run log (read), a scratch worktree of main with the real legacy head, offline git fixtures'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'claude-code-session_01LZjc7uUB8m8Nz9UBDuVGUY' AND instr(action, 'make the catch-up a tested script') = 1);

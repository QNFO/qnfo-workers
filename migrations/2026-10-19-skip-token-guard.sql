-- SKIP-TOKEN-GUARD-1 (2026-10-19, charter pillar: autonomy; owner directive 2026-10-19: "audit, resolve and remediate all failure modes and their root causes systemwide").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-skip-token-in-merge-message'; DELETE FROM failure_modes WHERE fm_key = 'skip-token-in-merge-message';
--
-- WHY (measured 2026-10-19 with git history and the workflow run list)
-- Merge 03d801a0 (#2811, the consumer cadence-gate fix) started no push-triggered workflow: the runs listed for its sha were all workflow_run follow-ups.
-- Its squash message explains how the gate treats a status commit and so contains the literal skip-CI token; GitHub honours that token anywhere in the
-- head commit's message. No deploy-gate run, no canonical-deploy, no apply-migrations, no push conflict-repair ran for it, so its migration was applied by
-- a manual dispatch. The same mistake is in 6e8c9a40 (#1438, the commit that introduced the gate, 2026-10-18). Of 33 commits by the owner account in three
-- days that carry the token, 31 are the portfolio and charter loops committing straight to main on purpose; those never pass through a pull request.
-- Fix: deploy-gate fails a pull request whose title, description or commit messages contain a skip token (scripts/skip-token-guard.py, SKIP-TOKEN-GUARD-1).
-- The failure mode is registered with a code-read detector on the gate step, so removing the guard shows up as a recurrence.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('skip-token-in-merge-message',
   'a pull request whose title, description or commit messages mention a skip-CI token is squash-merged, and GitHub starts no push workflow for the merge commit',
   'GitHub honours a skip token anywhere in the head commit message, and a squash merge builds that message from the pull request text; a description that only explains how a gate treats the token carries it. No check looked at the text of a pull request',
   'SKIP-TOKEN-GUARD-1: scripts/skip-token-guard.py in deploy-gate fails a pull request that names a token in its title, description or commits (bot status commits never pass through a pull request)',
   'code-read of .github/workflows/deploy-gate.yml for the SKIP-TOKEN-GUARD-1 step',
   'fm-skip-token-in-merge-message', '2026-10-19', NULL,
   'a pull request text names one of the five bracketed skip tokens or the skip-checks trailer, and the pull request is merged',
   'the merge commit has workflow_run follow-ups only: no deploy, no migration apply, no guards; a migration or worker change in it sits unapplied until another push or a manual dispatch',
   'every change in the merge: worker deploys, migrations and the push-time guards are lost for that commit');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-skip-token-in-merge-message', NULL,
  '{"paths": [".github/workflows/deploy-gate.yml"], "contains": "python3 scripts/skip-token-guard.py --base"}',
  'code-read', 3, 1, 'active', 'SKIP-TOKEN-GUARD-1', 'failure-mode detector', 'qnfo-fleet-control');

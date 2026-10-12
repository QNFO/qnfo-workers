-- DEPLOY-LOOP-CONTINUES-1 (2026-10-12, charter pillar core). canonical-deploy run 38255625967 (main c01c60a, five targets) ended at its
-- first target: /ops/deploy for idea-hub read-timed out after 180 s (the deploy itself completed server-side; idea-hub 1.8.5 is live),
-- scripts/canonical_deploy.py exited 3 ("route unavailable, listed for the second deploy path") and, because the step shell is bash -e,
-- the while loop ended there: qnfo-fleet-control, qnfo-gateway, qnfo-pdf and qnfo-research-exec were never attempted and the second
-- deploy path (direct_content_deploy.py) never drained the fallback file. The workflow now captures the exit code without tripping -e.
-- This file registers the failure mode (CI-guarded: the fix is the workflow text; the detector is the status file the run commits) and
-- the belief it retires.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'deploy-loop-aborts-on-first-target'; DELETE FROM belief_registry WHERE belief_key = 'deploy-loop-attempts-every-target'; DELETE FROM remediation_contracts WHERE class = 'belief-deploy-loop-attempts-every-target'

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('deploy-loop-aborts-on-first-target', 'one slow or refused target stops the canonical deploy of every target after it, and the second deploy path never runs',
  'the deploy step runs under bash -e; the loop called canonical_deploy.py and read $? on the next line, so a non-zero exit ended the step instead of being classified',
  'DEPLOY-LOOP-CONTINUES-1 in .github/workflows/canonical-deploy.yml: rc=0; python3 ... || rc=$?, so every target is attempted and the fallback file is drained',
  'ci-status/canonical-deploy.json deploy=failure with targets > 1 while deployment_history shows fewer rows for that head than targets; the workflow text carries DEPLOY-LOOP-CONTINUES-1',
  NULL, '2026-10-12', NULL,
  'a target whose /ops/deploy call times out (180 s) or is refused while others wait behind it',
  'canonical-deploy red after one target; the other workers stay on their old VERSION while main carries the new one (fleet-control 0.19.3, gateway 3.16.1, pdf 1.3.1, research-exec 0.15.1 on 2026-10-12 13:28Z)',
  'every multi-worker merge: the later targets silently stay undeployed until a re-dispatch');

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('deploy-loop-attempts-every-target', 'the canonical deploy attempts every resolved target and hands unreachable ones to the second deploy path', 0.95,
  'falsified by run 38255625967 (2026-10-12 13:25Z): exit 3 on the first target ended the bash -e step, four targets and the fallback never ran; fixed by DEPLOY-LOOP-CONTINUES-1 (rc=0; ... || rc=$?)',
  'belief-deploy-loop-attempts-every-target', '.github/workflows/canonical-deploy.yml');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('belief-deploy-loop-attempts-every-target', NULL, 'main carries DEPLOY-LOOP-CONTINUES-1', 'belief probe (code-read against the checkout of main)',
  '{"paths": [".github/workflows/canonical-deploy.yml"], "contains": "|| rc=$?"}', 'code-read', 3, 'qnfo-fleet-control', 24, 'active', 'belief', 45000, 5, 0);

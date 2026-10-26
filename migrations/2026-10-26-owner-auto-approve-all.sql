-- OWNER-AUTO-APPROVE-ALL-1 (2026-10-26, charter pillar autonomy; owner answer in the session thread: "Yes, auto-approve all").
-- The session that remediated the failing workflows closed its report with two decisions it listed as waiting on the owner, both limits it had left standing because
-- relaxing them is the owner's call: (1) whether the stale-PR lane may merge a pull request that changes .github/ (CLAUDE.md said workflows under .github/ never auto-merge;
-- PR-MERGE-SLA-GROUPS-1 classed such a pull request waits_on 'session', and every one aged past the owner's 10 minutes), (2) whether the approval-gated zero-job runs that a
-- conflict-repair push creates may be approved instead of deleted (the gate is a security control; scripts/conflict_repair.py only deleted them, PHANTOM-RUN-CLEAR-1). The owner
-- answered "Yes, auto-approve all". Both are now the default and both keep a switch that restores the old limit without a deploy of code:
--   1. qnfo-fleet-control 0.50.0: ops_config stale_pr_merge_workflows (default on; off restores the refusal). Every other gate is unchanged: required checks green on the head, clean,
--      quiet window, no hold or WIP, the control-plane canary and revert. The code loop's own merge scope (cmScope) still denies .github/workflows/**: it was not asked.
--   2. scripts/conflict_repair.py: clear_phantom_runs approves a completed action_required zero-job pull_request run of THIS push on THIS repository's own branch (never a fork,
--      a person's run or a dispatched run) and falls back to the deletion when GitHub refuses; CONFLICT_REPAIR_APPROVE=off in the workflow env restores "nothing is approved".
-- This file records the directive for machines (the shape of the earlier directive rows), the lane switch, the control_registry dispositions (a filter and a security gate changed) and the decision.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key IN ('OWNER_DIRECTIVE_2026_10_26_AUTO_APPROVE_ALL_1', 'stale_pr_merge_workflows'); DELETE FROM control_registry WHERE control IN ('stale-pr-workflow-refusal', 'repair-push-run-approval-gate'); DELETE FROM decision_log WHERE action LIKE 'OWNER-AUTO-APPROVE-ALL-1:%'
-- Rollback note: ops_config stale_pr_merge_workflows = off restores the lane refusal and CONFLICT_REPAIR_APPROVE=off restores the deletion, each without a code deploy; the decision row stays as evidence.
-- spof-review: no new cron, trigger, binding, host or credential; two ops_config rows, two control_registry rows and one decision row.

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_10_26_AUTO_APPROVE_ALL_1',
  '{"id":"OWNER-AUTO-APPROVE-ALL-1","directive_verbatim":"Yes, auto-approve all","answers":["may the stale-PR lane merge pull requests that change .github/","may the approval-gated zero-job runs of a conflict-repair push be approved instead of deleted"],"recorded":"2026-10-26","switches":["ops_config stale_pr_merge_workflows","CONFLICT_REPAIR_APPROVE (workflow env)"],"unchanged":["interrupt gate","shared-secrets lock","harness permission checks","code-loop merge scope cmScope denies .github/workflows/**"]}',
  'Owner answer 2026-10-26 to the two items a session had left waiting on the owner (docs/AUTONOMOUS-OPERATION-DOCTRINE.md, standing directive 2026-10-26, auto-approve all).');

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('stale_pr_merge_workflows', 'on',
  'OWNER-AUTO-APPROVE-ALL-1 (qnfo-fleet-control 0.50.0): the stale-PR lane merges a pull request that changes .github/ like any other; off restores the refusal "workflows and repository settings are never merged automatically".');

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('stale-pr-workflow-refusal',
        'qnfo-fleet-control bhMergeDecide (ops_config stale_pr_merge_workflows)',
        'filter',
        'merging an unreviewed change to the repository''s workflows, which run with the repository''s token and secrets and gate every other change',
        1, 'replace', 'applied',
        'the owner decided it: a pull request that changes .github/ merges through the same gates as any other (required checks green on the head, clean, quiet, no hold or WIP, canary and revert for the control plane) and the merge message names the owner decision and the files; ops_config stale_pr_merge_workflows = off restores the refusal and PR-MERGE-SLA-GROUPS-1 then classes the pull request waits_on session again; the code loop''s own merge scope still denies .github/workflows/**',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'qnfo-fleet-control/pr-merge-sla.test.mjs: a ready and a draft pull request that change .github/ merge by default and the merge message carries OWNER-AUTO-APPROVE-ALL-1 and the file, a WIP title and a missing check still hold them, the switch off refuses (branch-hygiene.test.mjs, pr-merge-sla.test.mjs); 2026-10-26 pull request 4328 waited 63 minutes for its session to merge it',
        1000291, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('repair-push-run-approval-gate',
        'scripts/conflict_repair.py clear_phantom_runs (CONFLICT_REPAIR_APPROVE)',
        'gate',
        'GitHub''s approval gate on the pull_request runs of a push made with GITHUB_TOKEN: a run that never starts a job and is concluded failure the second its pull request closes',
        0, 'replace', 'applied',
        'the owner decided it: the gated run of this push on this repository''s own branch is approved so the checks run for real on the repaired head; a fork run, a person''s run, a dispatched run and a run with jobs are never touched; a refused approval falls back to the deletion of PHANTOM-RUN-CLEAR-1; CONFLICT_REPAIR_APPROVE=off restores "nothing is approved"',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'scripts/conflict_repair.py --selftest: approval on approves run 11 only, a refused approval deletes run 12, a fork run, an unknown repository and another sha are deleted not approved, a run with jobs, a person''s run and a dispatched run are untouched; approval off approves nothing; 2026-10-26 56 of 84 failed runs in 24 h were these gated runs',
        1000291, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01LJNL3LGHVnU6qhuvNbAjDw',
  'the owner''s answer "Yes, auto-approve all" to the two decisions a session had listed as waiting on them covers both: the lane merging a .github/ change, and approving a repair push''s gated runs; the code loop''s own scope (cmScope) was not part of the question and stays denied',
  'OWNER-AUTO-APPROVE-ALL-1: qnfo-fleet-control 0.50.0 merges a pull request that changes .github/ through every other gate unchanged (ops_config stale_pr_merge_workflows, default on), and scripts/conflict_repair.py approves the gated zero-job runs of its own push on this repository''s own branch (CONFLICT_REPAIR_APPROVE, default on) with the deletion as the fallback',
  'pull request 4328 (a .github/ change) sat 63 minutes until its session merged it, pr_sla_state waits_on session; branch_hygiene_log refusal "workflows and repository settings are never merged automatically"; 56 of 84 failed workflow runs in 24 h were approval-gated zero-job runs of repair pushes (PHANTOM-RUN-CLEAR-1)',
  'merged through the canonical path with qnfo-fleet-control 0.50.0',
  'a workflow change that passes the same required checks as code merges without a person; a workflow change can run with the repository''s token, so a bad one reaches main after three quiet minutes instead of after a person''s read; the gate (deploy-gate, workflow-lint, mirror-guard) and the canary are the checks, and an approved run executes the pull request branch''s own workflow files',
  'ops_config stale_pr_merge_workflows = off and CONFLICT_REPAIR_APPROVE=off, or the Rollback header',
  'every pull request, workflow changes included, is inside the owner''s 10 minutes; no repair push leaves a failed gated run behind',
  'session_over_10m = 0 and no pull request open past 10 minutes for a .github/ change',
  'the .github/ merge path removes the last class of pull request the lane refused for policy',
  'bhMergeDecide and the tick run offline in branch-hygiene.test.mjs and pr-merge-sla.test.mjs (default on, switch off, holds); clear_phantom_runs runs offline in conflict_repair.py --selftest and scripts/conflict_repair_test.py'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'OWNER-AUTO-APPROVE-ALL-1:%');

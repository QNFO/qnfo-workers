-- COPILOT-LIFECYCLE-LEDGER-1 (2026-10-30, charter pillar autonomy; owner directives 2026-10-30: "ALWAYS ASSIGN GITHUB COPILOT ... TO ALL NEW ISSUES ... NEVER ASSIGN ISSUES TO THE USER",
-- "NEVER LEAVE DRAFT PRS. ALWAYS APPROVE AND MERGE PR CODE CHANGES FOR ISSUES", "THE SYSTEM SHALL ALWAYS REVIEW ITS OWN PRS. THE SYSTEM SHALL NEVER ASSIGN PR REVIEW TO USER",
-- "AUDIT AND REMEDIATE ALL FAILURE MODES AND THEIR ROOT CAUSES"; ANTIFRAGILE-1: every failure mode gets a registry row, a detector and a recorded decision).
-- Evidence (GitHub REST reads, 2026-10-30 08:26Z to 09:20Z; no D1 read was possible from the cloud sandbox, which resolves GitHub hosts only):
--   * 67 draft pull requests written by the Copilot cloud agent were open with changed_files 0; the bodies of #5304, #5305, #5347 and others say the work claim could not be taken
--     (curl: (6) Could not resolve host: qnfo-deploy-guard.q08.workers.dev). The claim endpoint was the only path to every edit.
--   * Timeline of #5363: copilot_work_finished 08:14:09, review_requested rwnq8 08:14:10; assigned rwnq8 at creation. GitHub makes the person who triggered the agent its reviewer and assignee.
--   * 268 workflow runs were action_required (all workflow_run, actor Copilot) and every recent pull_request run by Copilot was a zero-job failure: GitHub holds the agent's runs for a click.
--   * PR 5366 was merged by the lane 4m43s after the last check while Copilot code review, requested by hand, listed two high-severity findings five minutes after the merge decision window.
-- What this file records: five failure modes, four outcome detectors (external-https reads of GitHub's public API, expected 0), one control (the deny list that scopes the approval), one SPOF with its
-- second path, one capability, two decisions, and the doer issue for the failure mode that is not fixed yet (LANE-WAITS-FOR-REVIEW-1).
-- Prediction (7 days): no pull request titled with a work claim after 2026-10-30T12:00Z; no open Copilot pull request with the owner as reviewer or assignee; Copilot pull requests of a finished session
-- have executed checks. Guard: the merge lane's scope is unchanged, so a Copilot pull request that touches a denied path still needs the code loop.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- CONTROL-PROBE: none (the alternate of copilot-pr-approval-deny-paths is a GitHub repository variable and the code loop path; neither is readable from qnfo-audit, so no read-only D1 probe can falsify it)
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-copilot-claim-stall-prs', 'fm-copilot-pr-owner-review', 'fm-copilot-pr-owner-assigned', 'fm-issue-owner-assigned'); DELETE FROM failure_modes WHERE fm_key IN ('cloud-agent-claim-spof', 'copilot-pr-owner-routing', 'copilot-pr-checks-held', 'new-issue-no-copilot', 'lane-merges-before-automated-review'); DELETE FROM control_registry WHERE control = 'copilot-pr-approval-deny-paths'; DELETE FROM spof_registry WHERE component = 'work-claim endpoint (qnfo-deploy-guard /work-lock)'; DELETE FROM capability_ledger WHERE capability = 'copilot-pr-owner-free-lifecycle'
-- Rollback scope: the registry and contract rows only; the decision_log rows stay (append-only) and the agent_issues row is closed by its own evidence, never deleted.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('cloud-agent-claim-spof',
  'A GitHub cloud-agent session cannot take the mandatory work claim, so it ends with a no-change draft pull request and the issue is left unworked',
  'the work claim was the first mandatory step of every edit and had one path, qnfo-deploy-guard.q08.workers.dev; the cloud-agent firewall lets a sandbox resolve GitHub hosts only, so the claim failed with Could not resolve host in about 67 sessions on 2026-10-30',
  'CLAIM-UNREACHABLE-FALLBACK-1 (CLAUDE.md, .github/copilot-instructions.md, the assignment custom_instructions): an unreachable claim endpoint is not a held claim; the session coordinates through GitHub (open pull requests and their files), records the verbatim error in the pull request body and finishes the change; BH-EMPTY-DRAFT-1 closes the empty drafts that remain; an administrator allowlist of the host is an optional third path',
  'fm-copilot-claim-stall-prs: GitHub search for pull requests whose title names a work claim and that were created after 2026-10-30T12:00Z, expected 0',
  'fm-copilot-claim-stall-prs', '2026-10-30', NULL,
  'a Copilot cloud-agent session starts while the claim host is not on the firewall allowlist and the instructions make the claim mandatory with no second path',
  'draft pull request with changed_files 0 whose title or body says the work claim was unavailable',
  'every Copilot cloud-agent session on QNFO/qnfo-workers; 67 empty drafts and no attempt on 40 or more issues on 2026-10-30');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('copilot-pr-owner-routing',
  'The owner is made reviewer and assignee of every Copilot pull request, and assignee of the issue it works',
  'the cloud agent requests review from, and assigns, the user who triggered it (timeline of #5363: copilot_work_finished 08:14:09, review_requested rwnq8 08:14:10); the fleet and its sessions trigger the agent with the owner user token, so 66 open pull requests asked the owner to review',
  'COPILOT-PR-LIFECYCLE-1: scripts/copilot-pr-lifecycle.mjs removes the owner as reviewer, assignee and issue assignee on every Copilot pull request on each pull_request_target event, push to main and remediation-consumer completion; the assignment sweep removes a person that its own call adds to an issue',
  'fm-copilot-pr-owner-review, fm-copilot-pr-owner-assigned and fm-issue-owner-assigned: GitHub search counts of open pull requests that request the owner or are assigned to the owner, and open issues assigned to the owner, expected 0 each',
  'fm-copilot-pr-owner-review', '2026-10-30', NULL,
  'a session or loop triggers the Copilot cloud agent with the owner token',
  'review_requested and assigned events naming the owner on a pull request written by Copilot',
  'the owner queue: every Copilot pull request asked a person to review and approve, against the directive that the system never routes review or approval to the owner');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('copilot-pr-checks-held',
  'The workflow runs of a Copilot pull request wait for a click on Approve and run workflows, so the merge lane never sees a green check and the pull request cannot merge without a person',
  'GitHub holds every run triggered by the Copilot actor for approval by default: 268 runs were action_required and every recent pull_request run by Copilot was a zero-job failure; lane-poke chained off those runs and left 98 more held; no automation approved them',
  'COPILOT-PR-LIFECYCLE-1 approves the held pull_request runs of a finished session when the diff avoids DENY_PATHS (workflows, scripts, build manifests, shell, Docker, yaml); COPILOT_PR_APPROVE=off restores the hold; lane-poke ignores copilot/** branches; deploy-gate already strips the Cloudflare secrets from pull_request events',
  'the lifecycle RESULT_JSON (approved, approval_withheld, errors) in each run summary; a GitHub Actions search for action_required pull_request runs is not a detector because a run is legitimately held while the agent is still working',
  NULL, '2026-10-30', NULL,
  'a Copilot session pushes to its pull request branch',
  'checks stay action_required and the pull request shows no check result',
  'every Copilot pull request: none could merge without a person clicking');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('new-issue-no-copilot',
  'A new issue is not assigned to GitHub Copilot running the Quniverse agent, so nothing starts work on it',
  'nothing assigned Copilot at birth: the steward files issues without assignees, the workflow GITHUB_TOKEN cannot assign Copilot (a user token is required), an issue filed with GITHUB_TOKEN fires no issues event, and no organization-level agent profile existed for the other repositories',
  'ASSIGN-COPILOT-ISSUES-1: .github/workflows/assign-copilot-on-issue.yml runs scripts/assign-copilot-sweep.mjs with QNFO_GH_PAT on issues opened, hourly, and after remediation-consumer; it assigns copilot-swe-agent[bot] with custom_agent quniverse, publishes the profile at QNFO/.github agents/, assigns only issues written by an owner, member, collaborator or github-actions[bot], never one Copilot ever had, at most 25 per run',
  'the sweep RESULT_JSON (assigned, skipped, errors) in each run summary and a GitHub search for open issues without a Copilot assignee',
  NULL, '2026-10-30', NULL,
  'an issue is opened by the steward, a loop or a person',
  'an open issue with no assignee, or one assigned to the owner',
  'every QNFO repository; 5 of 97 open issues in qnfo-workers had no Copilot assignee at 09:00Z');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('lane-merges-before-automated-review',
  'The merge lane merges a pull request on green checks and a quiet window while an automated code review of the same head is still running or has listed high-severity findings',
  'neither bhMergeDecide nor cmDecide reads the review of copilot-pull-request-reviewer[bot], and no workflow requests that review at open (automatic review needs a repository ruleset that the app token cannot write: 403 Resource not accessible by integration); PR 5366 merged at 08:51:03Z, the review with two high-severity findings was submitted at 08:46:20Z',
  'NOT FIXED YET: agent_issues LANE-WAITS-FOR-REVIEW-1 (doer qnfo-fleet-control via qnfo-code-orchestrator): request the review at open, hold the merge for a review that lists high-severity findings, release on a new push, never wait longer than the 10-minute merge SLA for a review that has not arrived; the three findings of PR 5366 are fixed by #5369 and the FinOps digest forward migration',
  'LANE-WAITS-FOR-REVIEW-1 carries the closing probe; until it ships this row is the record',
  NULL, '2026-10-30', NULL,
  'a pull request is green and quiet before the automated review of its head lands',
  'a merged pull request with an unresolved high-severity review comment',
  'every pull request the lane merges: three defects shipped in PR 5366 (an edited applied migration, stale FinOps digest groups, a rollback that deleted a shared mapping)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-copilot-claim-stall-prs', NULL, 'CLAIM-UNREACHABLE-FALLBACK-1 is on main', 'failure-mode detector',
  '{"url": "https://api.github.com/search/issues?q=repo%3AQNFO%2Fqnfo-workers+is%3Apr+in%3Atitle+%22work+claim%22+created%3A%3E%3D2026-10-30T12%3A00%3A00Z&per_page=1", "method": "GET", "check": "json:total_count", "expected": "0"}',
  'external-https', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-copilot-pr-owner-review', NULL, 'COPILOT-PR-LIFECYCLE-1 is on main', 'failure-mode detector',
  '{"url": "https://api.github.com/search/issues?q=repo%3AQNFO%2Fqnfo-workers+is%3Apr+is%3Aopen+review-requested%3Arwnq8&per_page=1", "method": "GET", "check": "json:total_count", "expected": "0"}',
  'external-https', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-copilot-pr-owner-assigned', NULL, 'COPILOT-PR-LIFECYCLE-1 is on main', 'failure-mode detector',
  '{"url": "https://api.github.com/search/issues?q=repo%3AQNFO%2Fqnfo-workers+is%3Apr+is%3Aopen+assignee%3Arwnq8&per_page=1", "method": "GET", "check": "json:total_count", "expected": "0"}',
  'external-https', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-issue-owner-assigned', NULL, 'ASSIGN-COPILOT-ISSUES-1 is on main', 'failure-mode detector',
  '{"url": "https://api.github.com/search/issues?q=repo%3AQNFO%2Fqnfo-workers+is%3Aissue+is%3Aopen+assignee%3Arwnq8&per_page=1", "method": "GET", "check": "json:total_count", "expected": "0"}',
  'external-https', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('copilot-pr-approval-deny-paths',
  'scripts/copilot-pr-lifecycle.mjs DENY_PATHS and the repository variable COPILOT_PR_APPROVE',
  'gate',
  'an agent-written change to a path that CI executes with more than read access (workflows, scripts, build manifests, shell, Docker, yaml) reaching a workflow run that holds a secret',
  0, 'keep', 'applied',
  'COPILOT_PR_APPROVE=off restores the GitHub approval hold for every Copilot pull request; the code loop opens its own pull requests under the fleet identity for a denied path',
  NULL,
  'scripts/copilot-pr-lifecycle.test.mjs: each of the eight deny rules fails the suite when dropped; approval before copilot_work_finished, for a fork run, for a green run or for a person pull request fails it; deploy-gate strips Cloudflare secrets from pull_request events and fleet-graph and model-floor-guard only parse changed files as text',
  NULL);

INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('work-claim endpoint (qnfo-deploy-guard /work-lock)',
  'every file edit and every issue start by a session that follows CLAUDE.md',
  'CLAIM-UNREACHABLE-FALLBACK-1: a GitHub-side overlap check (open pull requests and their files, a copilot/<issue>-<slug> branch, the verbatim error in the pull request body) with conflict repair as the second line',
  NULL,
  'on 2026-10-30 about 67 cloud-agent sessions stopped on curl: (6) Could not resolve host: qnfo-deploy-guard.q08.workers.dev; the fallback is live once CLAUDE.md carries it and the first Copilot pull request after it is non-empty',
  NULL);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('copilot-pr-owner-free-lifecycle',
  'COPILOT-PR-LIFECYCLE-1 (scripts/copilot-pr-lifecycle.mjs, .github/workflows/copilot-pr-lifecycle.yml)',
  'the workflow GITHUB_TOKEN with pull-requests, issues and actions write; the Copilot work events copilot_work_started and copilot_work_finished',
  'idempotent, capped per run, dry mode, kill switch COPILOT_PR_APPROVE; a refusal by GitHub is recorded as said and never retried with another credential',
  '2026-10-30',
  'scripts/copilot-pr-lifecycle.test.mjs: 43 offline checks, including mutation checks of every deny rule; the live effect is read from the first run summary and the fm-copilot-pr-owner-* detectors');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-copilot-lifecycle-1',
  'the GitHub approval hold on a Copilot pull request protects secrets only where the diff can change what CI executes with them; elsewhere it only stops the merge lane, so the system approves that case and leaves the rest held',
  'COPILOT-PR-LIFECYCLE-1: approve the held pull_request runs of a finished Copilot session when the diff avoids DENY_PATHS',
  'GitHub REST 2026-10-30: 268 action_required runs, 19 zero-job pull_request failures by Copilot, deploy-gate step env strips secrets on pull_request, fleet_graph.mjs and model-floor-guard.mjs parse files as text, docs: Approve and run workflows is the default hold',
  'merged with this migration',
  'one workflow, one script, one lane-poke trigger filter; the approval touches only runs of this repository''s own copilot branches',
  'set the repository variable COPILOT_PR_APPROVE to off, or delete .github/workflows/copilot-pr-lifecycle.yml',
  'a finished Copilot session reaches the merge lane with executed checks and no owner click',
  'Copilot pull requests merge without a person; owner review and assignment requests stay at 0',
  'none',
  'github-rest:QNFO/qnfo-workers pulls, issues events, actions runs (reads); scripts/copilot-pr-lifecycle.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COPILOT-PR-LIFECYCLE-1:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-copilot-lifecycle-1',
  'an unreachable coordination service is an environment limit and not a held claim: a session that stops on it produces nothing, so a GitHub-side check replaces it while an acquired:false answer stays binding',
  'CLAIM-UNREACHABLE-FALLBACK-1: cloud-agent sessions continue when the work-claim endpoint cannot be reached',
  'GitHub REST 2026-10-30: bodies of #5304, #5305, #5347 and about 64 more name Could not resolve host; api.github.com and raw.githubusercontent.com resolve from the sandbox, the workers.dev hosts do not',
  'merged with this migration',
  'instruction text only (CLAUDE.md, copilot-instructions.md, AGENTS.md, the agent profile, docs/GITHUB-CLOUD-QUNIVERSE.md)',
  'revert the instruction commit; the firewall allowlist stays an optional administrator action',
  'a cloud-agent session finishes a code change without the claim endpoint',
  'Copilot pull requests opened after the fallback is on main carry a file change; fm-copilot-claim-stall-prs stays at 0',
  'none',
  'github-rest:QNFO/qnfo-workers pulls (bodies, titles), search/issues'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CLAIM-UNREACHABLE-FALLBACK-1:') = 1);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'LANE-WAITS-FOR-REVIEW-1: the merge lane merged PR 5366 while an automated code review of its head was running; no gate reads the review or requests it',
  'Charter pillar: autonomy. Doer: qnfo-fleet-control via qnfo-code-orchestrator. Evidence (GitHub REST 2026-10-30): PR 5366 was merged by qnfo-fleet[bot] at 08:51:03Z; copilot-pull-request-reviewer[bot] submitted its review at 08:46:20Z (requested by hand at 08:41Z) with two high-severity findings (an edited applied migration, stale FinOps digest groups) and one medium; no workflow requests the review at open and the ruleset rule copilot_code_review cannot be written with the app token (403 Resource not accessible by integration). Lever: (1) request the review of every pull request into main when it opens or becomes ready, with the workflow GITHUB_TOKEN first and QNFO_GH_PAT as the documented second path; (2) in bhMergeDecide and cmDecide, when the reviewer bot has a review on the head commit whose body lists a High severity item, hold the merge for that head with a HOLD: comment naming the findings and release it on a new push or a hold released comment; (3) never wait longer than 8 minutes for a review that has not arrived, so the 10-minute merge SLA holds; (4) feed the findings to the code loop repair round as its prompt. Done: a pull request whose head has a high-severity review finding is not merged until a later push, and fm-lane-merges-before-automated-review gets a detector. Closing probe: a regression suite in qnfo-fleet-control that replays PR 5366 (review 5709974064) and refuses the merge.'
  || char(10) || 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js'
  || char(10) || 'code-anchor: function bhMergeDecide(',
  'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'LANE-WAITS-FOR-REVIEW-1:%' AND status = 'open');

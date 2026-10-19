-- CODE-LOOP-CONTROL-PLANE-1 (2026-10-19, charter pillar autonomy; lever T1.23; control_registry control-plane-deny).
-- Owner directive 2026-10-19, verbatim: "The code loop SHALL ALWAYS BE ABLE TO change qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and
-- the loop's own code." qnfo-fleet-control 0.36.0 (CM_LOOP_CANARIED, cmScope, tpOnControlPlane, CM_SCRIPT_DENY) and qnfo-code-orchestrator
-- 0.20.0 (PLAN_LOOP_CANARIED, CM_SCRIPT_DENY) carry the change; this file records it in the registries and adds the detector.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-code-loop-barred-from-control-plane'; DELETE FROM failure_modes WHERE fm_key = 'code-loop-barred-from-control-plane'; UPDATE control_registry SET evidence = replace(evidence, ' | APPLIED 2026-10-19 (CODE-LOOP-CONTROL-PLANE-1)', '') WHERE control = 'control-plane-deny';
-- Rollback scope: the registry rows only; the behaviour is the worker change (revert the two worker.js files, or the canary reverts the push).
-- spof-review: none added. The lifted workers keep the independent rollback: canonical-deploy.yml canaries /health and a functional route and
-- scripts/canary_revert.py reverts the push from GitHub Actions, outside the worker that was changed, and dispatches the deploy of the revert
-- through the workflow that owns the worker (deploy-qnfo-ops.yml, deploy-code-orchestrator.yml, canonical-deploy.yml); CONTROL-PLANE-REVERTED-1 is
-- filed when it fires. The merge runner still merges one change at a time and never while the same worker has a change in flight.

UPDATE control_registry SET
  evidence = evidence || ' | APPLIED 2026-10-19 (CODE-LOOP-CONTROL-PLANE-1): qnfo-fleet-control 0.36.0 and qnfo-code-orchestrator 0.20.0 put qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and qnfo-code-orchestrator on CM_LOOP_CANARIED / PLAN_LOOP_CANARIED (held equal by fold-guard.test.mjs, which requires a /health canary, a FUNCTIONAL check and a canary_revert.py entry for each); the deny stays for qnfo-observability, qnfo-autonomy-scorer and qnfo-containers-pilot.',
  disposition_state = 'applied',
  reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'control-plane-deny' AND evidence NOT LIKE '%APPLIED 2026-10-19 (CODE-LOOP-CONTROL-PLANE-1)%';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('code-loop-barred-from-control-plane',
  'the code loop is barred from qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and its own orchestrator, so every defect in the merge runner, the deploy path or the planner waits for a chat session',
  'CM_LOOP_CANARIED / PLAN_LOOP_CANARIED listed only qnfo-ai and qnfo-gateway (CONTROL-PLANE-FUNCTIONAL-CANARY-1, 2026-10-12) and the decision card that asked to lift it for qnfo-fleet-control (human_actions 115) was closed at birth on its "The deny stays" default (DEFAULT-ADOPTED-1)',
  'owner directive 2026-10-19: both lists carry the four workers (qnfo-fleet-control 0.36.0, qnfo-code-orchestrator 0.20.0); DEFAULT-APPROVE-1 stops a decision card closing on a status-quo default; fold-guard.test.mjs fails CI if a list drops one',
  'qnfo-fleet-control/worker.js and qnfo-code-orchestrator/worker.js on main both contain the six-worker list (a code-read contract: the consumer reads its checkout of main)',
  'fm-code-loop-barred-from-control-plane', '2026-10-19', NULL,
  'a change shortens either list, or a merge conflict resolution keeps the old two-worker line',
  'a code task on one of the four workers is refused at intake ("control-plane worker") or at the merge runner ("never auto-merges") and the issue becomes a session task',
  'every fix to the loop itself, the merge runner and the deploy path');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-code-loop-barred-from-control-plane', NULL, 'CODE-LOOP-CONTROL-PLANE-1', 'failure-mode detector',
  '{"paths":["qnfo-fleet-control/worker.js","qnfo-code-orchestrator/worker.js"],"contains":"[\"qnfo-ai\", \"qnfo-gateway\", \"qnfo-fleet-control\", \"qnfo-ops\", \"qnfo-deploy-guard\", \"qnfo-code-orchestrator\"]"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'session-probe', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'the owner means what they wrote: the code loop may always change qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and the loop''s own code (qnfo-code-orchestrator, scripts/code-task-*); the safety net for those workers is the one already proven for qnfo-ai and qnfo-gateway (functional canary, Actions revert outside the changed worker), and it exists for each of the four (CANARY_WORKERS, FUNCTIONAL, CP_CANARY_WORKERS)',
  'CODE-LOOP-CONTROL-PLANE-1: CM_LOOP_CANARIED and PLAN_LOOP_CANARIED gain qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and qnfo-code-orchestrator; tpOnControlPlane dispatches levers on them; scripts/code-task-* leaves CM_SCRIPT_DENY; the scorer host, the scorer and the container pilot stay denied; tests, CLAUDE.md and the architecture self-model updated; control_registry control-plane-deny applied',
  'repo + qnfo-audit 2026-10-19: scripts/canary_revert.py CANARY_WORKERS and FUNCTIONAL cover all four; 126 canary-functional ok rows over 13 pushes and no control-plane revert 2026-10-12 to 2026-10-19 (human_actions 115); fold-guard.test.mjs 24 passed; code-merge.test.mjs 324 passed; scope-intake 33; transformation 103',
  'merged to main', 'the code loop can open and merge a pull request on four more workers; every merge is followed by the canonical deploy, the /health and functional canary and an automatic revert; one change at a time per worker',
  'revert the two worker.js files (or the canary reverts the push); the Rollback header removes the registry rows; ops_config code_merge_runner_enabled = off stops the runner',
  'the loop repairs its own planner, merge runner and deploy path without waiting for a session',
  'within 24 hours a code task on one of the four workers is planned and merged by the loop with merged_by qnfo-fleet-control; fm-code-loop-barred-from-control-plane reads ok',
  'none', 'offline suites fold-guard, code-merge, scope-intake, merge-scope-at-read, transformation, branch-hygiene; scripts/canary_revert.py tables read'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CODE-LOOP-CONTROL-PLANE-1:') = 1);

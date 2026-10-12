-- SPOF-REVIEW-GATE-1 (2026-10-12, agent_issues 2184, pillar autonomy; doctrine section 12: a new design passes a SPOF review before
-- merge) with WORKERS-STANDARDS-GUARD-2, WORKER-SIZE-CHECK-1 and CONTROL-PLANE-FUNCTIONAL-CANARY-1 (agent_issues 2176).
-- The same pull request adds four controls under scripts/. CLAUDE.md (DOCTRINE-1) asks that every gate and guard is a
-- control_registry row with its disposition, its critical path and its tested alternate, so this file registers them:
--   spof-review-gate          scripts/spof_review.py, called by workers_standards_guard.py on every pull request. Asks a change that
--                             adds a cron, a D1 trigger, an external host or a credential to name its second path. Fails only
--                             pull requests opened on or after 2026-10-13; advisory before that and on a push.
--   workers-standards-guard   scripts/workers_standards_guard.py, deploy-gate step. Changed lines only. Rev 2 adds floating promises,
--                             id assignments from Math.random, loose secret compares, ctx in a handler signature, a queue consumer
--                             without a dead-letter queue, logs and traces, and scripts/workers-standards-allowlist.txt.
--   worker-size-check         scripts/worker_size_check.py. Fails above 90% of the 64 MiB script limit; the largest live script was
--                             1,010,023 bytes (1.5%) on 2026-10-12, so the control is far from its critical path.
--   canary-functional         scripts/canary_revert.py. After the VERSION check, one read-only route per control-plane worker; a
--                             failure on every attempt reverts as a missing VERSION does. CANARY_FUNCTIONAL=observe stops the revert.
-- No worker, cron, table or model call is added. Every statement is idempotent; no compound SELECT.
-- spof-review: each control here rides an existing CI step or deploy run and none is the only check of its kind (the suites, LOOP-WATCH-1 and the metric triggers remain), as the alternate_path column records
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control IN ('spof-review-gate', 'workers-standards-guard', 'worker-size-check', 'canary-functional'); DELETE FROM failure_modes WHERE fm_key = 'one-producer-two-paths'; DELETE FROM remediation_contracts WHERE class = 'fm-one-producer-two-paths'

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('spof-review-gate', 'scripts/spof_review.py (called by scripts/workers_standards_guard.py in deploy-gate)', 'gate',
  'a change that adds a cron, a D1 trigger, an external host or a credential without naming what happens when it fails', 0, 'keep', 'applied',
  'answered by a spof_registry or control_registry row in the same change, or a spof-review line in the pull request text; SPOF_REVIEW=off skips it; a fault inside the gate never fails the change', '2026-10-12T09:00:00Z',
  'scripts/spof-review.test.mjs holds the 2026-10-08 heartbeat case (a second cron row and a trigger on one table from one producer): fails under enforcement, passes once the second path is named. Advisory for pull requests opened before 2026-10-13.', 2184),
 ('workers-standards-guard', 'scripts/workers_standards_guard.py (deploy-gate step WORKERS-STANDARDS-GUARD-1)', 'guard',
  'a change that adds a known Workers anti-pattern: a dropped promise, Math.random ids, a compared secret, passThroughOnException, destructured ctx, a queue consumer without a dead-letter queue, logs or traces off', 0, 'keep', 'applied',
  'a false positive is marked on the line (standards-ok: reason) or in scripts/workers-standards-allowlist.txt; the whole-tree report is scripts/fleet_best_practices_audit.py', '2026-10-12T09:00:00Z',
  'changed lines only. Measured 2026-10-12: main and all 17 open pull request heads pass revision 2; the tree still holds 48 Math.random id lines and 27 secret comparisons as existing debt, none of them blocked.', NULL),
 ('worker-size-check', 'scripts/worker_size_check.py (run by scripts/spof-review.test.mjs in the full suite set)', 'guard',
  'a worker script that approaches the 64 MiB uncompressed size limit, where an upload would be refused', 0, 'keep', 'applied',
  'the upload itself refuses an oversized script; this check only gives the warning earlier', '2026-10-12T09:00:00Z',
  'fails above 90% of the limit. Measured 2026-10-12: 28 live scripts, largest qnfo-research-exec 1,010,023 bytes (1.5% of the limit).', NULL),
 ('canary-functional', 'scripts/canary_revert.py FUNCTIONAL (canonical-deploy.yml and deploy-code-orchestrator.yml canary step)', 'guard',
  'a control-plane deploy whose /health answers the new VERSION while the worker no longer serves its routes', 1, 'keep', 'applied',
  'CANARY_FUNCTIONAL=observe records the failure without reverting and off skips the step; LOOP-WATCH-1 and the metric triggers remain the next line', '2026-10-12T08:30:00Z',
  'one read-only route per control-plane worker, no secret and no model call; all seven answered with their markers on 2026-10-12 08:30Z (python3 scripts/canary_revert.py --functional-only). It proves a read path: inference on qnfo-ai needs the router key the canary does not hold.', 2176);

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('one-producer-two-paths', 'two signals from one producer are counted as two independent paths',
  'on 2026-10-08 the heartbeat was given a second cron row and a trigger on the same table, both written by one worker; nothing asked the change what happens when that worker stops',
  'SPOF-REVIEW-GATE-1 (scripts/spof_review.py) asks every pull request that adds a cron, a D1 trigger, an external host or a credential to name its second path in a spof_registry or control_registry row or a spof-review line',
  'control_registry row spof-review-gate present and applied', 'fm-one-producer-two-paths', '2026-10-08', 2184,
  'a pull request adds a dependency and no row or line names its alternate', 'a stalled producer silences every signal that was meant to watch it', 'every loop that reads the heartbeat');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-one-producer-two-paths', NULL, 'SPOF-REVIEW-GATE-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM control_registry WHERE control = ''spof-review-gate'' AND disposition_state = ''applied'') THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

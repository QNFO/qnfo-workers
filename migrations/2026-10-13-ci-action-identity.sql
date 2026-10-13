-- CI-ACTION-IDENTITY-1 + WRITE-SUCCESS-CODES-1 (2026-10-13, pillar autonomy; owner: "audit and remediate this type of failure mode and its
-- root causes systemwide across the fleet"). ci-watchdog #1033 ("unknown: cf-ops-actions", run 38258885817) carried two root causes:
-- 1. write-200-only: gen-activitypub-key PUT both Worker secrets, Cloudflare answered 201 Created for each, and the action counted only 200
--    as success, so a completed write was reported ok=false (fixed for that action by PR 1031). The audit found the same 200-only check after
--    a POST/PUT/PATCH in 16 places across 8 scripts, among them issue_owner_client_keys.py, whose first new key would have been recorded
--    put-failed while the worker held it. All now accept any 2xx, and workers_standards_guard.py rule write-200-only fails a change that adds one.
-- 2. watchdog-action-blind: cf-ops-actions, owner-client-keys and fleet-autodeploy run a different action per dispatch, but the watchdog filed
--    and the resolver closed by workflow name: the finding named no action, said "inspect the job log", and a green run of any other action
--    superseded or closed it. The workflows now carry a run-name naming the action; findings, supersede and close are per action, and the
--    action's RESULT_JSON (error, HTTP codes, next_step) is the finding's fix line. Suite scripts/ci_watchdog_action_test.py in deploy-gate.
-- Detectors are code-read contracts on main: each fails if its fix is removed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-write-200-only', 'fm-watchdog-action-blind'); DELETE FROM failure_modes WHERE fm_key IN ('write-200-only', 'watchdog-action-blind')

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('write-200-only', 'a completed write is reported as failed', 'the success test after a POST/PUT/PATCH accepts only HTTP 200, while the API answers 201 Created (Cloudflare Worker secret create) or 204', 'any 2xx is success (200 <= status < 300, or r.ok); workers_standards_guard.py rule write-200-only fails a change that adds a 200-only check after a write in worker.js or scripts/*.py', 'code-read: scripts/workers_standards_guard.py contains the write-200-only rule', 'fm-write-200-only', '2026-10-12', NULL, 'a write creates a resource (first secret, new record) and the API answers 201', 'RESULT_JSON ok=false with put_http [201, ...] and the resource present; a ledger row marked put-failed for a key the worker holds', 'every allowlisted action and key script: secret creation, owner client keys, D1 and zone writes'),
 ('watchdog-action-blind', 'a failed action of a multi-action workflow is filed without its action and closed by an unrelated green run', 'ci_watchdog.py and ci_watchdog_resolve.py keyed findings by workflow name; cf-ops-actions, owner-client-keys and fleet-autodeploy dispatch a different action per run', 'run-name names the action; findings, supersede and close are per action; the RESULT_JSON line is the fix line (scripts/ci_watchdog_action_test.py)', 'code-read: scripts/ci_watchdog.py contains def action_key(', 'fm-watchdog-action-blind', '2026-10-12', NULL, 'a dispatched action fails while other actions of the same workflow succeed', 'an "unknown: <workflow>" finding with "inspect the job log", closed or superseded by a different action''s green run', 'every action of cf-ops-actions (deletes, secret writes, scrubs), owner-client-keys and fleet-autodeploy');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-write-200-only', NULL, 'WRITE-SUCCESS-CODES-1', 'failure-mode detector', '{"paths": ["scripts/workers_standards_guard.py"], "contains": "write-200-only"}', 'code-read', 3, 'qnfo-ops', 24, 'holding', 'failure-mode', 45000, 5, 0),
 ('fm-watchdog-action-blind', NULL, 'CI-ACTION-IDENTITY-1', 'failure-mode detector', '{"paths": ["scripts/ci_watchdog.py"], "contains": "def action_key("}', 'code-read', 3, 'qnfo-ops', 24, 'holding', 'failure-mode', 45000, 5, 0);

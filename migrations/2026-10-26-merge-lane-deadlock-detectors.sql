-- MERGE-DEPLOYED-UNBLOCK-1 / AUDIT-CRASH-FIX-1 (2026-10-26, pillar autonomy; owner directive 2026-10-26: "PERMANENTLY REMEDIATE ALL FAILING
-- GITHUB WORKFLOWS ... WHY AREN'T FLEET PRS BEING MERGED IMMEDIATELY. AUDIT AND REMEDIATE ROOT CAUSES").
-- Measured 2026-10-26 06:00Z. Five green qnfo-research-exec pull requests (4275, 4276, 4277, 4282, 4283) had been green for up to 40
-- minutes and the merge runner deferred each one ("merge deferred (qnfo-research-exec has a change in flight)"; last tick merges 0).
-- Chain: PR 4201 (UNMANAGED-PROBE-1, code loop, merged 2026-10-25T20:21Z) put `for entry in d.get("cf_script_list", [])` into
-- scripts/fleet-autoaudit.py main(), but the drift guard emits cf_script_list as a BOOLEAN -> `TypeError: 'bool' object is not iterable`
-- in all 27 fleet-autodeploy runs since -> worker_live_audit frozen at 2026-10-25 21:03Z (122 rows) -> four runner merges
-- (qnfo-research-exec 4219, qnfo-ai 4230, qnfo-gateway 4236, qnfo-deploy-guard 4245) stayed merge_state 'deployed' ("waiting on a live
-- audit after deploy") -> code_tasks in 'deployed' count as in flight -> every other green pull request on the same worker waited behind
-- them until the 120-minute close (the codeagent-*-r2/-r3 retries). Fixed in code: scripts/fleet-autoaudit.py (type-safe reads, the guard
-- is now the producer of unmanaged_workers), qnfo-fleet-control 0.48.0 (a deployed task holds its worker 5 minutes and becomes
-- 'unverifiable' after 30 without an audit row), and the audit selftests now run in deploy-gate on every pull request. This file records
-- the three failure modes and their detectors, so a recurrence is a finding within the hour, not nine hours of silence.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-audit-frozen', 'fm-merge-worker-held', 'fm-green-pr-unmerged'); DELETE FROM failure_modes WHERE fm_key IN ('audit-frozen', 'merge-worker-held', 'green-pr-unmerged'); DELETE FROM decision_log WHERE action LIKE 'MERGE-DEPLOYED-UNBLOCK-1%'
-- BACKUP: failure_modes

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('audit-frozen', 'worker_live_audit stops being written and everything that reads "a probe after the deploy" waits forever',
  'fleet-autodeploy is the only writer of worker_live_audit; a crash in scripts/fleet-autoaudit.py (PR 4201: the guard emits cf_script_list as a boolean, the audit iterated it) failed every run before the first D1 write, and no PR check exercised the audit, so the three code-loop pull requests that changed it merged green',
  'AUDIT-CRASH-FIX-1: the audit reads every guard key through a type-safe accessor, the guard produces unmanaged_workers, and deploy-gate runs the audit and guard selftests (with the guard real-output fixture) on every pull request',
  'the newest worker_live_audit row is under 120 minutes old', 'fm-audit-frozen', '2026-10-25', NULL,
  'a change to the audit or the guard that no pull request check executes against the producer''s real output', 'fleet-autodeploy red on every run; worker_live_audit.probed_at older than 2 hours', 'live verification of every merge stops: runner merges stay deployed, drift and charter MVP checks read stale rows'),
 ('merge-worker-held', 'a runner merge in merge_state deployed holds its worker busy and defers every other green pull request on it',
  'cmAdvance kept a deployed task in "waiting on a live audit after deploy" with no bound, and codeMergeTick counted deployed as in flight, so one missing audit row blocked a worker for as long as the audit was missing',
  'MERGE-DEPLOYED-UNBLOCK-1 (qnfo-fleet-control 0.48.0): a deployed task holds its worker 5 minutes and becomes unverifiable (an error event, never a revert on a missing probe) after 30 minutes without an audit row',
  'no runner merge has been deployed for over 60 minutes', 'fm-merge-worker-held', '2026-10-26', NULL,
  'a missing or stale live audit after a runner merge', 'qnfo-fleet-control /code-merge/status shows "green; merge deferred (<worker> has a change in flight)" for tasks that stay green', 'every code-loop pull request on the same worker waits until it ages out and is retried'),
 ('green-pr-unmerged', 'a codeagent pull request is green and the merge runner has not merged it for an hour',
  'a gate in cmHandle (a worker in flight, the per-tick merge limit, a pending review) defers a green pull request and nothing measured how long a green pull request waited, so the deferral looked like normal queueing',
  'the deferral message names the task that holds the worker; this detector reads green_since, which cmHandle sets when a pull request first reads green',
  'no published or pr_open code task has been green for over 60 minutes', 'fm-green-pr-unmerged', '2026-10-26', NULL,
  'a green pull request deferred across several 10-minute ticks', 'code_tasks.green_since older than an hour on a task that is still published or pr_open', 'verified fixes sit unmerged, then conflict with main and are re-proposed (the -r2 and -r3 branches)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-audit-frozen', NULL, 'MERGE-DEPLOYED-UNBLOCK-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT MAX(probed_at) FROM worker_live_audit) > datetime(''now'', ''-120 minutes'') THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-merge-worker-held', NULL, 'MERGE-DEPLOYED-UNBLOCK-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE merged_by = ''qnfo-fleet-control'' AND merge_state = ''deployed'' AND replace(replace(COALESCE(deployed_at, merged_at), ''T'', '' ''), ''Z'', '''') < datetime(''now'', ''-60 minutes'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-green-pr-unmerged', NULL, 'MERGE-DEPLOYED-UNBLOCK-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status IN (''published'', ''pr_open'') AND green_since IS NOT NULL AND replace(replace(green_since, ''T'', '' ''), ''Z'', '''') < datetime(''now'', ''-60 minutes'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01LJNL3LGHVnU6qhuvNbAjDw', 'a green pull request is merged within one 10-minute tick unless a gate names a reason that ends', 'MERGE-DEPLOYED-UNBLOCK-1: the audit crash fixed at its producer and consumer, the runner deploy hold bounded, the audit selftests moved into the pull request gate', 'fleet-autodeploy 27 of 43 runs failed and 16 cancelled in 24 h (TypeError: bool object is not iterable, fleet-autoaudit.py:740); worker_live_audit newest probed_at 2026-10-25 21:03:18; code_tasks ct_im100615, ct_af5mjv5uz6ocqe, ct_99vk5bzw87tbz7, ct_0r1itdng2nj0cj in deployed since 21:21, 22:50, 23:40 and 01:01; /code-merge/status: five research-exec pull requests green_since 05:20Z to 06:00Z, merges 0', 'the audit writes worker_live_audit on every main push, runner merges verify within a tick, a deployed task never holds a worker more than 5 minutes', 'scripts/fleet-autoaudit.py, scripts/deploy-drift-guard.py, qnfo-fleet-control merge runner, deploy-gate.yml', 'the Rollback line and a revert of the pull request', 'the fleet audits unmanaged workers, and a merged change to the audit is executed against the guard real output before it lands', 'worker_live_audit newest probed_at under 120 minutes old and no code task deployed over 60 minutes within 2 h of the merge; fm-audit-frozen, fm-merge-worker-held and fm-green-pr-unmerged observe their expected values', NULL, 'GitHub Actions run logs, D1 code_tasks and worker_live_audit, qnfo-fleet-control /code-merge/status, Cloudflare script list, live /health probes'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'MERGE-DEPLOYED-UNBLOCK-1%');

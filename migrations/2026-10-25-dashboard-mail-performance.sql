-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-dashboard-mail-serial-reads'; DELETE FROM failure_modes WHERE fm_key = 'dashboard-mail-serial-reads'; DELETE FROM session_records WHERE session_id = '45a89c7a-bf9c-4dbe-8654-2a763b6ee5fa';
-- DASHBOARD-MAIL-PARALLEL-1 (pillar core): overlap independent inbox enrichment reads without widening either query.

INSERT OR IGNORE INTO failure_modes (
  fm_key, failure_mode, root_cause, remediation, detector, probe_class,
  first_seen, trigger_condition, symptom, blast_radius
) VALUES (
  'dashboard-mail-serial-reads',
  'Dashboard pending-mail facts unnecessarily wait for two independent D1 reads in sequence',
  'mailFacts awaited header hydration before starting its unrelated inbound-SLA category read',
  'Start both bounded reads together with Promise.all; retain partial enrichment on either failure and cover overlap, output order and query bounds with deferred-promise regression tests',
  'Hourly code-read contract plus qnfo-fleet-dashboard/mail-facts-performance.test.mjs in the automatic suite runner',
  'fm-dashboard-mail-serial-reads', '2026-10-25',
  'Pending messages need both stored headers and inbound-SLA categories',
  'Enrichment latency includes both D1 waits instead of overlapping them; no production latency reduction has been measured',
  'Dashboard action-feed requests containing pending mail; no schema, binding, route, cache TTL or privacy change'
);

INSERT OR IGNORE INTO remediation_contracts (
  class, issue_id, precondition, action, verify_probe, verify_transport,
  max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at
) VALUES (
  'fm-dashboard-mail-serial-reads', NULL,
  'DASHBOARD-MAIL-PARALLEL-1 is merged',
  'Keep mailFacts lookups independent and bounded; on regression run mail-facts-performance.test.mjs and restore overlap without removing partial-failure behavior',
  '{"paths":["qnfo-fleet-dashboard/worker.js","qnfo-fleet-dashboard/deployed-current.worker.js"],"contains":"const [extraRows, slaRows] = await Promise.all(["}',
  'code-read', 3, 'qnfo-fleet-dashboard', 1, 'active', 'failure-mode',
  datetime('now', '+60 minutes')
);

INSERT INTO decision_log (
  actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
  capability_gain, predicted_outcome, reach_gain, surfaces_tested
)
SELECT
  'session_45a89c7a-bf9c-4dbe-8654-2a763b6ee5fa',
  'Header hydration and inbound-SLA category lookup both depend only on the input rows, not on each other',
  'DASHBOARD-MAIL-PARALLEL-1: overlap the two existing bounded reads instead of adding a cache, index or dependency',
  'Deferred-promise regression proves both queries start before either resolves and preserves output order, latest category precedence, 100-ID bounds, empty inputs and independent failures; existing owner-surface and mirror suites pass',
  'Local behavior verified; production latency improvement is not measured',
  'qnfo-fleet-dashboard mailFacts and identical deployed-current mirror only',
  'Revert the worker patch and mirror through the canonical deploy workflow',
  'none; latency optimization of an existing capability',
  'Both D1 requests are issued without an application-level dependency; elapsed time still depends on D1 scheduling',
  'none',
  'Source inspection; deterministic offline concurrency and fallback cases; existing owner-surface privacy and rendering coverage'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log WHERE instr(action, 'DASHBOARD-MAIL-PARALLEL-1:') = 1
);

INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  handoff_notes, execution_ratio, total_tasks, completed_tasks,
  started_at, completed_at
)
SELECT
  '45a89c7a-bf9c-4dbe-8654-2a763b6ee5fa', 'core/performance', 'GitHub Copilot',
  'Audited dashboard polling, query hotspots and retained imports; implemented overlapping inbox enrichment queries with deterministic concurrency and fallback coverage',
  'Kept existing revision-based DOM updates, cache TTL, query bounds and private-data handling unchanged; coordinated source claims with independent dashboard fixes',
  'qnfo-fleet-dashboard/worker.js, qnfo-fleet-dashboard/deployed-current.worker.js, qnfo-fleet-dashboard/mail-facts-performance.test.mjs, migrations/2026-10-25-dashboard-mail-performance.sql',
  'Canonical merge/deploy owns delivery; verify the deployed dashboard health version and successful canonical workflow before reporting deployment. No measured production latency claim.',
  0.666667, 3, 2, '2026-10-25T17:32:09Z', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM session_records WHERE session_id = '45a89c7a-bf9c-4dbe-8654-2a763b6ee5fa'
);

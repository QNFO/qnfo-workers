-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-agent-route-normalization-auth-bypass'; DELETE FROM failure_modes WHERE fm_key = 'agent-route-normalization-auth-bypass';
-- AGENT-ROUTE-AUTH-NORMALIZATION-1 (2026-10-25, charter pillar: security): the Agents SDK strips empty path segments before routing, so a repeated-slash path reached an authenticated agent while the pre-router auth check saw no `/agents/` prefix. Normalize the path for the auth decision and keep a code-read detector on that invariant. The decision log is append-only and remains on rollback.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('agent-route-normalization-auth-bypass',
   'a repeated-slash Agents SDK URL bypasses the route authentication check and reaches an agent',
   'the auth check matched the raw pathname prefix while the SDK router removes empty path segments before matching agent routes',
   'AGENT-ROUTE-AUTH-NORMALIZATION-1: normalize path segments before deciding whether an agent route requires authentication; qnfo-agent-ws/worker.test.mjs guards repeated-slash variants',
   'code-read of qnfo-agent-ws/worker.js for normalizedPath used by the authentication decision',
   'fm-agent-route-normalization-auth-bypass', '2026-10-25', NULL,
   'an unauthenticated GET or WebSocket request uses repeated slashes before or within the /agents/ route prefix',
   'the router normalizes the path and forwards it to an agent without the SYNC_TOKEN check',
   'all QnfoAgent instances reachable through qnfo-agent-ws, including their configured tools and bound data');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
  ('fm-agent-route-normalization-auth-bypass', NULL,
   '{"paths":["qnfo-agent-ws/worker.js"],"contains":"const normalizedPath = \"/\" + path.split(\"/\").filter(Boolean).join(\"/\");"}',
   'code-read', 3, 1, 'active', 'AGENT-ROUTE-AUTH-NORMALIZATION-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_d8db78a0-537a-4635-b7e4-a8450a38b0b7',
  'the SDK router normalizes repeated slashes before resolving agent routes; the auth gate must classify those paths the same way',
  'AGENT-ROUTE-AUTH-NORMALIZATION-1: normalize pathname segments before applying the /agents/ authentication requirement and add repeated-slash regression coverage',
  'security review found //agents//qnfo-agent/<instance> bypassed path.startsWith("/agents/") while the SDK router filtered empty path segments; qnfo-agent-ws/worker.test.mjs tests slash variants',
  'local regression suite and Wrangler dry-run passed; deployment remains subject to the retired-worker and fleet-cap constraints',
  'qnfo-agent-ws authenticated agent routes; no new route or binding',
  'revert the path normalization and its regression test; remove this failure-mode row and contract through a new migration if the remediation is later intentionally replaced',
  'preserves the existing authenticated-agent capability across path normalization variants',
  'all repeated-slash variants of /agents/ are subject to the same authentication gate as canonical paths',
  'none',
  'offline qnfo-agent-ws/worker.test.mjs and repository route syntax checks'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'AGENT-ROUTE-AUTH-NORMALIZATION-1:%');

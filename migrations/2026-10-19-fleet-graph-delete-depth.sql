-- FLEET-GRAPH-DELETE-DEPTH-1 (2026-10-19, pillar core; ci-watchdog fleet-graph, GitHub issue 2849). scripts/fleet_graph.mjs
-- wrote the graph diff with DELETE ... WHERE (k1) OR (k2) OR ... of up to 400 terms. SQLite parses an OR chain as a tree as deep
-- as its terms and D1 refuses depth over 100 ("Expression tree is too large (maximum depth 100)"), so the first push that removed
-- more than ~99 edges (760a20a, CRON-GRID-1 renamed fifteen scheduled handlers) failed fleet-graph on every push to main after it,
-- and the graph went stale. fleet_graph.mjs 1.0.1 caps a DELETE at 80 terms (checked live on D1 with an 80-term triple-AND chain)
-- and its selftest asserts it. This file records the failure mode and its detector: the code scope of the graph is rebuilt
-- within 240 minutes (pushes rebuild it; FLEET-GRAPH-CADENCE-1 rebuilds a quiet main).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-fleet-graph-delete-depth'; DELETE FROM failure_modes WHERE fm_key = 'fleet-graph-delete-depth'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES ('fleet-graph-delete-depth', 'the fleet graph write fails on a push that removes many edges, and keeps failing on every later push',
  'deleteStatements joined up to 400 key conditions with OR in one DELETE; D1 refuses an expression tree deeper than 100',
  'fleet_graph.mjs 1.0.1 (FLEET-GRAPH-DELETE-DEPTH-1): at most 80 OR terms per DELETE, asserted by the selftest',
  'the code scope of the graph was rebuilt within 240 minutes', 'fm-fleet-graph-delete-depth', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'a fleet-graph run whose diff deletes more than 99 nodes or edges', 'fleet-graph fails with "Expression tree is too large"; /fleet-graph/freshness ages',
  'every blast-radius lookup (FLEET-GRAPH-1) and the graph findings metric');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-fleet-graph-delete-depth', NULL, 'FLEET-GRAPH-DELETE-DEPTH-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fg_state WHERE scope = ''code'' AND built_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-240 minutes'')) AS TEXT) AS observed',
  'd1-query@qnfo-graph', 3, 'qnfo-cloud-ops', 1, 'active', 'failure-mode', datetime('now'));

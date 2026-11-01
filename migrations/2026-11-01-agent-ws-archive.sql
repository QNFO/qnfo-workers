-- RM-AGENT-WS-DECISION-1: retain the absent agent websocket worker as archived source.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_agent_ws_archive
-- Rollback: UPDATE roadmap_implementation SET status = (SELECT status FROM bak_20261101_agent_ws_archive WHERE id = 121), evidence = (SELECT evidence FROM bak_20261101_agent_ws_archive WHERE id = 121), verified_at = (SELECT verified_at FROM bak_20261101_agent_ws_archive WHERE id = 121) WHERE id = 121 AND EXISTS (SELECT 1 FROM bak_20261101_agent_ws_archive WHERE id = 121)

CREATE TABLE IF NOT EXISTS bak_20261101_agent_ws_archive AS
SELECT id, status, evidence, verified_at
FROM roadmap_implementation
WHERE id = 121 AND item = 'RM-AGENT-WS-DECISION-1';

UPDATE roadmap_implementation
SET status = 'verified',
    verified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    evidence = 'Archived under qnfo-agent-ws/RETIRED. Live reads on 2026-11-01: Cloudflare Workers script search returned no qnfo-agent-ws script; qnfo-audit.service_registry had no qnfo-agent-ws row; metric_registry.worker_count was 39 against the hard cap of 30 (refreshed 2026-11-01T11:02:34.796Z). The source is retained, canonical deploy remains blocked by RETIRED, and active health-monitor inventories no longer list the worker. Regression coverage: qnfo-agent-ws/archive.test.mjs and migrations/agent-ws-archive.test.mjs.'
WHERE id = 121
  AND item = 'RM-AGENT-WS-DECISION-1'
  AND source = 'master backlog v2 s2.5'
  AND status = 'owner-decision';

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'coding-agent (RM-AGENT-WS-DECISION-1)',
  'The worker has no live application consumer, is absent from the live fleet, and the fleet is over its worker cap; archiving is preferable to reactivation.',
  'Keep qnfo-agent-ws absent and archived; remove its stale monitoring entries while retaining its source and reactivation prerequisites.',
  'Cloudflare Workers script search returned no script; qnfo-audit.service_registry had no row; worker_count was 39 against a cap of 30. The open AGENT-WS-REACTIVATION-1 control remains the requirement for any future consumer-backed reactivation.',
  'verified: archived',
  'qnfo-agent-ws source marker and bundle; qnfo-observability fallback inventory; fleet health-probe snapshot; RM-121 roadmap row',
  'Restore the roadmap row from bak_20261101_agent_ws_archive and revert this commit; any reactivation still requires a consumer and capacity.',
  'Avoids false missing-worker monitoring and accidental resurrection without adding a live worker or spend.',
  'The worker remains absent, its source remains available for audit, and active monitoring no longer treats it as deployed.',
  'No reach increase is claimed; this removes stale monitoring state and preserves the charter worker-cap constraint.',
  'Cloudflare Workers script search; qnfo-audit service_registry and worker_count; archive inventory regression tests'
WHERE EXISTS (
  SELECT 1 FROM roadmap_implementation
  WHERE id = 121
    AND item = 'RM-AGENT-WS-DECISION-1'
    AND source = 'master backlog v2 s2.5'
    AND status = 'verified'
)
AND NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'Keep qnfo-agent-ws absent and archived; remove its stale monitoring entries while retaining its source and reactivation prerequisites.'
);

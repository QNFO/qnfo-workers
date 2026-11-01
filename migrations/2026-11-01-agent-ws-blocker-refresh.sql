-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_agent_ws_blocker_refresh
-- Rollback: UPDATE agent_issues SET description = replace(description, char(10) || char(10) || (SELECT note FROM bak_20261101_agent_ws_blocker_refresh WHERE kind = 'issue'), '') WHERE id = 1000140 AND EXISTS (SELECT 1 FROM bak_20261101_agent_ws_blocker_refresh WHERE kind = 'issue'); UPDATE control_registry SET evidence = replace(evidence, char(10) || (SELECT note FROM bak_20261101_agent_ws_blocker_refresh WHERE kind = 'control'), ''), reviewed_at = (SELECT control_reviewed_at FROM bak_20261101_agent_ws_blocker_refresh WHERE kind = 'control') WHERE control = 'agent-ws-reactivation-prerequisites' AND EXISTS (SELECT 1 FROM bak_20261101_agent_ws_blocker_refresh WHERE kind = 'control');
-- AGENT-WS-REACTIVATION-1: refresh the measured blocker in the authoritative issue and its keep-control record.

CREATE TABLE IF NOT EXISTS bak_20261101_agent_ws_blocker_refresh AS
SELECT 'issue' AS kind, id AS issue_id, description AS issue_description, updated_at AS issue_updated_at,
       NULL AS control, NULL AS control_evidence, NULL AS control_reviewed_at,
       'AGENT-WS-REACTIVATION-BLOCKER-1 (live recheck 2026-11-01): Cloudflare Workers API enumeration returned 39 scripts; qnfo-audit.metric_registry.worker_count was 39 (last refreshed 2026-11-01T20:03:20.575Z; hard cap 30). The qnfo-graph live snapshot built at 2026-11-01T20:52:34.421Z reported 39 workers, and direct graph node/edge queries for worker:qnfo-agent-ws returned no rows. qnfo-audit.service_registry has no qnfo-agent-ws row or consumer dependency. The separate live qnfo-agents Agents SDK service depends on qnfo-ops, not qnfo-agent-ws. No dependency-safe same-class retirement was evidenced. Keep RETIRED and keep qnfo-agent-ws out of deploy-targets.txt. No deployment or live-health success is claimed; reactivation requires a consumer, safe retirement, and worker_count at or below 30.' AS note
FROM agent_issues
WHERE id = 1000140 AND status = 'open'
UNION ALL
SELECT 'control', NULL, NULL, NULL, control, evidence, reviewed_at,
       'AGENT-WS-REACTIVATION-BLOCKER-1 (live recheck 2026-11-01): 39 Workers against the hard cap of 30; no qnfo-agent-ws graph node, edge, registered service, or consumer dependency; no dependency-safe same-class retirement evidenced. Keep the existing retirement hold applied.' AS note
FROM control_registry
WHERE control = 'agent-ws-reactivation-prerequisites'
  AND disposition = 'keep'
  AND disposition_state = 'applied';

UPDATE control_registry
SET evidence = evidence || char(10) || (
      SELECT note FROM bak_20261101_agent_ws_blocker_refresh WHERE kind = 'control'
    ),
    reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'agent-ws-reactivation-prerequisites'
  AND disposition = 'keep'
  AND disposition_state = 'applied'
  AND instr(evidence, 'AGENT-WS-REACTIVATION-BLOCKER-1') = 0
  AND EXISTS (
    SELECT 1 FROM agent_issues WHERE id = 1000140 AND status = 'open'
  );

UPDATE agent_issues
SET description = description || char(10) || char(10) || (
      SELECT note FROM bak_20261101_agent_ws_blocker_refresh WHERE kind = 'issue'
    ),
    updated_at = strftime('%s', 'now') * 1000
WHERE id = 1000140
  AND status = 'open'
  AND instr(description, 'AGENT-WS-REACTIVATION-BLOCKER-1') = 0
  AND EXISTS (
    SELECT 1 FROM control_registry
    WHERE control = 'agent-ws-reactivation-prerequisites'
      AND disposition = 'keep'
      AND disposition_state = 'applied'
      AND instr(evidence, 'AGENT-WS-REACTIVATION-BLOCKER-1') > 0
  );

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
   predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'Copilot PR 6070',
  'The fresh census and topology evidence still fail the prerequisites for activating qnfo-agent-ws.',
  'AGENT-WS-REACTIVATION-1: refresh the measured blocker, keep the worker retired, and preserve the canonical deployment exclusion.',
  'Cloudflare API lists 39 scripts; worker_count is 39 against cap 30; the fresh live graph has no qnfo-agent-ws node or edges; service_registry has no consumer; no safe same-class retirement was evidenced.',
  'Issue 1000140 remains open with current blocker evidence; control disposition remains keep/applied; no Worker deployment is made.',
  'qnfo-audit.agent_issues 1000140 and control_registry agent-ws-reactivation-prerequisites; no runtime resource changes.',
  'Rollback removes only the appended blocker notes and restores the prior control review timestamp; decision_log remains append-only.',
  'current-evidence-for-agent-ws-reactivation-gate',
  'worker_count remains 39 and qnfo-agent-ws remains absent until consumer, safe same-class retirement, and capacity evidence pass.',
  'No reach increase is claimed.',
  'Cloudflare Workers script list; metric_registry.worker_count; qnfo-graph fg_state, fg_node and fg_edge; service_registry; control_registry and control_alternate_probes'
WHERE EXISTS (
  SELECT 1 FROM agent_issues
  WHERE id = 1000140 AND status = 'open'
    AND instr(description, 'AGENT-WS-REACTIVATION-BLOCKER-1') > 0
)
AND NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'AGENT-WS-REACTIVATION-1: refresh the measured blocker, keep the worker retired, and preserve the canonical deployment exclusion.'
);

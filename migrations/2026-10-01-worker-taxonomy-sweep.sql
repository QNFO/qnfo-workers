-- REGISTER-TAXONOMY-SWEEP-1 (#1623, 2026-10-01): the taxonomy sweep declared in docs/REGISTER-EXECUTION-ARCHITECTURE.md
-- ("full sweep = next phase, owner=agent"), executed. Every live worker (41 scripts, Cloudflare workers list 2026-10-01)
-- is classified, and its consumer evidence and disposition are recorded on its output contract.
-- The classes are:
--   executor         owns a queue or state and closes rows
--   detector         cron -> digest / alert / event
--   display/gateway  serves data, UI or compute to callers
--   self-serving     no downstream consumer
--   retired          contract kept, script not deployed
-- Consumer evidence comes from four sources: live workers that bind the worker as a service, live workers that call its
-- URL, a public route or MCP client, and live workers that read the tables it writes. Every live worker has at least
-- one consumer, so the self-serving set is empty. The two workers with no in-fleet consumer, qnfo-tools-mcp and
-- qnfo-ipatent, are kept on external-consumer evidence; their dispositions say so. Applied live.
ALTER TABLE worker_output_contracts ADD COLUMN worker_class TEXT;
ALTER TABLE worker_output_contracts ADD COLUMN class_disposition TEXT;

-- qnfo-signal-loop (created 2026-10-01 07:25Z, #1654) had no contract. It is the L8 re-entry consumer.
INSERT OR IGNORE INTO worker_output_contracts (worker, workflow, output, verify, state, updated_at, output_sql) VALUES
  ('qnfo-signal-loop', 'L8 re-entry: published DOIs -> artifact_reentry signals -> open questions -> idea_proposals (0 * * * *)',
   'signals rows source=artifact_reentry + idea_proposals rows ip_hash=l8-reentry',
   'SELECT MAX(created_at) FROM signals WHERE source=''artifact_reentry''', 'ACTIVE', datetime('now'),
   'SELECT (SELECT COUNT(*) FROM signals WHERE source=''artifact_reentry'' AND created_at >= :since_iso) + (SELECT COUNT(*) FROM idea_proposals WHERE ip_hash=''l8-reentry'' AND created_at >= :since_iso) AS n');
-- idea-hub's probe excludes the re-entry proposals that qnfo-signal-loop writes into the same table.
UPDATE worker_output_contracts SET output_sql = 'SELECT COUNT(*) AS n FROM idea_proposals WHERE COALESCE(ip_hash,'''') <> ''l8-reentry'' AND created_at >= :since_iso'
  WHERE worker = 'idea-hub';

UPDATE worker_output_contracts SET worker_class = CASE
  WHEN worker IN ('qnfo-signal-loop','errata-hub','qnfo-email-orchestrator','qnfo-agent-orchestrator','qnfo-social','qnfo-outreach',
    'q08-signal-engine','qnfo-deploy-guard','personal-companion','idea-hub','fleet-exec','qnfo-fleet-control','qnfo-paper-reviser',
    'qnfo-research-exec','qnfo-backlog-exec','qnfo-intent-orchestrator','qnfo-ops','qnfo-skill-sync','qnfo-paper-indexer','qnfo-email',
    'qnfo-lifecycle') THEN 'executor'
  WHEN worker IN ('qnfo-autonomy-scorer','ai-health-prober','qnfo-ai-calibration','qnfo-observability','qnfo-cloud-ops','qnfo-kaizen') THEN 'detector'
  WHEN worker IN ('qnfo-subscribers','qnfo-fleet-dashboard','calendar-api','qnfo-infra','qnfo-tools-mcp','personal-api','qnfo-ai-search',
    'qnfo-memory-mcp','qnfo-archive','qnfo-gateway','qnfo-ai','qnfo-ipatent','qnfo-pdf','qnfo-containers-pilot') THEN 'display/gateway'
  WHEN COALESCE(state,'ACTIVE') <> 'ACTIVE' THEN 'retired'
  ELSE worker_class END;

UPDATE worker_output_contracts SET class_disposition = CASE worker
  WHEN 'qnfo-tools-mcp' THEN 'keep: no in-fleet consumer; external MCP clients (904 req/24h against a ~480/24h health-probe baseline)'
  WHEN 'qnfo-ipatent' THEN 'keep: public route ipatent.qnfo.org (qnfo.org/ipatent 301), no in-fleet consumer, 24h requests at probe baseline (498); re-evaluate if 30d external traffic stays at baseline'
  WHEN 'qnfo-ai-calibration' THEN 'keep: overlaps ai-health-prober on ai_model_health; registry purpose names it a Wave-B merge target (qnfo-fleet-control)'
  WHEN 'qnfo-observability' THEN 'keep: registry purpose names it a Wave-B merge target (qnfo-fleet-control)'
  WHEN 'qnfo-agent-orchestrator' THEN 'keep: called by qnfo-intent-orchestrator (/task); idea-hub binds AGENT_ORCH but never calls it'
  WHEN 'qnfo-containers-pilot' THEN 'keep: container exec backend bound by qnfo-ops'
  WHEN 'qnfo-fleet-feed' THEN 'retired: not deployed (404)'
  WHEN 'qnfo-proof' THEN 'retired: not deployed (404)'
  ELSE CASE WHEN worker_class IS NOT NULL THEN 'keep: in-fleet consumer evidence (service binding, URL caller or output-table reader)' ELSE class_disposition END END;

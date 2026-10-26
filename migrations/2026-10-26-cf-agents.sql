-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS cf_agent_runs; DELETE FROM service_registry WHERE service = 'qnfo-agents'
-- CF-AGENTS-1 (2026-10-26, pillar autonomy; owner directive 2026-10-25: "ALL CLOUDFLARE AGENT TOOLS AND FUNCTIONALITY SHALL BE
-- AVAILABLE VIA THE CLOUDFLARE QUNIVERSE FLEET DASHBOARD" and "THIS SHALL ALSO APPLY TO OPS ENDPOINT").
-- cf_agent_runs is the fleet-visible ledger of qnfo-agents turns (the agent's own SQLite holds the full record). A row the
-- Durable Object never finished is closed as failed by the next ledger write after 20 minutes (qnfo-agents src/index.ts ledger()).
CREATE TABLE IF NOT EXISTS cf_agent_runs (
  id TEXT PRIMARY KEY,
  instance TEXT NOT NULL,
  caller TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  steps INTEGER DEFAULT 0,
  tools_used TEXT,
  prompt TEXT,
  result TEXT,
  error TEXT,
  created_ms INTEGER NOT NULL,
  finished_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cf_agent_runs_created ON cf_agent_runs (created_ms);
CREATE INDEX IF NOT EXISTS idx_cf_agent_runs_status ON cf_agent_runs (status, created_ms);
INSERT OR REPLACE INTO service_registry (service, kind, version, base_url, purpose, capabilities, routes, tools, models, deps, updated_at, state)
VALUES ('qnfo-agents', 'worker', '0.1.0', 'https://agents.qnfo.org',
  'The fleet''s Cloudflare Agents SDK agent: coding and operations turns over the qnfo-ops tool surface, reached from fleet.qnfo.org/cmd and ops.qnfo.org (CF-AGENTS-1).',
  'agent-durable-object,run-fiber,schedules,callable,mcp-server,mcp-client,code-mode,ai-gateway',
  '/,/health,/tools,/mcp,/run,/runs,/schedules,/mcp-servers,/sandbox,/agents/fleet-code-agent/<instance>',
  'repo_read_file,fleet_sql,ops_catalog,ops_call,propose_code_task,file_issue,schedule_turn,mcp_connect,codemode',
  '@cf/moonshotai/kimi-k2.7-code,@cf/zai-org/glm-5.3-flash',
  'ai:AI,d1:qnfo-audit,do:FleetCodeAgent,loader:LOADER,svc:qnfo-ops',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'live');

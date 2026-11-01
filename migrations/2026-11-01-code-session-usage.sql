-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE service_registry SET version = '0.2.6' WHERE service = 'qnfo-agents'
-- RM-CODE-SESSION-1 (charter pillar autonomy): durable CodeSession turns record token, neuron and estimated cost usage
-- without storing prompt or answer content in the fleet-visible ledger.
CREATE TABLE IF NOT EXISTS cf_agent_session_usage (
  session_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  caller TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  neurons REAL NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  finished_ms INTEGER,
  PRIMARY KEY (session_id, turn)
);
CREATE INDEX IF NOT EXISTS idx_cf_agent_session_usage_finished ON cf_agent_session_usage (finished_ms);
UPDATE service_registry
SET version = '0.3.0',
    capabilities = capabilities || ',code-session-sse,session-neuron-budget,session-usage-ledger',
    routes = routes || ',/code-sessions,/code-sessions/<id>/turns,/code-sessions/<id>/events',
    models = models || ',@cf/deepseek-ai/deepseek-v4-flash-0731,@cf/deepseek-ai/deepseek-v4-pro-0813',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE service = 'qnfo-agents';

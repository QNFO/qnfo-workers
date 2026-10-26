-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_stuck_summary_cf_agent_requests; DROP VIEW IF EXISTS v_cf_agent_requests_health; DROP TABLE IF EXISTS cf_agent_requests; DELETE FROM queue_sla WHERE stuck_type = 'cf-agent-request'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'cf_agent_requests_over_120m'; DELETE FROM metric_registry WHERE metric = 'cf_agent_requests_over_120m'
-- CF-AGENTS-LOOPS-1 (2026-10-26, pillar autonomy). Owner directive 2026-10-26 (verbatim): "EXPAND AGENT INTEGRATION AND SURFACES FOR
-- MORE AUTONOMOUS FLEET OPERATION. PORTFOLIO AND PROGRAM MANAGER AGENTS SHALL MAKE MOST DAILY DECISIONS AUTOMATICALLY TO MAINTAIN,
-- IMPROVEN, UPGRADE, AND ENHANCE THE FLEET".
-- cf_agent_requests is the fleet-wide way to reach the Agents SDK agent (qnfo-agents): any loop that can write qnfo-audit (a worker, a
-- fleet-exec workflow's sql step, the hourly management-personas workflow, the code loop) inserts a row; qnfo-agents drains it every
-- 5 minutes (up to 3 per tick) in the loop scope and writes the outcome back to the row.
--   kind 'run'      a model turn: Code Mode over the read-only fleet tools, D1 reads, the repository, connected MCP tools; it may file
--                   fleet issues (agent_issues, source qnfo-agents) and propose code tasks (returned in result, never filed as one).
--   kind 'sandbox'  `code` runs in the Code Mode Dynamic Worker sandbox without a model (codemode.fleet_sql, codemode.ops_<tool>, ...).
--   kind 'schedule' a recurring or delayed loop-scope turn on the requester's agent instance (cron of at most every 5 minutes, or delay_s).
-- Each requester gets its own agent instance (loop-<requester>), so a program manager keeps its own schedules and history.
-- Example (a fleet-exec sql step):
--   INSERT INTO cf_agent_requests (requester, kind, prompt) VALUES ('program-manager:research', 'run', 'Read v_program_focus ...');
CREATE TABLE IF NOT EXISTS cf_agent_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'run',
  prompt TEXT,
  code TEXT,
  cron TEXT,
  delay_s INTEGER,
  instance TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_id TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cf_agent_requests_status ON cf_agent_requests (status, id);
CREATE INDEX IF NOT EXISTS idx_cf_agent_requests_requester ON cf_agent_requests (requester, id);

-- Age of the oldest unfinished request (queued or running), and how many are past 120 minutes (QUEUE-SLA-1, SLA-120M-1).
CREATE VIEW IF NOT EXISTS v_cf_agent_requests_health AS
SELECT
  COUNT(*) AS open_n,
  COALESCE(SUM(CASE WHEN (julianday('now') - julianday(created_at)) * 1440 > 120 THEN 1 ELSE 0 END), 0) AS over_120m,
  COALESCE(CAST(MAX((julianday('now') - julianday(created_at)) * 1440) AS INTEGER), 0) AS oldest_min
FROM cf_agent_requests WHERE status IN ('queued', 'running');

CREATE VIEW IF NOT EXISTS v_stuck_summary_cf_agent_requests AS
SELECT s.*, h.over_120m AS cf_agent_requests_over_120m, h.oldest_min AS cf_agent_requests_oldest_min
FROM v_stuck_summary s CROSS JOIN v_cf_agent_requests_health h;

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column)
VALUES ('cf-agent-request', 'cf_agent_requests',
  'A cf_agent_requests row still queued or running more than 120 minutes after it was written',
  5, 120,
  'qnfo-agents drainRequests (5-minute cron) closes a running request from its cf_agent_runs row, re-queues one with no result after 30 minutes (twice at most) and then fails it with the reason. Revert: the qnfo-agents deploy before 0.2.0.',
  'qnfo-agents', 'v_stuck_summary_cf_agent_requests.cf_agent_requests_over_120m');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state)
VALUES ('cf_agent_requests_over_120m', 'operational', 'guard', 'cf_agent_requests rows queued or running more than 120 minutes after they were written',
  'v_cf_agent_requests_health', '0', 'qnfo-agents', 'qnfo-agents:drainRequests', '10m', 'UNMEASURED');
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('cf_agent_requests_over_120m', 'CF-AGENTS-LOOPS-1: fleet agent requests waiting over 120 minutes', 'v_cf_agent_requests_health', '>', 0, 2,
  'Check that the qnfo-agents 5-minute cron runs (cloud_ops_events / Workers logs, worker qnfo-agents, where drain) and that GET https://qnfo-agents.q08.workers.dev/health answers. A drain that runs but leaves rows queued means startRun failed: read cf_agent_requests.error. Close when over_120m = 0. Never delete requests to lower the count; fail them with a reason.',
  'qnfo-agents', 'agent_issues', 1, 1, 'CF-AGENTS-LOOPS-1');

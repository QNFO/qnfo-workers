-- CMDLINE-HOOKS-1 (issue 8255 / agent_issues 1002235), slice 1: user hooks for the command-line agent, evaluated outside the model by qnfo-agents (allTools wrapper).
-- cmd_hooks: event pre_tool | post_tool | session_end, matcher ("*" or comma list of tool names, "ops_github*" prefix form), action block | notify.
-- cmd_hook_events: one row per hook that fired. Prediction: a block hook stops a matching tool call before it runs and the refusal names the hook; no rows means no change in behavior.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS cmd_hook_events; DROP TABLE IF EXISTS cmd_hooks

CREATE TABLE IF NOT EXISTS cmd_hooks (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL CHECK (event IN ('pre_tool', 'post_tool', 'session_end')),
  matcher TEXT NOT NULL DEFAULT '*',
  action TEXT NOT NULL CHECK (action IN ('block', 'notify')),
  note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS cmd_hook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hook_id TEXT NOT NULL,
  event TEXT NOT NULL,
  tool TEXT,
  detail TEXT,
  created_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmd_hook_events_created ON cmd_hook_events (created_ms);

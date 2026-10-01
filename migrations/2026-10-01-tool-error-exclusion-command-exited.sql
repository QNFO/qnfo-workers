-- CONTAINER-EXIT-VISIBLE-1 (#1664, 2026-10-01): qnfo-ops 2.38.19 reports a shell command that exits
-- non-zero as "command exited N: <stderr>" (with its output) instead of a bare "container error".
-- A failing command is an agent-input error, not a tool fault; container/infra faults keep their
-- "container error" / "container HTTP" / "container timeout" text and stay genuine. Applied live.
INSERT INTO tool_error_exclusions (pattern, err_class, rationale, added_at)
SELECT 'command exited', 'agent-input-error', 'CONTAINER-EXIT-VISIBLE-1 (2026-10-01, #1664): non-zero command exit, output preserved; not a tool fault', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM tool_error_exclusions WHERE pattern = 'command exited');

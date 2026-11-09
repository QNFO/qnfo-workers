-- TOOL-TIMEOUT-AT-CAP-1 (2026-11-09, issue 9672 / agent_issues 1002675; charter pillar: autonomy).
-- Root cause read from the evidence: cloud_ops_events evt-8225a40faf34c8 is a shell_exec of `node scripts/run-suites.mjs --all --jobs 4 --timeout 180` that the agent itself
-- ran with timeout_ms 290000 (the container's ceiling); the suite takes longer, so the container timed out at exactly the cap (ms 290071). The tool did what it was told:
-- the command was too long for one call (the error text names the remedy: retry or change timeout_ms). That is an agent-input error, not a tool fault.
-- A genuine container stall (a short command that times out) keeps its text and still files an issue; only a call that asked for the full 290000 ms ceiling is excluded.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM tool_error_exclusions WHERE pattern = '"timeout_ms":290000';
-- CAUSE-MAPPED: registers no metric_registry row.

INSERT INTO tool_error_exclusions (pattern, err_class, rationale, added_at)
SELECT '"timeout_ms":290000', 'agent-input-error', 'TOOL-TIMEOUT-AT-CAP-1 (2026-11-09, issue 9672): the call asked for the container ceiling and the command ran past it; split the command (run-suites.mjs per worker) instead of raising the cap', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM tool_error_exclusions WHERE pattern = '"timeout_ms":290000');

-- TOOL-ERROR-CLASSIFY-6 (2026-10-19, RESOLVE-ALL-OPEN-1, issues 2740, 2799, 2801, 2820; pillar autonomy).
--
-- WHY
-- tool_error_files_issue_v2 files a TOOL-FAILURE issue for every qnfo-ops tool error whose text matches no
-- tool_error_exclusions pattern. Three caller-input classes had no pattern and filed issues that no tool change can close
-- (read 2026-10-19 from cloud_ops_events kind ops_ai_tool):
--   * run_code "tools is not defined" (#2799, and the 12 of 15 calls behind the [self-heal] escalation #2820, all
--     2026-10-17 15:37-15:39Z from one client): run_code is a sandbox with no network and no bindings, as its tool
--     description says; the caller's code assumed a `tools` global. run_code has answered ok 6 times since, 0 errors.
--   * ops_d1_write "Wrong number of parameter bindings" (#2801): the caller passed a params array that did not match its
--     own SQL placeholders; D1 rejected it correctly.
--   * ops_d1_query "access to _cf_KV ... SQLITE_AUTH" (#2740): D1 refuses reads of its internal _cf_KV table by design.
--     ops_d1_query answered 179 ok vs 9 errors in 36 h, every error a caller schema guess already excluded.
-- Tool breakage still files: these patterns name the caller's mistake, not a runtime, container or binding fault.
--
-- control_registry: tool_error_exclusions is a filter; it gets its registry row here (disposition keep; alternate path
-- tool_failures_excluded_24h, which still lists every excluded row so a mis-classified defect stays visible).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM tool_error_exclusions WHERE pattern IN ('tools is not defined', 'Wrong number of parameter bindings', 'access to _cf_KV'); DELETE FROM control_registry WHERE control = 'tool_error_exclusions';

INSERT OR IGNORE INTO tool_error_exclusions (pattern, err_class, rationale) VALUES
 ('tools is not defined', 'agent-input-error', 'TOOL-ERROR-CLASSIFY-6 (2026-10-19, #2799/#2820): run_code is an isolated sandbox with no bindings (its description says so); caller code that calls a tools.* global fails in the caller, not the tool.'),
 ('Wrong number of parameter bindings', 'agent-input-error', 'TOOL-ERROR-CLASSIFY-6 (2026-10-19, #2801): the caller''s params array does not match its SQL placeholders; D1 rejects it correctly.'),
 ('access to _cf_KV', 'correct-refusal', 'TOOL-ERROR-CLASSIFY-6 (2026-10-19, #2740): D1 forbids reading its internal _cf_KV table (SQLITE_AUTH); a correct refusal.');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id)
VALUES ('tool_error_exclusions', 'qnfo-audit.tool_error_exclusions (read by tool_error_files_issue_v2, tool_error_rate_24h, tool_failures_24h)', 'filter',
 'TOOL-FAILURE issues filed for caller-input errors no tool change can fix', 0, 'keep', 'applied',
 'tool_failures_excluded_24h lists every excluded error row; failure_class column in tool_failures_24h',
 'RESOLVE-ALL-OPEN-1 2026-10-19: 53 patterns, each with a rationale; 2026-10-17/19 TOOL-FAILURE issues 2740/2799/2801/2820 were all caller-input errors (cloud_ops_events kind ops_ai_tool).', 2799);

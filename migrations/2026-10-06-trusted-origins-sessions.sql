-- TRUSTED-ORIGINS-SESSIONS-1 (2026-10-06, pillar autonomy, agent_issues 2057 TRUSTED-ORIGINS-LOOPS-1). The code loop's intake
-- (qnfo-code-orchestrator INTAKE-PROVENANCE-1) and the merge runner (qnfo-fleet-control cmTrusted) read
-- ops_config.code_merge_trusted_sources: an issue whose source is not listed has its code-task line downgraded to a
-- session-task line, so the loop never builds it. The list trusts claude-session* and the exact word session, but sessions
-- also write their own id (session_01..., session-<name>, session:<label>) and chat-session-<date>; on 2026-10-06 five of six
-- code tasks written to give orphan issues a doer were downgraded for that spelling alone (issues 2024, 1903, 2034, 2045,
-- 2051, 2052). This adds the two session spellings as prefix globs. It does NOT add first-party loops (q08-signal-engine
-- and others that file their own issues): their descriptions carry model and feed text, and the trust list exists so that
-- such text can never carry a code-task line to main (fleet-control 0.4.1xx, "feed or model text"); a loop's code task is
-- re-filed by qnfo-fleet-control (trusted prefixes) or by a session. Backed up first: the previous value is kept as a
-- --bak row, the convention the two earlier edits of this key used. Idempotent: guarded INSERT and UPDATE.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = (SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261006T1200Z'), updated_at = datetime('now') WHERE key = 'code_merge_trusted_sources' AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261006T1200Z');

INSERT INTO ops_config (key, value, note, updated_at)
SELECT 'code_merge_trusted_sources--bak-20261006T1200Z', value, 'backup before TRUSTED-ORIGINS-SESSIONS-1 (migrations/2026-10-06-trusted-origins-sessions.sql)', datetime('now')
FROM ops_config WHERE key = 'code_merge_trusted_sources'
  AND NOT EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261006T1200Z');

UPDATE ops_config
SET value = value || ',session*,chat-session*',
    note = COALESCE(note, '') || ' | TRUSTED-ORIGINS-SESSIONS-1 2026-10-06: session* and chat-session* added (sessions write their own id as source); first-party loops deliberately not added',
    updated_at = datetime('now')
WHERE key = 'code_merge_trusted_sources' AND instr(value, ',session*') = 0;

-- SELF-AUDIT-TRIGGER-LIST-3 (2026-10-19, pillar autonomy; RESOLVE-ALL-OPEN-1, issues 2878 and 2879 SELF-AUDIT-TRIGGERMISSING).
-- The self-audit-systemwide task checks that six critical guard triggers exist. migrations/2026-10-17-consolidate-agent-issues-ts-triggers.sql
-- (AGENT-ISSUES-TRIGGER-DEPTH-2) folded the ten agent_issues timestamp triggers, among them agent_issues_created_at_default_ins and
-- agent_issues_updated_at_default_ins, into agent_issues_ts_norm_ins (AFTER INSERT: NULL created_at/updated_at -> now in ms) and
-- agent_issues_ts_norm_upd, on purpose, to get under D1's trigger-depth limit. The audit still named the removed defaulters, so it
-- filed SELF-AUDIT-TRIGGERMISSING for a deliberate change (the same miss SELF-AUDIT-TRIGGER-LIST-2 fixed on 2026-10-08). Read
-- 2026-10-19 04:45Z: both ts_norm triggers exist and 0 agent_issues rows have a NULL created_at or updated_at. The audit now checks the
-- replacements; only the quoted names in the json_each list change, so the NULLTS step's prose keeps its history.
-- docs/fleet-tasks-canonical.json carries the same edit.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = replace(replace(definition, '\"agent_issues_ts_norm_ins\"', '\"agent_issues_created_at_default_ins\"'), '\"agent_issues_ts_norm_upd\"', '\"agent_issues_updated_at_default_ins\"') WHERE id = 'self-audit-systemwide'

UPDATE fleet_tasks SET definition = replace(replace(definition,
    '\"agent_issues_created_at_default_ins\"', '\"agent_issues_ts_norm_ins\"'),
    '\"agent_issues_updated_at_default_ins\"', '\"agent_issues_ts_norm_upd\"')
WHERE id = 'self-audit-systemwide' AND instr(definition, '\"agent_issues_created_at_default_ins\"') > 0;

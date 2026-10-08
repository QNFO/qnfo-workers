-- SELF-AUDIT-TRIGGER-LIST-2 (2026-10-08, pillar autonomy; agent_issues 2202). The self-audit task checks that six critical
-- guard triggers exist. 2026-10-08-13 replaced agent_issues_enum_guard_ins on purpose (it aborted an issue with an unmapped
-- status or priority, and a filing worker's catch then dropped it: a silent drop by doctrine section 6) with
-- agent_issues_normalise_tick, which accepts the issue and normalises it on the next fleet tick (D1-TRIGGER-DEPTH-1 moved it
-- off agent_issues). The audit still named the removed guard, so it filed SELF-AUDIT-TRIGGERMISSING for a deliberate change.
-- It now checks the replacement. docs/fleet-tasks-canonical.json carries the same edit.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = replace(definition, 'agent_issues_normalise_tick', 'agent_issues_enum_guard_ins') WHERE id = 'self-audit-systemwide'

UPDATE fleet_tasks SET definition = replace(definition, 'agent_issues_enum_guard_ins', 'agent_issues_normalise_tick')
WHERE id = 'self-audit-systemwide' AND instr(definition, 'agent_issues_enum_guard_ins') > 0;

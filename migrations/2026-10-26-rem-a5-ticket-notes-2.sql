-- REM-A5-TICKET-NOTES-2 (2026-10-26, charter pillar autonomy; session rem-a5). One wording correction to the note that REM-A5-METRIC-TRIGGERS-1 (PR 4828, migration run 698) put on ticket 99909.
-- The note says the nine closed code-loop tasks behind the watchmaker by_person count were "closed by a person 9". The watchmaker query (qnfo-fleet-dashboard WATCHMAKER code-task-merge, WATCHMAKER-BY-PERSON-PRECISION-1)
-- counts a closed task when its merge_note or last_error names a session, "by PR", "into PR" or "on main", which is a closure with a session or by-PR note and not a closure by a person. The phrase
-- becomes "closed with a session or by-PR note 9"; the figures around it (github:rwnq8 21, merged_by null 13, session 1; 44 in all; 174 merged by qnfo-fleet-control) are unchanged. The first notes migration
-- (PR 4857, run 718) had merged before this correction was pushed, so the fix is its own file. Backup bak_20261026_rem_a5_notes_2 holds the description; the Rollback line restores it.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_rem_a5_notes_2 b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261026_rem_a5_notes_2)
-- spof-review: adds no cron, D1 trigger, external host or credential; one wording change on one issue.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_notes_2 AS SELECT id, description FROM agent_issues WHERE id = 99909;

UPDATE agent_issues SET description = replace(description, 'closed by a person 9', 'closed with a session or by-PR note 9')
 WHERE id = 99909 AND instr(COALESCE(description, ''), 'closed by a person 9') > 0;

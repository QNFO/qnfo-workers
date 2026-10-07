-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = replace(replace(description, char(10) || char(10) || 'CODE-TASK-MERGE-RUNNER-1: ', ' | CODE-TASK-MERGE-RUNNER-1: '), char(10) || char(10) || 'EVOLVE-PR-1: ', ' | EVOLVE-PR-1: ') WHERE status = 'open';
-- ISSUE-NOTE-NEWLINE-1 (2026-10-07, pillar autonomy; qnfo-fleet-control 0.11.1). The merge runner's note on a code task's
-- source issue (cmIssueNote) and the evolve merge note were appended inline, " | CODE-TASK-MERGE-RUNNER-1: ..." and
-- " | EVOLVE-PR-1: ...", on the issue's last line. On an ACT-BRIDGE-1 issue that last line is the code-anchor: line, and
-- the anchor parsers (fleet-control ACT_BRIDGE_MARK, the orchestrator's intake) read an anchor only to the end of its
-- line, at most 300 characters, so the anchor stopped parsing and every retry of the task ran anchor-less: measured
-- 2026-10-07T16:30Z, 15 open issues carried an inline note and 10 of them (2054, 2055, 2072, 2085, 2104, 2113, 2114, 2119,
-- 2121, 2125) had their code-anchor: line broken; ct_flm56h1rt2nk7v's retry of #2072 was windowed at var SPEND_BASIS
-- instead of CON_PROTECTED and failed twice. 0.11.1 writes the note on its own line; this file repairs the open rows.
UPDATE agent_issues
   SET description = replace(replace(description, ' | CODE-TASK-MERGE-RUNNER-1: ', char(10) || char(10) || 'CODE-TASK-MERGE-RUNNER-1: '), ' | EVOLVE-PR-1: ', char(10) || char(10) || 'EVOLVE-PR-1: '),
       updated_at = strftime('%s', 'now') * 1000
 WHERE status = 'open'
   AND (instr(description, ' | CODE-TASK-MERGE-RUNNER-1: ') > 0 OR instr(description, ' | EVOLVE-PR-1: ') > 0);

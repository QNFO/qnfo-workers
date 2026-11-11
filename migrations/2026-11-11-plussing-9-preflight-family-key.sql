-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = replace(description, 'code-task: repo=', 'session-task: repo=') WHERE id IN (1001801,1002173,1002174,1002191,1002192,1002193);
-- PLUSSING-9 / PREFLIGHT-FAMILY-KEY-1 (2026-11-11, charter pillar autonomy and reach): plus_ledger holds 9 rows and none deployed. Six plus issues
-- (1001801, 1002173, 1002174, 1002191, 1002192, 1002193) were refused by CODE-TASK-PREFLIGHT-1 with "its key ROADMAP-1 shipped as qnfo-gateway 3.60.0
-- within 72h": ROADMAP-1 is the prefix of every manager-originated issue, so one shipped item parked all the others, and the refusal rewrote their
-- code-task line to session-task, which no loop reads. qnfo-code-orchestrator 0.48.8 stops treating ROADMAP-1 as a key; this puts the lines back so
-- intake picks the six up on its next pass. Closing probe: SELECT COUNT(*) FROM plus_ledger WHERE status IN ('deployed','kept').
UPDATE agent_issues
SET description = replace(description, 'session-task: repo=', 'code-task: repo='), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE status = 'open' AND title LIKE 'ROADMAP-1:%'
  AND description LIKE '%CODE-TASK-PREFLIGHT-1%key ROADMAP-1 shipped%'
  AND description LIKE '%session-task: repo=%';

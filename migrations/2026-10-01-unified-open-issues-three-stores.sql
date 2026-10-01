-- UNIFIED-OPEN-WORK-1 (#1625, 2026-10-01): one queryable surface for all open work with a per-store breakdown.
-- unified_open_issues previously unioned agent_issues + issue_ledger only; task_dod_register (the register the
-- fleet executes from, also behind v_fleet_open_work) was missing. qnfo-ops 2.38.22 backlog_status reports
-- this view's total and per-store counts as openUnified. Applied live.
DROP VIEW IF EXISTS unified_open_issues;
CREATE VIEW unified_open_issues AS
SELECT 'agent_issues' AS store, CAST(id AS TEXT) AS ref, priority AS prio, title AS title, status AS status,
       CASE WHEN typeof(created_at) = 'integer' THEN strftime('%Y-%m-%dT%H:%M:%SZ', created_at / 1000.0) ELSE created_at END AS opened_at
FROM agent_issues WHERE status = 'open'
UNION ALL
SELECT 'issue_ledger', fingerprint, level, title, status, first_seen FROM issue_ledger WHERE status = 'open'
UNION ALL
SELECT 'task_dod_register', CAST(id AS TEXT), NULL, title, status, created_at FROM task_dod_register WHERE status = 'open';

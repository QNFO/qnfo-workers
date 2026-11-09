-- TRACKER-D1-CANON-2 (2026-11-09, pillar autonomy; owner directive 2026-11-06: D1 is canonical, one GitHub issue per D1 issue)
-- Measured 2026-11-09: 131 open agent_issues have a mirror closed on GitHub (gh_close_reason = 'age-policy') three days after TRACKER-D1-CANON-1 shipped; v_tracker_drift read 0 because
-- migration 2026-11-04-tracker-drift-age-policy hid exactly those rows ("explained, not drift"). The age policy no longer closes fleet-issue mirrors, so such a row is drift like any other.
-- THIS CHANGES: v_tracker_drift counts an open D1 row whose mirror is closed whatever the close reason, so tracker drift and its metric measure the 1:1 invariant. Nothing changes in agent_issues.
-- Rollback: the previous view text is kept in bak_20261109_v_tracker_drift_canon2 (name, sql): DROP VIEW v_tracker_drift; then run its sql.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261109_v_tracker_drift_canon2
-- CAUSE-MAPPED: registers no metric_registry row.
-- spof-review: one view, no new single point of failure.

CREATE TABLE IF NOT EXISTS bak_20261109_v_tracker_drift_canon2 AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
FROM sqlite_master
WHERE type = 'view' AND name = 'v_tracker_drift';

DROP VIEW IF EXISTS v_tracker_drift;
CREATE VIEW v_tracker_drift AS
  WITH configured_priorities AS (
    SELECT value FROM ops_config WHERE key = 'gh_individual_priorities' LIMIT 1
  ),
  issue_mirror_policy AS (
    SELECT a.id, a.title, a.status, a.priority, a.created_at, a.updated_at,
           CASE
             WHEN COALESCE(trim(p.value), '') = '' THEN 1
             WHEN lower(trim(a.title)) LIKE 'fm-actor-1:%' THEN 1
             WHEN instr(
               ',' || replace(replace(replace(replace(lower(p.value), char(9), ','), char(10), ','), char(13), ','), ' ', ',') || ',',
               ',' || lower(a.priority) || ','
             ) > 0 THEN 1
             ELSE 0
           END AS individual
      FROM agent_issues a
      LEFT JOIN configured_priorities p ON 1 = 1
  )
  SELECT 'issue-unmirrored' AS kind, CAST(a.id AS TEXT) AS ref, a.title AS detail,
         MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.created_at, 0) / 1000) / 60) AS age_min
    FROM issue_mirror_policy a LEFT JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE a.status = 'open' AND a.individual = 1 AND l.issue_id IS NULL
     AND a.created_at < (strftime('%s','now') - 1200) * 1000
  UNION ALL
  SELECT 'issue-state', CAST(a.id AS TEXT), 'D1 ' || a.status || ' vs GitHub #' || l.gh_number || ' ' || COALESCE(l.gh_state, '?'),
         MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.updated_at, a.created_at, 0) / 1000) / 60)
    FROM issue_mirror_policy a JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE a.individual = 1
     AND (a.status IN ('open')) <> (COALESCE(l.gh_state, '') = 'open')
  UNION ALL
  SELECT 'code-task-pr', t.task_id, t.drift,
         CASE WHEN t.synced_at IS NULL THEN 0 ELSE MAX(0, (CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', t.synced_at) AS INTEGER)) / 60) END
    FROM code_task_pr_links t WHERE t.drift IS NOT NULL AND t.drift <> '';

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE gh_issue_links; DROP TABLE code_task_pr_links; DROP TABLE tracker_sync_state; DROP VIEW v_tracker_drift; DELETE FROM metric_registry WHERE metric IN ('tracker_drift','tracker_issue_drift','tracker_code_task_drift'); DELETE FROM analytics_metric_triggers WHERE metric_key = 'tracker_drift'
--
-- TRACKER-SYNC-1 (owner directive 2026-10-18, pillar autonomy, verbatim): "qnfo-audit.code_tasks AND GITHUB ISSUES/PRS NEED TO
-- BE COORDINATED AND IN-SYNC AT ALL TIMES TO AVOID PHANTOM ISSUES AND INCORRECT METRICS".
--
-- Measured 2026-10-18 ~09:05Z, before this change:
--   * agent_issues: 2,856 rows (228 open). GitHub QNFO/qnfo-workers: 256 issues, 0 of them referencing an agent_issues id.
--     The fleet's real issue backlog was invisible on GitHub; the GitHub tracker held only ci-watchdog noise.
--   * fleet_issue_dispatch: 125 'tracked' rows with no gh_number (ISSUE-SYNC-1 only mirrors that table).
--   * code_tasks vs pull requests: 1 task 'failed' whose PR 812 MERGED (phantom failure, counted against the code loop);
--     7 codeagent-* PRs with no code_tasks row; 41 terminal tasks whose pr_url is a compare URL (no PR was ever opened),
--     so "closed, unmerged" on fleet.qnfo.org counted tasks, not pull requests.
--
-- Link tables, not new columns: issue_lifecycle_bd copies agent_issues with SELECT * into agent_issues_tombstone, whose
-- column count is fixed, so a new agent_issues column would break every delete. qnfo-github-steward (0.3.0) writes these
-- tables every 10 minutes; D1 stays authoritative for issue state (close-evidence gate), GitHub for merge state.

CREATE TABLE IF NOT EXISTS gh_issue_links (
  issue_id INTEGER PRIMARY KEY,
  gh_number INTEGER NOT NULL UNIQUE,
  gh_state TEXT,
  d1_status TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS code_task_pr_links (
  task_id TEXT PRIMARY KEY,
  pr_number INTEGER,
  pr_state TEXT,
  merged_at TEXT,
  head_sha TEXT,
  task_status TEXT,
  drift TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS tracker_sync_state (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT);

CREATE VIEW IF NOT EXISTS v_tracker_drift AS
  SELECT 'issue-unmirrored' AS kind, CAST(a.id AS TEXT) AS ref, a.title AS detail
    FROM agent_issues a LEFT JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE a.status = 'open' AND l.issue_id IS NULL AND a.created_at < (strftime('%s','now') - 1200) * 1000
  UNION ALL
  SELECT 'issue-state', CAST(a.id AS TEXT), 'D1 ' || a.status || ' vs GitHub #' || l.gh_number || ' ' || COALESCE(l.gh_state, '?')
    FROM agent_issues a JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE (a.status = 'open') <> (COALESCE(l.gh_state, '') = 'open')
  UNION ALL
  SELECT 'code-task-pr', t.task_id, t.drift FROM code_task_pr_links t WHERE t.drift IS NOT NULL AND t.drift <> '';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES
 ('tracker_drift', 'operational', 'lagging', 'tracker_issue_drift + tracker_code_task_drift (count(v_tracker_drift) after each sync tick)', 'qnfo-audit.v_tracker_drift', 'measured at first tick (2026-10-18)', '0', 'qnfo-github-steward', 'analytics_metric_triggers tracker_drift -> agent_issues', '10m', '> 0', '> 20', 'PENDING', 'computed'),
 ('tracker_issue_drift', 'operational', 'lagging', 'open agent_issues with no GitHub mirror after 20 min + mirrored issues whose open/closed state differs', 'qnfo-audit.v_tracker_drift', 'measured at first tick (2026-10-18)', '0', 'qnfo-github-steward', 'report; graded through tracker_drift', '10m', '> 0', '> 20', 'PENDING', 'computed'),
 ('tracker_code_task_drift', 'operational', 'lagging', 'code_tasks whose status contradicts their pull request + codeagent-* PRs with no code_tasks row', 'qnfo-audit.v_tracker_drift', 'measured at first tick (2026-10-18)', '0', 'qnfo-github-steward', 'report; graded through tracker_drift', '10m', '> 0', '> 20', 'PENDING', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('tracker_drift', 'Tracker drift: D1 issues/code tasks disagree with GitHub', 'registry', 'gt', 0, 2,
 'Pillar autonomy (TRACKER-SYNC-1). Read SELECT kind, ref, detail FROM v_tracker_drift. qnfo-github-steward fixes the mechanical cases every 10 minutes; what remains is a case it refuses on purpose: (1) issue-state = a GitHub issue closed or reopened by hand while D1 disagrees: D1 is authoritative, close it in D1 with close_evidence or leave it open; (2) code-task-pr task-merged-pr-not-merged = the D1 row claims a merge GitHub does not have: correct the row from merge_note; (3) pr-without-task = a codeagent-* PR with no code_tasks row: find the producer that opened it. Done: tracker_drift = 0 at two refreshes.',
 'qnfo-github-steward', 'agent_issues', 2, 1, 'TRACKER-SYNC-1 (migrations/2026-10-18-tracker-sync.sql)');

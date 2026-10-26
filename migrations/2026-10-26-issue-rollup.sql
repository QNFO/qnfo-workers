-- ISSUE-ROLLUP-1 (2026-10-26, pillar autonomy; owner directive: "CONTINUE TO REDUCE OPEN ISSUES TO <100")
--
-- Measured 2026-10-26: 456 open GitHub issues = 252 fleet-issue mirrors of open agent_issues (43 critical, 77 high, 114 medium, 18 low) + 200 roadmap
-- mirrors (74 goals). Hand-closing is reverted by TRACKER-SYNC-1 and a close needs evidence, so the lever is what is mirrored one-to-one.
-- THIS CHANGES: ops_config gh_individual_priorities = critical. qnfo-github-steward 0.10.0 keeps one GitHub issue per critical agent_issues row;
-- every other open row is listed in one [digest] issue per program (gh_digest_links), its own mirror is closed not_planned (not a verification),
-- and source goals (74) is out of the issue mirror (roadmap_mirror_scope) and listed in one goals digest. Nothing changes in agent_issues or
-- roadmap_implementation; loops, probes, SLAs and close evidence read D1 as before. v_tracker_drift expects only individual priorities on GitHub.
-- Revert: DELETE FROM ops_config WHERE key = 'gh_individual_priorities' (every priority is individual again; the steward reopens the mirrors,
-- 40 per tick) and UPDATE roadmap_mirror_scope SET mirrored = 1 WHERE source = 'goals'.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: ops_config
-- Rollback: DROP VIEW IF EXISTS v_tracker_drift; CREATE VIEW v_tracker_drift AS SELECT 'issue-unmirrored' AS kind, CAST(a.id AS TEXT) AS ref, a.title AS detail, MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.created_at, 0) / 1000) / 60) AS age_min FROM agent_issues a LEFT JOIN gh_issue_links l ON l.issue_id = a.id WHERE a.status = 'open' AND l.issue_id IS NULL AND a.created_at < (strftime('%s','now') - 1200) * 1000 UNION ALL SELECT 'issue-state', CAST(a.id AS TEXT), 'D1 ' || a.status || ' vs GitHub #' || l.gh_number || ' ' || COALESCE(l.gh_state, '?'), MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.updated_at, a.created_at, 0) / 1000) / 60) FROM agent_issues a JOIN gh_issue_links l ON l.issue_id = a.id WHERE (a.status IN ('open')) <> (COALESCE(l.gh_state, '') = 'open') UNION ALL SELECT 'code-task-pr', t.task_id, t.drift, CASE WHEN t.synced_at IS NULL THEN 0 ELSE MAX(0, (CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', t.synced_at) AS INTEGER)) / 60) END FROM code_task_pr_links t WHERE t.drift IS NOT NULL AND t.drift <> '' ; DELETE FROM ops_config WHERE key = 'gh_individual_priorities'; UPDATE roadmap_mirror_scope SET mirrored = 1 WHERE source = 'goals'
--
-- Verify after apply: SELECT value FROM ops_config WHERE key = 'gh_individual_priorities';   -- critical
--   within ~15 ticks of the steward deploy: SELECT COUNT(*) FROM gh_issue_links WHERE gh_state = 'open';   -- about the critical count
--   SELECT dkey, n FROM gh_digest_links;   -- one row per program plus goals
--   SELECT COUNT(*) FROM v_tracker_drift WHERE kind IN ('issue-state','issue-unmirrored');   -- 0 once the closes drain

CREATE TABLE IF NOT EXISTS gh_digest_links (
  dkey TEXT PRIMARY KEY,
  gh_number INTEGER NOT NULL,
  body_hash TEXT,
  n INTEGER,
  synced_at TEXT
);

INSERT OR REPLACE INTO ops_config (key, value, note) VALUES ('gh_individual_priorities', 'critical', 'ISSUE-ROLLUP-1: priorities that keep one GitHub issue each; the rest are listed in a [digest] issue per program. Delete the key to restore one issue per row.');

INSERT OR REPLACE INTO roadmap_mirror_scope (source, mirrored, reason) VALUES ('goals', 0, 'ISSUE-ROLLUP-1: the 74 goals are listed in one [digest] open goals issue; they stay in roadmap_implementation, the board and /roadmap');

DROP VIEW IF EXISTS v_tracker_drift;

CREATE VIEW v_tracker_drift AS
  SELECT 'issue-unmirrored' AS kind, CAST(a.id AS TEXT) AS ref, a.title AS detail,
         MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.created_at, 0) / 1000) / 60) AS age_min
    FROM agent_issues a LEFT JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE a.status = 'open' AND l.issue_id IS NULL AND a.created_at < (strftime('%s','now') - 1200) * 1000
     AND instr(',' || COALESCE((SELECT value FROM ops_config WHERE key = 'gh_individual_priorities'), a.priority) || ',', ',' || a.priority || ',') > 0
  UNION ALL
  SELECT 'issue-state', CAST(a.id AS TEXT), 'D1 ' || a.status || ' vs GitHub #' || l.gh_number || ' ' || COALESCE(l.gh_state, '?'),
         MAX(0, (CAST(strftime('%s','now') AS INTEGER) - COALESCE(a.updated_at, a.created_at, 0) / 1000) / 60)
    FROM agent_issues a JOIN gh_issue_links l ON l.issue_id = a.id
   WHERE (a.status IN ('open') AND instr(',' || COALESCE((SELECT value FROM ops_config WHERE key = 'gh_individual_priorities'), a.priority) || ',', ',' || a.priority || ',') > 0) <> (COALESCE(l.gh_state, '') = 'open')
  UNION ALL
  SELECT 'code-task-pr', t.task_id, t.drift,
         CASE WHEN t.synced_at IS NULL THEN 0 ELSE MAX(0, (CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', t.synced_at) AS INTEGER)) / 60) END
    FROM code_task_pr_links t WHERE t.drift IS NOT NULL AND t.drift <> '';

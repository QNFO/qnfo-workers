-- ISSUE-CONSOLIDATE-1 (2026-10-26, pillar autonomy; owner directive: "CONSOLIDATE >450 GITHUB ISSUES INTO <100 BY IMPORTANCE, PRIORITY, AND SCOPE")
--
-- Measured 2026-10-26 (GitHub REST + qnfo-audit reads): 456 open issues = 252 fleet-issue mirrors of open agent_issues (live metric breaches, 1:1 with D1) +
-- 200 mirrored roadmap_implementation rows (74 goals with a definition of done + 126 catalogue items from 120 distinct free-text sources).
-- Stale by date: none (every open issue was created in 2026-10). The fleet-issue half closes only with close_evidence, so it is not touched here.
--
-- THIS CHANGES: the roadmap half. By importance and scope, a roadmap source stays a GitHub issue only if it is a goal (source 'goals') or needs the
-- owner (a row with status owner-decision or open). Every other source (lesson catalogue quniverse-fleet-lessons, task/handoff/reorg lists,
-- transformation-program and business-plan phases, paper gaps, routing/model rows) stays in roadmap_implementation, on the Projects board and in
-- GET /roadmap, and its open GitHub mirror is closed not_planned by qnfo-github-steward (40 per tick, never a verification).
-- Revert: DELETE FROM roadmap_mirror_scope WHERE reason LIKE 'ISSUE-CONSOLIDATE-1%' (the steward reopens the linked issues, 40 per tick).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: roadmap_mirror_scope
-- Rollback: DELETE FROM roadmap_mirror_scope WHERE reason LIKE 'ISSUE-CONSOLIDATE-1%'
--
-- Verify after apply: SELECT COUNT(*) FROM roadmap_mirror_scope WHERE mirrored = 0;   -- about 120 more than the 3 seeded
--   within ~15 ticks: SELECT COUNT(*) FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id
--     WHERE g.gh_state = 'open' AND r.source IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0);   -- 0

INSERT OR IGNORE INTO roadmap_mirror_scope (source, mirrored, reason)
SELECT DISTINCT r.source, 0, 'ISSUE-CONSOLIDATE-1: catalogue item, not a goal and not an owner decision; stays in roadmap_implementation, the board and /roadmap'
  FROM roadmap_implementation r
 WHERE r.source IS NOT NULL AND r.source <> '' AND r.source <> 'goals' AND r.source <> 'agent_issues'
   AND r.source NOT IN (SELECT source FROM roadmap_implementation WHERE source IS NOT NULL AND (status IN ('owner-decision','open') OR source = 'goals'));

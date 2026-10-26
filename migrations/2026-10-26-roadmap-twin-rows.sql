-- ROADMAP-TWIN-ROWS-1 (2026-10-26, pillar autonomy; owner question "why are there over 800 GitHub issues?", follow-up to PORTFOLIO-NOT-ISSUES-1)
--
-- WHAT WAS MEASURED (2026-10-26 08:2xZ, qnfo-audit SELECT and the GitHub issue search, both read-only)
--   GitHub open issues went from 591 to 622 in 45 minutes although the sources the steward 0.8.0 took out of the mirror were all closing. The new ones are
--   `[RM-1403] AI-1000347: BP26 2.10 ...` and its 30 siblings: roadmap_implementation rows of source best-practice-2026, written between 08:31 and 08:37Z by a
--   research session, 30 of artifact_type agent_issue (item AI-<id>, artifact_ref BP26.<program>) plus one goal (GL-BP26-CATALOGUE). Each AI-<id> row is the
--   roadmap twin of agent_issues <id>, which TRACKER-SYNC-1 already mirrors as [#<id>]; the steward mirrored it a second time (15 of 31 by 08:40Z, the rest
--   queued at its per-tick creation cap). The steward excluded the source 'agent_issues' by name for exactly this reason; a new batch arrived under a new name.
--
-- WHAT THIS CHANGES (the code change is qnfo-github-steward 0.9.0: the rule is on the row's artifact_type, not on a source name)
--   1. v_portfolio_drift_roadmap leaves out roadmap rows of artifact_type agent_issue in all three of its selects, as the steward does, so an unfiled twin is not
--      read as 'roadmap-unmirrored' drift and a closed twin mirror is not read as 'roadmap-state' drift
--   2. the detector fm-roadmap-catalogue-as-issues also counts an open GitHub issue linked to such a row (observed 15 before the steward closes them, 0 after)
--   3. the decision is logged
--   The rows stay in roadmap_implementation (the roadmap, the Projects board and /roadmap read them); their status still follows the agent issue. The one goal
--   row of the batch is a goal like the 76 already mirrored and stays in scope. No trigger, no cron.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: roadmap_implementation
-- Rollback: DROP VIEW IF EXISTS v_portfolio_drift_roadmap; CREATE VIEW v_portfolio_drift_roadmap AS SELECT 'roadmap-unmirrored' AS kind, CAST(r.id AS TEXT) AS ref, r.item AS detail FROM roadmap_implementation r LEFT JOIN roadmap_gh_links g ON g.roadmap_id = r.id WHERE g.roadmap_id IS NULL AND r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source <> 'agent_issues' AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0) UNION ALL SELECT 'roadmap-state', CAST(r.id AS TEXT), 'D1 ' || r.status || ' vs GitHub #' || g.gh_number || ' ' || COALESCE(g.gh_state, '?') FROM roadmap_implementation r JOIN roadmap_gh_links g ON g.roadmap_id = r.id WHERE (r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0)) <> (COALESCE(g.gh_state, '') = 'open') UNION ALL SELECT 'roadmap-unplaced', CAST(g.roadmap_id AS TEXT), 'GitHub #' || g.gh_number || ' has no project milestone' FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id LEFT JOIN projects p ON p.project_code = g.project_code WHERE r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0) AND (p.gh_milestone IS NULL OR p.status <> 'active'); UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id WHERE g.gh_state = ''open'' AND r.source IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0)) AS TEXT) AS observed' WHERE class = 'fm-roadmap-catalogue-as-issues'

DROP VIEW IF EXISTS v_portfolio_drift_roadmap;

CREATE VIEW v_portfolio_drift_roadmap AS
  SELECT 'roadmap-unmirrored' AS kind, CAST(r.id AS TEXT) AS ref, r.item AS detail FROM roadmap_implementation r LEFT JOIN roadmap_gh_links g ON g.roadmap_id = r.id
   WHERE g.roadmap_id IS NULL AND r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source <> 'agent_issues' AND r.artifact_type <> 'agent_issue'
     AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0)
  UNION ALL
  SELECT 'roadmap-state', CAST(r.id AS TEXT), 'D1 ' || r.status || ' vs GitHub #' || g.gh_number || ' ' || COALESCE(g.gh_state, '?')
    FROM roadmap_implementation r JOIN roadmap_gh_links g ON g.roadmap_id = r.id
   WHERE (r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0) AND r.artifact_type <> 'agent_issue') <> (COALESCE(g.gh_state, '') = 'open')
  UNION ALL
  SELECT 'roadmap-unplaced', CAST(g.roadmap_id AS TEXT), 'GitHub #' || g.gh_number || ' has no project milestone'
    FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id
    LEFT JOIN projects p ON p.project_code = g.project_code
   WHERE r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0) AND r.artifact_type <> 'agent_issue'
     AND (p.gh_milestone IS NULL OR p.status <> 'active');

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id WHERE g.gh_state = ''open'' AND (r.source IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0) OR r.artifact_type = ''agent_issue'')) AS TEXT) AS observed'
WHERE class = 'fm-roadmap-catalogue-as-issues' AND verify_probe NOT LIKE '%agent_issue%';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_015kWmGuAq2fNuvzu4MrD7x3',
  'a roadmap row whose artifact is an agent issue is that issue''s twin whatever source writes it: the mirror of the issue is its [#id] ticket, and a second GitHub issue counts one thing twice',
  'ROADMAP-TWIN-ROWS-1: qnfo-github-steward 0.9.0 never files a roadmap row of artifact_type agent_issue and closes its existing mirror not_planned; this file makes v_portfolio_drift_roadmap and fm-roadmap-catalogue-as-issues read the same rule',
  'qnfo-audit 2026-10-26: roadmap_implementation source best-practice-2026 holds 31 rows written in six minutes (30 artifact_type agent_issue, 1 goal), roadmap_gh_links open for 15 of them; GitHub open issues 591 at 07:55Z and 622 at 08:37Z; the steward skips source agent_issues by name only; offline suite qnfo-github-steward/issue-hygiene.test.mjs (section 9) and migrations/roadmap-twin-rows.test.mjs',
  'migration merged, qnfo-github-steward 0.9.0 deployed through the canonical path',
  '15 GitHub issues closed not_planned (about one tick); no D1 roadmap row changes; the goal row and every other roadmap source are untouched',
  'the Rollback header restores the view and the detector; a deploy revert of the steward restores the old rule (this decision row stays: decision_log is append-only)',
  'the steward decides on the row''s own artifact_type, so a new research batch under a new source name cannot double its tickets',
  'GitHub open issues stop rising with each research batch; the 15 doubled tickets close within a tick of the deploy',
  'each research batch adds its tickets once',
  'd1 qnfo-audit roadmap_implementation, roadmap_gh_links, roadmap_mirror_scope, remediation_contracts (SELECT only), GitHub issue search (open count), qnfo-github-steward/worker.js psRoadmap and offline node:sqlite suites'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'ROADMAP-TWIN-ROWS-1: qnfo-github-steward 0.9.0') = 1);

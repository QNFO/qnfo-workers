-- PORTFOLIO-NOT-ISSUES-1 (2026-10-26, pillar autonomy; owner question: "why are there over 800 GitHub issues? are these in 1-1 sync with the fleet?")
--
-- WHAT WAS MEASURED (qnfo-audit and GitHub, SELECT and list reads only, 2026-10-26 06:00-07:00Z)
--   GitHub open issues 828 = 439 mirrored agent_issues (gh_issue_links, TRACKER-SYNC-1: 1:1 with the 438 open D1 rows, the 2 rows that disagree are
--   in-flight sync) + 381 mirrored roadmap_implementation rows (roadmap_gh_links, PORTFOLIO-SYNC-1). The first set is in sync. The second set is
--   where the count stops meaning "work to finish": of the 381 open roadmap issues
--     77  source 'projects'      PROJ-<code>: a worker or repository (W.qnfo-ai, R.laws-of-form). A project is a catalogue entry, it is already a
--                                GitHub milestone, and a live project is never 'completed', so these 77 issues can never close.
--     75  source 'metric-breach' RM-METRIC-<key>: the objective for a metric in breach. The same breach already has its METRIC-TRIGGER-<id> issue
--                                (same wording, e.g. #1454 and #2446 for "more than 20 open agent issues"), so one breach was two tickets.
--     29  source 'failure_modes' FM-<key>: a registry entry (root cause, remediation, detector). One with an open issue is that issue's twin, one
--                                without is a lesson, not a task.
--   181 of 828 (22 percent) therefore could never close or duplicated a ticket that is already tracked. The other 200 roadmap issues (76 goals
--   with a definition of done, the RM-n and RM-GATE-n items, owner decisions) are work and stay mirrored.
--
-- WHAT THIS CHANGES
--   roadmap_mirror_scope(source, mirrored, reason) is the one place that says which roadmap sources are GitHub issues. qnfo-github-steward 0.8.0
--   reads it every tick (and falls back to the same three sources while the table is absent): a source with mirrored = 0 is not filed, not
--   placed, and its open GitHub issue is closed not_planned with a comment that says it is not a verification; D1 is never changed by that.
--   The roadmap rows stay in roadmap_implementation, on the Projects board and in GET /roadmap. Setting mirrored = 1 brings a source back (its
--   linked issues are reopened, 40 per tick), so the decision is data, not code, and is reversible without a deploy.
--   v_portfolio_drift_roadmap reads the same table so the portfolio_drift metric (target 0) does not read the closed mirrors as drift.
--
-- NOT ADDED (stated): no trigger on agent_issues or roadmap_implementation (AGENT-ISSUES-TRIGGER-DEPTH-1: D1 refuses writes whose trigger programs
-- nest more than 10 levels); the existing roadmap-backlog-sync and portfolio-self-manage workflows keep deriving the rows, which is what the
-- roadmap and the board read.
--
-- Revert: UPDATE roadmap_mirror_scope SET mirrored = 1 (the steward reopens the linked issues, 40 per tick); the Rollback line restores the two views.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: roadmap_implementation
-- Rollback: DROP VIEW IF EXISTS v_portfolio_drift_roadmap; CREATE VIEW v_portfolio_drift_roadmap AS SELECT 'roadmap-unmirrored' AS kind, CAST(r.id AS TEXT) AS ref, r.item AS detail FROM roadmap_implementation r LEFT JOIN roadmap_gh_links g ON g.roadmap_id = r.id WHERE g.roadmap_id IS NULL AND r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source <> 'agent_issues' UNION ALL SELECT 'roadmap-state', CAST(r.id AS TEXT), 'D1 ' || r.status || ' vs GitHub #' || g.gh_number || ' ' || COALESCE(g.gh_state, '?') FROM roadmap_implementation r JOIN roadmap_gh_links g ON g.roadmap_id = r.id WHERE (r.status NOT IN ('verified','enforced-verified','violated-remediated','retired')) <> (COALESCE(g.gh_state, '') = 'open') UNION ALL SELECT 'roadmap-unplaced', CAST(g.roadmap_id AS TEXT), 'GitHub #' || g.gh_number || ' has no project milestone' FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id LEFT JOIN projects p ON p.project_code = g.project_code WHERE r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND (p.gh_milestone IS NULL OR p.status <> 'active'); DELETE FROM remediation_contracts WHERE class = 'fm-roadmap-catalogue-as-issues'; DELETE FROM failure_modes WHERE fm_key = 'roadmap-catalogue-as-issues'; DELETE FROM control_registry WHERE control = 'roadmap_mirror_scope'; UPDATE roadmap_mirror_scope SET mirrored = 1
--
-- Verify after apply:
--   SELECT source, mirrored FROM roadmap_mirror_scope;                                                            -- projects, metric-breach, failure_modes at 0
--   within ~60 minutes of the steward deploy (40 closes per 10-minute tick):
--   SELECT COUNT(*) FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id
--     WHERE g.gh_state = 'open' AND r.source IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0);      -- 0
--   SELECT COUNT(*) FROM v_portfolio_drift_roadmap;                                                               -- 0

CREATE TABLE IF NOT EXISTS roadmap_mirror_scope (
  source TEXT PRIMARY KEY,
  mirrored INTEGER NOT NULL DEFAULT 1 CHECK (mirrored IN (0, 1)),
  reason TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR IGNORE INTO roadmap_mirror_scope (source, mirrored, reason) VALUES
 ('projects', 0, 'PROJ-<code> rows are catalogue entries (a worker or repository): already a GitHub milestone, and a live project never completes, so the issue could never close'),
 ('metric-breach', 0, 'RM-METRIC-<key> objectives duplicate the METRIC-TRIGGER-<id> agent_issues ticket that already tracks the same breach and closes on recovery'),
 ('failure_modes', 0, 'FM-<key> rows are a registry of lessons with a detector, not work; one with an open issue is that issue''s twin');

DROP VIEW IF EXISTS v_portfolio_drift_roadmap;

CREATE VIEW v_portfolio_drift_roadmap AS
  SELECT 'roadmap-unmirrored' AS kind, CAST(r.id AS TEXT) AS ref, r.item AS detail FROM roadmap_implementation r LEFT JOIN roadmap_gh_links g ON g.roadmap_id = r.id
   WHERE g.roadmap_id IS NULL AND r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source <> 'agent_issues'
     AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0)
  UNION ALL
  SELECT 'roadmap-state', CAST(r.id AS TEXT), 'D1 ' || r.status || ' vs GitHub #' || g.gh_number || ' ' || COALESCE(g.gh_state, '?')
    FROM roadmap_implementation r JOIN roadmap_gh_links g ON g.roadmap_id = r.id
   WHERE (r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0)) <> (COALESCE(g.gh_state, '') = 'open')
  UNION ALL
  SELECT 'roadmap-unplaced', CAST(g.roadmap_id AS TEXT), 'GitHub #' || g.gh_number || ' has no project milestone'
    FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id
    LEFT JOIN projects p ON p.project_code = g.project_code
   WHERE r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source NOT IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0)
     AND (p.gh_milestone IS NULL OR p.status <> 'active');

-- The control and its alternate path, so the next reader does not "fix" the scope by removing it.
INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, reviewed_at)
VALUES ('roadmap_mirror_scope',
        'qnfo-audit.roadmap_mirror_scope (migrations/2026-10-26-roadmap-mirror-scope.sql), read by qnfo-github-steward psRmScope and v_portfolio_drift_roadmap',
        'filter',
        'roadmap rows that are catalogue entries, registry entries or twins of an existing ticket being filed as GitHub issues that can never close or count one breach twice',
        0, 'keep', 'applied',
        'the rows stay in qnfo-audit.roadmap_implementation, on the Projects board and in GET /roadmap on qnfo-github-steward; mirrored = 1 for a source reopens its linked issues (40 per tick) with no deploy. Exercised offline by qnfo-github-steward/issue-hygiene.test.mjs (scope off closes, scope on reopens)',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        'measured 2026-10-26: 828 open GitHub issues, 381 roadmap mirrors, 181 of them projects (77), metric-breach twins (75) and failure-mode registry rows (29); no row is deleted or rewritten, only the GitHub mirror of those sources is closed not_planned',
        strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('roadmap-catalogue-as-issues',
  'catalogue entries, registry entries and twins of an existing ticket are filed as GitHub issues, so the open-issue count (828) mixes work with rows that can never close',
  'PORTFOLIO-SYNC-1 mirrored every roadmap_implementation row that is not done and not copied from agent_issues; portfolio-self-manage derives a PROJ- row for every project (a project never completes), the steward derives an RM-METRIC- objective for every metric in breach (the breach already has a METRIC-TRIGGER ticket) and roadmap-backlog-sync derives an FM- row for every failure mode',
  'PORTFOLIO-NOT-ISSUES-1: roadmap_mirror_scope names the sources that are not issues; the steward closes their open issues not_planned and never reopens them; v_portfolio_drift_roadmap reads the same table; fm-roadmap-catalogue-as-issues reads any open issue of an out-of-scope source; no trigger is added to agent_issues',
  'no open GitHub roadmap issue belongs to a source with mirrored = 0 in roadmap_mirror_scope', 'fm-roadmap-catalogue-as-issues', '2026-10-26', NULL,
  'a new roadmap deriver writes rows for a catalogue or registry that is not work, or a source is switched off while its issues stay open',
  'the GitHub issue list shows hundreds of open issues that nobody can finish; open_agent_issues and the GitHub count disagree by hundreds',
  'the owner reading the open-issue count, the Projects board, the portfolio_drift metric');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-roadmap-catalogue-as-issues', NULL, 'PORTFOLIO-NOT-ISSUES-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id WHERE g.gh_state = ''open'' AND r.source IN (SELECT source FROM roadmap_mirror_scope WHERE mirrored = 0)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_015kWmGuAq2fNuvzu4MrD7x3',
  'a GitHub issue is work that finishing the work closes: a project, a registry entry and a second ticket for a tracked breach are not, and the roadmap, the board and the milestones already carry them',
  'PORTFOLIO-NOT-ISSUES-1: roadmap_mirror_scope takes the projects, metric-breach and failure_modes roadmap sources out of the GitHub issue mirror; qnfo-github-steward 0.8.0 closes their open issues not_planned; v_portfolio_drift_roadmap follows the scope',
  'd1 qnfo-audit and GitHub 2026-10-26: 828 open issues; gh_issue_links 439 open = 438 open agent_issues; roadmap_gh_links 381 open of which projects 77, metric-breach 75, failure_modes 29; METRIC-TRIGGER-362 (#1454) and RM-METRIC (#2446) carry the same breach; portfolio-self-manage step 0 derives a PROJ- row for every project and sets it open until the project completes',
  'migration merged; steward deploy closes the mirrors',
  '181 GitHub issues closed not_planned, 40 per steward tick (about 5 ticks); no D1 row changes; the 200 other roadmap issues and all 439 agent_issues mirrors are untouched',
  'UPDATE roadmap_mirror_scope SET mirrored = 1 (the steward reopens the linked issues, 40 per tick); the Rollback header restores the view (this decision row stays: decision_log is append-only)',
  'the open GitHub issue count stops including rows that can never close, and a breach has one ticket on GitHub',
  'GitHub open issues <= 650 within 2 hours of the steward deploy; portfolio_drift stays 0',
  'none',
  'd1:qnfo-audit roadmap_gh_links, roadmap_implementation, gh_issue_links, agent_issues (SELECT only); github issues list (open count and labels); offline node:sqlite suite qnfo-github-steward/issue-hygiene.test.mjs replays the steward against this file'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PORTFOLIO-NOT-ISSUES-1:') = 1);

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW v_portfolio_drift; DROP VIEW v_portfolio_drift_work; DROP VIEW v_portfolio_drift_roadmap; DROP TABLE issue_project_map; DROP TABLE roadmap_gh_links; DELETE FROM metric_registry WHERE metric = 'portfolio_drift'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'portfolio_drift'; DELETE FROM programs WHERE program_code IN ('QNFO.REACH','QNFO.PERSONAL'); restore projects from bak_20261018_projects_ps1
-- BACKUP: bak_20261018_projects_ps1
--
-- PORTFOLIO-SYNC-1 (owner directive 2026-10-18, verbatim): "THE SYSTEM SHALL AUTOMATICALLY POPULATE AND MAINTAIN ITS OWN FLEET
-- ROADMAP AND BACKLOG, AS WELL AS ISSUES/TASKS FOR ALL FIXES/REMEDIATION AND PLANNED ENHANCEMENTS/UPGRADES, WHICH SHALL BE
-- CANONICAL ACROSS THE FLEET AND ALWAYS IN-SYNC WITH GITHUB ASSETS AND ISSUE/PROJECT TRACKING. THE SYSTEM SHALL MANAGE ITS OWN
-- PORTFOLIO, ITS OWN PROGRAMS, AND ITS OWN PROJECTS AUTOMATICALLY."
--
-- Measured 2026-10-18 ~10:00Z, before this change:
--   * portfolios 1 / programs 3 / projects 21, all hand-written 2026-07-13..; 0 of 30 live workers had a project; 7 projects
--     named a GitHub repo that returns 404 (QNFO/qnfo-rsch x3, extended-cosmology, cfpe-*, qnfo-100yr-forecast) and
--     QNFO.RSCH.APH was 'active' on an archived repo.
--   * roadmap_implementation 141 rows, 117 not verified, 0 on GitHub. GitHub QNFO/qnfo-workers: 0 milestones, org 0 Projects v2.
--   * 20 metrics in breach (v_metric_trigger_state hit=1) with no roadmap objective.
-- After: qnfo-github-steward (0.4.0) derives projects from service_registry + portfolio_repos, maps every open issue to a
-- project/program/kind, writes metric breaches as roadmap objectives, and mirrors programs (labels), projects (milestones),
-- issues and roadmap items to GitHub every 10 minutes. D1 stays authoritative; v_portfolio_drift / portfolio_drift grade it.

CREATE TABLE IF NOT EXISTS bak_20261018_projects_ps1 AS SELECT * FROM projects;

INSERT OR IGNORE INTO programs (program_code, portfolio_code, name, description) VALUES
 ('QNFO.REACH', 'QNFO', 'Reach & Distribution', 'Social, subscribers, outreach, signal and idea intake: the fleet''s audience-facing surfaces'),
 ('QNFO.PERSONAL', 'QNFO', 'Personal Twin', 'Personal-life workers; issues and repos are mirrored by name only (PERSONAL-QNFO-SEPARATION-1)');

ALTER TABLE projects ADD COLUMN source TEXT;
ALTER TABLE projects ADD COLUMN owner_service TEXT;
ALTER TABLE projects ADD COLUMN gh_milestone INTEGER;

UPDATE projects SET source = 'legacy' WHERE source IS NULL;
UPDATE projects SET github_repo = 'QNFO/qnfo-workers', updated_at = datetime('now') WHERE github_repo = 'QNFO/qnfo-rsch';
UPDATE projects SET status = 'archived', completed_at = datetime('now'), updated_at = datetime('now') WHERE project_code IN ('CFPE-FORECAST', 'QNFO.RSCH.APH') AND status = 'active';

CREATE TABLE IF NOT EXISTS issue_project_map (
  issue_id INTEGER PRIMARY KEY,
  project_code TEXT NOT NULL,
  program_code TEXT NOT NULL,
  kind TEXT NOT NULL,
  synced_milestone INTEGER,
  synced_labels TEXT,
  gh_node TEXT,
  gh_item TEXT,
  updated_at TEXT,
  synced_at TEXT
);

CREATE TABLE IF NOT EXISTS roadmap_gh_links (
  roadmap_id INTEGER PRIMARY KEY,
  gh_number INTEGER NOT NULL UNIQUE,
  gh_state TEXT,
  d1_status TEXT,
  project_code TEXT,
  gh_node TEXT,
  gh_item TEXT,
  synced_at TEXT
);

CREATE VIEW IF NOT EXISTS v_portfolio_drift_work AS
  SELECT 'worker-no-project' AS kind, s.service AS ref, 'live worker without an active project' AS detail
    FROM service_registry s LEFT JOIN projects p ON p.project_code = 'W.' || s.service AND p.status = 'active'
   WHERE s.kind = 'worker' AND s.state = 'live' AND p.project_code IS NULL
  UNION ALL
  SELECT 'project-no-milestone', p.project_code, p.name FROM projects p WHERE p.status = 'active' AND p.gh_milestone IS NULL
  UNION ALL
  SELECT 'issue-unplaced', CAST(l.issue_id AS TEXT), 'GitHub #' || l.gh_number || ' has no project milestone'
    FROM gh_issue_links l JOIN agent_issues a ON a.id = l.issue_id AND a.status = 'open'
    LEFT JOIN issue_project_map m ON m.issue_id = l.issue_id LEFT JOIN projects p ON p.project_code = m.project_code
   WHERE m.issue_id IS NULL OR p.gh_milestone IS NULL OR m.synced_milestone IS NOT p.gh_milestone;

CREATE VIEW IF NOT EXISTS v_portfolio_drift_roadmap AS
  SELECT 'roadmap-unmirrored' AS kind, CAST(r.id AS TEXT) AS ref, r.item AS detail FROM roadmap_implementation r LEFT JOIN roadmap_gh_links g ON g.roadmap_id = r.id
   WHERE g.roadmap_id IS NULL AND r.status NOT IN ('verified','enforced-verified','violated-remediated','retired')
  UNION ALL
  SELECT 'roadmap-state', CAST(r.id AS TEXT), 'D1 ' || r.status || ' vs GitHub #' || g.gh_number || ' ' || COALESCE(g.gh_state, '?')
    FROM roadmap_implementation r JOIN roadmap_gh_links g ON g.roadmap_id = r.id
   WHERE (r.status NOT IN ('verified','enforced-verified','violated-remediated','retired')) <> (COALESCE(g.gh_state, '') = 'open')
  UNION ALL
  SELECT 'roadmap-unplaced', CAST(g.roadmap_id AS TEXT), 'GitHub #' || g.gh_number || ' has no project milestone'
    FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id
    LEFT JOIN projects p ON p.project_code = g.project_code
   WHERE r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND (p.gh_milestone IS NULL OR p.status <> 'active');

-- D1 rejects a compound SELECT over 5 terms, so the graded view unions two sub-views.
CREATE VIEW IF NOT EXISTS v_portfolio_drift AS
  SELECT kind, ref, detail FROM v_portfolio_drift_work
  UNION ALL
  SELECT kind, ref, detail FROM v_portfolio_drift_roadmap;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('portfolio_drift', 'operational', 'lagging', 'count(v_portfolio_drift) after each portfolio sync tick: live workers without a project, active projects without a GitHub milestone, mirrored open issues not placed in their project milestone, open roadmap items not on GitHub, roadmap items whose GitHub state differs', 'qnfo-audit.v_portfolio_drift', 'measured at first converged tick (2026-10-18)', '0', 'qnfo-github-steward', 'analytics_metric_triggers portfolio_drift -> agent_issues', '10m', '> 0', '> 25', 'PENDING', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('portfolio_drift', 'Portfolio drift: projects, issues or roadmap disagree with GitHub', 'registry', 'gt', 0, 3,
 'Pillar autonomy (PORTFOLIO-SYNC-1). Read SELECT kind, ref, detail FROM v_portfolio_drift and GET https://qnfo-github-steward.q08.workers.dev/portfolio (errors[]). qnfo-github-steward converges every 10 minutes at bounded per-tick caps, so drift that persists is a refused or failing case: a GitHub 4xx on milestone/label/issue writes (token scope, rate limit), a roadmap issue closed by hand on GitHub while D1 is open (D1 is authoritative; it is reopened), or a degenerate source (service_registry or portfolio_repos under 10 rows: derivation refuses to retire). Done: portfolio_drift = 0 at two refreshes.',
 'qnfo-github-steward', 'agent_issues', 6, 1, 'PORTFOLIO-SYNC-1 (migrations/2026-10-18-portfolio-sync.sql)');

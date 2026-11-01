-- PORTFOLIO-OPEN-MIRRORS-1 (#2052, agent_issues 2972, charter pillar autonomy).
-- Live 2026-11-01: 11 of 15 issue-unplaced rows are closed GitHub mirrors of
-- high-priority D1 issues retained by ISSUE-ROLLUP-1. psIssues only places open
-- mirrors. State disagreements remain the responsibility of v_tracker_drift.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: gh_issue_links
-- Source rows remain unchanged; rollback restores the original view.
-- Rollback: DROP VIEW IF EXISTS v_portfolio_drift_work; CREATE VIEW v_portfolio_drift_work AS SELECT 'worker-no-project' AS kind, s.service AS ref, 'live worker without an active project' AS detail FROM service_registry s LEFT JOIN projects p ON p.project_code = 'W.' || s.service AND p.status = 'active' WHERE s.kind = 'worker' AND s.state = 'live' AND p.project_code IS NULL UNION ALL SELECT 'project-no-milestone', p.project_code, p.name FROM projects p WHERE p.status = 'active' AND p.gh_milestone IS NULL UNION ALL SELECT 'issue-unplaced', CAST(l.issue_id AS TEXT), 'GitHub #' || l.gh_number || ' has no project milestone' FROM gh_issue_links l JOIN agent_issues a ON a.id = l.issue_id AND a.status = 'open' LEFT JOIN issue_project_map m ON m.issue_id = l.issue_id LEFT JOIN projects p ON p.project_code = m.project_code WHERE m.issue_id IS NULL OR p.gh_milestone IS NULL OR m.synced_milestone IS NOT p.gh_milestone; UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied' WHERE control = 'portfolio-open-mirror-milestones'; UPDATE control_alternate_probes SET enabled = 0 WHERE control = 'portfolio-open-mirror-milestones';

DROP VIEW IF EXISTS v_portfolio_drift_work;
CREATE VIEW v_portfolio_drift_work AS
  SELECT 'worker-no-project' AS kind, s.service AS ref, 'live worker without an active project' AS detail
    FROM service_registry s LEFT JOIN projects p ON p.project_code = 'W.' || s.service AND p.status = 'active'
   WHERE s.kind = 'worker' AND s.state = 'live' AND p.project_code IS NULL
  UNION ALL
  SELECT 'project-no-milestone', p.project_code, p.name FROM projects p WHERE p.status = 'active' AND p.gh_milestone IS NULL
  UNION ALL
  SELECT 'issue-unplaced', CAST(l.issue_id AS TEXT), 'GitHub #' || l.gh_number || ' has no project milestone'
    FROM gh_issue_links l JOIN agent_issues a ON a.id = l.issue_id AND a.status = 'open'
    LEFT JOIN issue_project_map m ON m.issue_id = l.issue_id LEFT JOIN projects p ON p.project_code = m.project_code
   WHERE l.gh_state = 'open'
     AND (m.issue_id IS NULL OR p.gh_milestone IS NULL OR m.synced_milestone IS NOT p.gh_milestone);

INSERT OR IGNORE INTO control_registry
  (control, location, kind, guards_against, critical_path, disposition,
   disposition_state, alternate_path, evidence, issue_id)
VALUES
  ('portfolio-open-mirror-milestones', 'qnfo-audit.v_portfolio_drift_work',
   'filter', 'false milestone drift for intentionally closed roll-up mirrors', 0,
   'keep', 'applied',
   'v_tracker_drift independently measures issue-state disagreement; reopened mirrors regain milestone checks.',
   'PORTFOLIO-OPEN-MIRRORS-1: live D1 found 11 closed high-priority mirrors with stale milestone 72 vs project milestone 62. psIssues reads only open mirrors.',
   2972);

INSERT OR IGNORE INTO control_alternate_probes
  (control, probe_sql, window_note, enabled)
VALUES
  ('portfolio-open-mirror-milestones',
   'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''v_tracker_drift'' AND sql LIKE ''%issue-state%'') THEN ''ok'' ELSE ''tracker state checks missing'' END AS observed',
   'Hourly: retain the independent tracker state view while milestone checks apply only to open mirrors.', 1);

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id)
VALUES
  ('portfolio-program-mirror-drift', 'Portfolio drift never converges after otherwise successful ticks',
   'Manager-pinned W.<program> rows had no project; closed roll-up mirrors were still graded for milestones.',
   'qnfo-github-steward 0.10.7 derives program projects; PORTFOLIO-OPEN-MIRRORS-1 grades milestones only for open mirrors.',
   'fm-portfolio-program-mirror-drift', 'fm-portfolio-program-mirror-drift', '2026-11-01', 2972);

INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, max_attempts,
   escalate_to, expected_cadence_h, status)
VALUES
  ('fm-portfolio-program-mirror-drift', 'Portfolio sync has completed after canonical deployment',
   'Detect recurrent portfolio drift; repair the steward or its source rather than closing on a stale metric.',
   'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_portfolio_drift',
   'd1-query', 3, 'qnfo-github-steward', 1, 'active');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
   capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:QNFO.OPS', 'Closed roll-up mirrors do not require individual milestones.',
  'PORTFOLIO-OPEN-MIRRORS-1: derive pinned program projects and measure milestones only for open mirrors.',
  'Live D1: four pinned program rows lacked projects; eleven closed mirrors retained stale milestones.',
  'Pending canonical deployment and two portfolio refreshes at zero drift.',
  'Program projects and portfolio milestone drift; tracker state checks are unchanged.',
  'Revert steward 0.10.7 and run this migration rollback.',
  'Portfolio convergence preserves manager program ownership and roll-up semantics.',
  'All 15 observed persistent issue-unplaced rows clear after deployment and migration; portfolio_drift remains 0 at two refreshes.',
  'No direct external reach change.',
  'Read-only D1; offline sync, idempotency, reactivation, scope and rollback tests.'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PORTFOLIO-OPEN-MIRRORS-1:%');

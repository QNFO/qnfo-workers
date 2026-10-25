-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = '63990a86-fd8f-4afb-bd25-b3d703a26c64'
-- SESSION-CLOSEOUT-20261025-DOCS (pillar core; SESSION-RECORD-1).
INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
)
SELECT
  '63990a86-fd8f-4afb-bd25-b3d703a26c64',
  'core/documentation',
  'GitHub Copilot',
  'Updated the repository README with its current layout and test workflow; documented exported helpers in the suite runner and compatibility scanner and clarified the scanner look-ahead.',
  'Kept the change scoped to documentation and repository tooling. No Worker source or Wrangler configuration changed, so the canonical Worker deployment has no target; the session closeout row is applied by the migration runner after merge.',
  'README.md, scripts/run-suites.mjs, scripts/compat-risk-scan.mjs, migrations/2026-10-25-session-closeout-63990a86.sql',
  '',
  'No production Worker deployment; no Worker entrypoint or Wrangler config changed.',
  'Targeted Node.js suites passed: scripts/run-suites.test.mjs (59 tests) and scripts/compat-risk-scan.test.mjs (33 tests). git diff --check passed. The closeout migration is pending the canonical merge/apply workflow.',
  1.0, 3, 3,
  '2026-10-25T18:49:25Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM session_records
  WHERE session_id = '63990a86-fd8f-4afb-bd25-b3d703a26c64'
);

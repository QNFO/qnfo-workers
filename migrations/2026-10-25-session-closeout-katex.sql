-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = '7efa1050-a5f8-4e22-baf1-88e9aa07a8e5'
-- SESSION-CLOSEOUT-KATEX-1 (pillar core; SESSION-RECORD-1).
INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
) VALUES (
  '7efa1050-a5f8-4e22-baf1-88e9aa07a8e5',
  'core/dependency-maintenance',
  'GitHub Copilot',
  'Updated qnfo-pdf KaTeX to 0.19.1, found the deployed worker still embedded KaTeX 0.16.21, then regenerated the committed runtime bundle and mirror and bumped worker version to 1.7.2.',
  'Kept folded and retired workers untouched; updated the qnfo-pdf bundle because the canonical deploy consumes worker.js rather than the npm lockfile.',
  'qnfo-pdf/package.json, qnfo-pdf/package-lock.json, qnfo-pdf/bundle-katex.mjs, qnfo-pdf/worker.js, qnfo-pdf/deployed-current.worker.js, qnfo-pdf/README.md, migrations/2026-10-25-session-closeout-katex.sql',
  'PR #4110; follow-up KaTeX bundle and closeout PR',
  'The lockfile-only update was merged as #4110; the follow-up upgrades the actual bundled runtime. Production rollout is performed and verified through the canonical deployment path.',
  1.0, 2, 2,
  '2026-10-25T15:40:05Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
);

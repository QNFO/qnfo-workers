-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = 'cfde3500-8753-44c4-900f-dfe24591b0d1'
-- SESSION-CLOSEOUT-ARCHITECTURE-REVIEW-1 (pillar autonomy; SESSION-RECORD-1).
INSERT OR IGNORE INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
) VALUES (
  'cfde3500-8753-44c4-900f-dfe24591b0d1',
  'autonomy/fleet-reliability',
  'GitHub Copilot',
  'Aligned qnfo-evolve WIP recovery with the planner shared threshold and active-task accounting. Updated regression coverage and documentation, synchronized the branch with main, and corrected a stale folded-advisor manifest assertion exposed by CI. PR #4136 merged and deployed; qnfo-evolve 0.2.6 and its live WIP report were verified.',
  'Kept the change focused in qnfo-evolve. The architecture freshness recommendation was already served by the dynamic architecture API. The separate code-task-yield improvement shipped through PR #4147 and its canonical deployment; it was not duplicated here.',
  'qnfo-evolve/worker.js, qnfo-evolve/deployed-current.worker.js, qnfo-evolve/evolve.test.mjs, qnfo-evolve/README.md, migrations/2026-10-25-evolve-wip-planner-alignment.sql, scripts/runner-pin-annotations.test.mjs',
  'PR #4136; squash merge b95341ad336dc9f962f74410177bee51fbf5a0e9',
  'qnfo-evolve 0.2.6 verified live at /health and /report; CI migration run 40228698273 applied the WIP alignment migration successfully (6 statements).',
  'No implementation or deployment steps remain. The live report shows shared WIP ceiling 40 and active WIP 21; the code-task-yield change from PR #4147 is deployed.',
  1.0, 3, 3,
  '2026-10-25T15:40:33.853Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
);

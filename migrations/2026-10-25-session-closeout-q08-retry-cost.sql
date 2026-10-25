-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = 'a2e8b8f1-8f5e-48d5-a565-eb6bec8f5f3b'
-- SESSION-CLOSEOUT-Q08-RETRY-COST-1 (pillar cost; SESSION-RECORD-1).
INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
)
SELECT
  'a2e8b8f1-8f5e-48d5-a565-eb6bec8f5f3b',
  'cost/q08-retry-progress',
  'GitHub Copilot',
  'Prevented repeated verification of exact rejected drafts while retaining full verification for changed drafts; implemented, tested, and delivered q08-signal-engine 0.35.1.',
  'Stopped only exact previously rejected text within one repair invocation; kept independent verification of changed drafts and all publication gates. The exact-cycle test saves 4 of 8 fact-check calls on a no-op revision, but aggregate live incidence and savings remain unmeasured.',
  'migrations/2026-10-25-q08-retry-progress.sql, q08-signal-engine/README.md, q08-signal-engine/deployed-current.worker.js, q08-signal-engine/retry-progress.test.mjs, q08-signal-engine/verify.test.mjs, q08-signal-engine/worker.js',
  'PR #4168; merge commit 465a9cce3715f5633bca1b647dda0c71b1ef8b1b',
  'Canonical deploy run 40226242975 succeeded; migration run 40226243022 succeeded (file hash 847b25a88545); live q08.org/health reported 0.35.1.',
  'All Q08 suites and targeted guards passed. Differential exact-cycle coverage saves 4/8 fact-check calls for the no-op fixture; live exact-cycle incidence and aggregate savings remain unmeasured, so no production cost reduction is claimed.',
  1.0, 3, 3,
  '2026-10-25T19:01:26Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM session_records
  WHERE session_id = 'a2e8b8f1-8f5e-48d5-a565-eb6bec8f5f3b'
);

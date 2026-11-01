-- ISSUE-AGE-24H-REPAIR-1 (issue 1001017, autonomy): issue 2521 has no plan, claim, live task, or progressing diagnosis.
-- Its only code-task marker names the completed idea-hub handoff; trusted planner intake excludes the issue while it remains.
-- Retire only that stale marker, preserving the historical handoff and all issue/claim/doctor state.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_issue_2521_planner_reentry
-- Rollback: UPDATE agent_issues SET description = (SELECT description FROM bak_20261101_issue_2521_planner_reentry WHERE id = 2521) WHERE id = 2521 AND EXISTS (SELECT 1 FROM bak_20261101_issue_2521_planner_reentry WHERE id = 2521); DROP TABLE IF EXISTS bak_20261101_issue_2521_planner_reentry;

CREATE TABLE IF NOT EXISTS bak_20261101_issue_2521_planner_reentry AS
SELECT id, description FROM agent_issues WHERE id = 2521;

UPDATE agent_issues AS a
SET description = replace(a.description,
  'code-task: repo=qnfo-workers path=idea-hub/worker.js',
  'completed task handoff: repo=qnfo-workers path=idea-hub/worker.js')
WHERE a.id = 2521
  AND a.status = 'open'
  AND instr(a.description, 'code-task: repo=qnfo-workers path=idea-hub/worker.js') > 0
  AND EXISTS (SELECT 1 FROM issue_age_actions x WHERE x.issue_id = a.id AND x.rung = '24h')
  AND NOT EXISTS (SELECT 1 FROM issue_plans p WHERE p.issue_id = a.id)
  AND NOT EXISTS (
    SELECT 1 FROM code_tasks k
    WHERE (k.goal LIKE '[issue #' || a.id || ']%' OR k.id = 'ct_im' || a.id)
      AND k.status NOT IN ('merged', 'closed', 'superseded', 'publish_failed', 'needs_human', 'failed', 'reverted')
      AND (k.updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')
           OR k.lease_until > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM work_claims w
    WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id)
      AND w.released_at IS NULL
      AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  )
  AND NOT EXISTS (
    SELECT 1 FROM breach_diagnoses d
    WHERE d.issue_id = a.id
      AND d.mode = 'on'
      AND d.state IN ('queued', 'applied', 'verifying')
      AND d.action_ref IS NOT NULL
      AND d.action_kind <> 'none'
      AND d.lease_until > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      AND d.last_progress_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')
  );

INSERT INTO decision_log (
  actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
  capability_gain, predicted_outcome, reach_gain, surfaces_tested
)
SELECT 'copilot:1001017',
  'Issue 2521 has no plan and its code-task marker names a completed handoff, not a live doer.',
  'Retire the stale issue 2521 handoff marker for trusted planner reconsideration.',
  'issue_age_actions rung 24h records no live task, claim, or progressing diagnosis; issue_plans has no row; ct_im2521 is terminal failed.',
  'Issue remains open and eligible for the planner on its next permitted run.',
  'Issue 2521 description only; no task, claim, diagnosis, or close state is changed.',
  'Restore the original description from bak_20261101_issue_2521_planner_reentry; the decision log remains append-only.',
  'A completed handoff no longer suppresses planner intake for this overdue issue.',
  'The trusted planner can reconsider issue 2521 without bypassing its normal refusal, retry, and claim checks.',
  'No direct external reach gain.',
  'Read issue_age_actions, issue_plans, agent_issues, code_tasks, work_claims, and breach_diagnoses.'
WHERE EXISTS (
    SELECT 1 FROM bak_20261101_issue_2521_planner_reentry b
    JOIN agent_issues a ON a.id = b.id
    WHERE b.id = 2521
      AND instr(b.description, 'code-task: repo=qnfo-workers path=idea-hub/worker.js') > 0
      AND a.description = replace(b.description,
        'code-task: repo=qnfo-workers path=idea-hub/worker.js',
        'completed task handoff: repo=qnfo-workers path=idea-hub/worker.js')
  )
  AND NOT EXISTS (
    SELECT 1 FROM decision_log
    WHERE action = 'Retire the stale issue 2521 handoff marker for trusted planner reconsideration.'
  );

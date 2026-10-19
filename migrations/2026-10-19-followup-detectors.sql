-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_followup_detectors
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_followup_detectors b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261019_followup_detectors b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_followup_detectors b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_followup_detectors)
-- spof-review: removes a blind spot in a standing detector and adds no single point of failure
--
-- PR2603-FOLLOWUP-DETECTORS-1 (2026-10-19, pillar autonomy; independent review of PR 2603, RESOLVE-ALL-OPEN-1).
-- WHY
-- 1. fm-code-publish-waits-for-push (migrations/2026-10-12-merge-side-root-causes.sql) counted ready_to_publish code tasks with
--    WHERE repo = 'qnfo-workers', a verbatim compare. Six tasks written with the owner-qualified slug QNFO/qnfo-workers sat in
--    ready_to_publish for 14 hours (2026-10-18 14:49Z to 2026-10-19 05:05Z) and the detector read 0 (pass) throughout: the guard
--    for "a verified task waits for its publish" could not see the tasks that were waiting. The repo predicate adds nothing the
--    status and age do not already say (every ready_to_publish task waits for the publisher whichever repo it names), and
--    REPO-SLUG-PUBLISH-1 now keeps the column bare, so the predicate is dropped rather than normalised.
-- 2. fm-code-task-repo-slug (migrations/2026-10-19-resolve-code-task-publish-slug.sql) was inserted without module. The other live
--    fm-* detectors (measured 2026-10-19) carry module 'failure-mode'; this row read NULL, so a query by module missed it.
-- Both rows are standing detectors (issue_id NULL by design). The probe change clears next_due_at so the consumer's next run reads the
-- new probe at once (a NULL next_due_at is due); status, attempts and last_verdict are untouched.

CREATE TABLE IF NOT EXISTS bak_20261019_followup_detectors AS SELECT class, verify_probe, module, next_due_at FROM remediation_contracts WHERE class IN ('fm-code-publish-waits-for-push', 'fm-code-task-repo-slug');

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''ready_to_publish'' AND updated_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) AS TEXT) AS observed',
  next_due_at = NULL
WHERE class = 'fm-code-publish-waits-for-push' AND verify_probe LIKE '%repo = ''qnfo-workers''%';

UPDATE remediation_contracts SET module = 'failure-mode' WHERE class = 'fm-code-task-repo-slug' AND module IS NULL;

-- WORKFLOW-FAILED-ROOT-PROBE-1 (2026-10-28, pillar autonomy; agent_issues 1000558, GitHub #5003).
-- Finding (read-only, qnfo-audit + git, 2026-10-28): the WORKFLOW-FAILED-1 family reopens because deploy-gate (issue 100412) goes red on main after a merge:
-- MERGE-STREAMLINE-1 (PR 4541, owner directive 2026-10-26 "DEPLOY GATE REPEATEDLY FAILS. GET RID OF IT!") made every deploy-gate step continue-on-error on pull_request, so
-- a violation (for example swallowed-catch in qnfo-memory-mcp, run 40680554551, fixed by the follow-up commit 40683353100 at 11:52Z) merges and turns the strict push run red.
-- That policy is the owner's; this file does not reverse it. It rewrites the closing probe, which PROBE-REVIEW-1 judged self-confirming (it read the family's own lifecycle only),
-- so the contract measures the definition of done: no workflow is red on main now, no WORKFLOW-FAILED-1 issue is open, none opened or reopened in 24 hours, and the issue is over 24 hours old.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT verify_probe FROM bak_20261028_wfroot_contract WHERE class = 'issue-1000558'), status = (SELECT status FROM bak_20261028_wfroot_contract WHERE class = 'issue-1000558') WHERE class = 'issue-1000558';

CREATE TABLE IF NOT EXISTS bak_20261028_wfroot_contract AS SELECT class, status, last_verdict, verify_probe FROM remediation_contracts WHERE class = 'issue-1000558';

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM workflow_main_state WHERE conclusion IN (''failure'', ''timed_out'', ''startup_failure'')) + (SELECT COUNT(*) FROM agent_issues WHERE title LIKE ''WORKFLOW-FAILED-1:%'' AND status = ''open'') + (SELECT COUNT(*) FROM issue_lifecycle l JOIN agent_issues b ON b.id = l.issue_id WHERE b.title LIKE ''WORKFLOW-FAILED-1:%'' AND l.event IN (''opened'', ''reopened'') AND l.ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) + (SELECT COUNT(*) FROM agent_issues WHERE id = 1000558 AND created_at >= (CAST(strftime(''%s'', ''now'') AS INTEGER) - 86400) * 1000) AS TEXT) AS observed',
  verify_transport = 'd1-query',
  status = 'active',
  last_verdict = NULL
WHERE class = 'issue-1000558' AND status = 'probe-review-refused';

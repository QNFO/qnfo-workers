-- RESEARCH-CONFIG-AUDIT-REACTIVATE-1 (2026-10-26, pillar autonomy; agent_issues 100626): PR 4675 repaired the words of the issue 100626 probe, but its UPDATE was guarded with status = 'active'
-- and the fleet had already moved the contract to superseded ("probe-unusable: no machine-executable probe", last_attempt_at 2026-10-26 16:36:47Z, after the runner refused the first
-- text on its first run), so the repair matched no row (migration_runs 2026-10-26 16:38:55Z ok, statements 1, remediation_contracts.verify_probe unchanged). This file writes the same
-- repair without that guard and returns the contract to active so the runner reads it again. It touches only the contract of issue 100626 and only while the issue is open.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)', verify_probe = replace(verify_probe, 'the audit trigger for changes is missing', 'the update audit trigger is missing') WHERE class = 'issue-100626'

UPDATE remediation_contracts SET status = 'active', verify_probe = replace(verify_probe, 'the update audit trigger is missing', 'the audit trigger for changes is missing'), last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now') WHERE class = 'issue-100626' AND status <> 'closed' AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100626 AND a.status = 'open');

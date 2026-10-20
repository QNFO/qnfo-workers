-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'issue-100277';
-- PROBE-NEEDED-1 (agent_issues 100283): issue 100277 (MODEL-AB-REGRESSION-1, errata-hub kimi-k2.6) had only a
-- superseded contract, so nothing measured it. Its description names its closer: the latest model_ab_runs row for
-- errata-hub with post_model kimi-k2.6 passes. charter-pillar: autonomy.
INSERT OR IGNORE INTO remediation_contracts (class, verify_probe, verify_transport, status)
VALUES ('issue-100277', 'SELECT 1', 'd1-query', 'active');
UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''pass'' AS expected, (SELECT verdict FROM model_ab_runs WHERE worker = ''errata-hub'' AND post_model = ''@cf/moonshotai/kimi-k2.6'' ORDER BY id DESC LIMIT 1) AS observed',
       verify_transport = 'd1-query',
       status = 'active',
       last_verdict = NULL,
       attempts = 0,
       deferred_since = NULL,
       next_due_at = datetime('now')
 WHERE class = 'issue-100277';

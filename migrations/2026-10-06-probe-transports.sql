-- PROBE-TRANSPORTS-1 (2026-10-06, pillar autonomy; owner directive OWNER-NO-LOOSE-ENDS-1). qnfo-fleet-control 0.4.141 lets
-- remediation contracts check more than one table: transport d1-query@portfolio-state (the PORTFOLIO binding the kernel
-- already holds) and external-https (public sources outside the fleet: GitHub, PyPI, Zenodo, DOI, OpenAlex, Crossref,
-- DataCite; already trusted in transport_trust as off-zone and independent). This file:
--   1. trusts d1-query@portfolio-state, the same class as d1-query@personal-life (a read-only literal SELECT on a bound D1);
--   2. retires the placeholder contracts that can never measure anything. Measured 2026-10-06 11:40Z: 92 contracts held
--      the literal probe 'needs-machine-probe' (a placeholder written when an issue was filed without a probe); 88 sit on
--      closed issues and 1 on a wontfix issue, none has a verification row, and the tick never selects that status. They
--      are marked superseded with the reason; nothing is deleted. The 3 on open issues (1996, 2041, 2042) stay: those
--      issues are claimed by a session that is writing their probes.
-- Idempotent: INSERT OR IGNORE and a guarded UPDATE.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM transport_trust WHERE transport = 'd1-query@portfolio-state'; UPDATE remediation_contracts SET status = 'needs-machine-probe', last_verdict = NULL WHERE status = 'superseded' AND last_verdict LIKE 'superseded: PROBE-TRANSPORTS-1%';

INSERT OR IGNORE INTO transport_trust (transport, observation_class, runtime_observable, independent, trusted, note, ts)
VALUES ('d1-query@portfolio-state', 'data-plane-read', 0, 1, 1, 'PROBE-TRANSPORTS-1 (2026-10-06): qnfo-fleet-control remediation tick runs the literal read-only SELECT probe against portfolio-state through its PORTFOLIO binding', datetime('now'));

UPDATE remediation_contracts
SET status = 'superseded',
    last_verdict = 'superseded: PROBE-TRANSPORTS-1 placeholder (verify_probe was the literal needs-machine-probe) on an issue that is ' || COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = remediation_contracts.issue_id), 'missing') || '; it never ran and has no verification row',
    last_attempt_at = datetime('now')
WHERE status = 'needs-machine-probe'
  AND verify_probe = 'needs-machine-probe'
  AND COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = remediation_contracts.issue_id), 'missing') IN ('closed', 'resolved', 'wontfix', 'missing')
  AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.class = remediation_contracts.class);

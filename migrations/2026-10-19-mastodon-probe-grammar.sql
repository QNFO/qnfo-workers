-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"url": "https://mstdn.science/api/v1/accounts/lookup?acct=QNFO", "status": 200, "contains": "\"verified_at\":\"20"}', last_verdict = NULL, attempts = 0, next_due_at = datetime('now') WHERE class = 'issue-2925' AND instr(verify_probe, '"check"') > 0;
-- MASTODON-PROBE-GRAMMAR-1 (2026-10-19, charter pillar: autonomy; agent_issues 2925 INTEG-MASTODON-VERIFY-1).
-- Correction of migrations/2026-10-19-probe-needed-live-paths.sql. That file rewrote the issue-2925 probe in the grammar of scripts/remediation_consumer.py (url, status, contains), which belongs to the
-- runner-https transport for fleet hosts. A contract with transport external-https is run by qnfo-fleet-control (rtHttpSpec), whose grammar is url, method, check and expected; the contract read
-- probe-not-machine-executable at 23:30Z (attempts 3). The earlier text (check body-contains, expected present) was the right grammar, and its original refusal was a different cause: rtHttpSpec refused the host
-- (host not allowed: mstdn.science). qnfo-fleet-control 0.41.2 adds that one public host to RT_HTTP_HOSTS (https, GET or HEAD, no credentials, no redirect), so the probe is restated in the runner grammar.
-- It reads the public account lookup and passes when any profile field carries a verified_at; it cannot tell which link was verified (the field value and verified_at are siblings in an array), so the
-- engagement half of the issue and the choice of link stay with the issue.
UPDATE remediation_contracts SET
  verify_probe = '{"url": "https://mstdn.science/api/v1/accounts/lookup?acct=QNFO", "method": "GET", "check": "body-contains:\"verified_at\":\"20", "expected": "present"}',
  verify_transport = 'external-https',
  last_verdict = NULL, attempts = 0, next_due_at = datetime('now')
 WHERE class = 'issue-2925' AND instr(verify_probe, '"contains"') > 0;

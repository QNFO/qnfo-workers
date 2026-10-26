-- RESEARCH-CONFIG-AUDIT-PROBE-FIX-1 (2026-10-26, pillar autonomy; agent_issues 100626): the doer probe of issue 100626 written by migrations/2026-10-26-research-config-audit.sql
-- carried the failure text "the update audit trigger is missing". The runners' write-keyword guard (scripts/remediation_consumer.py WRITE_KW) scans string literals too and
-- refuses any probe whose text holds "update ", so the contract read probe-not-machine-executable on its first run (remediation_contracts.last_verdict, 2026-10-26 16:32Z) and
-- could never close the issue. Only the words of that one failure text change: the probe measures exactly what it measured. migrations/research-config-audit.test.mjs now runs
-- every probe of the first file through the same keyword list, which it did not before.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'the audit trigger for changes is missing', 'the update audit trigger is missing'), last_verdict = NULL WHERE class = 'issue-100626'

UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'the update audit trigger is missing', 'the audit trigger for changes is missing'), last_verdict = NULL, attempts = 0, next_due_at = datetime('now') WHERE class = 'issue-100626' AND status = 'active' AND instr(verify_probe, 'the update audit trigger is missing') > 0;

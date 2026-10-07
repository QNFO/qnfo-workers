-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'needs-machine-probe', verify_transport = 'd1-query', action = 'needs-machine-probe', status = 'needs-machine-probe', expected_cadence_h = 24 WHERE class = 'issue-2105'
-- PUB-GATE-LOOP-1 (2026-10-07, agent_issues 2105, pillar research). Gives issue 2105 (PUB-GATE-DEAD-1) its closing probe.
-- Measured cause: the "shadow publication gate" was one hand-run pass (living-paper.publication_gate_audit, all 464 rows
-- run_id shadow-20261004, 09:13:30-09:13:46 on 2026-10-04, written by the PUBLISH-GATE-1 session, session_records row 50,
-- which deferred enforcement), never a loop: no worker in the repository ever wrote publication_gate_audit or
-- papers.release_gate_*. Its 28 "no-quality-score" demotes come from qnfo-cloud-ops jobQualityScore writing only the first
-- 200 of 466 published papers (stmts.slice(0, 200), "scanned=466 rows=200" every day, graded ok). qnfo-cloud-ops 1.23.0
-- scores every paper and runs the gate daily in the 06:20 Amsterdam quality-score slot, at most 100 verdict changes a run.
-- The probe passes when every published paper carries a gate verdict, a verdict was written in the last 48 hours, and no
-- published paper holds a verdict that demands quarantine. It fails today (0 rows have release_gate_at), so it cannot pass
-- while the defect exists. Transport d1-query@living-paper is trusted since PROBE-PLANES-1 (migrations/2026-10-06-probe-planes.sql).
UPDATE remediation_contracts
SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM papers WHERE status = ''published'' AND release_gate_at IS NULL) = 0 AND (SELECT MAX(release_gate_at) FROM papers) >= strftime(''%Y-%m-%dT%H:%M:%S'', ''now'', ''-48 hours'') AND (SELECT COUNT(*) FROM papers WHERE status = ''published'' AND release_gate_reason LIKE ''quality:quarantine-candidate%'') = 0 THEN ''ok'' ELSE ''pending: ungated published='' || (SELECT COUNT(*) FROM papers WHERE status = ''published'' AND release_gate_at IS NULL) || '' newest verdict='' || COALESCE((SELECT MAX(release_gate_at) FROM papers), ''never'') || '' published quarantine-candidates='' || (SELECT COUNT(*) FROM papers WHERE status = ''published'' AND release_gate_reason LIKE ''quality:quarantine-candidate%'') END AS observed',
    verify_transport = 'd1-query@living-paper',
    action = 'qnfo-cloud-ops 1.23.0 PUB-GATE-LOOP-1: the daily quality-score sweep gates every published paper (release_gate_pass/at/reason, publication_gate_audit per changed verdict, quarantine under score 25 in enforce mode)',
    precondition = 'qnfo-cloud-ops /health VERSION >= 1.23.0 and one quality-score run after the deploy',
    escalate_to = 'qnfo-cloud-ops',
    expected_cadence_h = 24,
    status = 'active'
WHERE class = 'issue-2105';

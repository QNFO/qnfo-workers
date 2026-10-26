-- DRIFT-STUB-EXEMPT-1 (2026-10-26, fleet breach remediation, issue 99906 METRIC-TRIGGER-360-DRIFT-TOTAL). drift_total counts the unversioned entries in
-- qnfo-fleet-dashboard integrationView, and the two it lists, voice-stt and qnfo-workers, can never carry a version: voice-stt is an unmanaged worker with no
-- source directory in this repository (its /health answers {"ok":true}), and qnfo-workers is the retired repository-root stub (its /health answers 410 with status
-- retired). Their service_registry rows are rewritten each hour by discovery with version 'unknown', so a hand edit of the rows does not hold. ops_config
-- portfolio_gap_stub_services ('voice-stt,qnfo-workers', seeded by PORTFOLIO-GAP-DETECTORS-1) already names them as stubs; integrationView does not read it.
-- This file hands the one-file change to the code loop (ACT-BRIDGE-1): it appends a code-task and a code-anchor line to the issue, once.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = replace(description, char(10) || 'DRIFT-STUB-EXEMPT-1 (2026-10-26): integrationView must not count the stub services of ops_config portfolio_gap_stub_services as unversioned (voice-stt has no source and no version by design; qnfo-workers is the retired root stub, /health 410). Read the key with d1all(env.AUDIT, "SELECT value FROM ops_config WHERE key = ''portfolio_gap_stub_services''") and skip a node whose service is in the comma list when building the unversioned array; the drift object and drift_total keep counting every other unversioned or non-semver service. Add the case to qnfo-fleet-dashboard/integration-stub.test.mjs.' || char(10) || 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) || 'code-anchor: const unversioned = nodes.filter(function(n) {', '') WHERE id = 99906;

UPDATE agent_issues
SET description = description || char(10) || 'DRIFT-STUB-EXEMPT-1 (2026-10-26): integrationView must not count the stub services of ops_config portfolio_gap_stub_services as unversioned (voice-stt has no source and no version by design; qnfo-workers is the retired root stub, /health 410). Read the key with d1all(env.AUDIT, "SELECT value FROM ops_config WHERE key = ''portfolio_gap_stub_services''") and skip a node whose service is in the comma list when building the unversioned array; the drift object and drift_total keep counting every other unversioned or non-semver service. Add the case to qnfo-fleet-dashboard/integration-stub.test.mjs.' || char(10) || 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) || 'code-anchor: const unversioned = nodes.filter(function(n) {',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 99906
  AND status = 'open'
  AND instr(COALESCE(description, ''), 'DRIFT-STUB-EXEMPT-1') = 0;

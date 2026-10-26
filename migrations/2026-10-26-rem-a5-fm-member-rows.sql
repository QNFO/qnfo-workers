-- REM-A5-FM-MEMBER-ROWS-1 (2026-10-26, charter pillar autonomy; metric failure_modes_recurring, trigger 3072, ticket 3002).
-- WHAT WAS WRONG (read 2026-10-26 19:06Z, qnfo-audit): v_failure_mode_status lists 47 failure modes as recurring. Two of them read one row. fm-registry-live-absent ("a live registry row
-- whose worker_live_audit note is NOT_DEPLOYED", expected 0) and fm-standing-report-issue (expected 1, read 0) both count
--   service_registry qnfo-backlog-exec, kind member, state live, base_url https://qnfo-lifecycle.q08.workers.dev/backlog; worker_live_audit qnfo-backlog-exec http 404 NOT_DEPLOYED.
-- A member is a worker folded into a host: it runs as a route of the host and has no script of its own, so NOT_DEPLOYED is the correct audit answer for it and not an absence. The rest of
-- the fleet already reads it that way: qnfo-fleet-control counts a ghost only for (!r.kind || r.kind === "worker") (DRIFT_TOTAL_FORMULA, drift_total), and v_executor_roster probes the host of a
-- member (probe_worker). It is the only member row (service_registry kind not worker: cloudflare-mcp, an oauth-pending MCP server, and qnfo-backlog-exec). The two detectors were written before
-- the member kind existed (migrations/2026-10-11-autoaudit-actionable.sql, FOLD-KIT-1 and BACKLOG-FOLD-1 had left kind worker rows live for deleted scripts), so they never excluded it.
-- WHAT THIS CHANGES: both probes read kind worker rows only (COALESCE(s.kind, 'worker') = 'worker'). Nothing else in them changes, and neither contract is parked or re-armed:
--   * a deleted or folded script that is still registered live as a worker still reads 1 (the case the detectors exist for), including a null kind;
--   * a member whose HOST script is gone is still caught, because the host is a kind worker row whose own audit row reads NOT_DEPLOYED.
-- The suite proves the three cases against the live probe texts. Backup: bak_20261026_rem_a5_fm_probes. Expected at the next probes of the two contracts: observed 0 and 1.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261026_rem_a5_fm_probes b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_rem_a5_fm_probes)
-- spof-review: adds no cron, D1 trigger, external host or credential; two detector probes read one more column.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_fm_probes AS SELECT class, verify_probe FROM remediation_contracts WHERE class IN ('fm-registry-live-absent', 'fm-standing-report-issue');

UPDATE remediation_contracts
   SET verify_probe = replace(verify_probe, 's.state = ''live'' AND a.note = ''NOT_DEPLOYED''', 's.state = ''live'' AND COALESCE(s.kind, ''worker'') = ''worker'' AND a.note = ''NOT_DEPLOYED''')
 WHERE class IN ('fm-registry-live-absent', 'fm-standing-report-issue')
   AND instr(verify_probe, 's.state = ''live'' AND a.note = ''NOT_DEPLOYED''') > 0
   AND instr(verify_probe, 'COALESCE(s.kind') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a member row has no script of its own, so a NOT_DEPLOYED audit answer for it is correct; a detector for a registered-but-absent worker reads the rows that claim a script, as drift_total already does',
  'REM-A5-FM-MEMBER-ROWS-1: fm-registry-live-absent and fm-standing-report-issue read kind worker rows only',
  'v_failure_mode_status 2026-10-26 19:06Z: 47 recurring; both detectors counted service_registry qnfo-backlog-exec kind member state live (base_url qnfo-lifecycle /backlog) against worker_live_audit http 404 NOT_DEPLOYED; qnfo-fleet-control DRIFT_TOTAL ghost counts kind worker only; v_executor_roster probes the host of a member; qnfo-backlog-exec is the only member row',
  'applied by migration', 'two detector probes (remediation_contracts.verify_probe); no contract status, issue or worker changes', 'the Rollback line restores both probes from bak_20261026_rem_a5_fm_probes',
  'two failure modes stop reading a by-design 404', 'the next probes of fm-registry-live-absent and fm-standing-report-issue pass within 2 h (observed 0 and 1)', 'none',
  'd1:service_registry, worker_live_audit, remediation_contracts, v_failure_mode_status; code:qnfo-fleet-control DRIFT_TOTAL_FORMULA'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-FM-MEMBER-ROWS-1:%');

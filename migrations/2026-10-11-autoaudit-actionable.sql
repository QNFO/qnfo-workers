-- AUTOAUDIT-ACTIONABLE-1 (2026-10-11, pillar autonomy; owner directive 2026-10-11: "You shall always automatically audit and
-- remediate all issues, failure modes, open items, and root causes", sent with a screenshot of GitHub issue #52).
-- Measured 2026-10-11 08:07Z: #52 had been open for two weeks as a standing report, rewritten every run and never closed, while
-- every row it summarised was in its expected state: 28 SYNC (the 28 scripts in the account), 10 NOT_A_WORKER and 76
-- NOT_DEPLOYED, all 76 FOLDED/RETIRED directories or their old names. scripts/fleet-autoaudit.py now counts a marked absence
-- as expected and keeps #52 open only while an actionable finding exists (the D1 note stays NOT_DEPLOYED: qnfo-fleet-control,
-- qnfo-observability, qnfo-autonomy-scorer and trigger worker_removals_from_live_audit read it).
-- The same read found the one real defect: service_registry listed calendar-api and qnfo-backlog-exec as live, though both
-- were FOLDED into qnfo-lifecycle on 2026-10-06 and are absent from the account. They are marked retired (CLAUDE.md
-- OWNER-STANDING-GRANT-1: removal from registries, service_registry state retired), and a detector watches for a recurrence.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE service_registry SET state = 'live' WHERE service IN ('calendar-api', 'qnfo-backlog-exec'); DELETE FROM remediation_contracts WHERE class IN ('fm-registry-live-absent', 'fm-standing-report-issue'); DELETE FROM failure_modes WHERE fm_key IN ('registry-live-absent', 'standing-report-issue')
-- BACKUP: failure_modes

UPDATE service_registry SET state = 'retired', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE service IN ('calendar-api', 'qnfo-backlog-exec') AND state = 'live';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('standing-report-issue', 'the fleet self-audit kept GitHub #52 open for two weeks with nothing to do',
  'fleet-autoaudit.py only PATCHed the body of the open issue and counted FOLDED/RETIRED directories absent from the account as NOT_DEPLOYED, so the report always looked like 76 missing workers and the issue could never close',
  'AUTOAUDIT-ACTIONABLE-1: the guard tags each absence with its marker; the audit lists actionable findings and opens or closes the same issue on them (scripts/fleet-autoaudit-selftest.py)',
  'the audit ran within 6h and no live worker reads NOT_DEPLOYED (worker_live_audit vs service_registry)', 'fm-standing-report-issue', '2026-09-29', NULL,
  'a report-only issue with no close condition', 'an open GitHub issue whose findings are all expected states', 'the owner reads a false alarm; a real finding is hidden in a permanent issue'),
 ('registry-live-absent', 'service_registry lists a worker as live after it was folded or retired',
  'FOLD-KIT-1 and BACKLOG-FOLD-1 (2026-10-06) deleted the scripts but left their service_registry rows at state live',
  'this migration marks calendar-api and qnfo-backlog-exec retired; the detector catches the next one',
  'no service_registry live row whose worker_live_audit note is NOT_DEPLOYED', 'fm-registry-live-absent', '2026-10-06', NULL,
  'a fold or retirement that skips the registry', 'service_registry state live for a script absent from the account', 'registry readers (dashboard, ops router, charter) route to a worker that does not exist');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-registry-live-absent', NULL, 'AUTOAUDIT-ACTIONABLE-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM service_registry s JOIN worker_live_audit a ON a.worker = s.service WHERE s.state = ''live'' AND a.note = ''NOT_DEPLOYED'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-standing-report-issue', NULL, 'AUTOAUDIT-ACTIONABLE-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM worker_live_audit WHERE probed_at > datetime(''now'', ''-6 hours'')) > 0 AND (SELECT COUNT(*) FROM worker_live_audit a JOIN service_registry s ON s.service = a.worker WHERE s.state = ''live'' AND a.note = ''NOT_DEPLOYED'') = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'an audit issue should be open exactly while it holds an actionable finding', 'AUTOAUDIT-ACTIONABLE-1: retired absences counted as expected, #52 opened or closed on actionable findings, two folded workers marked retired in service_registry', 'worker_live_audit 2026-10-11 08:07Z: 28 SYNC = 28 account scripts; 76 NOT_DEPLOYED all FOLDED/RETIRED; service_registry live rows calendar-api and qnfo-backlog-exec absent', 'the audit issue carries signal; the registry matches the account', 'scripts/fleet-autoaudit.py, scripts/deploy-drift-guard.py, two service_registry rows', 'the Rollback line and a revert of the PR', 'the fleet self-audit closes its own report when nothing is actionable and reopens it on a finding', 'the first fleet-autodeploy run after merge closes GitHub #52 as completed with Actionable findings: 0; fm-registry-live-absent observes 0', NULL, 'GitHub issues API, D1, Cloudflare script list'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'AUTOAUDIT-ACTIONABLE-1%');

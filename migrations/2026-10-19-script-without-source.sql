-- SCRIPT-SOURCE-RECONCILE-1 (2026-10-19, charter pillar: autonomy; owner directive 2026-10-19: "audit, resolve and remediate all failure modes and their root causes systemwide").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_script_source_probes b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_script_source_probes); UPDATE service_registry SET kind = (SELECT b.kind FROM bak_20261019_script_source_registry b), state = (SELECT b.state FROM bak_20261019_script_source_registry b), version = (SELECT b.version FROM bak_20261019_script_source_registry b), base_url = (SELECT b.base_url FROM bak_20261019_script_source_registry b), purpose = (SELECT b.purpose FROM bak_20261019_script_source_registry b) WHERE service = 'fleet-exec'; DELETE FROM remediation_contracts WHERE class = 'fm-script-live-without-source'; DELETE FROM failure_modes WHERE fm_key = 'script-live-without-source';
--
-- WHY (measured 2026-10-19 10:15-11:00Z)
-- 1. fm-fleet-census-blind read recurring: the binding-census journey listed fleet-exec and qnfo-artifacts as blind. Both were deployed scripts whose repository
--    directory said they should not be. fleet-exec was FOLDED into qnfo-code-orchestrator on 2026-10-06 with the instruction to delete the separate script once
--    the host runs the member; it never was, so it ran a */5 cron beside the host's */2 member and the census could not read it. qnfo-artifacts carried a
--    RETIRED marker from 2026-10-01 although it was rebuilt, deployed by hand (4 times, 2026-10-18) and is now what artifacts-canonical-sync depends on, so the
--    canonical path skipped it and the fleet graph reported a deployed script with no source (fg_finding untracked-worker, 2 rows). fleet-exec was deleted with
--    cf-ops-actions (run 39240334895: binder census clean, settings 404 afterwards); the same PR drops the qnfo-artifacts marker and lists it in deploy-targets.txt
--    (net zero in the worker count). The registry row of fleet-exec becomes a retired member served by the host, as calendar-api and qnfo-backlog-exec are.
-- 2. fm-metric-close-flap read recurring on four METRIC-TRIGGER issues. issue_lifecycle_au labels every status change that is not a disposition 'reopened', so a
--    bulk open -> monitoring (12:19:49Z 10-18, all four at the same second) and monitoring -> open (14:38:56Z, two of them) counted as reopens: each issue has three
--    'reopened' rows in 24 h but exactly one of them left a closed state. The detector now counts reopens from closed, resolved or wontfix, which is a close that did not hold.
-- 3. fm-probe-source-moved read recurring on one contract, issue-2838, which reads spof_registry directly; the failure mode's own rule is that a SPOF contract reads
--    v_spof_registry_all (the registry plus the resolved rows), so the contract moves to the view.
-- 4. A new failure mode, script-live-without-source, watches the class from 1: any deployed script the repository cannot redeploy (the graph's untracked-worker finding).

CREATE TABLE IF NOT EXISTS bak_20261019_script_source_probes AS
  SELECT class, verify_probe FROM remediation_contracts WHERE class IN ('fm-metric-close-flap', 'issue-2838');
CREATE TABLE IF NOT EXISTS bak_20261019_script_source_registry AS
  SELECT service, kind, state, version, base_url, purpose FROM service_registry WHERE service = 'fleet-exec';

UPDATE service_registry SET kind = 'member', state = 'retired', version = '1.0.4-folded',
  base_url = 'https://qnfo-code-orchestrator.q08.workers.dev/fleet-exec',
  purpose = 'fleet_tasks dispatcher: runs the due fleet_crons jobs; a member of qnfo-code-orchestrator since FLEET-EXEC-FOLD-1 (2026-10-06); the standalone script was deleted 2026-10-19',
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE service = 'fleet-exec';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT l.issue_id FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE l.event = ''reopened'' AND l.from_status IN (''closed'', ''resolved'', ''wontfix'') AND a.title LIKE ''METRIC-TRIGGER-%'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY l.issue_id HAVING COUNT(*) >= 3)) AS TEXT) AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
  WHERE class = 'fm-metric-close-flap';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''tested'' AS expected, CASE WHEN EXISTS(SELECT 1 FROM v_spof_registry_all WHERE component LIKE ''qnfo-research-exec%'' AND alternate_tested_at IS NOT NULL) THEN ''tested'' ELSE ''untested'' END AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
  WHERE class = 'issue-2838';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('script-live-without-source',
   'a script is deployed in the account that the repository cannot redeploy, because its directory is marked FOLDED or RETIRED (or is absent) while the script still runs',
   'folding or retiring a worker is two steps, a marker in the repository and then deleting the script, and nothing checked the second; the reverse also happened, a retired directory was rebuilt and deployed by hand and the marker stayed, so the canonical path skipped a worker in use',
   'SCRIPT-SOURCE-RECONCILE-1: fleet-exec deleted with cf-ops-actions, the qnfo-artifacts marker dropped and the worker listed in deploy-targets.txt; this detector reads the fleet graph untracked-worker findings, which the graph rebuilds on every push',
   'count of fg_finding rows of kind untracked-worker in qnfo-graph',
   'fm-script-live-without-source', '2026-10-19', NULL,
   'a worker directory is folded or retired and the deploy step is not run, or a marked directory is rebuilt without removing its marker',
   'the fleet census reads the script blind, a folded worker runs twice, a worker in use is skipped by the canonical deploy',
   'every consumer of the census (binding-census journey, deploy coherence) and the worker count against the charter cap');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-script-live-without-source', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fg_finding WHERE kind = ''untracked-worker'') AS TEXT) AS observed',
  'd1-query@qnfo-graph', 3, 1, 'active', 'SCRIPT-SOURCE-RECONCILE-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
VALUES ('session_01SPji35GAVJZypZFbJuGJcq',
  'a worker whose directory is FOLDED, whose host runs it as a member and which no live service binding targets can be deleted under OWNER-STANDING-GRANT-1; a worker marked RETIRED whose source is current, deployed and in use is a stale marker',
  'deleted the standalone fleet-exec script with cf-ops-actions (run 39240334895); removed the qnfo-artifacts RETIRED marker and listed it in deploy-targets.txt; moved the fleet-exec registry row to a retired member; corrected two detector probes; registered script-live-without-source',
  'binder census clean; /fleet-exec/health on qnfo-code-orchestrator answered ok 1.0.4-folded before and after; fleet_runs 14-25 ok runs per 10 minutes before; qnfo-artifacts source 1.2.2 equals the live /health version; fg_finding untracked-worker listed exactly these two',
  'fleet-exec absent (settings 404); census blind list reduced to the worker without a service binding',
  'the standalone fleet-exec cron (every 5 minutes) is gone, the host member still runs every 2 minutes; the next canonical deploy of qnfo-artifacts redeploys the same 1.2.2 source',
  'git revert of the PR restores the marker and manifest; the fleet-exec source stays in the repository and can be redeployed by workflow_dispatch; the migration rollback line restores the registry row and both probes',
  'the fleet finishes a fold by itself: a graph finding names any deployed script without a redeployable source and a detector watches it',
  'script-live-without-source count of untracked-worker findings = 0 within 2 h of the next graph build after qnfo-artifacts is deployable',
  'one fewer deployed script, one worker back under the canonical deploy path',
  'registry, deploy-targets.txt, fleet graph, cf-ops-actions delete-worker, host health, fleet_runs');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('finish-a-fold', 'migrations/2026-10-19-script-without-source.sql (SCRIPT-SOURCE-RECONCILE-1; cf-ops-actions delete-worker run 39240334895)',
  'fleet graph untracked-worker findings (FLEET-GRAPH-1), cf-ops-actions delete-worker with its binder census, d1-query@qnfo-graph probe transport',
  'one fold finished (fleet-exec); detector fm-script-live-without-source',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'a folded worker whose host serves its health and which has no binders is deleted; a marker that contradicts a deployed, current, used worker is removed in the same change that lists it for the canonical deploy');

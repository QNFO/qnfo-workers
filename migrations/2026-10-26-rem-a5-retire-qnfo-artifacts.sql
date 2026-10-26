-- REM-A5-RETIRE-ARTIFACTS-1 (2026-10-26, charter pillar core; worker_count breach, trigger 344, agent_issues 99923; owner standing grant OWNER-STANDING-GRANT-1).
-- Follow-up to PR 4800, which added qnfo-artifacts/RETIRED, dropped it from deploy-targets.txt and removed the qnfo-ops CH_QNFO_ARTIFACTS probe binding. After the merge the
-- script was unbound with cf-ops-actions unbind-service qnfo-ops:CH_QNFO_ARTIFACTS and deleted with cf-ops-actions delete-worker qnfo-artifacts (run ids in the decision row).
-- This file is the registry half and is applied only after the script is gone, so service_registry never says retired while the script still exists, and the detector
-- fm-registry-live-absent (a live registry row whose worker_live_audit note is NOT_DEPLOYED) has nothing to read:
--   * service_registry: qnfo-artifacts state live -> retired (the row, its purpose and its history stay);
--   * remediation_contracts: rt-live-qnfo-artifacts (runner-https probe of https://qnfo-artifacts.q08.workers.dev/health, active) and issue-3010 (a holding contract of a closed
--     issue that reads worker_live_audit for qnfo-artifacts) are superseded with the reason, never hidden: three straight failures of the first would file RUNTIME-PROBE-FAIL-1
--     about a worker that was removed on purpose.
-- Backups: bak_20261026_rem_a5_artifacts_registry and bak_20261026_rem_a5_artifacts_contracts hold the rows before the change; the Rollback line restores them.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE service_registry SET state = (SELECT b.state FROM bak_20261026_rem_a5_artifacts_registry b WHERE b.service = service_registry.service), updated_at = (SELECT b.updated_at FROM bak_20261026_rem_a5_artifacts_registry b WHERE b.service = service_registry.service) WHERE service IN (SELECT service FROM bak_20261026_rem_a5_artifacts_registry); UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261026_rem_a5_artifacts_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_rem_a5_artifacts_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261026_rem_a5_artifacts_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_rem_a5_artifacts_contracts)
-- spof-review: removes a worker, a probe binding and two probes; adds no cron, D1 trigger, external host or credential.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_artifacts_registry AS SELECT service, state, updated_at FROM service_registry WHERE service = 'qnfo-artifacts';
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_artifacts_contracts AS SELECT class, status, last_verdict, next_due_at FROM remediation_contracts WHERE class IN ('rt-live-qnfo-artifacts', 'issue-3010');

UPDATE service_registry SET state = 'retired', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE service = 'qnfo-artifacts' AND state = 'live';

UPDATE remediation_contracts
   SET status = 'superseded', last_verdict = 'superseded:REM-A5-RETIRE-ARTIFACTS-1 (qnfo-artifacts was retired 2026-10-26, PR 4800; the script is deleted)', last_attempt_at = datetime('now')
 WHERE class IN ('rt-live-qnfo-artifacts', 'issue-3010') AND status IN ('active', 'holding', 'escalated', 'monitoring');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a worker with no functional binder, no URL caller, no table it writes and no cron is a retirement the standing grant allows; the one probe binder is removed in the same change and the registry row follows the delete, never leads it',
  'REM-A5-RETIRE-ARTIFACTS-1: qnfo-artifacts retired (PR 4800, cf-ops-actions unbind-service then delete-worker), registry row retired, two contracts superseded',
  'fleet graph impact worker:qnfo-artifacts depth 1: one binding, qnfo-ops CH_QNFO_ARTIFACTS (a /health probe); git grep for the host and the binding name on origin/main including .github: no other reference; worker.js has no INSERT, UPDATE or DELETE; wrangler.toml has no cron; artifacts-canonical-sync.yml and its scripts call api.cloudflare.com, not the worker; worker_count 36 at 17:03Z against the cap of 30; the binder census and delete-worker guard (marker, no live binder) passed',
  'applied by migration after the delete', 'one worker script, one service binding, two contracts, one registry row; Artifacts namespaces and replicas untouched',
  'the Rollback line restores the registry row and the contracts; the worker itself returns by removing qnfo-artifacts/RETIRED, re-adding the deploy-targets.txt line and the qnfo-ops binding, and redeploying (the source stays in the directory)',
  'one worker fewer on the account', 'worker_count <= 35 within 3 h', 'none',
  'github:PR 4800 and cf-ops-actions runs; d1:service_registry, remediation_contracts; cf:fleet-graph impact'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-RETIRE-ARTIFACTS-1:%');

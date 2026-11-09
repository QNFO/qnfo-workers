-- COMPANION-GUARD-RECORD-1 (2026-11-09, charter pillar core; issues 9335 / agent_issues 1002603 deploy-unrecorded qnfo-companion-guard, 9158 / 1002550 project-stale-deploy W.qnfo-companion-guard).
-- qnfo-companion-guard is live (GET https://qnfo-companion-guard.q08.workers.dev/health -> {"ok":true,"worker":"qnfo-companion-guard","version":"1.1.0"} read 2026-11-09) and its source is in the repo
-- (WORKER-SOURCE-IN-REPO-1, issue 9663), but it was deployed outside the ledger, so both portfolio detectors read "never deployed". This records the live deployment (the cluster-e-c precedent:
-- action 'deployed'), links it to the project when a W.qnfo-companion-guard project row exists, then resolves the open gaps with that evidence.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261109_companion_guard_gaps
-- Rollback: DELETE FROM project_ledger WHERE task_id LIKE 'record:companion-guard-%'; DELETE FROM deployment_history WHERE resource_name = 'qnfo-companion-guard' AND deployed_by = 'session:companion-guard-record-1'; UPDATE portfolio_gaps SET status = 'open', resolved_at = NULL WHERE rowid IN (SELECT id FROM bak_20261109_companion_guard_gaps WHERE status = 'open')
-- Fix 2026-11-09 (issue 9764): portfolio_gaps has no id column in production (D1 7500 'no such column: id'); the backup selects rowid AS id.
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS bak_20261109_companion_guard_gaps AS
SELECT rowid AS id, kind, entity, status FROM portfolio_gaps WHERE entity IN ('qnfo-companion-guard', 'W.qnfo-companion-guard');

INSERT INTO deployment_history (resource_type, resource_name, action, version_id, deployed_by, deployed_at, status, notes)
SELECT 'worker', 'qnfo-companion-guard', 'deployed', '1.1.0', 'session:companion-guard-record-1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'success',
  'COMPANION-GUARD-RECORD-1: live deployment recorded after /health answered version 1.1.0 on 2026-11-09; source in qnfo-companion-guard/ (issue 9663)'
WHERE NOT EXISTS (SELECT 1 FROM deployment_history d WHERE d.resource_name = 'qnfo-companion-guard' AND d.action IN ('deploy', 'deployed') AND COALESCE(d.status, 'success') = 'success');

INSERT OR IGNORE INTO project_ledger (project_id, session_id, phase, task_id, action, evidence, worker_name, timestamp)
SELECT p.project_code, 'companion-guard-record-1', COALESCE((SELECT MAX(ph.phase_number) FROM phases ph WHERE ph.project_code = p.project_code), 1),
  'record:companion-guard-' || d.id, 'deployed', 'version ' || COALESCE(d.version_id, '?') || ' deployed by ' || COALESCE(d.deployed_by, '?'), 'qnfo-companion-guard', datetime('now')
FROM projects p JOIN deployment_history d ON d.resource_name = 'qnfo-companion-guard' AND d.action IN ('deploy', 'deployed') AND d.status = 'success'
WHERE p.project_code = 'W.qnfo-companion-guard'
ORDER BY d.id DESC LIMIT 1;

UPDATE portfolio_gaps SET status = 'resolved', resolved_at = datetime('now'),
  detail = COALESCE(detail, '') || ' | resolved 2026-11-09 COMPANION-GUARD-RECORD-1: deployment_history records the live deployment'
WHERE status = 'open' AND kind IN ('deploy-unrecorded', 'project-stale-deploy') AND entity IN ('qnfo-companion-guard', 'W.qnfo-companion-guard')
  AND EXISTS (SELECT 1 FROM deployment_history d WHERE d.resource_name = 'qnfo-companion-guard' AND d.action IN ('deploy', 'deployed') AND COALESCE(d.status, 'success') = 'success');

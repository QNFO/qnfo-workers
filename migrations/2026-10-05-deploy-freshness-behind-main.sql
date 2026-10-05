-- DEPLOY-FRESHNESS-BEHIND-MAIN-1 (2026-10-05, agent_issues 1979, pillar core). Idempotent. Applied to qnfo-audit on 2026-10-05.
--
-- Defect: fleet_tasks 'metric-refresh' computed deploy_freshness_h as hours since the newest fleet_deploys row of ANY kind:
--   ROUND((julianday('now') - julianday((SELECT MAX(ts) FROM fleet_deploys))) * 24, 2)
-- The registry defines it as "hours since last successful deploy per changed worker", target "< 24h behind repo main", and
-- trigger #359 reads "live workers more than 6h behind repo main". The old formula breached whenever main simply did not change
-- for 6 hours: on 2026-10-05 15:00Z it read 25.68 although no worker.js or wrangler.toml changed on main after the last code
-- deploy (idea-hub 1.5.3, 2026-10-04 13:12Z) and the fleet self-audit (fleet-autoaudit.py, version + sha256 content) read
-- 41 SYNC, 0 DRIFT, 0 CONTENT_DRIFT. It also counted SETTINGS-ONLY observability reasserts as deploys.
--
-- New formula: from the fleet self-audit snapshot (worker_live_audit, written by fleet-autodeploy.yml on every push to main):
--   for each worker whose live version or bytes differ from main (note DRIFT or CONTENT_DRIFT), hours since that worker's last
--   successful code deploy (SETTINGS-ONLY rows excluded); the metric is the maximum, 0 when every worker matches main.
--   If the snapshot is older than 26h (no audit to trust), fall back to hours since the newest successful code deploy, so a
--   silent audit can never read as fresh.
--
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT data FROM infra_state WHERE id = 'backup-metric-refresh-20261005-deploy-freshness')
--           WHERE id = 'metric-refresh'; and restore metric_registry.formula from infra_state 'backup-deploy-freshness-formula-20261005'.

-- 0. Backups.
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-metric-refresh-20261005-deploy-freshness', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'fleet_tasks-backup', definition
FROM fleet_tasks WHERE id = 'metric-refresh';
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-deploy-freshness-formula-20261005', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'metric_registry-backup', json_object('formula', formula, 'source_of_truth', source_of_truth)
FROM metric_registry WHERE metric = 'deploy_freshness_h';

-- 1. The formula (one occurrence in the definition, checked 2026-10-05: instr = 276).
UPDATE fleet_tasks
SET definition = replace(definition,
  'WHEN ''deploy_freshness_h'' THEN CAST(ROUND((julianday(''now'')-julianday((SELECT MAX(ts) FROM fleet_deploys)))*24,2) AS TEXT)',
  'WHEN ''deploy_freshness_h'' THEN CAST(CASE WHEN (SELECT COUNT(*) FROM worker_live_audit WHERE probed_at >= datetime(''now'',''-26 hours'')) = 0 THEN ROUND((julianday(''now'')-julianday((SELECT MAX(ts) FROM fleet_deploys WHERE ok = 1 AND COALESCE(note,'''') NOT LIKE ''SETTINGS-ONLY%'')))*24,2) ELSE COALESCE((SELECT ROUND(MAX(julianday(''now'') - julianday(COALESCE((SELECT MAX(d.ts) FROM fleet_deploys d WHERE d.worker = a.worker AND d.ok = 1 AND COALESCE(d.note,'''') NOT LIKE ''SETTINGS-ONLY%''), a.probed_at)))*24,2) FROM worker_live_audit a WHERE a.note LIKE ''%DRIFT%''), 0) END AS TEXT)'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh'
  AND instr(definition, 'WHEN ''deploy_freshness_h'' THEN CAST(ROUND((julianday(''now'')-julianday((SELECT MAX(ts) FROM fleet_deploys)))*24,2) AS TEXT)') > 0;

-- 2. The registry says what is measured.
UPDATE metric_registry
SET formula = 'max over workers whose live version or sha256 content differs from repo main (worker_live_audit note DRIFT or CONTENT_DRIFT, fleet self-audit on every push to main) of hours since that worker''s last successful code deploy (SETTINGS-ONLY excluded); 0 when every worker matches main; if the audit snapshot is older than 26h, hours since the newest successful code deploy (DEPLOY-FRESHNESS-BEHIND-MAIN-1)',
    source_of_truth = 'qnfo-audit.worker_live_audit (scripts/fleet-autoaudit.py via fleet-autodeploy.yml) + qnfo-audit.fleet_deploys; fleet_tasks metric-refresh'
WHERE metric = 'deploy_freshness_h';

-- BP26-WORKERS-BP-LINT-1 (2026-10-28, charter pillar core; agent_issues 1000348, GitHub 4424; program QNFO.INFRA, project BP26.ENGINEERING, session bp26-reliability).
-- WHAT: the CI lint baseline gains the rule compat-date-stale in scripts/workers_standards_guard.py (a wrangler.toml change that sets a compatibility_date older than 90 days fails);
-- workers_with_source_maps is judged on the generated bundles (qnfo-agents, whose wrangler.toml now sets upload_source_maps = true) because a hand-written single-file worker.js is its own source.
-- Docs: docs/WORKERS-STANDARDS.md section "BP26-WORKERS-BP-LINT-1". Existing enforcement kept: workers_standards_guard.py, fleet_best_practices_audit.py, metric workers_compat_date_behind.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM roadmap_implementation WHERE item = 'BP26-WORKERS-BP-LINT-1'; UPDATE metric_registry SET source_of_truth = 'repository wrangler config scan of every live worker directory (upload_source_maps = true): scripts/bp26_repo.py collect_workers_config, runner (remediation-consumer, hourly) [BP26]' WHERE metric = 'workers_with_source_maps';

UPDATE metric_registry SET source_of_truth = 'repository wrangler config scan of the generated esbuild bundles (qnfo-agents; a hand-written single-file worker.js has nothing to map) for upload_source_maps = true: scripts/bp26_repo.py collect_workers_config, runner (remediation-consumer, hourly) [BP26]'
  WHERE metric = 'workers_with_source_maps';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'BP26-WORKERS-BP-LINT-1', 'bp26-catalogue', 'Workers best practices as the CI lint baseline: compat-date-stale rule, bundle-scoped source maps', 'code', 'scripts/workers_standards_guard.py; qnfo-agents/wrangler.toml; scripts/bp26_repo.py', 'implemented',
  'guard test scripts/workers_standards_guard.test.py passes; metrics compat_date_age_days_max (target 90 or fewer) and workers_with_source_maps (target 1.0) are measured by scripts/bp26_repo.py and scripts/bp26_compat.py'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'BP26-WORKERS-BP-LINT-1');

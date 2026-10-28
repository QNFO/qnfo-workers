-- BP26-GRADUAL-DEPLOYS-1 (2026-10-28, charter pillar autonomy; agent_issues 1000352, GitHub 4428; program QNFO.INFRA, project BP26.ENGINEERING, session bp26-reliability).
-- WHAT: scripts/gradual_deploy.py + .github/workflows/gradual-deploy.yml (Versions upload, preview smoke test, 10/50/100 percent with soak, per-version error-rate and p99 gate,
-- automatic rollback). Metrics deploys_via_gradual, change_failure_rate and mttr_rollback_min_p95 are produced by scripts/bp26_cfapi.py from the deployment history; this adds the roadmap rows
-- and the decision record. Adoption by the canonical path is the follow-up row below (the metric reaches its target only then).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM roadmap_implementation WHERE item IN ('BP26-GRADUAL-DEPLOYS-1', 'ROADMAP-1: QNFO.INFRA BP26-GRADUAL-ADOPT-1'); DELETE FROM decision_log WHERE action LIKE 'BP26-GRADUAL-DEPLOYS-1:%';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'BP26-GRADUAL-DEPLOYS-1', 'bp26-catalogue', 'Health-gated gradual deployments with automatic rollback', 'code', 'scripts/gradual_deploy.py; .github/workflows/gradual-deploy.yml; docs/GRADUAL-DEPLOYS.md', 'implemented',
  'scripts/gradual_deploy.py --selftest passes; docs/GRADUAL-DEPLOYS.md; live proof recorded on the issue'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'BP26-GRADUAL-DEPLOYS-1');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'ROADMAP-1: QNFO.INFRA BP26-GRADUAL-ADOPT-1', 'bp26-catalogue', 'Canonical deploy path calls gradual_deploy.py for code-only changes (deploys_via_gradual toward 1.0)', 'code', 'scripts/canonical_deploy.py', 'planned',
  'metric deploys_via_gradual (target 1.0) rises with each adopted worker; serves charter pillar autonomy'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'ROADMAP-1: QNFO.INFRA BP26-GRADUAL-ADOPT-1');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-bp26-reliability',
  'a staged rollout through the Versions API can be added beside the canonical /content path without touching a control-plane worker, and proves itself on a worker whose main code is already live',
  'BP26-GRADUAL-DEPLOYS-1: scripts/gradual_deploy.py and gradual-deploy.yml; no change to qnfo-ops, canonical-deploy.yml or any worker.js',
  'bp26_cfapi.py counts a percentage strategy with two versions as gradual; metric deploys_via_gradual read 0 on 2026-10-28',
  'applied by migration; workflow_dispatch only, nothing runs on its own', 'a manual workflow; a run deploys one existing worker and rolls back on a regression',
  'the Rollback line; delete the workflow file', 'staged rollout and automatic rollback available to every code-only deploy',
  'deploys_via_gradual rises above 0 after the first run (each run adds two or three percentage deployments); change_failure_rate stays at or below 0.15',
  'none directly; it limits a bad deploy to a tenth of requests first', 'offline selftest; live proof run recorded on the issue'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-GRADUAL-DEPLOYS-1:%');

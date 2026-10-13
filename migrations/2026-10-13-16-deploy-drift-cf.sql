-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE spof_registry SET alternate_path = 'Cloudflare crons carry the loops; deploys have no second runner' WHERE component = 'GitHub Actions'; UPDATE ops_config SET value = 'off' WHERE key = 'deploy_drift_cf'; UPDATE spof_alternate_probes SET enabled = 0 WHERE component = 'GitHub Actions: canonical deploy runner'; UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied' WHERE control LIKE 'deploy-drift-cf-%' (the table deploy_drift_cf holds only derived state and may stay)
-- DEPLOY-DRIFT-CF-1 (2026-10-13, pillars core and autonomy; doctrine section 12 "redundant paths, never a single critical path";
-- qnfo-fleet-control 0.26.0 and qnfo-ops 2.47.0 in the same PR).
-- spof_registry lists 'GitHub Actions' as a single point of failure for CI, the canonical deploy, the migration runner and the
-- runner-https probes: "deploys have no second runner". qnfo-fleet-control 0.26.0 gives the deploy one on Cloudflare: every 20
-- minutes it compares each canonical-path worker's main VERSION (git tree and blobs through the GitHub API) with its live VERSION
-- (worker_live_audit and deployment_history), and a worker that has been behind main for 45 minutes, with no canonical-deploy.yml
-- run created in the last hour still active, is deployed through qnfo-ops POST /ops/deploy on the new SVC_QNFO_OPS service
-- binding (props.caller qnfo-fleet-control; qnfo-ops 2.47.0 trusts that caller on that path alone). The route takes the deploy
-- lock and writes the ledger. At most 2 a tick; control-plane workers, container workers, marked directories and workers with
-- no live version are skipped; live ahead of main is never deployed. Ledger: cloud_ops_events kind deploy-drift-cf; state:
-- deploy_drift_cf (created below and by the worker).
-- Only the deploy path gains a second runner. CI, this migration runner and the runner-https probes still run on GitHub Actions
-- alone, so the 'GitHub Actions' row stays in spof_registry (it is not moved to spof_registry_resolved) and keeps
-- alternate_tested_at NULL; only its alternate_path text now names this path.
-- CHAOS-DRILL-1 tests alternates through spof_alternate_probes, and a passing probe stamps alternate_tested_at on the
-- spof_registry row of the same component. The probe row is therefore its own component, 'GitHub Actions: canonical deploy
-- runner', so a passing drill never stamps the whole 'GitHub Actions' row as tested. It is inserted disabled: a tick is ok only
-- once qnfo-ops 2.47.0 is live and the binding carries its props, and the two workers may deploy in either order. qnfo-fleet-control
-- enables the row on its first ok tick; from then on the 6-hourly drill files CHAOS-DRILL-FAILED-1 when no ok tick landed in
-- the last hour.
-- The table deploy_drift_cf is the step's state, not a queue: a worker behind main is the drift metric deploy_freshness_h already
-- measures, so it adds no queue_sla row.
CREATE TABLE IF NOT EXISTS deploy_drift_cf (
  dir TEXT PRIMARY KEY,
  worker TEXT,
  containers INTEGER,
  marker TEXT,
  toml_sha TEXT,
  tree_blob TEXT,
  blob_sha TEXT,
  main_version TEXT,
  live_version TEXT,
  live_source TEXT,
  state TEXT,
  drift_since TEXT,
  drift_live TEXT,
  synced_key TEXT,
  last_action TEXT,
  last_action_at TEXT,
  updated_at TEXT
);
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
  ('deploy_drift_cf', 'on', 'DEPLOY-DRIFT-CF-1 (qnfo-fleet-control 0.26.0): off stops the Cloudflare-side second deploy runner on the next 20-minute tick, without a deploy; absent or any other value means on');
UPDATE spof_registry
SET alternate_path = 'Deploys: qnfo-fleet-control DEPLOY-DRIFT-CF-1 every 20 minutes deploys a canonical-path worker whose main VERSION has been ahead of live for 45 minutes with no canonical-deploy run active, through qnfo-ops /ops/deploy (service binding, props.caller; control-plane workers excluded). CI, the migration runner and the runner-https probes have no second runner; Cloudflare crons carry the loops',
    evidence = evidence || ' | DEPLOY-DRIFT-CF-1 2026-10-13: second deploy runner on Cloudflare (migration 2026-10-13-16); the row stays, CI and migrations still depend on GitHub Actions',
    reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE component = 'GitHub Actions' AND instr(COALESCE(evidence, ''), 'DEPLOY-DRIFT-CF-1') = 0;
INSERT OR IGNORE INTO spof_alternate_probes (component, probe_sql, exercise, window_note, enabled, created_at) VALUES
  ('GitHub Actions: canonical deploy runner',
   'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''deploy-drift-cf'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-1 hour'')) THEN ''ok'' ELSE ''no ok DEPLOY-DRIFT-CF-1 tick in the last hour (switch off, route not accepting the caller, or a failed deploy)'' END AS observed',
   NULL, '1 h: qnfo-fleet-control DEPLOY-DRIFT-CF-1 runs every 20 minutes; a tick is ok only when qnfo-ops accepts its caller and no deploy failed. Inserted disabled; the worker enables it on its first ok tick', 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
  ('deploy-drift-cf-switch', 'ops_config deploy_drift_cf (absent = on), read by qnfo-fleet-control deployDriftCf', 'kill-switch',
   'the Cloudflare-side deploy runner deploying while it should not (a bad tick, an incident on qnfo-ops)', 0, 'keep', 'applied',
   'off leaves deploys to canonical-deploy.yml alone, as before 0.26.0', '2026-10-13',
   'qnfo-fleet-control/deploy-drift-cf.test.mjs: switch off, no read, no preflight, no deploy, an off event per tick', NULL),
  ('deploy-drift-cf-grace', 'qnfo-fleet-control DDC_GRACE_MIN (45 min of drift against one live version) and DDC_RUN_BLOCK_MIN (an active canonical-deploy.yml run created within 60 min)', 'gate',
   'the second runner racing the primary path while canonical-deploy.yml is about to deploy, or still deploying, the same change', 0, 'keep', 'applied',
   'past the grace with no active run the second runner deploys; a run active for more than an hour is treated as stuck and does not block; the deploy lock in /ops/deploy serializes any race left', '2026-10-13',
   'deploy-drift-cf.test.mjs: 30 min no deploy, 50 min deploy; in-progress and queued runs within the hour block, a run queued 170 min does not', NULL),
  ('deploy-drift-cf-cap', 'qnfo-fleet-control DDC_MAX_PER_TICK (2 /ops/deploy calls a tick) and DDC_BACKOFF_MIN (60 min after a failed deploy)', 'cap',
   'a burst of Cloudflare-side deploys in one tick, or a failing deploy retried every 20 minutes', 0, 'keep', 'applied',
   'the next tick takes the next two, oldest drift first; after the backoff the deploy is tried again', '2026-10-13',
   'deploy-drift-cf.test.mjs: five due, two deployed, two more on the next tick; a failed deploy is not retried 20 min later and is retried 65 min later', NULL),
  ('deploy-drift-cf-control-plane-skip', 'qnfo-fleet-control ddcExclusion: CM_CONTROL_PLANE and CP_CANARY_WORKERS (qnfo-ops, qnfo-fleet-control, qnfo-deploy-guard, qnfo-gateway, qnfo-ai, qnfo-observability, qnfo-code-orchestrator and peers)', 'filter',
   'a control-plane worker deployed without the runner''s canary and automatic revert (CONTROL-PLANE-CANARY-1), which this path does not have', 0, 'keep', 'applied',
   'canonical-deploy.yml (and deploy-qnfo-ops.yml, deploy-code-orchestrator.yml) with the canary; the drift stays visible in deploy_drift_cf rows and deploy_freshness_h', '2026-10-13',
   'deploy-drift-cf.test.mjs: qnfo-ops and qnfo-fleet-control ahead of live are skipped, never deployed', NULL),
  ('ops-deploy-internal-caller', 'qnfo-ops OPS-INTERNAL-CALLER-1 and OPS_INTERNAL_DEPLOY_CALLERS (2.47.0): props.caller qnfo-fleet-control is mapped to the router key on POST /ops/deploy only', 'guard',
   'a service-binding caller gaining the router key''s reach on every qnfo-ops route (chat, jobs, the agent) when it needs one path', 0, 'keep', 'applied',
   'canonical-deploy.yml keeps its own Bearer OPS_ROUTER_AUTH_KEY; qnfo-email keeps its full trust', '2026-10-13',
   'qnfo-ops/internal-caller.test.mjs executes the guard line: POST /ops/deploy trusted; chat, /ops/compat-verify, GET and unknown callers not', NULL);
INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
  ('deploy-second-runner-cloudflare', 'qnfo-fleet-control 0.26.0 and qnfo-ops 2.47.0, DEPLOY-DRIFT-CF-1 (migration 2026-10-13-16)',
   'SVC_QNFO_OPS binding with props.caller installed by the canonical deploy; qnfo-ops 2.47.0 live; GITHUB_TOKEN read access; CF_DEPLOY_TOKEN or CF_API_TOKEN script read',
   'offline suites deploy-drift-cf.test.mjs and qnfo-ops internal-caller.test.mjs; live from the first ok deploy-drift-cf tick', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
   'a worker merged to main and left undeployed by GitHub Actions for 45 minutes is deployed from Cloudflare through the canonical route, two a tick');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a deploy path that runs only on GitHub Actions is a single point of failure; a Cloudflare cron that deploys through the same canonical route after a grace, and only while no canonical-deploy run is active, is a second runner that does not race the first one',
   'DEPLOY-DRIFT-CF-1: qnfo-fleet-control 0.26.0 deploys a canonical-path worker whose main VERSION has been ahead of live for 45 minutes, with no canonical-deploy.yml run created in the last hour still active, through qnfo-ops /ops/deploy on a props.caller service binding (qnfo-ops 2.47.0 trusts that caller on that path alone); at most 2 a tick, control-plane workers skipped, live ahead never deployed, ops_config deploy_drift_cf switch',
   'spof_registry 2026-10-13: GitHub Actions alternate_path "deploys have no second runner"; worker_live_audit 07:30Z: 28 live workers, 20 of them canonical-path non-control-plane targets; qnfo-fleet-control held no qnfo-ops binding and qnfo-ops OPS-INTERNAL-CALLER-1 trusted only qnfo-email',
   'merged through the canonical path', 'at most two /ops/deploy calls per 20 minutes for workers already behind main; each call takes the deploy lock', 'ops_config deploy_drift_cf = off (no deploy), then a revert of qnfo-fleet-control 0.26.0 and qnfo-ops 2.47.0 and the Rollback line of migration 2026-10-13-16',
   'deploys survive a GitHub Actions outage or a cancelled canonical-deploy run', 'the first tick after both workers are live is ok and arms the chaos-drill probe; a real drift past 45 minutes is deployed within one tick and deploy_freshness_h stays under 2 h', 'none', 'github-api:git trees and blobs, actions runs; d1:worker_live_audit, deployment_history; binding:SVC_QNFO_OPS'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'DEPLOY-DRIFT-CF-1:%');

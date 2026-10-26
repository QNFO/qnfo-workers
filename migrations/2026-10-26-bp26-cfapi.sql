-- BP26-CFAPI-1 (2026-10-26, charter pillars core, cost and autonomy; owner directive 2026-10-26 "Implement general best practices systemwide across the fleet"; breach bp26_metrics_unmeasured, trigger 14541;
-- agent_issues 1000351 AI Gateway budgets, 1000352 gradual deploys, 1000353 durable jobs, 1000354 observability, 1000358 agent change gates).
-- WHAT WAS WRONG: nine BP26 metrics read UNMEASURED because their input is the Cloudflare API, the GitHub API or a fleet ledger that no D1 trigger can reach in one statement:
--   deploys_via_gradual, change_failure_rate, mttr_rollback_min_p95   Workers Deployments API (latest 10 per script) + canary reverts
--   gateway_coverage, ai_cache_hit_rate                               Cloudflare GraphQL aiGatewayRequestsAdaptiveGroups and aiInferenceAdaptiveGroups
--   dlq_depth                                                         Cloudflare Queues API
--   duplicate_side_effects                                            qnfo-audit social_media_posts, social_threads, emails
--   log_ingest_gb_month                                               no API reports it (billing/usage/paygo answers 404; the telemetry API has no size field)
--   ci_gate_bypass_count                                              GitHub REST merged pull requests and commit check-runs
-- WHAT THIS DOES: scripts/bp26_cfapi.py (collectors run by scripts/bp26_producers.py from the remediation-consumer job) measures them. Two small tables keep what the APIs forget or ration:
-- bp26_deploy_events (the Deployments API returns only the latest 10 per script, so each run stores the new ones and the 30-day figures are computed from the table) and ci_gate_audit (GitHub allows 60
-- unauthenticated requests an hour shared with the other collectors, so one batch of up to 16 merged pull requests is audited every 50 minutes and the audited set grows). The runner trims both to 40 days. log_ingest_gb_month stays unmeasured on purpose:
-- the collector asks both candidate endpoints every six hours and records their answers; unknown is never a value.
-- MEASURED 2026-10-26T19:5xZ (live read-only dry runs before this file was written): deployments 0 of 340 gradual (35 scripts, one-step "Automatic deployment on upload"); ai_cache_hit_rate 0.0972
-- (2159 cached of 22208 gateway requests, 7 days); gateway_coverage 0.4148 (22208 gateway requests, 31334 Workers AI inferences outside the gateway); dlq_depth 0 (2 queues, 1 DLQ qnfo-ops-jobs-dlq, backlog 0);
-- duplicate_side_effects 0 (six checks); ci_gate_bypass_count not yet a value (24 of 1934 merges of the window audited, none outside the declared checks). Off-target values are the finding, not a defect of the producer.
-- Revert: drop the two tables (Rollback line) and null the nine metrics; they return to UNMEASURED.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_ci_gate_audit_merged; DROP TABLE IF EXISTS ci_gate_audit; DROP INDEX IF EXISTS idx_bp26_deploy_events_worker; DROP INDEX IF EXISTS idx_bp26_deploy_events_time; DROP TABLE IF EXISTS bp26_deploy_events; UPDATE metric_registry SET last_value = NULL, last_refreshed = NULL, state = 'UNMEASURED' WHERE metric IN ('deploys_via_gradual', 'change_failure_rate', 'mttr_rollback_min_p95', 'gateway_coverage', 'ai_cache_hit_rate', 'dlq_depth', 'duplicate_side_effects', 'log_ingest_gb_month', 'ci_gate_bypass_count');
-- spof-review: the collectors ride the remediation-consumer job (qnfo-cloud-ops dispatches it when idle for 60 minutes; pushes and workflow_run also start it); a missed run delays these metrics only, and metric_staleness_breach_rec records the gap. Each API call is a read.

CREATE TABLE IF NOT EXISTS bp26_deploy_events (
  deployment_id TEXT PRIMARY KEY,
  worker TEXT NOT NULL,
  created_on TEXT NOT NULL,
  strategy TEXT,
  n_versions INTEGER NOT NULL DEFAULT 0,
  min_pct REAL,
  triggered_by TEXT,
  message TEXT,
  version_ids TEXT,
  seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bp26_deploy_events_time ON bp26_deploy_events (created_on);

CREATE INDEX IF NOT EXISTS idx_bp26_deploy_events_worker ON bp26_deploy_events (worker, created_on);

CREATE TABLE IF NOT EXISTS ci_gate_audit (
  pr INTEGER PRIMARY KEY,
  merged_at TEXT NOT NULL,
  merge_sha TEXT,
  head_sha TEXT,
  required_state TEXT NOT NULL,
  missing TEXT,
  red TEXT,
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ci_gate_audit_merged ON ci_gate_audit (merged_at);

UPDATE metric_registry SET source_of_truth = 'Cloudflare Workers Deployments API (every script, latest 10 each) accumulated in qnfo-audit.bp26_deploy_events: deployments with more than one version or below 100 percent / all recorded; scripts/bp26_cfapi.py collect_deploys on the remediation-consumer runner [BP26]'
  WHERE metric = 'deploys_via_gradual';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.bp26_deploy_events (Workers Deployments API) plus agent_issues CONTROL-PLANE-REVERTED-1: deployments followed within 24 h by a rollback, a re-activated earlier version or a canary revert / all recorded; scripts/bp26_cfapi.py collect_deploys [BP26]'
  WHERE metric = 'change_failure_rate';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.bp26_deploy_events: p95 minutes from a failed deployment to its rollback deployment (detection time is recorded nowhere: upper bound), unmeasured below 5 rollbacks; scripts/bp26_cfapi.py collect_deploys [BP26]'
  WHERE metric = 'mttr_rollback_min_p95';
UPDATE metric_registry SET source_of_truth = 'Cloudflare GraphQL aiGatewayRequestsAdaptiveGroups and aiInferenceAdaptiveGroups, 7 days: gateway requests / (gateway requests + Workers AI inferences outside the gateway); scripts/bp26_cfapi.py collect_ai_gateway on the remediation-consumer runner [BP26]'
  WHERE metric = 'gateway_coverage';
UPDATE metric_registry SET source_of_truth = 'Cloudflare GraphQL aiGatewayRequestsAdaptiveGroups (cached dimension), 7 days, all routes; scripts/bp26_cfapi.py collect_ai_gateway on the remediation-consumer runner [BP26]'
  WHERE metric = 'ai_cache_hit_rate';
UPDATE metric_registry SET source_of_truth = 'Cloudflare Queues API (queues and per-queue metrics): backlog of dead-letter queues whose oldest message is older than 120 minutes; scripts/bp26_cfapi.py collect_queues on the remediation-consumer runner [BP26]'
  WHERE metric = 'dlq_depth';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit social_media_posts, social_threads and emails (status sent), 7 days: the same platform id, buffer id, url or post uri twice, identical thread text or sent mail twice within 24 h; scripts/bp26_cfapi.py collect_side_effects [BP26]'
  WHERE metric = 'duplicate_side_effects';
UPDATE metric_registry SET source_of_truth = 'no Cloudflare API reports Workers Logs ingest bytes (billing/usage/paygo answers 404, the telemetry API lists event fields without a size); scripts/bp26_cfapi.py collect_log_ingest asks both every six hours and keeps the metric unmeasured until one answers [BP26]'
  WHERE metric = 'log_ingest_gb_month';
UPDATE metric_registry SET source_of_truth = 'GitHub REST (merged pull requests of 30 days, check-runs of each head commit) audited into qnfo-audit.ci_gate_audit against the required checks of scripts/github-main-ruleset.json; scripts/bp26_cfapi.py collect_ci_gate, one batch of 16 merges every 50 minutes, a value only once a bypass is found or 98 percent of the window is audited [BP26]'
  WHERE metric = 'ci_gate_bypass_count';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-cfapi',
  'a metric whose input is an API that keeps only a short history (10 deployments per script) or rations reads (60 GitHub requests an hour) is measured by accumulating what each run sees into a small table, and states how much of the window it holds; a value that would be 0 only because little was audited is not written',
  'BP26-CFAPI-1: scripts/bp26_cfapi.py (six collectors for nine metrics), tables bp26_deploy_events and ci_gate_audit, source_of_truth of the nine metrics names the real producer',
  'live read-only dry runs 2026-10-26T19:5xZ: Workers Deployments API 340 deployments of 35 scripts, 0 gradual, strategy percentage, triggered_by upload 320 / deployment 19 / secret 1; GraphQL aiGatewayRequestsAdaptiveGroups 22208 requests 7 d, 2159 cached; Queues API 2 queues, DLQ backlog 0; GitHub search 1934 merged PRs in 30 d, 24 audited, 0 outside the declared checks; billing/usage/paygo 404',
  'applied by migration; the collectors run on the next remediation-consumer run after merge', 'two new tables in qnfo-audit, nine source_of_truth texts, read-only API calls from the runner',
  'the Rollback line', 'nine BP26 metrics move from UNMEASURED to a measured value or to a recorded, specific reason',
  'bp26_metrics_unmeasured falls by six at the first run (mttr_rollback_min_p95 needs five rollbacks, log_ingest_gb_month has no API, ci_gate_bypass_count needs a found bypass or 98 percent audited); off-target values file their own breach tickets',
  'none directly; it gives the BP26 engineering issues a measured state', 'offline: scripts/bp26_cfapi.py --selftest and migrations/bp26-cfapi.test.mjs; live: dry runs through scripts/bp26_producers.py'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-CFAPI-1:%');

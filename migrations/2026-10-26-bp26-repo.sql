-- BP26-REPO-1 (2026-10-26, charter pillars core and security; owner directive 2026-10-26 "Implement general best practices systemwide across the fleet"; breach bp26_metrics_unmeasured,
-- trigger 14541, agent_issues 1000363; practices 1000348 workers lint, 1000349 D1 discipline, 1000350 R2/KV usage, 1000354 observability, 1000355 secrets).
-- WHAT WAS WRONG: eight BP26 metrics read UNMEASURED although their inputs are all readable from the runner: the repository checkout, the Cloudflare API and the migration ledger.
--   workers_with_source_maps, observability_enabled_share, kv_used_for_locking, secrets_in_repo, secret_expiry_warnings_open, d1_db_size_pct, d1_restore_drill_age_days, pre_migration_bookmark_recorded.
-- WHAT THIS DOES: scripts/bp26_repo.py (collectors run by scripts/bp26_producers.py from the remediation-consumer job) now measures them, and this file gives them what they read:
--   * migration_runs.bookmark and migration_runs.bookmark_source: the D1 Time Travel restore point of each applied migration. scripts/apply_migrations.py does not capture one at apply time
--     (the file is under another session's work claim until 21:05Z; the apply-time capture is a code-task), so the runner records it afterwards from Time Travel at applied_at minus 120 seconds,
--     which stays possible for 30 days; bookmark_source says which way each one was taken.
--   * credential_registry: external credentials by NAME (never a value), the worker that holds each, and the way its expiry can be known. Only the Cloudflare repository token has one the
--     fleet reads (cf-token-verify). The others are registered as no-expiry-mechanism: the registry says the fleet cannot see their expiry, which the metric note repeats every run.
--   * d1_restore_drills: the ledger a restore drill writes; d1_restore_drill_age_days is unknown (no row) until a drill passes. A measured age is never invented.
--   * the real source_of_truth of the eight metrics (the [BP26] tag stays: the framework writes only tagged metrics).
-- MEASURED 2026-10-26T19:5xZ by dry runs of the collectors against live data (read-only): observability_enabled_share 0.9714 (34 of 35 deployed Workers; the root stub qnfo-workers is the one
-- without, fixed in the same PR in wrangler.toml); workers_with_source_maps 0 of 33 (qnfo-ops has no source-map upload code, so the lever is the deploy path); kv_used_for_locking 1
-- (qnfo-ops opsPublicGate keeps a per-visitor hourly counter in KV with get then put); secrets_in_repo 0 of 3183 tracked text files; d1_db_size_pct 0.0982 (qnfo-audit 982 MB).
-- Revert: the Rollback line drops the two tables and the two columns and returns the eight metrics to their earlier source_of_truth text; the metrics then read their last values until a
-- later producer overwrites them (the framework writes only what a collector measured).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS d1_restore_drills; DROP TABLE IF EXISTS credential_registry; ALTER TABLE migration_runs DROP COLUMN bookmark_source; ALTER TABLE migration_runs DROP COLUMN bookmark; UPDATE metric_registry SET source_of_truth = CASE metric WHEN 'workers_with_source_maps' THEN 'repository wrangler.toml scan (to compute) [BP26]' WHEN 'observability_enabled_share' THEN 'repository wrangler.toml scan (to compute) [BP26]' WHEN 'kv_used_for_locking' THEN 'repository scan (to build) [BP26]' WHEN 'secrets_in_repo' THEN 'CI secret scan (to build or wire) [BP26]' WHEN 'secret_expiry_warnings_open' THEN 'credential expiry probe (to build) [BP26]' WHEN 'd1_db_size_pct' THEN 'Cloudflare D1 API (to poll) [BP26]' WHEN 'd1_restore_drill_age_days' THEN 'restore drill ledger (to build) [BP26]' ELSE 'qnfo-audit.migration_runs (to extend) [BP26]' END WHERE metric IN ('workers_with_source_maps', 'observability_enabled_share', 'kv_used_for_locking', 'secrets_in_repo', 'secret_expiry_warnings_open', 'd1_db_size_pct', 'd1_restore_drill_age_days', 'pre_migration_bookmark_recorded');
-- spof-review: the collectors run in the remediation-consumer job (qnfo-cloud-ops dispatches it when idle 60 minutes; pushes and workflow_run also start it); a missed run delays these metrics only, and metric_staleness_breach_rec records the gap. No new cron, no new worker.

ALTER TABLE migration_runs ADD COLUMN bookmark TEXT;

ALTER TABLE migration_runs ADD COLUMN bookmark_source TEXT;

CREATE TABLE IF NOT EXISTS credential_registry (
  credential TEXT PRIMARY KEY,
  holder_worker TEXT NOT NULL,
  provider TEXT,
  expiry_mechanism TEXT NOT NULL,
  expires_at TEXT,
  renewal_issue_id INTEGER,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR IGNORE INTO credential_registry (credential, holder_worker, provider, expiry_mechanism, expires_at, renewal_issue_id, note) VALUES
 ('CLOUDFLARE_API_TOKEN', 'github-actions (repository secret: deploys, migrations, runner reads)', 'Cloudflare', 'cf-token-verify', NULL, NULL, 'read every consumer run: metrics cloudflare_token_ok and cloudflare_token_expires_in_min (999999 means the token carries no expiry date), scripts/remediation_consumer.py cf_token_watch'),
 ('CF_API_TOKEN', 'qnfo-ops, qnfo-fleet-control and other workers (worker secret, 78 references in worker.js files)', 'Cloudflare', 'no-expiry-mechanism', NULL, NULL, 'the value is not readable from the runner, so its expiry date is not known; a holder worker calling the token verify route would read it (code-task)'),
 ('GITHUB_TOKEN', 'qnfo-github-steward, qnfo-ops, qnfo-code-orchestrator and other workers (worker secret)', 'GitHub', 'no-expiry-mechanism', NULL, NULL, 'a fine-grained token reports its expiry in the github-authentication-token-expiration response header; no loop reads it yet'),
 ('BSKY_APP_PASS', 'qnfo-social, qnfo-paper-explainer, qnfo-cloud-ops', 'Bluesky', 'no-expiry-mechanism', NULL, NULL, 'the fleet has no way to read an expiry date for it; whether the provider expires it is not recorded here'),
 ('MASTODON_TOKEN', 'qnfo-social', 'Mastodon', 'no-expiry-mechanism', NULL, NULL, 'the fleet has no way to read an expiry date for it; whether the provider expires it is not recorded here'),
 ('BUFFER_TOKEN', 'qnfo-social, qnfo-paper-explainer, qnfo-cloud-ops', 'Buffer', 'no-expiry-mechanism', NULL, NULL, 'the fleet has no way to read an expiry date for it; whether the provider expires it is not recorded here'),
 ('GA4_SA_KEY', 'qnfo-fleet-dashboard', 'Google Cloud', 'no-expiry-mechanism', NULL, NULL, 'a service account key; the fleet has no way to read an expiry date for it'),
 ('DEEPSEEK_API_KEY', 'qnfo-ai, qnfo-ops, personal-companion', 'DeepSeek', 'no-expiry-mechanism', NULL, NULL, 'the fleet has no way to read an expiry date for it; whether the provider expires it is not recorded here'),
 ('OSF_TOKEN', 'osf-integrity-check', 'OSF', 'no-expiry-mechanism', NULL, NULL, 'a personal access token; its expiry is set at creation in OSF and is not read by any loop');

CREATE TABLE IF NOT EXISTS d1_restore_drills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  source_db TEXT,
  scratch_db TEXT,
  bookmark TEXT,
  rows_checked INTEGER,
  outcome TEXT NOT NULL,
  evidence TEXT
);

UPDATE metric_registry SET source_of_truth = 'repository wrangler config scan of every live worker directory (upload_source_maps = true): scripts/bp26_repo.py collect_workers_config, runner (remediation-consumer, hourly) [BP26]'
  WHERE metric = 'workers_with_source_maps';
UPDATE metric_registry SET source_of_truth = 'Cloudflare API script-settings of every deployed Worker (observability.enabled), wrangler config scan as the fallback: scripts/bp26_repo.py collect_workers_config, runner [BP26]'
  WHERE metric = 'observability_enabled_share';
UPDATE metric_registry SET source_of_truth = 'static scan of the live worker.js files against their [[kv_namespaces]] bindings (lock-like key puts, read-modify-write counters): scripts/bp26_repo.py collect_kv_locking, runner [BP26]'
  WHERE metric = 'kv_used_for_locking';
UPDATE metric_registry SET source_of_truth = 'pattern scan of the tracked files, allowlist scripts/secret-scan-allowlist.txt: scripts/bp26_repo.py collect_secrets_in_repo, runner [BP26]'
  WHERE metric = 'secrets_in_repo';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.credential_registry (credential names and how their expiry can be known) with metric cloudflare_token_expires_in_min: scripts/bp26_repo.py collect_credential_expiry, runner [BP26]'
  WHERE metric = 'secret_expiry_warnings_open';
UPDATE metric_registry SET source_of_truth = 'Cloudflare API D1 database list (file_size of the largest database over 10 x 10^9 bytes): scripts/bp26_repo.py collect_d1_size_and_drill, runner [BP26]'
  WHERE metric = 'd1_db_size_pct';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.d1_restore_drills (newest outcome pass; unknown until one passes): scripts/bp26_repo.py collect_d1_size_and_drill, runner [BP26]'
  WHERE metric = 'd1_restore_drill_age_days';
UPDATE metric_registry SET source_of_truth = 'qnfo-audit.migration_runs.bookmark (D1 Time Travel restore point per applied migration, taken at applied_at minus 120 s by scripts/bp26_repo.py collect_migration_bookmarks), runner [BP26]'
  WHERE metric = 'pre_migration_bookmark_recorded';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-repo',
  'a Time Travel bookmark for a past timestamp is a real restore point for 30 days, so recording it afterwards is the same safety as capturing it at apply time while scripts/apply_migrations.py is claimed by another session; a credential whose expiry the fleet cannot read must be listed as such, not counted as fine',
  'BP26-REPO-1: scripts/bp26_repo.py (six collectors for eight metrics), migration_runs.bookmark and bookmark_source, credential_registry, d1_restore_drills, the real source_of_truth of the eight metrics, observability on the root stub',
  'Cloudflare API 2026-10-26T19:5xZ: 35 deployed scripts, 34 with observability enabled (qnfo-workers, the repository root stub, is off); D1 list: qnfo-audit 981483520 bytes; time_travel/bookmark?timestamp= answered for 2026-10-26 and refused 2026-09-01 as too old; qnfo-ops/worker.js has no source-map upload code; opsPublicGate keeps a KV hit counter',
  'applied by migration; the collectors run on the next remediation-consumer run after merge', 'two columns on migration_runs, two new tables, eight metric source texts, one root wrangler.toml observability block; the collectors only read, and write migration_runs.bookmark',
  'the Rollback line', 'eight BP26 metrics measured from the real checkout, API and ledger; a restore point recorded for every applied migration',
  'bp26_metrics_unmeasured falls by about six at the first runner pass (the restore drill age stays unknown until a drill passes); observability_enabled_share reaches 1.0 after the root stub redeploys; pre_migration_bookmark_recorded climbs to 1.0 within a few runs',
  'none directly; it makes the restore points and the credential gaps visible', 'offline: scripts/bp26_repo.py --selftest and migrations/bp26-repo.test.mjs; live: dry runs of every collector on 2026-10-26'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-REPO-1:%');

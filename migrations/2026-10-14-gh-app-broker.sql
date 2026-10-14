-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'off' WHERE key = 'gh_app_primary' (instant, no deploy); full: DELETE FROM analytics_metric_triggers WHERE metric_key = 'github_app_token_ok'; DELETE FROM metric_registry WHERE metric = 'github_app_token_ok'; DELETE FROM ops_config WHERE key = 'gh_app_primary'; DELETE FROM control_registry WHERE control = 'gh_app_primary'; DELETE FROM capability_ledger WHERE capability = 'github-app-installation-token'
--
-- GH-APP-BROKER-1 (qnfo-fleet-control 0.32.0; agent_issues 2595; charter pillar autonomy, security). The owner created the GitHub App
-- qnfo-fleet on 2026-10-14 and set GH_APP_PRIVATE_KEY, GH_APP_ID and GH_APP_INSTALLATION_ID on qnfo-fleet-control. The worker now mints
-- an installation token (one hour, cached) and uses it as GITHUB_TOKEN for every GitHub call, replaying a refused call once with the
-- personal token. This file registers the switch, its metric and trigger, and the capability.
-- spof-review: spof_registry 'GitHub token (worker secrets)' gains the App path as its second credential for qnfo-fleet-control

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('gh_app_primary', 'on',
 'GH-APP-BROKER-1: on = qnfo-fleet-control uses the GitHub App installation token with a per-request fallback to the personal token; off = personal token only (no deploy needed)');

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state,
  alternate_path, alternate_tested_at, evidence, issue_id) VALUES
('gh_app_primary', 'ops_config gh_app_primary, read by qnfo-fleet-control ghAppEnv on every invocation', 'kill-switch',
 'an App token that lacks a scope the fleet needs, or an App outage, stopping GitHub writes', 0, 'keep', 'applied',
 'the per-request fallback to the personal token covers a refused call without the switch; off restores the personal token for all calls',
 NULL, 'qnfo-fleet-control 0.32.0; gh-app-broker.test.mjs', 2595);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor,
  refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
('github_app_token_ok', 'operational', 'guard',
 '1 when qnfo-fleet-control minted (or holds a live) GitHub App installation token on its latest tick, else 0',
 'qnfo-fleet-control GH-APP-BROKER-1 (scheduler_state gh_app_broker; GET /gh-app), every 10 minutes', 'unmeasured before 0.32.0', '1',
 'qnfo-fleet-control', 'trigger lt 1 -> issue naming the mint error from /gh-app', '*/10', '< 1', '< 1', 'UNMEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'github_app_token_ok', 'GitHub App token not minted: fleet on the personal-token fallback', 'registry', 'lt', 1, 1,
  'Pillar autonomy (GH-APP-BROKER-1). qnfo-fleet-control could not mint the qnfo-fleet App installation token, so every GitHub call runs on the personal token (still working: github_token_ok). Read GET https://qnfo-fleet-control.q08.workers.dev/gh-app (gh_app and why, never token text) and scheduler_state gh_app_broker. why "is PKCS#1": the key secret needs the openssl pkcs8 -topk8 -nocrypt form; "is not set": a secret is missing; access_tokens 401: wrong App id or key; 404: wrong installation id or the App was uninstalled. A new key, App id or installation is the owner''s step (IDENTITY-BOUND card naming the field, with this metric as its closing probe); a code fault is fixed in qnfo-fleet-control ghAppToken. Done when github_app_token_ok is 1.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'GH-APP-BROKER-1: evaluated every 10 minutes'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'github_app_token_ok');

UPDATE spof_registry SET alternate_path = alternate_path || '; qnfo-fleet-control 0.32.0 holds two credentials: the GitHub App installation token (primary) and the personal token (per-request fallback)',
  reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE component = 'GitHub token (worker secrets)' AND alternate_path NOT LIKE '%GitHub App installation token%';

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence) VALUES
('github-app-installation-token', 'qnfo-fleet-control 0.32.0 GH-APP-BROKER-1 (session_018gmMjMgWAuzVh7gHPBcosA)',
 'GitHub App qnfo-fleet installed on QNFO; worker secrets GH_APP_PRIVATE_KEY (PKCS#8), GH_APP_ID, GH_APP_INSTALLATION_ID',
 'measured by github_app_token_ok every 10 minutes', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
 'short-lived, self-renewing GitHub credential not tied to the owner''s personal account; per-request fallback keeps every call working');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
  predicted_outcome, reach_gain, surfaces_tested) VALUES
('session_018gmMjMgWAuzVh7gHPBcosA',
 'the App installation token covers the fleet''s repository calls; any call outside its permissions or installation is answered 401/403/404 and replayed with the personal token',
 'GH-APP-BROKER-1: qnfo-fleet-control 0.32.0 uses the App installation token as GITHUB_TOKEN, ops_config gh_app_primary on',
 'owner set the App secrets 2026-10-14; offline suite signs and verifies the RS256 JWT; 416 suites pass',
 'applied by apply-migrations', 'qnfo-fleet-control GitHub calls (lane merges, charter, portfolio, evolve, code loop)', 'ops_config gh_app_primary = off',
 'GitHub credential that renews itself hourly and does not act as the owner''s personal account',
 'github_app_token_ok = 1 within 20 min of the deploy', 'none', 'offline JWT signing replay; full suite set');

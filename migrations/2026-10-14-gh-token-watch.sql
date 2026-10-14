-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key IN ('github_token_ok','github_token_expires_in_min'); DELETE FROM metric_registry WHERE metric IN ('github_token_ok','github_token_expires_in_min','github_api_remaining'); DELETE FROM spof_registry WHERE component = 'GitHub token (worker secrets)'; DELETE FROM failure_modes WHERE fm_key = 'github-token-lapse'; DELETE FROM remediation_contracts WHERE class = 'fm-github-token-lapse'
--
-- GH-TOKEN-WATCH-1 (qnfo-cloud-ops 1.30.0; charter pillar autonomy). The Cloudflare -> GitHub half of the fleet (stale-PR lane merges,
-- the code loop, canonical-deploy and remediation-consumer dispatches, PROBE-CADENCE-1) runs on GitHub tokens held as worker secrets
-- (GITHUB_TOKEN in 13 workers, GH_TOKEN in qnfo-cloud-ops). Read 2026-10-14 07:30Z: no spof_registry row, metric or issue covered them,
-- so an expired or revoked token would stop every merge and dispatch with no signal. qnfo-cloud-ops now reads GET /rate_limit every
-- 10 minutes and writes the three metrics below. Renewing a token is the owner's step (a credential only the owner can mint):
-- the expiry trigger fires 20160 minutes ahead so the IDENTITY-BOUND card has two weeks; a refused token files a critical issue at once.
-- spof-review: new spof_registry row 'GitHub token (worker secrets)'; no trigger, cron or credential changes

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor,
  refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
('github_token_ok', 'operational', 'guard',
 '1 when GitHub answers GET /rate_limit with HTTP 200 for qnfo-cloud-ops GH_TOKEN, else 0',
 'qnfo-cloud-ops GH-TOKEN-WATCH-1 (scheduler_state gh_token_watch), every 10 minutes', 'unmeasured before 1.30.0', '1',
 'qnfo-cloud-ops', 'trigger lt 1 -> critical issue: the Cloudflare -> GitHub path is down', '*/10', '< 1', '< 1', 'UNMEASURED', 'computed'),
('github_token_expires_in_min', 'operational', 'guard',
 'minutes until the github-authentication-token-expiration date of qnfo-cloud-ops GH_TOKEN; 999999 when the token has no expiry date',
 'qnfo-cloud-ops GH-TOKEN-WATCH-1 (scheduler_state gh_token_watch), every 10 minutes', 'unmeasured before 1.30.0', '>= 20160',
 'qnfo-cloud-ops', 'trigger lt 20160 -> issue with an IDENTITY-BOUND owner card to renew the token before it lapses', '*/10', '< 20160', '< 1440',
 'UNMEASURED', 'computed'),
('github_api_remaining', 'operational', 'leading',
 'x-ratelimit-remaining of GET /rate_limit for qnfo-cloud-ops GH_TOKEN (core API calls left in the current hour)',
 'qnfo-cloud-ops GH-TOKEN-WATCH-1, every 10 minutes', 'unmeasured before 1.30.0', '> 500', 'qnfo-cloud-ops',
 'exempt from a trigger: measurement only; a starved token shows first as github_token_ok and the loops'' own HTTP 403 records', '*/10',
 '< 500', '< 100', 'UNMEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'github_token_ok', 'GitHub token refused: Cloudflare -> GitHub path down', 'registry', 'lt', 1, 0,
  'Pillar autonomy (GH-TOKEN-WATCH-1). GitHub refused the worker token, so stale-PR lane merges, code-loop PRs, canonical-deploy and remediation-consumer dispatches stop. Read SELECT value FROM scheduler_state WHERE key = ''gh_token_watch'' for the HTTP status. Probe each token holder''s own GitHub call (qnfo-fleet-control /health, the lane''s last merge in cloud_ops_events) to see whether GITHUB_TOKEN is also refused. A revoked or expired token is a credential only the owner can mint: file one human_actions card with an IDENTITY-BOUND: line naming the secret (GH_TOKEN and/or GITHUB_TOKEN), the workers that hold it and the scopes they use (contents, pull_requests, actions write), with this metric as its closing probe; then the new value goes in under the secret lock (CLAUDE.md #1701). Done when github_token_ok is 1.',
  'qnfo-cloud-ops', 'agent_issues', 2, 1, 'GH-TOKEN-WATCH-1: evaluated every 10 minutes'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'github_token_ok');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'github_token_expires_in_min', 'GitHub token expires within 20160 minutes', 'registry', 'lt', 20160, 1,
  'Pillar autonomy (GH-TOKEN-WATCH-1). The worker GitHub token expires soon (minutes left in metric_registry github_token_expires_in_min; date in scheduler_state gh_token_watch). Renewing it is a credential only the owner can mint: file one human_actions card with an IDENTITY-BOUND: line, the expiry date, the secrets to replace (GH_TOKEN in qnfo-cloud-ops; GITHUB_TOKEN in the workers that hold it) and the scopes in use, with this metric as its closing probe. The default while the card waits: nothing changes until the date. The new value is written under the secret lock (CLAUDE.md #1701). Done when github_token_expires_in_min is at least 20160.',
  'qnfo-cloud-ops', 'agent_issues', 2, 1, 'GH-TOKEN-WATCH-1: 20160 minutes = two weeks of lead for the owner step'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'github_token_expires_in_min');

INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
('GitHub token (worker secrets)',
 'every Cloudflare -> GitHub write: stale-PR lane and code-loop merges, code-task PRs, canonical-deploy and remediation-consumer dispatches',
 'GitHub -> Cloudflare still runs without it (push to main triggers canonical-deploy with the repository CLOUDFLARE_API_TOKEN; GitHub schedules run the consumer); detection by GH-TOKEN-WATCH-1 every 10 minutes',
 NULL,
 '13 workers read env.GITHUB_TOKEN and qnfo-cloud-ops reads env.GH_TOKEN (git grep 2026-10-14); no metric covered validity or expiry before qnfo-cloud-ops 1.30.0',
 NULL);

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('github-token-lapse',
 'a worker-held GitHub token expires or is revoked and every Cloudflare -> GitHub action stops without a signal',
 'GitHub tokens with an expiry date were stored as worker secrets with no watch on their validity or expiry',
 'GH-TOKEN-WATCH-1: qnfo-cloud-ops reads /rate_limit every 10 minutes; triggers on github_token_ok and github_token_expires_in_min',
 'github_token_ok = 1 and github_token_expires_in_min >= 1440, refreshed within 30 minutes',
 'fm-github-token-lapse', '2026-10-14', NULL,
 'a token past its expiry date, revoked, or refused with HTTP 401',
 'PR lane, code loop and dispatches return 401 while the fleet reads green',
 'every GitHub write the fleet makes');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-github-token-lapse', NULL, 'GH-TOKEN-WATCH-1', 'failure-mode detector',
 'SELECT ''1'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''github_token_ok'') = ''1'' AND CAST((SELECT last_value FROM metric_registry WHERE metric = ''github_token_expires_in_min'') AS INTEGER) >= 1440 AND datetime((SELECT last_refreshed FROM metric_registry WHERE metric = ''github_token_ok'')) > datetime(''now'', ''-30 minutes'') THEN ''1'' ELSE ''0'' END AS observed',
 'd1-query', 3, 'qnfo-cloud-ops', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain,
  predicted_outcome, reach_gain, surfaces_tested) VALUES
('session_018gmMjMgWAuzVh7gHPBcosA',
 'GH_TOKEN in qnfo-cloud-ops stands for the fleet''s GitHub tokens; one watched token is a lower bound, and GITHUB_TOKEN holders show the same lapse through their own 401s',
 'GH-TOKEN-WATCH-1: qnfo-cloud-ops 1.30.0 watches its GitHub token every 10 minutes; metrics, triggers, spof row and fm detector',
 'no spof, metric or issue covered the worker GitHub tokens (D1 read 2026-10-14 07:30Z)',
 'applied by apply-migrations', 'three metric rows, two triggers, one spof row, one failure mode and contract', 'see the Rollback header',
 'the fleet sees a refused or expiring GitHub token within 10 minutes and two weeks ahead of expiry',
 'github_token_ok = 1 within 30 min of the deploy', 'none', 'git grep of worker token use; offline parser suite');

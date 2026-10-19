-- CF-TOKEN-WATCH-1 (2026-10-19, RESOLVE-ALL-OPEN-1, agent_issues 2581, pillar autonomy)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key IN ('cloudflare_token_ok','cloudflare_token_expires_in_min'); DELETE FROM metric_registry WHERE metric IN ('cloudflare_token_ok','cloudflare_token_expires_in_min');
--
-- scripts/remediation_consumer.py (cf_token_watch) verifies the repository CLOUDFLARE_API_TOKEN every run and writes
-- these two metrics. The owner directive of 2026-10-08 says no new Cloudflare token will be issued, so a lapse stops
-- every deploy and migration: the expiry trigger gives two weeks of lead for the identity-bound owner step, the ok
-- trigger files a critical issue at once. Mirrors GH-TOKEN-WATCH-1 (github_token_ok / github_token_expires_in_min).

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner,
  disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
('cloudflare_token_ok', 'operational', 'guard',
 '1 when Cloudflare tokens/verify answers status active for the repository CLOUDFLARE_API_TOKEN (account path, then user path), else 0',
 'scripts/remediation_consumer.py cf_token_watch, every consumer run (PROBE-CADENCE-1, at least hourly)',
 'unmeasured before 2026-10-19', '1', 'remediation-consumer',
 'trigger lt 1 -> critical issue: the GitHub -> Cloudflare path (deploys, migrations, cf-ops) is down',
 'hourly', '< 1', '< 1', 'PENDING', 'computed'),
('cloudflare_token_expires_in_min', 'operational', 'guard',
 'minutes until expires_on of the repository CLOUDFLARE_API_TOKEN; 999999 when the token has no expiry',
 'scripts/remediation_consumer.py cf_token_watch, every consumer run (PROBE-CADENCE-1, at least hourly)',
 'unmeasured before 2026-10-19', '>= 20160', 'remediation-consumer',
 'trigger lt 20160 -> issue with an IDENTITY-BOUND owner card to renew the token before it lapses',
 'hourly', '< 20160', '< 1440', 'PENDING', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner,
  queue_target, cooldown_hours, enabled, notes) VALUES
('cloudflare_token_ok', 'Cloudflare repository token refused: deploys and migrations stopped', 'registry', 'lt', 1, 0,
 'Pillar autonomy (CF-TOKEN-WATCH-1). Cloudflare did not answer tokens/verify with status active for the repository CLOUDFLARE_API_TOKEN, so canonical-deploy, apply-migrations, cf-ops-actions and the remediation consumer stop. Read the latest remediation-consumer run log (cf_token_watch path and ok) and dispatch cf-ops-actions report to confirm the refusal. A replacement token is a credential only the owner can mint (owner directive 2026-10-08: no new token will be issued): file one human_actions card with an IDENTITY-BOUND: line naming the repository secret to replace.',
 'remediation-consumer', 'agent_issues', 2, 1, 'CF-TOKEN-WATCH-1: evaluated on the hourly metric tick'),
('cloudflare_token_expires_in_min', 'Cloudflare repository token expires within 20160 minutes', 'registry', 'lt', 20160, 1,
 'Pillar autonomy (CF-TOKEN-WATCH-1). The repository CLOUDFLARE_API_TOKEN expires soon (minutes left in metric_registry cloudflare_token_expires_in_min). Renewing it is a credential only the owner can mint: file one human_actions card with an IDENTITY-BOUND: line, the expiry, and the repository secret to replace; the card closes when the metric reads >= 20160 again.',
 'remediation-consumer', 'agent_issues', 2, 1, 'CF-TOKEN-WATCH-1: 20160 minutes = two weeks of lead for the owner step');

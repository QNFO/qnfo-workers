-- CF-TOKEN-WATCH-3 (CLOCKWORK-1 follow-up, issue 11155, pillar autonomy)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key = 'cloudflare_tokens_expiring_7d'; DELETE FROM metric_breach_cause WHERE metric_key = 'cloudflare_tokens_expiring_7d'; DELETE FROM metric_registry WHERE metric = 'cloudflare_tokens_expiring_7d';
--
-- scripts/remediation_consumer.py cf_tokens_expiry_watch lists every account and user token (names, status, expires_on; never
-- values) each run and writes how many active tokens expire within 7 days or already expired. Only the repository token was
-- watched before (CF-TOKEN-WATCH-1), so an R2 access token could lapse and stop the loop that uses it with no warning.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner,
  disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
('cloudflare_tokens_expiring_7d', 'operational', 'guard',
 'count of account and user Cloudflare tokens with status active or expired whose expires_on is within 7 days or past',
 'scripts/remediation_consumer.py cf_tokens_expiry_watch, every consumer run (PROBE-CADENCE-1, at least hourly)',
 'unmeasured before 2026-11-12', '= 0', 'remediation-consumer',
 'trigger gt 0 -> issue naming the tokens (run log cf_tokens_expiry.names); renewal is a credential only the owner can mint, so the issue carries one IDENTITY-BOUND card',
 'hourly', '> 0', '> 0', 'PENDING', 'computed');

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES ('cloudflare_tokens_expiring_7d', 'structure', 'CF-TOKEN-WATCH-3 2026-11-12: a token lapsing is a structural credential gap');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner,
  queue_target, cooldown_hours, enabled, notes) VALUES
('cloudflare_tokens_expiring_7d', 'A Cloudflare account token expires within 7 days', 'registry', 'gt', 0, 1,
 'Pillar autonomy (CF-TOKEN-WATCH-3). Read the latest remediation-consumer run log (cf_tokens_expiry.names) for the tokens and their expiry. Find which worker or workflow uses each (fleet-graph impact on its binding or secret name). Renewing a token is a credential only the owner can mint: file one human_actions card with an IDENTITY-BOUND: line naming the token and the secret it feeds; the card closes when this metric reads 0.',
 'remediation-consumer', 'agent_issues', 24, 1, 'CF-TOKEN-WATCH-3 2026-11-12');

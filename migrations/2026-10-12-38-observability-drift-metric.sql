-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key = 'observability_drift_unrepaired'; DELETE FROM metric_registry WHERE metric = 'observability_drift_unrepaired'
-- OBSERVABILITY-DRIFT-WATCH-1 (2026-10-12, agent_issues 2394, pillar core; qnfo-fleet-control 0.21.0 in the same PR).
-- Root cause of the drift measured on 2026-10-12 (qnfo-ai declares traces head_sampling_rate 0.1, live reads 1): the
-- fleet-control reassert forced every worker to logs, traces and issues at rate 1 whenever one of the three was off and never
-- read the declared blocks, so the next tick overwrote what the canonical deploy had applied. 0.21.0 holds each worker to its
-- declared keys and patches only on drift. This metric counts the workers whose live settings still differ from the declared
-- ones after the patch (the patch failed or Cloudflare refused the block); the trigger files one issue for the fleet.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('observability_drift_unrepaired', 'operational', 'target',
  'live workers whose Cloudflare observability settings differ from the [observability] blocks their wrangler.toml declares on main after the reassert tick tried to patch them (OBSERVABILITY-DRIFT-WATCH-1; keys compared: enabled, head_sampling_rate, logs.*, traces.*, issues.enabled)',
  'qnfo-fleet-control reassertObservability (*/20 and hourly ticks); cloud_ops_events kind obs-drift-repair lists each repair',
  'unmeasured before 2026-10-12 (the reassert overwrote declared rates; qnfo-ai traces 0.1 read live 1)', '0', 'qnfo-fleet-control', 'qnfo-fleet-control', '20m', '> 0', '> 3', NULL, NULL, 'REGISTERED', 'worker');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'observability_drift_unrepaired', 'Observability drift: a worker''s live settings still differ from its declared wrangler.toml blocks', 'registry', 'gt', 0, 2,
  'Pillar core (OBSERVABILITY-DRIFT-WATCH-1, agent_issues 2394). Read the newest cloud_ops_events row of kind obs-drift-repair: its text names the unrepaired workers and the keys that differ. Causes in order: (1) Cloudflare refused the PATCH for that worker (read the worker''s settings with the CF API; a Durable Object worker needs its exports block, a container worker refuses observability on /settings): fix the request shape in reassertObservability; (2) the declared block is not valid for the API (a rate outside 0..1 is dropped by the parser, so the file keeps saying one thing and the API another): fix the wrangler.toml by PR; (3) the GitHub read failed (no GITHUB_TOKEN or rate limit): the worker is then treated as undeclared and this metric does not count it, so a persistent count means (1) or (2). DoD: the metric reads 0 on two consecutive ticks.',
  'qnfo-fleet-control', 'agent_issues', 6, 1, 'OBSERVABILITY-DRIFT-WATCH-1 (migrations/2026-10-12-38-observability-drift-metric.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'observability_drift_unrepaired');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a declared observability block is the source of truth for a worker; a reassert that overwrites it makes the repository lie',
   'OBSERVABILITY-DRIFT-WATCH-1: qnfo-fleet-control 0.21.0 holds live settings to the declared blocks and measures the remainder (metric observability_drift_unrepaired, trigger gt 0)',
   'agent_issues 2394 evidence 2026-10-12: qnfo-ai declares traces 0.1, live 1; reassertObservability (0.20.1) PATCHes rate 1 for every worker with any of logs/traces/issues off and reads no toml',
   'merged and deployed through the canonical path', 'every live worker''s observability settings; a patch only where live differs from declared', 'revert the PR (the previous reassert returns) and the Rollback line of migration 2026-10-12-38',
   'drift between declared and live observability is measured and repaired every 20 minutes', 'the first 0.21.0 tick patches qnfo-ai traces to 0.1 and the metric reads 0; failure mode observability-config-inert stops recurring within 2 h', 'none', 'cf-api:settings, github:contents');

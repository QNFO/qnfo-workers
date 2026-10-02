-- METRIC-CLOSED-LOOP-1 (2026-10-02, pillar: autonomy). Owner directive 2026-10-02: the fleet measures and improves its
-- own internal and external effectiveness, automatically and continuously, with or without the owner's commands.
-- Applied live by the session that wrote it; idempotent (safe to re-run).
--
-- What was measured before this (qnfo-audit, 2026-10-02 06:40Z):
--   - metric_registry holds 36 metrics, refreshed hourly; but only 9 have an enabled analytics_metric_triggers rule, so
--     27 can sit off target with no consequence. Among them the three largest gaps: billed unified AI spend $224.55/30d
--     against the owner's $150 threshold, Workers AI $59.82/30d against a $7.50 target, and agent-session execution
--     ratio 0.12 against >= 0.8.
--   - metric_registry.state is written 'OK' by the refresh step whatever the value (worker_count 44 against a cap of 30
--     reads OK), so the state column cannot say whether a metric is on target.
--   - nothing measures whether a fired remedy moved its metric, so a remedy that does not work is repeated forever.
--
-- The loop this completes (all on Cloudflare, no session needed):
--   measure   fleet_tasks 'metric-refresh' (hourly, fleet-exec) computes every registered metric;
--   judge     v_metric_trigger_state evaluates every enabled trigger against the live value (the same value order as
--             qnfo-fleet-control evaluateMetricTriggers: records, meta, registry; non-numeric values are unreadable,
--             never 0);
--   act       evaluateMetricTriggers (qnfo-fleet-control, hourly) files one deduped agent_issues row per breach for the
--             owning loop, with the lever and the definition of done;
--   learn     remedy_efficacy_30d = share of firings 7-30 days old whose metric is now back inside its threshold; below
--             0.5 it fires its own trigger, which asks the fleet to replace the remedies that did not work;
--   report    metrics_in_breach (headline, target 0) and metric_trigger_coverage_pct guard the loop itself; the fleet
--             command line's own answer rate is measured like any other metric.
--
-- Deliberately without a trigger (and why): human_actions_open (the owner's queue itself); capability_contract_conformance,
-- energy_efficiency, unmanaged_direct_spend_share (OBJECTIVE-CONSTRAINTS-1 already files and self-closes them);
-- cost_usd_30d (a list-cost estimate, not cash; billed spend is triggered as unified_cost_usd_30d below); cron_compliance
-- (unit ambiguous); external_impact_per_dollar, indexed_surface, zenodo_views_total, zenodo_downloads_total (trend
-- targets need a value history, not a threshold); metrics_in_breach and fleet_cmd_owner_actions_7d (reports).

-- 1. Judge: the live state of every enabled trigger.
DROP VIEW IF EXISTS v_metric_trigger_state;
CREATE VIEW v_metric_trigger_state AS
WITH raw AS (
  SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.queue_target, t.priority,
    COALESCE(
      CASE WHEN t.source_table = 'records' THEN (SELECT CASE WHEN trim(x.value) <> '' AND trim(x.value) NOT GLOB '*[^0-9.+-]*' THEN CAST(trim(x.value) AS REAL) END FROM analytics_dash_records x WHERE x.metric = t.metric_key) END,
      (SELECT CASE WHEN trim(m.value) <> '' AND trim(m.value) NOT GLOB '*[^0-9.+-]*' THEN CAST(trim(m.value) AS REAL) END FROM analytics_dash_meta m WHERE m.key = t.metric_key),
      (SELECT CASE WHEN trim(r.last_value) <> '' AND trim(r.last_value) NOT GLOB '*[^0-9.+-]*' THEN CAST(trim(r.last_value) AS REAL) END FROM metric_registry r WHERE r.metric = t.metric_key)
    ) AS val
  FROM analytics_metric_triggers t WHERE t.enabled = 1
)
SELECT id, metric_key, title, operator, threshold, owner, queue_target, priority, val,
  CASE WHEN val IS NULL THEN NULL
       WHEN operator = 'gt' THEN val > threshold
       WHEN operator = 'lte' THEN val <= threshold
       WHEN operator = 'lt' THEN val < threshold
       WHEN operator = 'eq' THEN val = threshold
       ELSE val >= threshold END AS hit
FROM raw;

-- 2. Learn and report: five metrics about the loop itself and the fleet command line.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('metrics_in_breach', 'system', 'lagging', 'count(v_metric_trigger_state WHERE hit = 1): enabled metric triggers whose live value is outside their threshold right now', 'qnfo-audit.v_metric_trigger_state', 'n/a', '0 (falling)', 'qnfo-fleet-control', 'one agent_issues row per breach via evaluateMetricTriggers (qnfo-fleet-control, hourly)', 'hourly', '> 5', '> 10', 'MEASURED', 'computed'),
 ('metric_trigger_coverage_pct', 'system', 'leading', '100 * metrics in metric_registry with at least one enabled analytics_metric_triggers rule / all metrics in metric_registry', 'qnfo-audit.metric_registry + analytics_metric_triggers', 'n/a', '>= 70 (the rest are named exemptions in migrations/2026-10-02-metric-closed-loop.sql)', 'qnfo-fleet-control', 'a session or loop that registers a metric adds its trigger (METRIC-CLOSED-LOOP-1)', 'hourly', '< 60', '< 40', 'MEASURED', 'computed'),
 ('remedy_efficacy_30d', 'system', 'lagging', 'share of analytics_action_log firings 7-30 days old (dispatched or deduped) whose trigger is no longer hit now (v_metric_trigger_state.hit = 0); n/a when there are none', 'qnfo-audit.analytics_action_log + v_metric_trigger_state', 'n/a', '>= 0.5', 'qnfo-fleet-control', 'its own trigger: replace remedies whose metric did not move', 'hourly', '< 0.5', '< 0.2', 'MEASURED', 'computed'),
 ('fleet_cmd_answer_rate_7d', 'operational', 'leading', 'answered / (answered + failed) over cmd_log rows with kind = ai in the last 7 days (fleet.qnfo.org command line, FLEET-CMD-1); n/a with none', 'qnfo-audit.cmd_log', 'n/a', '>= 0.95', 'qnfo-fleet-dashboard', 'qnfo-fleet-dashboard ASK_MODELS + cmdRunAi budget', 'hourly', '< 0.9', '< 0.7', 'MEASURED', 'computed'),
 ('fleet_cmd_owner_actions_7d', 'system', 'leading', 'count(cmd_log WHERE kind = action AND status = done) in the last 7 days: decisions the owner made at fleet.qnfo.org instead of in an LLM front-end', 'qnfo-audit.cmd_log', '0', '>= 1/week (rising)', 'qnfo-fleet-dashboard', 'report only', 'hourly', NULL, NULL, 'MEASURED', 'computed');

-- cmd_log is created by qnfo-fleet-dashboard on first use; create it here too so the refresh step never fails.
CREATE TABLE IF NOT EXISTS cmd_log (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), text TEXT, from_url TEXT, kind TEXT, status TEXT, answer TEXT, actions_json TEXT, model TEXT, error TEXT, owner INTEGER DEFAULT 0, visitor TEXT, done_ms INTEGER);

UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CASE metric WHEN ''metrics_in_breach'' THEN CAST((SELECT COUNT(*) FROM v_metric_trigger_state WHERE hit = 1) AS TEXT) WHEN ''metric_trigger_coverage_pct'' THEN CAST(ROUND(100.0 * (SELECT COUNT(*) FROM metric_registry r WHERE EXISTS (SELECT 1 FROM analytics_metric_triggers t WHERE t.enabled = 1 AND t.metric_key = r.metric)) / (SELECT COUNT(*) FROM metric_registry), 1) AS TEXT) WHEN ''remedy_efficacy_30d'' THEN COALESCE(CAST((SELECT ROUND(AVG(CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END), 2) FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id WHERE a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') AND a.status IN (''dispatched'', ''deduped'')) AS TEXT), ''n/a'') WHEN ''fleet_cmd_answer_rate_7d'' THEN COALESCE(CAST((SELECT ROUND(1.0 * SUM(status = ''answered'') / NULLIF(SUM(status IN (''answered'', ''failed'')), 0), 2) FROM cmd_log WHERE kind = ''ai'' AND ts >= datetime(''now'', ''-7 days'')) AS TEXT), ''n/a'') ELSE CAST((SELECT COUNT(*) FROM cmd_log WHERE kind = ''action'' AND status = ''done'' AND ts >= datetime(''now'', ''-7 days'')) AS TEXT) END, last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric IN (''metrics_in_breach'', ''metric_trigger_coverage_pct'', ''remedy_efficacy_30d'', ''fleet_cmd_answer_rate_7d'', ''fleet_cmd_owner_actions_7d'')"}')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = 'metric-refresh' AND instr(definition, 'metrics_in_breach') = 0;

-- 3. Act: a trigger for every metric with a threshold-shaped target. Each files one deduped agent_issues row for the
-- owning loop; the issue closes only when the metric is back inside its threshold (CLAUDE.md close_evidence).
-- (D1 caps compound SELECT terms, so the rows are a VALUES list.)
WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner, cooldown) AS (VALUES
  ('unified_cost_usd_30d', 'Cost gap: billed unified AI spend over the owner''s $150/30d threshold', 'meta', 'gt', 150, 9, 'Pillar cost. Billed unified AI spend (analytics_dash_meta.unified_cost_usd_30d) is above the owner''s $150/30d threshold. Find the top callers in ai_spend_ledger by caller and model, move bread-and-butter calls to the free Workers AI tier or the cheap model, and tighten costImpactGuard; never raise a cap.', 'qnfo-fleet-control', 72),
  ('workers_ai_cost_30d_usd', 'Cost gap: Workers AI cost over $10/30d (target $7.50)', 'registry', 'gt', 10, 8, 'Pillar cost. Workers AI cost is far above its $7.50/30d target. Use ai_call_counters (per worker, purpose, model) to find the largest neuron consumers; batch, cache or move them to a cheaper @cf model; cut cadence of indexers and embeddings.', 'qnfo-fleet-control', 168),
  ('session_execution_ratio_30d', 'Autonomy gap: agent sessions finish under 60% of what they start', 'registry', 'lt', 0.6, 7, 'Pillar autonomy. session_records.execution_ratio averages below 0.6. Read the last sessions'' handoff_notes for what stopped them (missing credential, unclear scope, blocked deploy) and remove the most common blocker in the fleet itself.', 'fleet-exec', 168),
  ('session_records_30d', 'Autonomy gap: fewer than 2 agent sessions reported their outcome in 30 days', 'registry', 'lt', 2, 5, 'Pillar autonomy. Sessions do not record their own outcome, so session effectiveness cannot be measured. CLAUDE.md (SESSION-RECORD-1) asks every session to write one session_records row at closeout; check the rule is present and followed.', 'fleet-exec', 168),
  ('watchmaker_index', 'Autonomy gap: recurring operations still need a person or a stalled runner', 'registry', 'gt', 0, 7, 'Pillar autonomy. GET https://fleet.qnfo.org/api/watchmaker lists each operation that still needs a person or whose Cloudflare runner is stalled; give each a worker-cron runner or restart the stalled one.', 'qnfo-fleet-control', 168),
  ('probe_coverage_pct', 'Core gap: health-probe coverage under 90%', 'registry', 'lt', 90, 6, 'Pillar core. Fewer than 90% of service_registry workers were probed in 24h. Add base_url for the missing services or retire the stale registry rows.', 'qnfo-fleet-control', 168),
  ('deploy_freshness_h', 'Core gap: live workers more than 6h behind repo main', 'registry', 'gt', 6, 6, 'Pillar core. The newest fleet_deploys row is over 6h old while main moved. Check canonical-deploy and the */20 redeploy cron.', 'qnfo-fleet-control', 72),
  ('drift_total', 'Core gap: configuration drift between repo and live workers', 'registry', 'gt', 0, 6, 'Pillar core. scan() found drift; reconcile from the repo through the canonical deploy, never by hand.', 'qnfo-fleet-control', 72),
  ('guard_rcs', 'Security gap: a deploy or model guard exited non-zero', 'registry', 'gt', 0, 7, 'Pillar security. A guard failed closed. Read the guard output, fix the cause; never disable the guard.', 'qnfo-fleet-control', 72),
  ('open_agent_issues', 'Autonomy gap: more than 20 open agent issues', 'registry', 'gt', 20, 6, 'Pillar autonomy. The backlog is growing faster than it closes. Triage oldest-first, close duplicates with evidence, and route each remaining issue to an owning loop.', 'qnfo-kaizen', 168),
  ('fleet_context_tokens', 'Cost gap: fleet context over 800k tokens', 'registry', 'gt', 800000, 5, 'Pillar cost. The fleet context digest is too large; compact the ledger and load the digest only.', 'qnfo-fleet-control', 168),
  ('gateway_cap_30d_usd', 'Cost gap: AI gateway cap above $180/30d', 'registry', 'gt', 180, 7, 'Pillar cost. The live gateway cap drifted above $180; costImpactGuard tightens it toward the owner''s $150. Never raise it.', 'qnfo-fleet-control', 72),
  ('distribution_posts_30d', 'Reach gap: fewer than 7 distribution posts in 30 days', 'registry', 'lt', 7, 6, 'Pillar reach. qnfo-social posted under 7 items in 30 days. Check the social kill switch, the queue and the owner-voice gates; volume is never the goal, cadence is.', 'qnfo-social', 168),
  ('publications_30d', 'Research gap: nothing published in 30 days', 'registry', 'lt', 1, 6, 'Pillar research. No publication in 30 days. Check the reviser -> version_queue -> research-exec publish drain.', 'qnfo-research-exec', 168),
  ('full_reports_live_30d', 'Research gap: no full report published in 30 days', 'registry', 'lt', 1, 6, 'Pillar research. No full report (>= 5000 chars) went live in 30 days. Check publishV2 and the reviser queue.', 'qnfo-research-exec', 168),
  ('pageviews_30d', 'Reach gap: pageviews under 6100 in 30 days', 'registry', 'lt', 6100, 6, 'Pillar reach. Pageviews fell below the 6100/30d band. Compare referral_30d, distribution_posts_30d and indexed_surface to find which lever dropped; fix that one.', 'qnfo-social', 168),
  ('referral_30d', 'Reach gap: no referral traffic in 30 days', 'registry', 'lt', 1, 6, 'Pillar reach. Distribution posts are not producing referrals; check live UTM links and the posting cadence.', 'qnfo-social', 168),
  ('impressions_growth_30d', 'Reach gap: impressions growth under +10% month on month', 'registry', 'lt', 10, 7, 'Pillar reach. Impressions growth is under +10% MoM (target +30% by 2026-10-25). Pick the reach lever with the best measured referral_30d per post and double down on it inside the owner-voice gates.', 'qnfo-social', 168),
  ('remedy_efficacy_30d', 'Autonomy gap: fleet remedies are not moving their metrics', 'registry', 'lt', 0.5, 8, 'Pillar autonomy. Under half of the metric-trigger remedies fired 7-30 days ago brought their metric back. Run: SELECT s.metric_key, s.val, s.threshold, t.action FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1 AND a.fired_at < datetime(''now'', ''-7 days''). For each, the remedy did not work: write a different, concrete lever into analytics_metric_triggers.action (with a code-task if it needs code), or correct a wrong target with evidence.', 'qnfo-kaizen', 168),
  ('fleet_cmd_answer_rate_7d', 'Owner-experience gap: the fleet command line fails more than 10% of plain-English requests', 'registry', 'lt', 0.9, 7, 'Pillar autonomy. cmd_log shows failed AI answers at fleet.qnfo.org. Read cmd_log.error for the cause (timeout, model http error), adjust ASK_MODELS or the budget in qnfo-fleet-dashboard.', 'qnfo-fleet-dashboard', 72),
  ('metric_trigger_coverage_pct', 'Autonomy gap: registered metrics without an automatic remedy', 'registry', 'lt', 60, 6, 'Pillar autonomy. Under 60% of metric_registry rows have an enabled trigger. Add a trigger for each new metric, or name its exemption in the migration that registered it.', 'qnfo-fleet-control', 168)
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry (or analytics_dash_meta); record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', v.owner, 'agent_issues', v.cooldown, 1, 'METRIC-CLOSED-LOOP-1 2026-10-02'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

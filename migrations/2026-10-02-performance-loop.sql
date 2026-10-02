-- PERFORMANCE-LOOP-1 (2026-10-02, pillar: autonomy; the KPIs serve core, cost and reach). Owner directive 2026-10-02:
-- "automatically measure and improve internal and external performance and effectiveness metrics systemwide ... and
-- constantly and consistently improve, adapt, and change yourself and the system to improve those metrics."
-- Idempotent (safe to re-run). Not applied by the session that wrote it; the owner's coordinating session applies it.
--
-- What it adds on top of METRIC-CLOSED-LOOP-1 (migrations/2026-10-02-metric-closed-loop.sql) and IMPROVEMENT-LOOP-1
-- (qnfo-fleet-control 0.4.87, metric_history):
--   1. the experiment ledger the kernel writes (qnfo-fleet-control 0.4.91 PERFORMANCE-LOOP-1): perf_levers,
--      perf_experiments, perf_runs. Same DDL as PERF_DDL in the worker, so either may create them first;
--   2. the first lever named by a trigger: the action of fleet_ai_run_rate_30d_usd (FLEET-RUN-RATE-1, qnfo-fleet-control
--      0.4.90: the fleet's own AI cost projected from the last 7 days, so a change shows inside an experiment's window)
--      gains 'perf-lever:q08-cadence'. When that trigger is hit on 3 consecutive metric_history days the kernel steps
--      ops_config q08_max_per_day down by 2 (within 2..10), and keeps or reverts it after 14 days on the metric's own
--      history. The trigger row is created here with FLEET-RUN-RATE-1's own fields if the kernel has not seeded it yet,
--      so the order in which this migration and that deploy land does not matter;
--   3. remedy_efficacy_30d learns from experiments: a kept experiment counts as a remedy that worked, a reverted one as a
--      remedy that did not, beside the trigger firings it already counts (superseded and aborted ones are not judged);
--   4. six KPIs and their registry rows (five computed hourly by the kernel, one by qnfo-fleet-dashboard 1.17.4), and a
--      trigger for every KPI the owner's coordinating session listed, including the five other workers compute
--      (social_engagement_rate_30d in qnfo-social; outreach_reply_rate_30d and warm_conversations_30d in qnfo-cloud-ops;
--      inbound_first_response_h_median_30d in qnfo-email; inbound_contacts_30d in qnfo-fleet-dashboard). A trigger on a
--      metric with no numeric value yet is unreadable, never fired (v_metric_trigger_state.hit is NULL).
--
-- Deliberately without a trigger (CLAUDE.md METRIC-CLOSED-LOOP-1 names its exemption here): engaged_human_sessions_28d.
-- Its STRATEGY s9 target is relative ("baseline in week 1, then x2") and the baseline does not exist yet; its registry
-- target starts with 'maximize', so IMPROVEMENT-LOOP-1 judges its 7d trend and files METRIC-REGRESSION-1 on a decline.
-- A threshold trigger follows once two weeks of bot-filtered readings exist (2 x the week-1 median, linear pace to
-- 2026-12-31).
--
-- Units the triggers below assume for the metrics other workers compute (check each against its writer before applying):
--   social_engagement_rate_30d          reactions + reposts + replies or quotes per post in 30 days (a count per post)
--   outreach_reply_rate_30d             a fraction 0..1 (replies / recipients), not a percentage
--   warm_conversations_30d              distinct people in 30 days
--   inbound_first_response_h_median_30d hours
--   inbound_contacts_30d                distinct people in 30 days

-- 1. The experiment ledger (same DDL as PERF_DDL in qnfo-fleet-control/worker.js).
CREATE TABLE IF NOT EXISTS perf_levers (key TEXT PRIMARY KEY, metric TEXT, ops_config_key TEXT, min REAL, max REAL, step REAL, current TEXT, tier TEXT, note TEXT, direction INTEGER, effect TEXT, default_value REAL, owner_voice INTEGER, eval_days INTEGER, updated_at TEXT);
CREATE TABLE IF NOT EXISTS perf_experiments (id INTEGER PRIMARY KEY AUTOINCREMENT, lever TEXT, metric TEXT, trigger_id INTEGER, dir TEXT, from_value TEXT, to_value TEXT, started_at TEXT, baseline REAL, baseline_sd REAL, eval_after TEXT, observed REAL, threshold REAL, decision TEXT, decided_at TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS perf_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, day TEXT, kind TEXT, worker_version TEXT, enabled INTEGER, started INTEGER, decided INTEGER, running INTEGER, note TEXT, state_json TEXT);

-- 2. The first trigger-named lever. q08-signal-engine composes every essay with Workers AI (env.AI.run, attributed in
-- ai_call_counters, which fleet_ai_run_rate_30d_usd projects) and reads ops_config q08_max_per_day before each generation
-- (Q08-CADENCE-CAP-1).
UPDATE analytics_metric_triggers
SET action = action || ' Experiment lever perf-lever:q08-cadence: q08 essays are Workers AI calls, so PERFORMANCE-LOOP-1 (qnfo-fleet-control) may step ops_config q08_max_per_day down by 2 (bounds 2..10) and keeps it only if this metric improves beyond noise within 14 days, else reverts it; ops_config perf_loop_enabled=0 stops new experiments.'
WHERE metric_key = 'fleet_ai_run_rate_30d_usd' AND enabled = 1 AND instr(action, 'perf-lever:q08-cadence') = 0;
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('fleet_ai_run_rate_30d_usd', 'Fleet AI run-rate above $15/30d (the fleet''s own live spend)', 'registry', 'gt', 15, 'high',
  'Read ai_call_counters for the last 7 days grouped by worker and model; the top neuron consumer is the lever (2026-10-02: qnfo-research-exec, glm-5.3 at max reasoning effort, about 4k neurons per call). Prefer reasoning_effort low or a cheaper model on stages whose output quality is verified downstream, and record the before/after quality check. Close when metric_registry.fleet_ai_run_rate_30d_usd <= 15. Experiment lever perf-lever:q08-cadence: q08 essays are Workers AI calls, so PERFORMANCE-LOOP-1 (qnfo-fleet-control) may step ops_config q08_max_per_day down by 2 (bounds 2..10) and keeps it only if this metric improves beyond noise within 14 days, else reverts it; ops_config perf_loop_enabled=0 stops new experiments.',
  'qnfo-fleet-control', 'agent_issues', 168, 1, 'seeded by FLEET-RUN-RATE-1; perf-lever token by PERFORMANCE-LOOP-1');

-- 3. remedy_efficacy_30d also judges experiments (kept = 1.0, reverted = 0.0), on the metric-refresh task's SQL step.
UPDATE fleet_tasks
SET definition = replace(definition,
  'WHEN ''remedy_efficacy_30d'' THEN COALESCE(CAST((SELECT ROUND(AVG(CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END), 2) FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id WHERE a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') AND a.status IN (''dispatched'', ''deduped'')) AS TEXT), ''n/a'')',
  'WHEN ''remedy_efficacy_30d'' THEN COALESCE(CAST((SELECT ROUND(AVG(o), 2) FROM (SELECT CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END AS o FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id WHERE a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') AND a.status IN (''dispatched'', ''deduped'') UNION ALL SELECT CASE e.decision WHEN ''kept'' THEN 1.0 ELSE 0.0 END AS o FROM perf_experiments e WHERE e.decision IN (''kept'', ''reverted'') AND e.decided_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 days''))) AS TEXT), ''n/a'')'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh' AND instr(definition, 'perf_experiments') = 0;

UPDATE metric_registry
SET formula = 'mean over (a) analytics_action_log firings 7-30 days old (dispatched or deduped): 1 if their trigger is no longer hit now (v_metric_trigger_state.hit = 0), 0 if it still is, and (b) PERFORMANCE-LOOP-1 lever experiments decided in the last 30 days: 1 if kept (the metric improved beyond noise), 0 if reverted; n/a when there are none',
    source_of_truth = 'qnfo-audit.analytics_action_log + v_metric_trigger_state + perf_experiments'
WHERE metric = 'remedy_efficacy_30d' AND instr(COALESCE(formula, ''), 'perf_experiments') = 0;

-- 4a. Registry rows for the six KPIs this change computes (the kernel and the dashboard also INSERT OR IGNORE them).
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('issue_mttr_h_30d', 'operational', 'leading', 'median hours from created_at to the closing update (updated_at) of agent_issues closed or resolved in the last 30 days (wontfix and duplicate excluded); unmeasured under 10 closures (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)', 'qnfo-audit.agent_issues (created_at, updated_at in ms)', 'n/a', '<= 48 (median hours from filing to closing; a guard band, no stated target: autotriage gives every issue a 7-day SLA)', 'qnfo-fleet-control', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach; PERFORMANCE-LOOP-1 measures it', 'hourly', '> 24', '> 72', 'MEASURED', 'computed'),
 ('deploy_failure_rate_7d', 'operational', 'leading', 'rows with ok=0 / all rows in fleet_deploys over the last 7 days; unmeasured under 20 deploys (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)', 'qnfo-audit.fleet_deploys (canonical deploy ledger)', 'n/a', '<= 0.1 (share of canonical deploys that failed in 7 days; a guard band)', 'qnfo-fleet-control', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach; PERFORMANCE-LOOP-1 measures it', 'hourly', '> 0.05', '> 0.2', 'MEASURED', 'computed'),
 ('worker_health_failure_rate', 'operational', 'leading', 'share of live workers in worker_live_audit (notes other than NOT_A_WORKER and NOT_DEPLOYED) that are neither http 200 nor SYNC or CRON_ONLY; unmeasured when the newest probe is over 26h old (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)', 'qnfo-audit.worker_live_audit', 'n/a', '<= 0 (charter s5 and principle 2: every live worker serving, judged by a live probe)', 'qnfo-fleet-control', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach; PERFORMANCE-LOOP-1 measures it', 'hourly', '> 0', '> 0.1', 'MEASURED', 'computed'),
 ('credibility_events_90d', 'system', 'lagging', 'max(new OpenAlex citations of the 7 selected works in 90 days + third-party mentions in non-social sources first seen in 90 days (external_mentions; social posts listed, not counted), the attested invest_facts credibility_events). Unmeasured when OpenAlex covers fewer than 4 of the 7 selected works and nothing is attested. Talks, acceptances, press and arXiv listings count only when attested (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)', 'qnfo-audit.citation_stats (openalex) + external_mentions + invest_facts', 'n/a', '>= 2 by 2026-12-31 (STRATEGY s9 review gate; the s9 target is 3)', 'qnfo-fleet-control', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach; PERFORMANCE-LOOP-1 measures it', 'hourly', '< 2', '< 1', 'MEASURED', 'computed'),
 ('selected_works_citation_coverage', 'fleet', 'leading', 'selected works (STRATEGY s2.4, 7 DOIs) with an OpenAlex cited_by_count reading in the last 3 days; unmeasured when the collection has not run in 72h (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)', 'qnfo-audit.citation_stats (qnfo-paper-indexer OpenAlex collection)', 'n/a', '>= 7 (every selected work in the daily OpenAlex collection, STRATEGY s6.1)', 'qnfo-fleet-control', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach; PERFORMANCE-LOOP-1 measures it', 'hourly', '< 7', '< 4', 'MEASURED', 'computed'),
 ('engaged_human_sessions_28d', 'fleet', 'leading', 'Cloudflare Web Analytics (RUM) page views over the last 28 days with the Exclude-bots filter (bot: 0), STRATEGY s6.3; unmeasured when fewer than 26 of the 28 days hold data or the read fails (qnfo-fleet-dashboard refreshRegistryMetrics, hourly)', 'CF GraphQL rumPageloadEventsAdaptiveGroups filter bot: 0 (qnfo-fleet-dashboard, CF_TOKEN)', 'n/a', 'maximize (STRATEGY s9: baseline in week 1, then x2 by 2026-12-31; trended by IMPROVEMENT-LOOP-1 until the baseline exists)', 'qnfo-fleet-dashboard', 'IMPROVEMENT-LOOP-1 files METRIC-REGRESSION-1 on a decline (exempt from a threshold trigger, migrations/2026-10-02-performance-loop.sql)', 'hourly', 'falling week on week', 'falling 2 weeks', 'MEASURED', 'computed');

-- 4b. Triggers: threshold, owner, a concrete lever and the definition of done (CLAUDE.md METRIC-CLOSED-LOOP-1).
WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner, cooldown) AS (VALUES
  ('issue_mttr_h_30d', 'Autonomy gap: the median issue takes over 48h to close', 'registry', 'gt', 48, 5, 'Pillar autonomy. Median time to close (30d) is above 48h. Take the oldest open classes first: give each recurring class a machine predicate that closes it on a live probe (remediation_contracts, qnfo-backlog-exec), route code defects to EVOLVE-PR-1 (a code-defect category and the worker as issue_triage.owner), and stop filing non-actionable duplicates.', 'qnfo-backlog-exec', 168),
  ('deploy_failure_rate_7d', 'Core gap: over 10% of canonical deploys failed in 7 days', 'registry', 'gt', 0.1, 6, 'Pillar core. More than 10% of fleet_deploys rows in 7 days have ok=0. Group the failures by worker and note (SELECT worker, note, COUNT(*) FROM fleet_deploys WHERE ok=0 AND ts >= datetime(''now'',''-7 days'') GROUP BY 1, 2), fix the dominant cause in that worker or in the canonical deploy step, and stop redeploy loops.', 'qnfo-ops', 72),
  ('worker_health_failure_rate', 'Core gap: live workers failing their health probe', 'registry', 'gt', 0.05, 7, 'Pillar core. More than 5% of live workers in worker_live_audit are neither http 200 nor SYNC or CRON_ONLY. Re-probe each failing worker''s /health and fix the crash; a worker that serves no HTTP reports CRON_ONLY.', 'qnfo-fleet-control', 24),
  ('credibility_events_90d', 'Reach gap: fewer than 2 credibility events in 90 days (review gate)', 'registry', 'lt', 2, 7, 'Pillar reach. The 2026-12-31 review gate needs credibility events >= 2 (STRATEGY s9). Levers: the arXiv package for selected works 1, 2 and 4 (STRATEGY s4); Scholar tags with citation_pdf_url on paper pages; a JPCUB measurement call to warm contacts (STRATEGY s7); attest each real event with its evidence at POST https://fleet.qnfo.org/api/decision/fact. Never count volume.', 'qnfo-paper-indexer', 168),
  ('selected_works_citation_coverage', 'Measurement gap: OpenAlex does not cover every selected work', 'registry', 'lt', 7, 6, 'Pillar reach. Fewer than 7 of the selected works (STRATEGY s2.4) have an OpenAlex cited_by_count reading in 3 days, so credibility_events_90d cannot be measured. Add the seven DOIs to qnfo-paper-indexer''s daily OpenAlex collection whatever their age (STRATEGY s6.1: cover the selected works always).', 'qnfo-paper-indexer', 168),
  ('warm_conversations_30d', 'Reach gap: fewer than 3 warm conversations in 30 days', 'registry', 'lt', 3, 7, 'Pillar reach. STRATEGY s9 asks for 10 new warm conversations by 2026-12-31 (about 3.3 per 30 days). Answer every escalated human email still awaiting a draft (email_reply_queue decision escalate), offer the JPCUB assessment to warm contacts (STRATEGY s7), and tie each outreach first line to the recipient''s own work (OUTREACH-CONSENT-1); never above 8 sends a day.', 'qnfo-cloud-ops', 168),
  ('outreach_reply_rate_30d', 'Reach gap: research outreach reply rate under 2% (30 days)', 'registry', 'lt', 0.02, 6, 'Pillar reach. Fewer than 2% of research recipients reply (the campaign ran at about 4% before 2026-10-01). Move the daily cap toward the segments that answer and stop any segment under 1% after 50 sends (STRATEGY s6.4); rewrite the first line around the recipient''s own work. Never raise the 8/day cap.', 'qnfo-cloud-ops', 168),
  ('inbound_first_response_h_median_30d', 'Reach gap: humans wait over 48h for a first reply', 'registry', 'gt', 48, 6, 'Pillar reach. The median first response to an inbound human email is over 48h. Author the drafts the queue executor waits for (email_reply_queue decision escalate, draft_text empty) and check replyStallGuard and the drain cron in qnfo-email.', 'qnfo-email', 72),
  ('social_engagement_rate_30d', 'Reach gap: under 1 engagement per post (30 days)', 'registry', 'lt', 1, 6, 'Pillar reach. Posts average under one reaction, repost or reply. Post about the selected works with the claim, test and status lines (STRATEGY s2.5), one UTM link each; never raise the cadence above STRATEGY s4 and never automate follows or likes. Check that the engagement collector ran in the last 48h.', 'qnfo-social', 168),
  ('inbound_contacts_30d', 'Reach gap: no inbound human contact in 30 days', 'registry', 'lt', 1, 6, 'Pillar reach. Nobody wrote to the fleet unprompted in 30 days. Put a contact and subscribe line on every selected-work page (STRATEGY s2.5) and in each post about a selected work, and check that mail to rowan.quni@qnfo.org reaches qnfo-audit.emails.', 'qnfo-gateway', 168)
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', v.owner, 'agent_issues', v.cooldown, 1, 'PERFORMANCE-LOOP-1 2026-10-02'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

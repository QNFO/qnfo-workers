-- METRIC-VALIDITY-1 (2026-10-02, pillars: autonomy, cost, reach). NOT applied by the session that wrote it (its D1 access
-- was read-only). Apply by hand against qnfo-audit, top to bottom. Idempotent: every statement is guarded.
--
-- Why. metrics_in_breach read 21-22 on 2026-10-02 09:00Z. A breach that cannot be acted on, or that measures the wrong
-- thing, hides the real gaps and teaches remedy_efficacy_30d that remedies fail. Every breaching trigger was read against
-- its writer and its source (qnfo-audit, 2026-10-02 09:00-09:45Z). This file holds the corrections that are SQL; two value
-- computations are fixed in code on the same branch (qnfo-fleet-control 0.4.98 COST-PER-TASK-WINDOW-1,
-- qnfo-fleet-dashboard 1.18.6 PAGEVIEWS-HUMAN-1). Real gaps are left alone.
--
-- Disabled (enabled = 0; the rows stay, so their history is kept and the revert is one UPDATE):
--   #1 ai_est_cost_30d >= 20. qnfo-fleet-control UNIFIED-AI-SPEND-1 writes it from the same total as cost_usd_30d (both
--      451.10 = gateway list cost 391.11 + Workers AI 59.99). migrations/2026-10-02-metric-closed-loop.sql exempts
--      cost_usd_30d from a trigger as "a list-cost estimate, not cash". The title ("Workers AI cost crossed $20/30d") dates
--      from 2026-09-05, when the key held a Workers AI estimate (first firing 23.21). Each part keeps its own trigger: #353
--      unified billing, #354 Workers AI, #409 the fleet's own run-rate.
--   #2 neurons_30d >= 2,000,000. The same aiInferenceAdaptiveGroups read as workers_ai_cost_30d_usd, whose value is
--      (neurons - 300k free) / 1000 x $0.011 = (5,753,226 - 300,000) x 0.000011 = $59.99. 2M neurons is $18.70, looser than
--      #354's $10, so #2 never fires without #354 and files nothing #354 does not.
--   #3 worker_req_30d >= 220,000. Nothing writes it: no reference in the repository or its git history, and the value
--      427,536 is identical at 2026-10-01 07:34Z (analytics_action_log) and now. High request volume is usage, not failure;
--      the action (check the internal/external split, amplify honest /papers traffic) is an opportunity check owned by
--      'agent', no loop. Reach is measured by engaged_human_sessions_28d and referral_30d.
--   #7 gateway_cost_usd_30d >= 5. The value is a 30-day sum (unified 224.55 + BYOK 166.56 = 391.11) and the threshold is a
--      daily pace (its own notes: "Daily A9 pace = $150/30d = $5/day"), so it fires at 1/30 of the ceiling. Its unified part
--      is #353 at the owner's $150. Its BYOK part is DeepSeek, of which the fleet's router logged $0.03 in 30 days
--      (ai_spend_ledger provider deepseek); the rest is the owner's own client key (FLEET-RUN-RATE-1), an owner decision.
--   #368 pageviews_30d < 6100. The registry target is "maximize ... no absolute gate target", and IMPROVEMENT-LOOP-1 already
--      judges it week on week (a >= 15% decline files METRIC-REGRESSION-1). The 6100 threshold was set at 06:39Z above the
--      value of that moment (6010) on a series that rose 5700 -> 6060 from 2026-09-25 to 2026-10-02
--      (roi_daily_snapshots.pageviews), so "fell below the band" is false. The reach KPI is engaged_human_sessions_28d
--      (bot-filtered RUM, STRATEGY s6.3), exempt from a threshold in migrations/2026-10-02-performance-loop.sql for the same
--      reason. EXEMPTION (METRIC-CLOSED-LOOP-1): pageviews_30d has no threshold trigger; IMPROVEMENT-LOOP-1 judges its
--      direction. metric_trigger_coverage_pct goes from 55/76 (72.4%) to 54/76 (71.1%), above its 70 target. The four keys
--      above are analytics_dash_meta keys, not metric_registry rows, so they do not move the coverage figure.
--
-- Corrected:
--   autonomous_fixes_30d counted merge_state = 'deployed', a state the merge runner leaves within the hour: cmAdvance moves a
--      worker merge deploying -> deployed -> verified once the live audit passes, and writes a non-worker merge 'verified'
--      at once (qnfo-fleet-control CODE-TASK-MERGE-RUNNER-1). A fix the fleet made and verified was therefore never counted.
--      It now counts 'verified', the state its formula names ("merged and verified live without a person"). It reads 0
--      either way today: no code_tasks row has merged_by set yet, so the gap is real.
--   #353 unified_cost_usd_30d stays enabled at the owner's $150. Its action named a lever that holds none of the spend: the top
--      callers in ai_spend_ledger, whose non-Workers-AI total over 30 days is $0.03 (qnfo-ops ladder tier 3: $0.02). The
--      $224.55 is openai $197.78 + anthropic $25.96 + alibaba and unbiased $0.82 (cost_usd_30d source_of_truth), traffic that
--      reaches the gateway from clients and agent sessions (FLEET-RUN-RATE-1: a gpt-5.5 session burst on 2026-09-26 that ages
--      out about 2026-10-26). The action now says so and names the owner's lever; owner 'human' like #11.
--   worker_count: its formula and source_of_truth described the CF API census ("live census 40"); the refresh counts
--      service_registry. The two agree while drift_total = 0, which qnfo-fleet-control measures hourly against the CF API
--      (44 and 44, drift 0, on 2026-10-02).
--
-- Closed with evidence (guarded; each statement is a no-op until its condition holds, so re-running later is the intent):
--   #1799 METRIC-TRIGGER-368 (pageviews): refuted by the rising series, once #368 is disabled.
--   METRIC-TRIGGER-343 (cost per task): once 0.4.98 has measured it below 0.05.
--   METRIC-TRIGGER-342 (Zenodo versions per flagship): once a qnfo-paper-indexer run after the 3.0.8 deploy
--      (2026-10-02 07:18Z, FLAGSHIP-MEASURE-1) has measured every flagship at >= 2. The 04:00Z run of 2026-10-02 predates
--      that deploy, so 10.5281/zenodo.21979060 had no versions row and counted as 1; the next run is 2026-10-03 04:00Z.
--
-- Rollback: UPDATE analytics_metric_triggers SET enabled = 1 WHERE id IN (1, 2, 3, 7, 368); restore fleet_tasks
-- 'metric-refresh' from infra_state 'backup-metric-refresh-20261002-metric-validity'; restore #353 owner and action from
-- infra_state 'backup-trigger-353-20261002-metric-validity' (json owner, action, notes).

-- 0. Backups.
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-metric-refresh-20261002-metric-validity', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'fleet_tasks-backup', definition
FROM fleet_tasks WHERE id = 'metric-refresh';
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-trigger-353-20261002-metric-validity', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'analytics_metric_triggers-backup', json_object('owner', owner, 'action', action, 'notes', notes)
FROM analytics_metric_triggers WHERE id = 353;

-- 1. autonomous_fixes_30d counts fixes that were verified live (one occurrence in the definition, checked 2026-10-02).
UPDATE fleet_tasks
SET definition = replace(definition, 'merged_by = ''qnfo-fleet-control'' AND merge_state = ''deployed''', 'merged_by = ''qnfo-fleet-control'' AND merge_state = ''verified'''),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh' AND instr(definition, 'merged_by = ''qnfo-fleet-control'' AND merge_state = ''deployed''') > 0;
UPDATE metric_registry
SET formula = replace(formula, 'merge_state = ''deployed''', 'merge_state = ''verified''')
WHERE metric = 'autonomous_fixes_30d' AND instr(formula, 'merge_state = ''deployed''') > 0;

-- 2. Disable the five triggers that measure the wrong thing or duplicate another.
UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | METRIC-VALIDITY-1 2026-10-02: disabled; ai_est_cost_30d is written from the same all-provider list-cost total as cost_usd_30d (exempt as not cash); its parts are #353, #354 and #409'
WHERE id = 1 AND metric_key = 'ai_est_cost_30d' AND enabled = 1;
UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | METRIC-VALIDITY-1 2026-10-02: disabled; neurons_30d is the input of workers_ai_cost_30d_usd (#354, $10 = 1.2M neurons), so 2M neurons is a looser duplicate'
WHERE id = 2 AND metric_key = 'neurons_30d' AND enabled = 1;
UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | METRIC-VALIDITY-1 2026-10-02: disabled; worker_req_30d has no writer (frozen at 427536 since 2026-10-01 or earlier) and high usage is not a failure'
WHERE id = 3 AND metric_key = 'worker_req_30d' AND enabled = 1;
UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | METRIC-VALIDITY-1 2026-10-02: disabled; a 30-day sum against a $5/day pace; unified part is #353, BYOK part is the owner''s own client key (fleet BYOK $0.03/30d)'
WHERE id = 7 AND metric_key = 'gateway_cost_usd_30d' AND enabled = 1;
UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | METRIC-VALIDITY-1 2026-10-02: disabled; maximize metric with no absolute target, judged week on week by IMPROVEMENT-LOOP-1; the 6100 threshold sat above the value at creation on a rising series; reach KPI is engaged_human_sessions_28d'
WHERE id = 368 AND metric_key = 'pageviews_30d' AND enabled = 1;

-- 3. #353: the action points at where the spend is; the threshold and enabled state are unchanged.
UPDATE analytics_metric_triggers
SET owner = 'human',
    action = 'Pillar cost. Billed unified AI spend (analytics_dash_meta.unified_cost_usd_30d) is above the owner''s $150/30d threshold. Measured 2026-10-02 (METRIC-VALIDITY-1): the fleet''s own routers hold almost none of it (ai_spend_ledger non-Workers-AI spend $0.03 in 30 days; qnfo-ops ladder tier 3 $0.02); the $224.55 was openai $197.78 (a gpt-5.5 agent-session burst on 2026-09-26, ages out about 2026-10-26, FLEET-RUN-RATE-1) and anthropic $25.96, traffic that reaches the gateway from clients and sessions, not from a worker. First re-read the split (metric_registry.cost_usd_30d source_of_truth lists it by provider) and ai_spend_ledger by caller. If a worker appears among the unified providers, move it to Workers AI or the cheap model and tighten costImpactGuard. Otherwise the lever is the owner''s, decided on https://fleet.qnfo.org (INVEST-DECISION-1): the gateway spend limit (gateway_cap_30d_usd) and which clients may bill the gateway credit. Never raise a cap to clear this. Definition of done: unified_cost_usd_30d <= 150 in analytics_dash_meta; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).',
    notes = COALESCE(notes, '') || ' | METRIC-VALIDITY-1 2026-10-02: action re-pointed at where the spend is; backup infra_state backup-trigger-353-20261002-metric-validity'
WHERE id = 353 AND metric_key = 'unified_cost_usd_30d' AND instr(COALESCE(notes, ''), 'METRIC-VALIDITY-1') = 0;

-- 4. worker_count says what it counts.
UPDATE metric_registry
SET formula = 'count(service_registry) (fleet_tasks metric-refresh and qnfo-lifecycle, hourly); equals the CF API workers/scripts census while drift_total = 0, which qnfo-fleet-control measures hourly against the CF API (44 and 44 on 2026-10-02)',
    source_of_truth = 'qnfo-audit.service_registry, cross-checked against CF API workers/scripts by drift_total'
WHERE metric = 'worker_count' AND instr(COALESCE(formula, ''), 'service_registry') = 0;

-- 5. Close the pageviews breach issue as refuted, with the live series as evidence, once #368 is disabled.
UPDATE issue_triage
SET triage_state = 'closed-refuted',
    close_evidence = 'METRIC-VALIDITY-1 2026-10-02: the premise "pageviews fell below the 6100/30d band" is refuted by the live series (roi_daily_snapshots.pageviews ' ||
      (SELECT group_concat(d || '=' || pageviews, ', ') FROM (SELECT d, pageviews FROM roi_daily_snapshots WHERE d >= '2026-09-25' ORDER BY d)) ||
      '; rising) and the threshold sat above the value when the trigger was created. pageviews_30d is a maximize metric judged by IMPROVEMENT-LOOP-1; the reach KPI engaged_human_sessions_28d reads ' ||
      COALESCE((SELECT last_value FROM metric_registry WHERE metric = 'engaged_human_sessions_28d'), 'n/a') || '. Trigger #368 disabled (migrations/2026-10-02-metric-validity.sql).'
WHERE issue_id = (SELECT id FROM agent_issues WHERE title LIKE 'METRIC-TRIGGER-368-PAGEVIEWS-30D:%' AND status = 'open' ORDER BY id DESC LIMIT 1)
  AND EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE id = 368 AND enabled = 0);

-- 6. Close the cost-per-task issue once qnfo-fleet-control 0.4.98 has measured it inside the target.
UPDATE issue_triage
SET triage_state = 'closed',
    close_evidence = 'METRIC-VALIDITY-1: cost_per_successful_task_by_class = ' || (SELECT last_value FROM metric_registry WHERE metric = 'cost_per_successful_task_by_class') ||
      ' at ' || (SELECT last_refreshed FROM metric_registry WHERE metric = 'cost_per_successful_task_by_class') ||
      ' (was 0.1379: model_ladder_budget months incl. a $188.10 tier-0 seed over a 30-day task count). Source now: ' || (SELECT source_of_truth FROM metric_registry WHERE metric = 'cost_per_successful_task_by_class')
WHERE issue_id = (SELECT id FROM agent_issues WHERE title LIKE 'METRIC-TRIGGER-343-%' AND status = 'open' ORDER BY id DESC LIMIT 1)
  AND (SELECT instr(COALESCE(formula, ''), 'COST-PER-TASK-WINDOW-1') FROM metric_registry WHERE metric = 'cost_per_successful_task_by_class') > 0
  AND (SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'cost_per_successful_task_by_class') < 0.05;

-- 7. Close the Zenodo versions issue once a post-3.0.8 indexer run has measured every flagship at >= 2 versions.
UPDATE issue_triage
SET triage_state = 'closed',
    close_evidence = 'METRIC-VALIDITY-1: zenodo_versions_per_flagship = ' || (SELECT last_value FROM metric_registry WHERE metric = 'zenodo_versions_per_flagship') ||
      ' at ' || (SELECT last_refreshed FROM metric_registry WHERE metric = 'zenodo_versions_per_flagship') ||
      '; 10.5281/zenodo.21979060 versions = ' || COALESCE((SELECT CAST(MAX(value) AS TEXT) FROM citation_stats WHERE doi = '10.5281/zenodo.21979060' AND source = 'zenodo' AND metric = 'versions'), 'none') ||
      '. The 1 was a missing reading (no versions row before qnfo-paper-indexer 3.0.8 FLAGSHIP-MEASURE-1), not a flagship at v1.'
WHERE issue_id = (SELECT id FROM agent_issues WHERE title LIKE 'METRIC-TRIGGER-342-%' AND status = 'open' ORDER BY id DESC LIMIT 1)
  AND (SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'zenodo_versions_per_flagship') >= 2
  AND EXISTS (SELECT 1 FROM citation_stats WHERE doi = '10.5281/zenodo.21979060' AND source = 'zenodo' AND metric = 'versions' AND collected_at > '2026-10-02T07:18:22Z');

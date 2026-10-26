-- BREACH-SELFHEAL-1 (2026-10-26, charter pillars autonomy and research; agent_issues 1000035, 1000032, 1000017, 1000072).
-- Owner, 2026-10-24: "FLEET IS NOT SELF-DIAGNOSING ITS OWN BREACHES AND AUTOMATICALLY REMEDIATING". Publishing fell from 89/day
-- (2026-10-20) to 4-11/day (2026-10-22..26), the internal-errata chain held 527-640 rows, and qnfo-gateway threw exceededMemory and
-- then D1 LIKE errors; no loop named the cause or acted on it.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS breach_selfheal_tick; DROP VIEW IF EXISTS v_breach_selfheal; DROP VIEW IF EXISTS v_breach_selfheal_spend; DROP VIEW IF EXISTS v_breach_selfheal_chains; DROP VIEW IF EXISTS v_breach_selfheal_inputs; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('errata_confirm_stalled', 'research_stage_stalled', 'publish_rate_ratio_24h', 'post_deploy_error_workers', 'research_budget_member_share'); DELETE FROM metric_registry WHERE metric IN ('errata_confirm_stalled', 'research_stage_stalled', 'publish_rate_ratio_24h', 'post_deploy_error_workers', 'research_budget_member_share'); DELETE FROM remediation_contracts WHERE class IN ('fm-errata-confirm-stalled', 'fm-research-stage-stalled', 'fm-publish-rate-collapse', 'fm-post-deploy-error-spike', 'fm-research-budget-member-share', 'fm-d1-like-pattern-limit'); DELETE FROM failure_modes WHERE fm_key IN ('errata-confirm-stalled', 'research-stage-stalled', 'publish-rate-collapse', 'post-deploy-error-spike', 'research-budget-member-share', 'd1-like-pattern-limit'); DELETE FROM ops_config WHERE key IN ('breach_selfheal', 'errata_confirm_max'); breach_selfheal_actions keeps its rows as the ledger (each research row it requeued names its revert in research_queue.error).
-- spof-review: no new cron, binding or credential; the checks ride the fleet_tick heartbeat (two producers), like queue_sla_tick_10m.
--
-- WHAT WAS MEASURED (qnfo-audit and living-paper, 2026-10-26 04:00-04:30Z)
--   publishing  research_queue.published_at per day: 10-19 71, 10-20 89, 10-21 56, 10-22 6, 10-23 7, 10-24 11, 10-25 4. The step is
--               COST-SUSTAIN-1 (qnfo-research-exec 0.31.0, owner directive 2026-10-21: research and publication <= $300/month, hard daily
--               budget 360,000 neurons). 10-20 ran at 3.5-4.2M neurons/day. On 10-25 the budget was exhausted at 13:00 UTC and every stage
--               was held for the rest of the day (12 research-budget events an hour, "daily budget exhausted").
--   who spent   ai_call_counters 2026-10-25 for the three budget workers: errata-hub kimi-k2.6 (the internal-errata confirm) 207 calls,
--               158,848 neurons, 33% of the budget, and it is not gated, so it kept spending after the stages were held (474k by 23:59).
--               The stages: review 88 + 35 calls, revise 82 + 27, verify 50; review->revise 113 and revise->review 136 against 45
--               review->verify in 24 h, so a paper takes about three review cycles to reach verify.
--   errata      errata_queue internal-open 527 (oldest 2026-10-20 00:00), settling 5-12 an hour since the confirm fixes landed (detected
--               112, rejected 55); inflow 65-72 a day. ERRATA-INTERNAL-CONFIRM-FIX-1's root cause (wrong kimi knob, no fallback,
--               head-of-line order) is fixed on main (reasoning_effort none, a second model, ORDER BY RANDOM, defer events): verified by
--               207 kimi calls with 0 errors and 2 errata_confirm_defer events in 24 h.
--   gateway     worker_logs: 110 scheduled exceededMemory events, hourly to 2026-10-25 08:01 (PLAIN-FILL-MEMORY-1, 3.29.7, removed the
--               body_md read of every paper), none since; cron_fire_log ok every hour since 10:00. From 19:50 a new error: 41 page requests
--               threw "D1_ERROR: LIKE or GLOB pattern too complex" because a residue marker made a 54-byte LIKE pattern (D1 allows 50),
--               which also stopped every plain-summary fill (qnfo-gateway 3.43.2 PLAIN-RESIDUE-LIKE-1 in the same PR).
-- WHAT THIS FILE ADDS
--   1. v_breach_selfheal: one row per check with hit, diagnosis and evidence: errata confirm stalled (backlog over 20, nothing settled in
--      120 minutes), errata backlog old (over 50 rows, oldest over 24 h), research stages stalled (queued work, no ok stage in 60 minutes,
--      not budget-held), publish-rate collapse (24 h under 40% of the trailing 7-day daily mean, diagnosed budget-bound, gate-loop, stalled
--      or throughput), a budget member other than the stages over 35% of the research budget, and a worker whose errors in the last 3 h
--      are at least 10 and three times its pre-deploy rate within 24 h of a deploy, or at least 20 whatever the deploy (sustained).
--   2. breach_selfheal_tick on the 10-minute heartbeat, remediating what SQL can, each action in breach_selfheal_actions with its revert:
--      (a) errata rate: errata_confirm_max doubles (12 -> 24 -> 48, once an hour) while the backlog is old, the budget share is fine
--          and today's research spend is under its hourly pace (the confirm shares the budget with the stages, so it never takes a
--          paper's budget to drain faster); back to 12 when the backlog is under 50, a member other than the stages takes over 35%,
--          or the day's budget is spent (qnfo-research-exec 0.34.0 reads it each tick);
--      (b) research stall: a row still 'researching' 120 minutes after its last heartbeat goes back to queued at the same stage (at most
--          6 a tick, recover_count + 1, parked at 3 like QUEUE-SLA-2), so a dead run cannot hold the queue;
--      (c) the five metrics below refresh, and their analytics_metric_triggers file one issue per breach for the code loop or
--          qnfo-fleet-control with the read query, the diagnosis and the lever (ACT-BRIDGE-1 code-task lines where one file is the lever).
--   3. failure modes with fm- detector contracts, including d1-like-pattern-limit for the gateway defect.
--   ops_config breach_selfheal = off stops the remediation (the view and metrics still measure).

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('breach_selfheal', 'on', 'BREACH-SELFHEAL-1: off stops the automatic remediation on the 10-minute tick; v_breach_selfheal and its metrics still measure (migrations/2026-10-26-breach-selfheal.sql)'),
 ('errata_confirm_max', '12', 'BREACH-SELFHEAL-1 / ERRATA-CONFIRM-COST-1: internal-errata rows confirmed per hourly tick (qnfo-research-exec 0.34.0 reads it, 1..48); breach_selfheal_tick raises it while the backlog is old and lowers it under budget pressure');

CREATE TABLE IF NOT EXISTS breach_selfheal_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  check_class TEXT NOT NULL,
  subject TEXT NOT NULL,
  action TEXT NOT NULL,
  revert TEXT,
  evidence TEXT
);

CREATE VIEW IF NOT EXISTS v_breach_selfheal_inputs AS
SELECT
  (SELECT COUNT(*) FROM errata_queue WHERE status = 'internal-open' AND datetime(created_at) < datetime('now', '-30 minutes')) AS errata_backlog,
  (SELECT ROUND((julianday('now') - julianday(MIN(created_at))) * 24, 1) FROM errata_queue WHERE status = 'internal-open') AS errata_oldest_h,
  (SELECT COUNT(*) FROM errata_queue WHERE status IN ('detected', 'rejected', 'no-paper') AND datetime(updated_at) >= datetime('now', '-120 minutes') AND updated_at > created_at) AS errata_settled_2h,
  (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'errata_confirm_defer' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS errata_defers_2h,
  COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = 'errata_confirm_max'), 12) AS errata_confirm_max,
  (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) AS research_open,
  (SELECT MAX(ts) FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok') AS research_last_ok,
  (SELECT COUNT(*) FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'research-budget' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes')) AS research_budget_held_30m,
  (SELECT COUNT(*) FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'research-budget' AND text LIKE 'daily budget exhausted%' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS research_budget_exhausted_24h,
  (SELECT COUNT(*) FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND text LIKE '%"stage":"review->revise"%' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS review_to_revise_24h,
  (SELECT COUNT(*) FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND text LIKE '%"stage":"review->verify"%' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS review_to_verify_24h,
  (SELECT COUNT(*) FROM research_queue WHERE published_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS published_24h,
  (SELECT COUNT(*) FROM research_queue WHERE published_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days') AND published_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) / 7.0 AS published_daily_base_7d,
  (SELECT COALESCE(SUM(neurons), 0) FROM ai_call_counters WHERE day = date('now') AND worker IN ('qnfo-research-exec', 'errata-hub', 'qnfo-paper-reviser')) AS budget_spent_today,
  (SELECT COALESCE(SUM(neurons), 0) FROM ai_call_counters WHERE day = date('now') AND worker IN ('errata-hub', 'qnfo-paper-reviser')) AS budget_members_today,
  COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = 'research_daily_neurons'), 360000) AS research_daily_neurons,
  COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = 'research_daily_neurons'), 360000) * (CAST(strftime('%H', 'now') AS INTEGER) + 1) / 24.0 AS research_budget_pace_now;

-- One row per check. hit = 1 is a breach; diagnosis names the cause class the remediation and the metric trigger act on.
CREATE VIEW IF NOT EXISTS v_breach_selfheal_chains AS
SELECT 'chain-stall' AS check_class, 'errata-confirm' AS subject,
  CASE WHEN i.errata_backlog > 20 AND i.errata_settled_2h = 0 THEN 1 ELSE 0 END AS hit,
  CASE WHEN i.errata_defers_2h > 0 THEN 'confirm-failing' ELSE 'confirm-not-running' END AS diagnosis,
  'backlog=' || i.errata_backlog || ' settled_2h=' || i.errata_settled_2h || ' defers_2h=' || i.errata_defers_2h AS evidence
FROM v_breach_selfheal_inputs i
UNION ALL
SELECT 'chain-backlog', 'errata-confirm',
  CASE WHEN i.errata_backlog > 50 AND i.errata_oldest_h > 24 THEN 1 ELSE 0 END,
  'drain-too-slow',
  'backlog=' || i.errata_backlog || ' oldest_h=' || COALESCE(i.errata_oldest_h, 0) || ' errata_confirm_max=' || i.errata_confirm_max
FROM v_breach_selfheal_inputs i
UNION ALL
SELECT 'chain-stall', 'research',
  CASE WHEN i.research_open > 10 AND i.research_budget_held_30m = 0
    AND (i.research_last_ok IS NULL OR i.research_last_ok < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END,
  'no-stage-completes',
  'open=' || i.research_open || ' last_ok=' || COALESCE(i.research_last_ok, 'never') || ' budget_held_30m=' || i.research_budget_held_30m
FROM v_breach_selfheal_inputs i
UNION ALL
SELECT 'publish-collapse', 'research',
  CASE WHEN i.published_daily_base_7d >= 5 AND i.published_24h < 0.4 * i.published_daily_base_7d THEN 1 ELSE 0 END,
  CASE WHEN i.research_budget_exhausted_24h > 0 THEN 'budget-bound'
       WHEN i.review_to_revise_24h > 3 * MAX(1, i.review_to_verify_24h) THEN 'gate-loop'
       WHEN i.research_last_ok IS NULL OR i.research_last_ok < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes') THEN 'stalled'
       ELSE 'throughput' END,
  'published_24h=' || i.published_24h || ' base_7d=' || ROUND(i.published_daily_base_7d, 1) || ' budget_exhausted_events_24h=' || i.research_budget_exhausted_24h
    || ' review->revise=' || i.review_to_revise_24h || ' review->verify=' || i.review_to_verify_24h
FROM v_breach_selfheal_inputs i
;
CREATE VIEW IF NOT EXISTS v_breach_selfheal_spend AS
SELECT 'budget-share', 'errata-hub+qnfo-paper-reviser',
  CASE WHEN i.budget_spent_today >= 0.25 * i.research_daily_neurons AND i.budget_members_today > 0.35 * i.budget_spent_today THEN 1 ELSE 0 END,
  'member-over-share',
  'members=' || CAST(i.budget_members_today AS INTEGER) || ' spent=' || CAST(i.budget_spent_today AS INTEGER) || ' budget=' || i.research_daily_neurons
FROM v_breach_selfheal_inputs i
UNION ALL
SELECT 'post-deploy-errors', e.script_name,
  CASE WHEN (e.n3h >= 10 AND e.deployed_at IS NOT NULL AND e.n3h >= 3 * (e.pre24h / 8.0 + 1)) OR e.n3h >= 20 THEN 1 ELSE 0 END,
  CASE WHEN e.n3h >= 10 AND e.deployed_at IS NOT NULL AND e.n3h >= 3 * (e.pre24h / 8.0 + 1) THEN 'errors-after-deploy' ELSE 'errors-sustained' END,
  'errors_3h=' || e.n3h || ' pre_deploy_24h=' || e.pre24h || ' deployed_at=' || COALESCE(e.deployed_at, 'none') || ' top=' || COALESCE(e.top, '')
FROM (
  SELECT w.script_name,
    COUNT(*) AS n3h,
    (SELECT MAX(d.ts) FROM fleet_deploys d WHERE d.worker = w.script_name AND d.ok = 1 AND d.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS deployed_at,
    (SELECT COUNT(*) FROM worker_logs p WHERE p.script_name = w.script_name AND p.outcome IN ('exception', 'exceededMemory', 'exceededCpu', 'exceededResources')
       AND p.ts_ms < (SELECT CAST(strftime('%s', MAX(d.ts)) AS INTEGER) * 1000 FROM fleet_deploys d WHERE d.worker = w.script_name AND d.ok = 1 AND d.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
       AND p.ts_ms >= (SELECT CAST(strftime('%s', MAX(d.ts)) AS INTEGER) * 1000 FROM fleet_deploys d WHERE d.worker = w.script_name AND d.ok = 1 AND d.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) - 86400000) AS pre24h,
    substr(MAX(w.outcome || ': ' || COALESCE(substr(w.exceptions_json, 1, 120), '')), 1, 160) AS top
  FROM worker_logs w
  WHERE w.ts_ms >= (CAST(strftime('%s', 'now') AS INTEGER) - 10800) * 1000
    AND w.outcome IN ('exception', 'exceededMemory', 'exceededCpu', 'exceededResources')
  GROUP BY w.script_name
) e;
CREATE VIEW IF NOT EXISTS v_breach_selfheal AS
SELECT * FROM v_breach_selfheal_chains UNION ALL SELECT * FROM v_breach_selfheal_spend;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('errata_confirm_stalled', 'operational', 'target', '1 when the internal-errata confirm has a backlog over 20 rows and settled none in 120 minutes (v_breach_selfheal chain-stall/errata-confirm)',
  'qnfo-audit.v_breach_selfheal (BREACH-SELFHEAL-1)', '0 on 2026-10-26 04:30Z (5-12 settled an hour)', '0', 'qnfo-research-exec', 'trigger gt 0', '*/10', '> 0', '> 0', NULL, NULL, 'MEASURED', 'computed'),
 ('research_stage_stalled', 'operational', 'target', '1 when research_queue has more than 10 open rows, no ok stage in 60 minutes, and the budget gate did not hold them in the last 30 minutes',
  'qnfo-audit.v_breach_selfheal (BREACH-SELFHEAL-1)', '0 on 2026-10-26 04:30Z', '0', 'qnfo-research-exec', 'trigger gt 0', '*/10', '> 0', '> 0', NULL, NULL, 'MEASURED', 'computed'),
 ('publish_rate_ratio_24h', 'outcome', 'target', 'papers published in the last 24 h divided by the daily mean of the 7 days before (1 when the base is under 5 a day)',
  'qnfo-audit.v_breach_selfheal_inputs (BREACH-SELFHEAL-1)', 'about 0.2 on 2026-10-26 (6 against a 7-day mean near 30)', '>= 0.4', 'qnfo-research-exec', 'trigger lt 0.4', '*/10', '< 0.6', '< 0.4', NULL, NULL, 'MEASURED', 'computed'),
 ('post_deploy_error_workers', 'operational', 'target', 'workers with at least 10 exception/exceeded* events in the last 3 h at three times their pre-deploy rate within 24 h of a deploy, or 20 or more whatever the deploy',
  'qnfo-audit.v_breach_selfheal over worker_logs and fleet_deploys (BREACH-SELFHEAL-1)', '1 on 2026-10-26 04:40Z (qnfo-gateway, 22 D1 LIKE-pattern errors in 3 h)', '0', 'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 1', NULL, NULL, 'MEASURED', 'computed'),
 ('research_budget_member_share', 'operational', 'guard', 'share of today''s research budget spend (COST-SUSTAIN-1 workers) taken by errata-hub and qnfo-paper-reviser rather than the stages',
  'qnfo-audit.ai_call_counters (BREACH-SELFHEAL-1)', '0.40 on 2026-10-25 (kimi confirm 158,848 of 394k by 15:00)', '<= 0.35', 'qnfo-research-exec', 'trigger gt 0.35', '*/10', '> 0.25', '> 0.35', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS breach_selfheal_tick AFTER INSERT ON fleet_tick
BEGIN
  -- (a) errata rate down: a member other than the stages over 35% of the budget, or the backlog drained under 50.
  INSERT INTO breach_selfheal_actions (check_class, subject, action, revert, evidence)
    SELECT 'errata-rate', 'errata-confirm', 'errata_confirm_max ' || i.errata_confirm_max || ' -> 12', 'ops_config errata_confirm_max = ' || i.errata_confirm_max,
      CASE WHEN b.hit = 1 THEN 'budget share: ' || b.evidence WHEN i.budget_spent_today >= i.research_daily_neurons THEN 'research budget spent: ' || CAST(i.budget_spent_today AS INTEGER) ELSE 'backlog drained: backlog=' || i.errata_backlog END
    FROM v_breach_selfheal_inputs i, v_breach_selfheal b
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND b.check_class = 'budget-share' AND i.errata_confirm_max > 12 AND (b.hit = 1 OR i.errata_backlog < 50 OR i.budget_spent_today >= i.research_daily_neurons);
  UPDATE ops_config SET value = '12', updated_at = datetime('now'), note = substr('BREACH-SELFHEAL-1 lowered at ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || '. ' || COALESCE(note, ''), 1, 600)
    WHERE key = 'errata_confirm_max' AND COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND CAST(value AS INTEGER) > 12
      AND ((SELECT hit FROM v_breach_selfheal WHERE check_class = 'budget-share') = 1 OR (SELECT errata_backlog FROM v_breach_selfheal_inputs) < 50
        OR (SELECT budget_spent_today >= research_daily_neurons FROM v_breach_selfheal_inputs) = 1);
  -- (a) errata rate up: the backlog is old, the confirm is settling (not failing), the budget share is fine; once an hour, at most 48.
  INSERT INTO breach_selfheal_actions (check_class, subject, action, revert, evidence)
    SELECT 'errata-rate', 'errata-confirm', 'errata_confirm_max ' || i.errata_confirm_max || ' -> ' || MIN(48, MAX(12, i.errata_confirm_max) * 2), 'ops_config errata_confirm_max = ' || i.errata_confirm_max, k.evidence
    FROM v_breach_selfheal_inputs i, v_breach_selfheal k
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND k.check_class = 'chain-backlog' AND k.subject = 'errata-confirm' AND k.hit = 1
      AND i.errata_settled_2h > 0 AND i.errata_confirm_max < 48 AND i.budget_spent_today < i.research_budget_pace_now
      AND (SELECT hit FROM v_breach_selfheal WHERE check_class = 'budget-share') = 0
      AND NOT EXISTS (SELECT 1 FROM breach_selfheal_actions a WHERE a.check_class = 'errata-rate' AND a.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes'));
  UPDATE ops_config SET value = CAST(MIN(48, MAX(12, CAST(value AS INTEGER)) * 2) AS TEXT), updated_at = datetime('now'),
      note = substr('BREACH-SELFHEAL-1 raised at ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (backlog old, budget share fine). ' || COALESCE(note, ''), 1, 600)
    WHERE key = 'errata_confirm_max' AND CAST(value AS INTEGER) < 48
      AND EXISTS (SELECT 1 FROM breach_selfheal_actions a
                    WHERE a.id = (SELECT MAX(id) FROM breach_selfheal_actions WHERE check_class = 'errata-rate')
                      AND a.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 minutes')
                      AND a.action = 'errata_confirm_max ' || ops_config.value || ' -> ' || MIN(48, MAX(12, CAST(ops_config.value AS INTEGER)) * 2));
  -- (b) research stall: a claim 120 minutes past its last heartbeat goes back to the queue at the same stage.
  INSERT INTO breach_selfheal_actions (check_class, subject, action, revert, evidence)
    SELECT 'chain-stall', 'research', 'requeued ' || COUNT(*) || ' dead claims at their stage: ' || group_concat(substr(id, 1, 12), ','), 'status researching, claimed_at as before', (SELECT evidence FROM v_breach_selfheal WHERE check_class = 'chain-stall' AND subject = 'research')
    FROM (SELECT id FROM research_queue WHERE status = 'researching' AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes') ORDER BY claimed_at LIMIT 6)
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND (SELECT hit FROM v_breach_selfheal WHERE check_class = 'chain-stall' AND subject = 'research') = 1
    HAVING COUNT(*) > 0;
  UPDATE research_queue SET
      status = CASE WHEN COALESCE(recover_count, 0) < 3 THEN 'queued' ELSE 'wontfix' END,
      stage = CASE WHEN COALESCE(recover_count, 0) < 3 THEN stage ELSE 'parked' END,
      recover_count = COALESCE(recover_count, 0) + 1,
      error = substr('BREACH-SELFHEAL-1 dead claim (no heartbeat since ' || COALESCE(claimed_at, '?') || ', no ok stage fleet-wide in 60 min; revert: status researching): ' || COALESCE(error, ''), 1, 300),
      claimed_at = NULL
    WHERE id IN (SELECT id FROM research_queue WHERE status = 'researching' AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes') ORDER BY claimed_at LIMIT 6)
      AND COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND (SELECT hit FROM v_breach_selfheal WHERE check_class = 'chain-stall' AND subject = 'research') = 1;
  -- (c) the metrics the triggers judge.
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT hit FROM v_breach_selfheal WHERE check_class = 'chain-stall' AND subject = 'errata-confirm') AS TEXT)
    WHERE metric = 'errata_confirm_stalled';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT hit FROM v_breach_selfheal WHERE check_class = 'chain-stall' AND subject = 'research') AS TEXT)
    WHERE metric = 'research_stage_stalled';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT CASE WHEN published_daily_base_7d < 5 THEN 1 ELSE ROUND(published_24h / published_daily_base_7d, 3) END FROM v_breach_selfheal_inputs) AS TEXT)
    WHERE metric = 'publish_rate_ratio_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT COUNT(*) FROM v_breach_selfheal WHERE check_class = 'post-deploy-errors' AND hit = 1) AS TEXT)
    WHERE metric = 'post_deploy_error_workers';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT CASE WHEN budget_spent_today > 0 THEN ROUND(budget_members_today * 1.0 / budget_spent_today, 3) ELSE 0 END FROM v_breach_selfheal_inputs) AS TEXT)
    WHERE metric = 'research_budget_member_share';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'errata_confirm_stalled', 'Internal-errata confirm settles nothing while rows wait', 'registry', 'gt', 0, 1,
  'Pillar research (owner, 2026-10-24: the fleet must diagnose and remediate its own breaches). Read: SELECT * FROM v_breach_selfheal WHERE subject = ''errata-confirm''; SELECT ts, text FROM cloud_ops_events WHERE kind = ''errata_confirm_defer'' ORDER BY ts DESC LIMIT 20; and errata_watch key tick:errata-watch (internal_confirm). Diagnosis confirm-failing: every model in internalConfirmModels returned no readable verdict; read the defer text, fix the request shape or move the failing model behind a working one in internalConfirmModels and confirmRunInput. Diagnosis confirm-not-running: the :00 watch tick did not run confirmInternalErrata; read tick:errata-watch and the worker errors. Done when errata_confirm_stalled reads 0 and errata_queue internal-open falls over two reads 60 minutes apart.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) || 'code-anchor: async function confirmInternalErrata(env) {',
  'qnfo-research-exec', 'agent_issues', 6, 1, 'BREACH-SELFHEAL-1 (migrations/2026-10-26-breach-selfheal.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'errata_confirm_stalled');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'research_stage_stalled', 'Research stages complete nothing while work waits and the budget is not holding them', 'registry', 'gt', 0, 1,
  'Pillar research. breach_selfheal_tick already requeues claims 120 minutes past their heartbeat (breach_selfheal_actions check_class chain-stall). Read: SELECT * FROM v_breach_selfheal WHERE subject = ''research''; SELECT kind, status, ts, substr(text, 1, 200) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' ORDER BY ts DESC LIMIT 40; SELECT * FROM research_exec_lease. A lease held with no done events is a hung round (RESEARCH-EXEC-SLOT-DEADLINE-1 bounds each slot); error events name the failing stage. Fix the stage named by the latest error in runSlot''s path. Done when research_stage_stalled reads 0 for two ticks.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) || 'code-anchor: async function runLeased(env, holder, maxStages, budgetMs) {',
  'qnfo-research-exec', 'agent_issues', 6, 1, 'BREACH-SELFHEAL-1 (migrations/2026-10-26-breach-selfheal.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'research_stage_stalled');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'publish_rate_ratio_24h', 'Publishing fell under 40% of its 7-day rate', 'registry', 'lt', 0.4, 1,
  'Pillar research. Read the diagnosis: SELECT diagnosis, evidence FROM v_breach_selfheal WHERE check_class = ''publish-collapse''. Levers per diagnosis: budget-bound (COST-SUSTAIN-1, owner cap $300/month): cut neurons per published paper, never the cap and never a gate: first a budget member other than the stages over its share (research_budget_member_share; breach_selfheal_tick already lowers errata_confirm_max), then the stage with the most neurons per published paper in ai_call_counters (purpose binding:<stage>) moves to a cheaper model of the same quality with a fallback (OWNER-STANDING-GRANT-1); gate-loop: review->revise far above review->verify, so read review-unresolved and revise-noop events and fix the revise path for the most frequent HARD finding class; stalled: see research_stage_stalled; throughput: the width governor or the claim order. Each change is one PR with its predicted ratio. Done when publish_rate_ratio_24h reads 0.4 or more.',
  'qnfo-research-exec', 'agent_issues', 12, 1, 'BREACH-SELFHEAL-1 (migrations/2026-10-26-breach-selfheal.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'publish_rate_ratio_24h');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'post_deploy_error_workers', 'A worker''s errors tripled after its latest deploy or stay high', 'registry', 'gt', 0, 1,
  'Pillar core. Read: SELECT subject, evidence FROM v_breach_selfheal WHERE check_class = ''post-deploy-errors'' AND hit = 1; then SELECT outcome, substr(exceptions_json, 1, 200), url, COUNT(*) FROM worker_logs WHERE script_name = <worker> AND ts_ms > (strftime(''%s'',''now'') - 10800) * 1000 GROUP BY 1, 2 ORDER BY 4 DESC. Lever: the top signature names the code path; fix it in <worker>/worker.js with a test reproducing the signature (D1_ERROR text is a query, exceededMemory a read that scales with a table, exceededCpu a loop); when the fix is not clear within one tick, revert the merge that produced the deploy (git revert on main, the canonical path redeploys it). Done when post_deploy_error_workers reads 0.',
  'qnfo-fleet-control', 'agent_issues', 6, 1, 'BREACH-SELFHEAL-1 (migrations/2026-10-26-breach-selfheal.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'post_deploy_error_workers');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'research_budget_member_share', 'A non-stage member spends over 35% of the research budget', 'registry', 'gt', 0.35, 2,
  'Pillar cost (COST-SUSTAIN-1). Read: SELECT worker, purpose, model, calls, ROUND(neurons) FROM ai_call_counters WHERE day = date(''now'') AND worker IN (''errata-hub'', ''qnfo-paper-reviser'') ORDER BY neurons DESC. breach_selfheal_tick already sets errata_confirm_max to 12; the lever after that is the member''s model order (ERRATA-CONFIRM-COST-1 put deepseek-v4-flash before kimi-k2.6) or its excerpt size, in the member''s block of qnfo-research-exec/worker.js. Done when research_budget_member_share reads 0.35 or less at 23:00 UTC.',
  'qnfo-research-exec', 'agent_issues', 12, 1, 'BREACH-SELFHEAL-1 (migrations/2026-10-26-breach-selfheal.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'research_budget_member_share');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('errata-confirm-stalled', 'internal errata wait in internal-open while the confirm settles nothing',
  'one model, one attempt, a wrong reasoning knob and id-ordered selection (fixed on main by 2026-10-25); no detector named the stall for four days',
  'two-model confirm with fallback and random order (main), deepseek first since ERRATA-CONFIRM-COST-1; BREACH-SELFHEAL-1 measures the stall and tunes errata_confirm_max',
  'fm-errata-confirm-stalled: v_breach_selfheal chain-stall/errata-confirm hit = 0', 'fm-errata-confirm-stalled', '2026-10-20', 1000032,
  'backlog over 20 and none settled in 120 minutes', 'errata_queue internal-open grows; errata_watch internal_confirm deferred = candidates', 'no confirmed erratum reaches errata-respond, so no correction is drafted'),
 ('research-stage-stalled', 'research stages complete nothing while work waits',
  'a hung stage held the round and the single-flight lease (RESEARCH-EXEC-SLOT-DEADLINE-1), and a dead claim waits for the worker''s own reclaimer, which runs only when the worker runs',
  'per-slot deadline on main; BREACH-SELFHEAL-1 requeues claims 120 minutes past their heartbeat from the D1 heartbeat, independent of the worker',
  'fm-research-stage-stalled: v_breach_selfheal chain-stall/research hit = 0', 'fm-research-stage-stalled', '2026-10-24', 1000017,
  'more than 10 open rows, no ok stage in 60 minutes, not budget-held', 'no done events; watchdog kicks answer 409', 'no paper advances; publishing stops'),
 ('publish-rate-collapse', 'publishing falls far under its recent rate with no diagnosis',
  '2026-10-22: the COST-SUSTAIN-1 hard budget (owner cap) met a pipeline spending about 70k neurons per published paper (13k on 10-09..12), a third of it on the errata confirm, so the stages stopped by 13:00 UTC daily',
  'v_breach_selfheal publish-collapse diagnoses budget-bound, gate-loop, stalled or throughput; the metric trigger names the lever per diagnosis; errata_confirm_max falls under budget pressure',
  'fm-publish-rate-collapse: publish_rate_ratio_24h >= 0.4', 'fm-publish-rate-collapse', '2026-10-22', 1000035,
  'published in 24 h under 40% of the 7-day daily mean', 'research-budget events "daily budget exhausted" from midday', 'papers.qnfo.org output falls ~90%'),
 ('post-deploy-error-spike', 'a worker''s errors multiply after a deploy and no loop links them to the deploy',
  'worker_logs recorded 110 hourly exceededMemory events for qnfo-gateway and the dashboard showed them, but nothing compared them with the deploy or acted; owner tasks were filed by hand seven times (agent_issues 100578, 1000072 ...)',
  'v_breach_selfheal post-deploy-errors per worker; post_deploy_error_workers files one issue per breach with the read query and the fix-or-revert lever',
  'fm-post-deploy-error-spike: no worker with a post-deploy error spike', 'fm-post-deploy-error-spike', '2026-10-24', 1000072,
  '>= 10 errors in 3 h at >= 3x the pre-deploy rate within 24 h of a deploy, or >= 20 errors in 3 h', 'exception or exceeded* outcomes in worker_logs after a fleet_deploys row', 'the worker''s requests or crons fail'),
 ('research-budget-member-share', 'a member other than the research stages spends the shared research budget',
  'the internal-errata confirm (kimi-k2.6, 48k-char excerpts) is not gated by COST-SUSTAIN-1 and took 33% of the budget on 2026-10-25',
  'ERRATA-CONFIRM-COST-1 (deepseek first, 24k excerpt); BREACH-SELFHEAL-1 holds errata_confirm_max at 12 under budget pressure',
  'fm-research-budget-member-share: research_budget_member_share <= 0.35 by 23:00 UTC', 'fm-research-budget-member-share', '2026-10-25', 1000035,
  'members over 35% of the day''s spend', 'stages held by midday while errata keeps spending', 'fewer papers per day under the same cap'),
 ('d1-like-pattern-limit', 'a D1 query with a LIKE pattern over 50 bytes throws "LIKE or GLOB pattern too complex"',
  'PLAIN-RESIDUE-GATE-1 (qnfo-gateway 3.42.1) built LIKE ''%<marker>%'' from each residue marker; one marker is 52 chars, so every plain-summary fill and every paper page without a summary threw from 2026-10-25 19:50',
  'PLAIN-RESIDUE-LIKE-1 (qnfo-gateway 3.43.2): instr() instead of LIKE; quick-read.test.mjs fails any LIKE literal over 50 bytes in the worker',
  'fm-d1-like-pattern-limit: no worker_logs exception with "LIKE or GLOB pattern too complex" in 60 minutes', 'fm-d1-like-pattern-limit', '2026-10-25', 1000072,
  'a LIKE pattern built from text longer than 48 chars', 'D1_ERROR: LIKE or GLOB pattern too complex', 'the query and everything after it in the request');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
 ('fm-errata-confirm-stalled', NULL, 'SELECT ''0'' AS expected, CAST((SELECT hit FROM v_breach_selfheal WHERE check_class = ''chain-stall'' AND subject = ''errata-confirm'') AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'BREACH-SELFHEAL-1', 'failure-mode detector', 'qnfo-research-exec'),
 ('fm-research-stage-stalled', NULL, 'SELECT ''0'' AS expected, CAST((SELECT hit FROM v_breach_selfheal WHERE check_class = ''chain-stall'' AND subject = ''research'') AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'BREACH-SELFHEAL-1', 'failure-mode detector', 'qnfo-research-exec'),
 ('fm-publish-rate-collapse', NULL, 'SELECT ''0'' AS expected, CAST((SELECT hit FROM v_breach_selfheal WHERE check_class = ''publish-collapse'') AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'BREACH-SELFHEAL-1', 'failure-mode detector', 'qnfo-research-exec'),
 ('fm-post-deploy-error-spike', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_breach_selfheal WHERE check_class = ''post-deploy-errors'' AND hit = 1) AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'BREACH-SELFHEAL-1', 'failure-mode detector', 'qnfo-fleet-control'),
 ('fm-research-budget-member-share', NULL, 'SELECT ''0'' AS expected, CAST((SELECT hit FROM v_breach_selfheal WHERE check_class = ''budget-share'') AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'BREACH-SELFHEAL-1', 'failure-mode detector', 'qnfo-research-exec'),
 ('fm-d1-like-pattern-limit', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM worker_logs WHERE ts_ms > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 3600) * 1000 AND exceptions_json LIKE ''%pattern too complex%'') AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'PLAIN-RESIDUE-LIKE-1 deployed (qnfo-gateway 3.43.2)', 'failure-mode detector', 'qnfo-gateway');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01RdDA76KLvqYHYBjL9C2be5',
  'the owner cap (COST-SUSTAIN-1) stays; publishing recovers by spending fewer neurons per paper, starting with the errata confirm that took a third of the budget, and the fleet must name a collapse''s cause and act on it from its own heartbeat',
  'BREACH-SELFHEAL-1: v_breach_selfheal (six checks with diagnosis), breach_selfheal_tick (errata rate tuning, dead-claim requeue, five metrics), five metric triggers, six failure modes; ERRATA-CONFIRM-COST-1 (qnfo-research-exec 0.34.0); PLAIN-RESIDUE-LIKE-1 (qnfo-gateway 3.43.2)',
  'qnfo-audit 2026-10-26 04:00-04:30Z: published per day 89 (10-20) -> 4 (10-25); budget exhausted 13:00 UTC 10-25; errata-hub kimi 158,848 neurons (33%); internal-open 527; gateway 41 LIKE-pattern exceptions, exceededMemory none since 10-25 09:02',
  'migration merged; the two workers deployed through the canonical path',
  'errata_confirm_max between 12 and 48 rows an hour; at most 6 research rows requeued a tick, only while the stall check hits; five metric triggers',
  'the Rollback header; ops_config breach_selfheal = off stops the remediation without a deploy',
  'a stalled chain, a publishing collapse with its cause, a member over its budget share and a post-deploy error spike are measured every 10 minutes and acted on without a session',
  'research_budget_member_share at or under 0.35 on 2026-10-27; errata_queue internal-open under 300 within 24 h of deploy; publish_rate_ratio_24h above its 2026-10-26 value within 48 h; zero LIKE-pattern exceptions within 60 minutes of the gateway deploy',
  'none', 'errata_queue, research_queue, cloud_ops_events, ai_call_counters, worker_logs, fleet_deploys, cron_fire_log; migrations/breach-selfheal.test.mjs; errata-confirm-cost.test.mjs; quick-read.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'BREACH-SELFHEAL-1:%');

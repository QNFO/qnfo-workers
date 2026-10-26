-- BREACH-SELFHEAL-POST-DEPLOY-WINDOW-1 (2026-10-26, charter pillar autonomy; follows migrations/2026-10-26-breach-selfheal.sql, PR 4263).
-- Measured live at 05:45Z: v_breach_selfheal flagged qnfo-gateway as post-deploy-errors / errors-sustained (errors_3h=23) although
-- its deploy at 04:42:14Z had fixed the error and worker_logs held no gateway error after 04:30:41Z. The check counted every error in
-- the last 3 h, including the ones the deploy removed, so a fix read as a breach for 3 h and post_deploy_error_workers would file an
-- issue against the deploy that fixed it. This file counts only errors after the latest deploy (or the last 3 h when the deploy is
-- older) and scales the pre-deploy baseline to that window.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: breach_selfheal_actions
-- Rollback: DROP VIEW IF EXISTS v_breach_selfheal; DROP VIEW IF EXISTS v_breach_selfheal_spend; then re-run the CREATE VIEW statements for v_breach_selfheal_spend and v_breach_selfheal from migrations/2026-10-26-breach-selfheal.sql.
-- spof-review: no new cron, binding or credential; views only.
DROP VIEW IF EXISTS v_breach_selfheal;
DROP VIEW IF EXISTS v_breach_selfheal_spend;
CREATE VIEW IF NOT EXISTS v_breach_selfheal_spend AS
SELECT 'budget-share', 'errata-hub+qnfo-paper-reviser',
  CASE WHEN i.budget_spent_today >= 0.25 * i.research_daily_neurons AND i.budget_members_today > 0.35 * i.budget_spent_today THEN 1 ELSE 0 END,
  'member-over-share',
  'members=' || CAST(i.budget_members_today AS INTEGER) || ' spent=' || CAST(i.budget_spent_today AS INTEGER) || ' budget=' || i.research_daily_neurons
FROM v_breach_selfheal_inputs i
UNION ALL
SELECT 'post-deploy-errors', e.script_name,
  CASE WHEN (e.n_post >= 10 AND e.deployed_at IS NOT NULL AND e.n_post >= 3 * (e.pre24h / 24.0 * e.post_h + 1)) OR e.n_post >= 20 THEN 1 ELSE 0 END,
  CASE WHEN e.n_post >= 10 AND e.deployed_at IS NOT NULL AND e.n_post >= 3 * (e.pre24h / 24.0 * e.post_h + 1) THEN 'errors-after-deploy' ELSE 'errors-sustained' END,
  'errors_since=' || e.n_post || ' window_h=' || ROUND(e.post_h, 2) || ' errors_3h=' || e.n3h || ' pre_deploy_24h=' || e.pre24h
    || ' deployed_at=' || COALESCE(e.deployed_at, 'none') || ' top=' || COALESCE(e.top, '')
FROM (
  SELECT w.script_name,
    COUNT(*) AS n3h,
    SUM(CASE WHEN w.ts_ms >= COALESCE(dp.dep_ms, 0) THEN 1 ELSE 0 END) AS n_post,
    dp.dep_ts AS deployed_at,
    MIN(3.0, MAX(0.1, (CAST(strftime('%s', 'now') AS INTEGER) * 1000 - COALESCE(dp.dep_ms, 0)) / 3600000.0)) AS post_h,
    (SELECT COUNT(*) FROM worker_logs p WHERE p.script_name = w.script_name AND p.outcome IN ('exception', 'exceededMemory', 'exceededCpu', 'exceededResources')
       AND dp.dep_ms IS NOT NULL AND p.ts_ms < dp.dep_ms AND p.ts_ms >= dp.dep_ms - 86400000) AS pre24h,
    substr(MAX(CASE WHEN w.ts_ms >= COALESCE(dp.dep_ms, 0) THEN w.outcome || ': ' || COALESCE(substr(w.exceptions_json, 1, 120), '') END), 1, 160) AS top
  FROM worker_logs w
  LEFT JOIN (SELECT d.worker, MAX(d.ts) AS dep_ts, CAST(strftime('%s', MAX(d.ts)) AS INTEGER) * 1000 AS dep_ms
             FROM fleet_deploys d WHERE d.ok = 1 AND d.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') GROUP BY d.worker) dp
    ON dp.worker = w.script_name
  WHERE w.ts_ms >= (CAST(strftime('%s', 'now') AS INTEGER) - 10800) * 1000
    AND w.outcome IN ('exception', 'exceededMemory', 'exceededCpu', 'exceededResources')
  GROUP BY w.script_name
) e;
CREATE VIEW IF NOT EXISTS v_breach_selfheal AS
SELECT * FROM v_breach_selfheal_chains UNION ALL SELECT * FROM v_breach_selfheal_spend;
UPDATE metric_registry SET formula = 'workers with at least 10 exception/exceeded* events since their latest deploy (within 3 h) at three times their pre-deploy rate, or 20 or more in that window whatever the deploy'
  WHERE metric = 'post_deploy_error_workers';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01RdDA76KLvqYHYBjL9C2be5', 'errors a deploy removed are not a post-deploy breach',
  'v_breach_selfheal post-deploy-errors counts only errors after the latest deploy (BREACH-SELFHEAL-POST-DEPLOY-WINDOW-1)',
  'qnfo-gateway read errors-sustained errors_3h=23 at 05:45Z with no error after its 04:42Z deploy', 'applied', 'one view',
  'the Rollback line of migrations/2026-10-26-breach-selfheal-post-deploy-window.sql', 'a deploy that fixes a worker no longer files a breach against itself',
  'post_deploy_error_workers 0 within 1 h', 'live v_breach_selfheal read'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'BREACH-SELFHEAL-POST-DEPLOY-WINDOW-1') > 0);

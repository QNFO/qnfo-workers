-- D1-ROWS-READ-PRD-FUNNEL-1 (2026-11-13, charter pillar: cost; owner: billions of D1 rows read).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET cron_expr = '*/10 * * * *' WHERE name = 'prd-funnel-monitor-10m';
-- CAUSE-MAPPED: registers no metric_registry row; one cron expression changes.
-- Measured 2026-11-13 (d1QueriesAdaptiveGroups, qnfo-audit, 90 minutes): the prd-funnel-monitor evidence insert reads v_prd_funnel_stages, 440 K rows per run,
-- 4.4 M rows in 10 runs; the task ran every 10 minutes. v_prd_funnel_health grades monitor_stale at 120 minutes without an ok run, so hourly stays inside the SLA.
UPDATE fleet_crons SET cron_expr = '15 * * * *' WHERE name = 'prd-funnel-monitor-10m' AND cron_expr = '*/10 * * * *';

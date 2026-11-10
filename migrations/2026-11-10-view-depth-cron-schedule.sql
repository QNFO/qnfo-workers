-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_cron_schedule; then re-run the v_cron_schedule definition in migrations/2026-10-19-cron-watch.sql (behaviour-identical, four levels deeper)
-- BACKUP: bak_view_defs_20261110
-- CAUSE-MAPPED: no metric registered; view rewrite only

-- VIEW-DEPTH-1: v_cron_faults (and its consumers) failed on 2026-11-10 with D1 error 7500 "VIEWs and/or subqueries
-- nested too deep" (agent_issues 1002966, 1002963-65). v_cron_schedule stacked nine CTEs under
-- v_cron_faults_worker; the UNION with v_cron_faults_task tipped the compound over D1's limit. The five
-- field-splitting CTEs f1..f5 become one level of nested substr/instr expressions: same columns, same rows, four levels fewer.
CREATE TABLE IF NOT EXISTS bak_view_defs_20261110 AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_cron_schedule';
DROP VIEW IF EXISTS v_cron_schedule;
CREATE VIEW v_cron_schedule AS
WITH RECURSIVE src AS (
  SELECT w.name AS worker, 'cf' AS kind, trim(j.value) AS expr
    FROM worker_schedules w, json_each(CASE WHEN json_valid(w.crons_json) THEN w.crons_json ELSE '[]' END) j
   WHERE w.refreshed_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes')
  UNION ALL
  SELECT 'fleet-exec:' || c.name, 'fleet_crons', trim(c.cron_expr) FROM fleet_crons c WHERE c.enabled = 1
),
f5 AS (SELECT worker, kind, expr,
    substr(expr, 1, instr(expr || ' ', ' ') - 1) AS m,
    substr(substr(expr, instr(expr, ' ') + 1), 1, instr(substr(expr, instr(expr, ' ') + 1) || ' ', ' ') - 1) AS h,
    substr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), 1, instr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1) || ' ', ' ') - 1) AS dom,
    substr(substr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), instr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), ' ') + 1), 1, instr(substr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), instr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), ' ') + 1) || ' ', ' ') - 1) AS mon,
    substr(substr(substr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), instr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), ' ') + 1), instr(substr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), instr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), ' ') + 1), ' ') + 1), 1, instr(substr(substr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), instr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), ' ') + 1), instr(substr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), instr(substr(substr(expr, instr(expr, ' ') + 1), instr(substr(expr, instr(expr, ' ') + 1), ' ') + 1), ' ') + 1), ' ') + 1) || ' ', ' ') - 1) AS dow
  FROM src),
parts (worker, expr, part, rest) AS (
  SELECT worker, expr, NULL, m || ',' FROM f5
  UNION ALL
  SELECT worker, expr, substr(rest, 1, instr(rest, ',') - 1), substr(rest, instr(rest, ',') + 1) FROM parts WHERE rest <> ''
),
grid AS (
  SELECT worker, expr, MAX(CASE
      WHEN part IS NULL THEN 0
      WHEN part = '*' THEN 1
      WHEN part LIKE '*/%' THEN (CAST(substr(part, 3) AS INTEGER) % 5 <> 0)
      ELSE (CAST(part AS INTEGER) % 5 <> 0) END) AS off
  FROM parts GROUP BY worker, expr
),
g AS (
  SELECT f5.worker, f5.kind, f5.expr,
    CASE
      WHEN dom = '*' AND mon = '*' AND dow = '*' THEN CASE
        WHEN h = '*' THEN CASE
          WHEN m = '*' THEN 1
          WHEN m LIKE '*/%' THEN MAX(1, CAST(substr(m, 3) AS INTEGER))
          WHEN instr(m, ',') > 0 THEN 60 / (length(m) - length(replace(m, ',', '')) + 1)
          ELSE 60 END
        WHEN h LIKE '*/%' THEN 60 * MAX(1, CAST(substr(h, 3) AS INTEGER))
        WHEN instr(h, ',') > 0 THEN 1440 / (length(h) - length(replace(h, ',', '')) + 1)
        ELSE 1440 END
      WHEN dom = '*' AND mon = '*' THEN 10080
      ELSE 44640 END AS gap_min,
    COALESCE(grid.off, 0) AS off
  FROM f5 LEFT JOIN grid ON grid.worker = f5.worker AND grid.expr = f5.expr
)
SELECT worker, kind, expr, gap_min,
  CASE WHEN off = 1 AND instr(',' || COALESCE((SELECT value FROM ops_config WHERE key = 'cron_grid_exempt'), '') || ',', ',' || worker || ',') = 0 THEN 1 ELSE 0 END AS off_grid,
  CASE WHEN gap_min > 60 THEN 1 ELSE 0 END AS too_slow
FROM g;

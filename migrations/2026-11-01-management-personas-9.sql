-- MANAGEMENT-PERSONAS-9 / METRIC-BREACH-WORST-FIRST-1 (2026-11-01, charter pillar research).
-- The program managers already put charter primary/guard issues before other work and DOER-ASSIGN-1
-- requests a code-task for focus issues without a doer. However, two off-target metric triggers were
-- effectively ordered by issue priority and age, not by how far each measured value missed its threshold.
-- Rank breached metric-trigger issues by normalized distance beyond threshold before the existing issue
-- ranking, and make the doer-request step consume that same focus order. The existing four-request cap,
-- two-hour age, non-PERSONAL boundary, validation, and doer_assign switch remain unchanged.
-- Prediction: the highest normalized breach in each program's available focus slots is ranked first;
-- the manager's existing request step asks about the worst no-doer breaches before less severe work.
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261101_mp9_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas'; DROP VIEW IF EXISTS v_program_focus_plan; CREATE VIEW v_program_focus_plan AS SELECT c.program_code, c.id AS issue_id, c.rn AS rank, c.tier, c.has_doer, CASE c.tier WHEN 0 THEN 'primary metric ' || c.primary_metric WHEN 1 THEN 'guard metric' WHEN 2 THEN 'critical' WHEN 3 THEN 'high' ELSE 'oldest open' END AS reason FROM v_program_focus_candidates c JOIN portfolio_allocations pa ON pa.program_code = c.program_code AND pa.tick = (SELECT MAX(tick) FROM portfolio_allocations) WHERE c.rn <= pa.slots
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_mp9_workflow

CREATE TABLE IF NOT EXISTS bak_20261101_mp9_workflow AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

DROP VIEW IF EXISTS v_program_focus_plan;
CREATE VIEW v_program_focus_plan AS
WITH scored AS (
  SELECT c.program_code, c.id, c.tier, c.has_doer, c.primary_metric, c.rn,
    t.metric_key, v.val, v.threshold, v.operator,
    CASE WHEN v.hit = 1 AND v.val IS NOT NULL AND v.threshold IS NOT NULL
      THEN ROUND(
        CASE WHEN v.operator IN ('gt', 'gte') THEN MAX(0, v.val - v.threshold)
             WHEN v.operator IN ('lt', 'lte') THEN MAX(0, v.threshold - v.val)
             WHEN v.operator = 'eq' THEN 0
             ELSE MAX(0, v.val - v.threshold) END
        / MAX(ABS(v.threshold), 1.0), 6)
    END AS breach_ratio
  FROM v_program_focus_candidates c
  LEFT JOIN analytics_metric_triggers t
    ON c.title LIKE 'METRIC-TRIGGER-%'
   AND t.id = CAST(substr(c.title, 16, instr(substr(c.title, 16), '-') - 1) AS INTEGER)
  LEFT JOIN v_metric_trigger_state v ON v.id = t.id
),
ranked AS (
  SELECT scored.*,
    ROW_NUMBER() OVER (
      PARTITION BY program_code
      ORDER BY CASE WHEN breach_ratio IS NULL THEN 1 ELSE 0 END,
        breach_ratio DESC, rn, id
    ) AS manager_rank
  FROM scored
)
SELECT r.program_code, r.id AS issue_id, r.manager_rank AS rank, r.tier, r.has_doer,
  CASE WHEN r.breach_ratio IS NOT NULL
    THEN 'worst off-target metric ' || r.metric_key || ' (' ||
      CASE WHEN ABS(r.threshold) < 1
        THEN ROUND(r.breach_ratio, 1) || ' normalized units beyond threshold'
        ELSE ROUND(r.breach_ratio * 100, 1) || '% beyond threshold'
      END || ')'
    ELSE CASE r.tier WHEN 0 THEN 'primary metric ' || r.primary_metric
                     WHEN 1 THEN 'guard metric' WHEN 2 THEN 'critical'
                     WHEN 3 THEN 'high' ELSE 'oldest open' END
  END AS reason
FROM ranked r
JOIN portfolio_allocations pa
  ON pa.program_code = r.program_code
 AND pa.tick = (SELECT MAX(tick) FROM portfolio_allocations)
WHERE r.manager_rank <= pa.slots;

UPDATE fleet_tasks
SET definition = json_set(
      definition,
      '$.steps[' || (
        SELECT CAST(key AS INTEGER)
        FROM json_each(fleet_tasks.definition, '$.steps')
        WHERE json_extract(value, '$.name') = 'dg-request'
        LIMIT 1
      ) || '].sql',
      replace(
        json_extract(
          definition,
          '$.steps[' || (
            SELECT CAST(key AS INTEGER)
            FROM json_each(fleet_tasks.definition, '$.steps')
            WHERE json_extract(value, '$.name') = 'dg-request'
            LIMIT 1
          ) || '].sql'
        ),
        'ORDER BY CASE a.priority WHEN ''critical'' THEN 0 WHEN ''high'' THEN 1 ELSE 2 END, f.entered_at LIMIT 4',
        'ORDER BY f.rank, CASE a.priority WHEN ''critical'' THEN 0 WHEN ''high'' THEN 1 ELSE 2 END, f.entered_at LIMIT 4'
      )
    ),
    version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas'
  AND EXISTS (
    SELECT 1
    FROM json_each(fleet_tasks.definition, '$.steps')
    WHERE json_extract(value, '$.name') = 'dg-request'
      AND instr(json_extract(value, '$.sql'),
        'ORDER BY CASE a.priority WHEN ''critical'' THEN 0 WHEN ''high'' THEN 1 ELSE 2 END, f.entered_at LIMIT 4') > 0
  );

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('program-managers-rank-metric-breaches', 'migrations/2026-11-01-management-personas-9.sql',
   'management-personas hourly workflow; active analytics metric triggers; existing DOER-ASSIGN-1',
   'each tick ranks current trigger breaches by normalized distance beyond threshold; doer requests retain their existing cap and eligibility rules',
   '2026-11-01',
   'v_program_focus_plan and the dg-request workflow step order breached metric-trigger issues by relative distance beyond threshold');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'program-manager:QNFO.RSCH (METRIC-BREACH-WORST-FIRST-1)',
  'an off-target metric with a larger normalized distance beyond its trigger threshold is the more urgent program work',
  'rank open metric-trigger issues worst-first and request doers in focus-rank order',
  'MANAGEMENT-PERSONAS-1 ranked issues by charter metric/guard tier and priority; DOER-ASSIGN-1 selected no-doer work by issue priority and age, without comparing trigger deviation.',
  'pending hourly workflow and metric readback after migration application',
  'v_program_focus_plan and the doer-request ordering in fleet_tasks management-personas',
  'Rollback line of migrations/2026-11-01-management-personas-9.sql',
  'worst-first program metric triage and doer dispatch',
  'The highest normalized off-target metric is first in its program focus set and no-doer requests follow that same rank.',
  'Research value per $100 remains governed by existing yield, quality, and monthly-budget measures; this change adds no spend or publication bypass.',
  'SQLite migration replay, synthetic gt/lt trigger breaches, in-target trigger, focus ordering, and doer-request SQL'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'rank open metric-trigger issues worst-first and request doers in focus-rank order'
);

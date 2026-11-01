-- PLUSSING-6 (2026-11-01, issue 1801, charter pillars autonomy and reach).
-- A kept plus seeds the next iteration; three consecutive measured misses rest only that product for seven days.
-- Unmeasured outcomes do not count as misses, and the fifth deployed cycle remains a simplify pass.
-- PREDICTION: three measured misses cause a seven-day rest before another proposal; active rests are excluded from the weekly shipment metric.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_plus6_workflow
-- Rollback: DROP TRIGGER IF EXISTS product_plus_outcome_streak; UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261101_plus6_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas'; UPDATE metric_registry SET formula = 'minimum verified plus count across active, plusable products in the rolling 7-day window; target >= 1 per product', target = '>= 1 per active plusable product' WHERE metric = 'plus_shipped_7d'; UPDATE analytics_metric_triggers SET title = 'Product plussing: every active product receives a verified plus each week', action = 'Pillar autonomy and reach. Read products with no verified plus in the last seven days from v_product_plus_due and plus_outcome_checks. The management-personas plus step is the shared Fix/Plus queue: repair breached products first and originate the smallest reversible yes-and proposal for each healthy product; keep the daily cap and the existing roadmap/code/canary path.', notes = 'PLUSSING-4: one verified plus per active plusable product per 7 days' WHERE metric_key = 'plus_shipped_7d'; UPDATE roadmap_implementation SET status = 'planned', evidence = 'depends on PLUS-4' WHERE source = 'plussing-2026' AND item = 'PLUS-6'; UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied', evidence = 'PLUS-6 rollback removed the seven-day product rest with the PLUS-6 workflow; the normal product cadence resumes without this pause.' WHERE control = 'plussing-three-miss-rest'

CREATE TABLE IF NOT EXISTS bak_20261101_plus6_workflow AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

UPDATE fleet_tasks
SET definition = replace(
      replace(
        replace(definition,
          'WHERE d.in_flight = 0 AND r.worker IS NOT NULL',
          'WHERE d.in_flight = 0 AND NOT EXISTS (SELECT 1 FROM plus_outcome_checks c JOIN metric_registry m ON m.metric = c.metric JOIN metric_registry g ON g.metric = ''output_quality_outcomes_worse'' WHERE c.product = r.product AND c.outcome = ''pending'' AND c.baseline_at <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND m.last_value IS NOT NULL AND m.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', c.baseline_at, ''+7 days'') AND m.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 days'') AND g.last_value IS NOT NULL AND g.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', c.baseline_at, ''+7 days'') AND g.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 days'')) AND r.worker IS NOT NULL'),
        'Candidates: a rough edge in a recent plus, a slow or empty or confusing state, the affordance the user would reach for next, a failure path that says nothing, a small delight. Pick the best ratio of user value to size, one worker file.',
        'Candidates: a rough edge in a recent plus, a slow or empty or confusing state, the affordance the user would reach for next, a failure path that says nothing, a small delight. If a plus is kept in the history above, make the smallest next improvement that builds on the latest kept plus or what it made possible; otherwise choose a measured first improvement. After a three-miss rest, choose a fresh angle, such as a different user or surface, rather than repeating the failed approach. Pick the best ratio of user value to size, one worker file.'),
      'misses_in_row = 0, pluses_since_simplify =',
      'misses_in_row = CASE WHEN rest_until IS NOT NULL AND rest_until <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') THEN 0 ELSE misses_in_row END, rest_until = CASE WHEN rest_until IS NOT NULL AND rest_until <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') THEN NULL ELSE rest_until END, pluses_since_simplify ='),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas'
  AND instr(definition, 'misses_in_row = 0, pluses_since_simplify =') > 0;

UPDATE fleet_tasks
SET definition = replace(definition,
  'FROM product_registry p WHERE p.state = ''active'' AND p.worker IS NOT NULL',
  'FROM product_registry p WHERE p.state = ''active'' AND (p.rest_until IS NULL OR p.rest_until <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'')) AND p.worker IS NOT NULL'),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas'
  AND instr(definition, 'FROM product_registry p WHERE p.state = ''active'' AND p.worker IS NOT NULL') > 0;

UPDATE fleet_tasks
SET definition = json_set(
      definition,
      '$.steps[' || (
        SELECT key FROM json_each(fleet_tasks.definition, '$.steps')
        WHERE json_extract(value, '$.name') = 'pl-shipped-metric'
        LIMIT 1
      ) || '].sql',
      replace(
        json_extract(
          definition,
          '$.steps[' || (
            SELECT key FROM json_each(fleet_tasks.definition, '$.steps')
            WHERE json_extract(value, '$.name') = 'pl-shipped-metric'
            LIMIT 1
          ) || '].sql'
        ),
        'WHERE p.state = ''active'' AND p.worker IS NOT NULL AND p.worker NOT IN (',
        'WHERE p.state = ''active'' AND (p.rest_until IS NULL OR p.rest_until <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'')) AND p.worker IS NOT NULL AND p.worker NOT IN ('
      )
    ),
    version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas'
  AND EXISTS (
    SELECT 1 FROM json_each(definition, '$.steps')
    WHERE json_extract(value, '$.name') = 'pl-shipped-metric'
      AND instr(json_extract(value, '$.sql'), 'WHERE p.state = ''active'' AND p.worker IS NOT NULL AND p.worker NOT IN (') > 0
  );

CREATE TRIGGER IF NOT EXISTS product_plus_outcome_streak
AFTER UPDATE OF outcome ON plus_outcome_checks
WHEN OLD.outcome = 'pending' AND NEW.outcome IN ('kept', 'revert_required')
BEGIN
  UPDATE product_registry
  SET misses_in_row = CASE WHEN NEW.outcome = 'kept' THEN 0 ELSE misses_in_row + 1 END,
      rest_until = CASE
        WHEN NEW.outcome = 'kept' THEN NULL
        WHEN misses_in_row + 1 >= 3
          AND (rest_until IS NULL OR rest_until <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days')
        ELSE rest_until
      END
  WHERE product = NEW.product;
END;

UPDATE metric_registry
SET formula = 'minimum verified plus count across active, plusable products not currently resting in the rolling 7-day window; target >= 1 per product',
    target = '>= 1 per active, non-resting plusable product'
WHERE metric = 'plus_shipped_7d';

UPDATE analytics_metric_triggers
SET title = 'Product plussing: every active, non-resting product receives a verified plus each week',
    action = 'Pillar autonomy and reach. Read products with no verified plus in the last seven days from v_product_plus_due and plus_outcome_checks, excluding products whose rest_until is in the future. The management-personas plus step is the shared Fix/Plus queue: repair breached products first and originate the smallest reversible yes-and proposal for each healthy, non-resting product; keep the daily cap and the existing roadmap/code/canary path.',
    notes = 'PLUSSING-6: active seven-day rests after three measured misses are excluded from the weekly shipment target'
WHERE metric_key = 'plus_shipped_7d';

INSERT OR IGNORE INTO control_registry
  (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence)
VALUES
  ('plussing-three-miss-rest',
   'qnfo-audit.product_registry.rest_until and v_product_plus_due; management-personas pl-outcome-review',
   'pause',
   'repeating measured product changes that did not improve the registered outcome or worsened the output-quality guard',
   0,
   'keep',
   'applied',
   'the same product becomes eligible when its seven-day rest expires; other products and ordinary manager work continue',
   'Three consecutive measured revert_required outcomes set rest_until to seven days; a kept outcome resets the streak, unmeasured outcomes do not count, and the weekly shipment metric excludes active rests.');

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
VALUES
  ('plussing-three-miss-rest',
   'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM product_registry p WHERE p.state = ''active'' AND (p.rest_until IS NULL OR p.rest_until <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'')) AND (julianday(''now'') - julianday(COALESCE(p.last_plus_at, p.created_at))) * 24 >= p.plus_cadence_h AND NOT EXISTS (SELECT 1 FROM v_product_plus_due d WHERE d.product = p.product)) THEN ''a cadence-due product eligible after its rest is missing from v_product_plus_due'' ELSE ''ok'' END AS observed',
   'state probe: every active product whose rest is absent or expired and whose cadence is due appears in v_product_plus_due',
   1);

UPDATE roadmap_implementation
SET status = 'built',
    evidence = 'migrations/2026-11-01-plussing-6.sql and migrations/plussing-3.test.mjs: kept-plus continuation, three measured misses trigger a seven-day product rest, unmeasured outcomes do not count, and active rests are excluded from the weekly shipment target'
WHERE source = 'plussing-2026' AND item = 'PLUS-6';

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('product-plus-ratchet-and-rest', 'migrations/2026-11-01-plussing-6.sql (PLUSSING-6)',
   'product_registry, plus_ledger, plus_outcome_checks, management-personas, output_quality_outcomes_worse',
   0.5, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
   'kept plusses seed the next product iteration; three consecutive measured misses rest only that product for seven days before a fresh-angle cycle');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'management-personas (PLUSSING-6)',
  'a product that repeatedly fails its measured outcome should pause for one week and return with a different angle, while successful changes should be extended rather than repeated',
  'PLUSSING-6: build the next proposal on the latest kept plus, count measured misses from PLUSSING-4 outcomes, rest a product for seven days after three consecutive misses, and exempt active rests from the weekly shipment target',
  'live qnfo-audit read: all eight products had misses_in_row = 0, rest_until = NULL, and no plus_outcome_checks; PLUSSING-3 already implemented a simplify pass after four normal deployed cycles',
  'pending',
  'product_registry miss/rest counters, product plus proposals, plus_shipped_7d metric and manager-personas task definition',
  'restore management-personas from bak_20261101_plus6_workflow, drop product_plus_outcome_streak, and restore the PLUSSING-4 shipment metric/action and PLUS-6 roadmap status',
  'measured feedback now prevents repeated failed product changes and directs kept changes toward a useful next iteration',
  'after three consecutive measured misses, no new plus is proposed for that product for seven days; active rests do not reduce plus_shipped_7d coverage',
  'more useful product improvements without worsening output-quality outcomes',
  'management-personas, product_registry, plus_outcome_checks, v_product_plus_due, plus_shipped_7d, plus_kept_share_30d'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE actor = 'management-personas (PLUSSING-6)'
    AND action LIKE 'PLUSSING-6:%'
);

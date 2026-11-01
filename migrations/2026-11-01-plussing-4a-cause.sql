-- METRIC-CAUSE-AT-REGISTRATION-1 (2026-11-01, charter pillar autonomy; issue 1000817).
-- Live qnfo-audit read: plus_shipped_7d and plus_kept_share_30d were active registrations with no metric_breach_cause row.
-- Both measure product-level improvement delivery or retention; existing product-plus debt metrics use the structure cause.
-- PREDICTION: the registration detector's missing-cause count falls from 2 to 0 after this migration; no metric threshold or spend changes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01-plussing-4:%';

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
  ('plus_shipped_7d', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01-plussing-4: this measures product-level capability improvements shipped; the root cause of a low rate is a structural product-delivery gap.'),
  ('plus_kept_share_30d', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01-plussing-4: this measures retained product improvements after outcome checks; the root cause of a low rate is structural quality debt in the product-improvement process.');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'copilot/1000817-fix-metric-breach-cause',
  'PLUSSING-4 delivery and retention metrics share the structure cause already used for product-plus debt and improvement-rate metrics.',
  'METRIC-CAUSE-AT-REGISTRATION-1: map plus_shipped_7d and plus_kept_share_30d to structure.',
  'Read-only qnfo-audit query found both active metrics registered with no cause row; product_plus_rate_7d, plus_keep_rate_30d and plus_debt_oldest_weeks already map to structure.',
  'CI migration adds the two cause mappings; the registration detector is expected to fall from 2 missing causes to 0.',
  'Two metric_breach_cause rows; no metric values, triggers, thresholds, or budgets change.',
  'The Rollback header removes only these two mappings; decision_log remains append-only.',
  'PLUSSING-4 metrics have an actionable root-cause classification from registration.',
  'The missing-cause detector count falls from 2 to 0 after CI applies this migration.',
  'Improves attribution of product delivery and quality gaps.',
  'Read-only qnfo-audit D1 query, migration replay/rollback test, and migration checker.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE actor = 'copilot/1000817-fix-metric-breach-cause'
    AND action = 'METRIC-CAUSE-AT-REGISTRATION-1: map plus_shipped_7d and plus_kept_share_30d to structure.'
);

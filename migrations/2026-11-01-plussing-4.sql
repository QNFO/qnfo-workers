-- PLUSSING-4 (2026-11-01, issue 1000790, charter pillars autonomy and reach).
-- Measure product-level shipment cadence and outcome retention. A deployed plus gets the same outcome measure
-- and the global output-quality guard recorded at ship time; after seven days it is kept only on a material
-- improvement with no guard regression. Otherwise a product-manager request asks the existing roadmap/code
-- path to revert only that plus. Products without an outcome measure count as unmeasured, never as kept.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_plus4_workflow
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261101_plus4_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas'; DROP VIEW IF EXISTS v_product_plus_due; CREATE VIEW v_product_plus_due AS SELECT p.product, p.host, p.program_code, p.last_plus_at, CAST((julianday('now') - julianday(COALESCE(p.last_plus_at, p.created_at))) * 24 AS INTEGER) AS hours_since_plus, p.plus_cadence_h, p.misses_in_row, p.pluses_since_simplify, CASE WHEN p.pluses_since_simplify >= 4 THEN 'simplify' ELSE 'plus' END AS next_kind, (SELECT COUNT(*) FROM plus_ledger l WHERE l.product = p.product AND l.status IN ('proposed','building')) AS in_flight FROM product_registry p WHERE p.state = 'active' AND (p.rest_until IS NULL OR p.rest_until <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) AND (julianday('now') - julianday(COALESCE(p.last_plus_at, p.created_at))) * 24 >= p.plus_cadence_h ORDER BY hours_since_plus DESC; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('plus_shipped_7d', 'plus_kept_share_30d'); DELETE FROM metric_registry WHERE metric IN ('plus_shipped_7d', 'plus_kept_share_30d')

CREATE TABLE IF NOT EXISTS bak_20261101_plus4_workflow AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

CREATE TABLE IF NOT EXISTS plus_outcome_checks (
  plus_id INTEGER PRIMARY KEY,
  product TEXT NOT NULL,
  metric TEXT,
  baseline REAL,
  baseline_at TEXT,
  guard_baseline REAL,
  checked_at TEXT,
  outcome TEXT NOT NULL DEFAULT 'pending',
  evidence TEXT
);

UPDATE product_registry
SET quality_measure = 'engaged_human_sessions_28d'
WHERE product = 'qnfo-site'
  AND EXISTS (SELECT 1 FROM output_quality_measures WHERE metric = 'engaged_human_sessions_28d' AND role = 'outcome');

UPDATE product_registry
SET quality_measure = 'papers_with_open_high_errata_pct'
WHERE product = 'papers'
  AND EXISTS (SELECT 1 FROM output_quality_measures WHERE metric = 'papers_with_open_high_errata_pct' AND role = 'outcome');

DROP VIEW IF EXISTS v_product_plus_due;
CREATE VIEW v_product_plus_due AS
SELECT p.product, p.host, p.program_code, p.last_plus_at,
  CAST((julianday('now') - julianday(COALESCE(p.last_plus_at, p.created_at))) * 24 AS INTEGER) AS hours_since_plus,
  p.plus_cadence_h, p.misses_in_row, p.pluses_since_simplify,
  CASE WHEN p.pluses_since_simplify >= 4 THEN 'simplify' ELSE 'plus' END AS next_kind,
  (SELECT COUNT(*) FROM plus_ledger l WHERE l.product = p.product AND l.status IN ('proposed','building','reverting')) AS in_flight
FROM product_registry p
WHERE p.state = 'active'
  AND (p.rest_until IS NULL OR p.rest_until <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  AND (julianday('now') - julianday(COALESCE(p.last_plus_at, p.created_at))) * 24 >= p.plus_cadence_h
ORDER BY hours_since_plus DESC;

UPDATE fleet_tasks
SET definition = json_insert(definition,
  '$.steps[#]', json('{"type":"sql","name":"pl-outcome-baseline","db":"AUDIT","sql":"INSERT OR IGNORE INTO plus_outcome_checks (plus_id, product, metric, baseline, baseline_at, guard_baseline, outcome, evidence) SELECT l.id, l.product, r.quality_measure, CASE WHEN q.role = ''outcome'' THEN CAST(m.last_value AS REAL) END, COALESCE(m.last_refreshed, l.decided_at), CAST(g.last_value AS REAL), CASE WHEN q.role = ''outcome'' AND m.last_value IS NOT NULL AND g.last_value IS NOT NULL THEN ''pending'' ELSE ''unmeasured'' END, CASE WHEN q.role = ''outcome'' AND m.last_value IS NOT NULL AND g.last_value IS NOT NULL THEN ''baseline captured at verified deployment'' ELSE ''no measured outcome and output-quality guard at deployment; not counted as kept'' END FROM plus_ledger l JOIN product_registry r ON r.product = l.product LEFT JOIN output_quality_measures q ON q.metric = r.quality_measure AND q.role = ''outcome'' LEFT JOIN metric_registry m ON m.metric = r.quality_measure LEFT JOIN metric_registry g ON g.metric = ''output_quality_outcomes_worse'' WHERE l.status = ''deployed'' AND l.outcome LIKE ''deployed%'' AND NOT EXISTS (SELECT 1 FROM plus_outcome_checks c WHERE c.plus_id = l.id)"}'),
  '$.steps[#]', json('{"type":"sql","name":"pl-outcome-review","db":"AUDIT","sql":"UPDATE plus_outcome_checks SET checked_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), outcome = CASE WHEN ((CAST((SELECT last_value FROM metric_registry WHERE metric = plus_outcome_checks.metric) AS REAL) - baseline) * (SELECT polarity FROM output_quality_measures WHERE metric = plus_outcome_checks.metric)) > MAX((SELECT tol_abs FROM output_quality_measures WHERE metric = plus_outcome_checks.metric), (SELECT tol_rel FROM output_quality_measures WHERE metric = plus_outcome_checks.metric) * ABS(baseline)) AND CAST((SELECT last_value FROM metric_registry WHERE metric = ''output_quality_outcomes_worse'') AS REAL) <= guard_baseline THEN ''kept'' ELSE ''revert_required'' END, evidence = ''seven-day outcome check: '' || metric || '' '' || baseline || '' -> '' || (SELECT last_value FROM metric_registry WHERE metric = plus_outcome_checks.metric) || ''; output_quality_outcomes_worse '' || guard_baseline || '' -> '' || (SELECT last_value FROM metric_registry WHERE metric = ''output_quality_outcomes_worse'') WHERE outcome = ''pending'' AND baseline_at <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND EXISTS (SELECT 1 FROM metric_registry m JOIN metric_registry g ON g.metric = ''output_quality_outcomes_worse'' WHERE m.metric = plus_outcome_checks.metric AND m.last_value IS NOT NULL AND m.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', plus_outcome_checks.baseline_at, ''+7 days'') AND m.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 days'') AND g.last_value IS NOT NULL AND g.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', plus_outcome_checks.baseline_at, ''+7 days'') AND g.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 days''))"}'),
  '$.steps[#]', json('{"type":"sql","name":"pl-outcome-result","db":"AUDIT","sql":"UPDATE plus_ledger SET status = CASE (SELECT outcome FROM plus_outcome_checks WHERE plus_id = plus_ledger.id) WHEN ''kept'' THEN ''kept'' WHEN ''revert_required'' THEN ''reverting'' ELSE status END, outcome = CASE (SELECT outcome FROM plus_outcome_checks WHERE plus_id = plus_ledger.id) WHEN ''kept'' THEN ''kept: seven-day outcome improved beyond tolerance and no guard worsened'' WHEN ''revert_required'' THEN ''revert required: seven-day outcome did not improve or output-quality guard worsened'' ELSE outcome END, decided_at = CASE WHEN (SELECT outcome FROM plus_outcome_checks WHERE plus_id = plus_ledger.id) = ''kept'' THEN (SELECT checked_at FROM plus_outcome_checks WHERE plus_id = plus_ledger.id) ELSE decided_at END WHERE status = ''deployed'' AND EXISTS (SELECT 1 FROM plus_outcome_checks WHERE plus_id = plus_ledger.id AND outcome IN (''kept'', ''revert_required''))"}'),
  '$.steps[#]', json('{"type":"sql","name":"pl-revert-request","db":"AUDIT","sql":"INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority) SELECT ''program-manager:'' || r.program_code, ''run'', ''Revert only plus #'' || l.id || '' for '' || l.product || '' because its seven-day outcome check failed: '' || COALESCE(c.evidence, ''outcome did not improve'') || ''. Restore the behavior before that plus, with no unrelated edits. Use the existing roadmap/code path. Never read or quote personal data. Reply exactly with TITLE, WHY, code-task, code-anchor and EDIT lines; the task must target '' || p.path || '' and anchor to this exact source line: '' || p.anchor_line || ''.'', ''roadmap-'' || r.program_code || ''-plus-revert-'' || l.product || ''-'' || l.id, ''high'' FROM plus_ledger l JOIN product_registry r ON r.product = l.product JOIN roadmap_proposals p ON p.issue_id = l.issue_id JOIN plus_outcome_checks c ON c.plus_id = l.id WHERE l.status = ''reverting'' AND p.path IS NOT NULL AND p.anchor_line IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cf_agent_requests a WHERE a.instance = ''roadmap-'' || r.program_code || ''-plus-revert-'' || l.product || ''-'' || l.id)"}'),
  '$.steps[#]', json('{"type":"sql","name":"pl-revert-sync","db":"AUDIT","sql":"UPDATE plus_ledger SET status = ''reverted'', outcome = ''reverted through the roadmap/code path after the seven-day outcome check'', decided_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') WHERE status = ''reverting'' AND EXISTS (SELECT 1 FROM roadmap_proposals p JOIN product_registry r ON r.product = plus_ledger.product WHERE p.request_instance = ''roadmap-'' || r.program_code || ''-plus-revert-'' || plus_ledger.product || ''-'' || plus_ledger.id AND p.status = ''deployed'' )"}'),
  '$.steps[#]', json('{"type":"sql","name":"pl-revert-sync-check","db":"AUDIT","sql":"UPDATE plus_outcome_checks SET outcome = ''reverted'', checked_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') WHERE outcome = ''revert_required'' AND EXISTS (SELECT 1 FROM plus_ledger l WHERE l.id = plus_outcome_checks.plus_id AND l.status = ''reverted'')"}'),
  '$.steps[#]', json('{"type":"sql","name":"pl-shipped-metric","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST(COALESCE((SELECT MIN((SELECT COUNT(*) FROM plus_outcome_checks c WHERE c.product = p.product AND c.baseline_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) FROM product_registry p WHERE p.state = ''active'' AND p.worker IS NOT NULL AND p.worker NOT IN (''qnfo-fleet-control'', ''qnfo-ops'', ''qnfo-deploy-guard'', ''qnfo-containers-pilot'', ''qnfo-autonomy-scorer'', ''qnfo-observability'', ''qnfo-code-orchestrator'', ''qnfo-code-agent'')), 0) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''plus_shipped_7d''"}'),
  '$.steps[#]', json('{"type":"sql","name":"pl-kept-metric","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE CAST(ROUND(1.0 * SUM(outcome = ''kept'') / COUNT(*), 3) AS TEXT) END FROM plus_outcome_checks WHERE baseline_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 days'') AND baseline_at <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND outcome IN (''kept'', ''reverted'', ''revert_required'', ''unmeasured'')), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = CASE WHEN (SELECT COUNT(*) FROM plus_outcome_checks WHERE baseline_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 days'') AND baseline_at <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND outcome IN (''kept'', ''reverted'', ''revert_required'', ''unmeasured'')) = 0 THEN ''UNMEASURED'' ELSE ''MEASURED'' END WHERE metric = ''plus_kept_share_30d''"}')
),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas' AND instr(definition, '"pl-outcome-baseline"') = 0;

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state)
VALUES
  ('plus_shipped_7d', 'operational', 'target',
   'minimum verified plus count across active, plusable products in the rolling 7-day window; target >= 1 per product',
   'qnfo-audit.plus_outcome_checks, written hourly by management-personas after verified deployment',
   '>= 1 per active plusable product', 'qnfo-fleet-control', 'analytics_metric_triggers -> management-personas', 'hourly', 'PENDING'),
  ('plus_kept_share_30d', 'operational', 'target',
   'kept seven-day outcome checks / all mature seven-day checks in the rolling 30-day window; unmeasured checks are not kept',
   'qnfo-audit.plus_outcome_checks, written hourly by management-personas after the outcome window',
   '>= 0.5', 'qnfo-fleet-control', 'analytics_metric_triggers -> management-personas', 'hourly', 'PENDING');

INSERT INTO analytics_metric_triggers
  (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'plus_shipped_7d', 'Product plussing: every active product receives a verified plus each week', 'registry', 'lt', 1, 2,
  'Pillar autonomy and reach. Read products with no verified plus in the last seven days from v_product_plus_due and plus_outcome_checks. The management-personas plus step is the shared Fix/Plus queue: repair breached products first and originate the smallest reversible yes-and proposal for each healthy product; keep the daily cap and the existing roadmap/code/canary path.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'PLUSSING-4: one verified plus per active plusable product per 7 days'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'plus_shipped_7d');

INSERT INTO analytics_metric_triggers
  (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'plus_kept_share_30d', 'Product plussing: fewer than half of measured pluses improve outcomes', 'registry', 'lt', 0.5, 2,
  'Pillar autonomy and reach. Read mature plus_outcome_checks with their baseline, seven-day outcome, and output_quality_outcomes_worse guard. Replace a plus that did not move its registered outcome; do not count an unmeasured or guard-regressing plus as kept. Use the existing roadmap/code path to revert a failed addition.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'PLUSSING-4: kept plus share at least 0.5 in 30 days'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'plus_kept_share_30d');

UPDATE roadmap_implementation
SET status = 'built', evidence = 'migrations/2026-11-01-plussing-4.sql: seven-day outcome/guard check, verified revert path, and plus_shipped_7d plus plus_kept_share_30d triggers'
WHERE source = 'plussing-2026' AND item = 'PLUS-4';

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('product-plus-outcome-verification', 'migrations/2026-11-01-plussing-4.sql (PLUSSING-4)',
   'product_registry, output_quality_measures, plus_ledger, plus_outcome_checks, management-personas, ROADMAP-ORIGINATE-1',
   0.5, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
   'every deployed plus is judged against the same registered outcome after seven days and the output-quality guard; failures request a revert through the existing code path');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'management-personas (PLUSSING-4)',
  'product plusses need a measured keep/revert decision, not only a verified deployment count',
  'capture each plus outcome baseline at verified deployment, compare after seven days with output-quality guards, and route failed additions through the existing roadmap/code path',
  'product_registry and plus_ledger existed, but PLUSSING-3 marked a verified deployment as success without a seven-day outcome check',
  'pending',
  'active plusable products, their plus outcome records, and two triggered metrics',
  'restore management-personas from bak_20261101_plus4_workflow; remove the two trigger and metric rows',
  'pluses are kept only when the same outcome improves and no guard worsens; otherwise the manager initiates a bounded revert',
  'plus_shipped_7d reaches at least 1 for every active plusable product and plus_kept_share_30d reaches at least 0.5 within 30 days',
  'research and reach products receive measured, reversible improvements',
  'management-personas, plus_outcome_checks, metric_registry, analytics_metric_triggers, ROADMAP-ORIGINATE-1');

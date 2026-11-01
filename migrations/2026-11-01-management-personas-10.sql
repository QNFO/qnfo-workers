-- MANAGEMENT-PERSONAS-10 / LEGACY-PLUS-LEDGER-1 (2026-11-01, charter pillar autonomy).
-- The live plus_ledger predates PLUSSING-1 and has the legacy product_slug/plus
-- columns with NOT NULL constraints. Because PLUSSING-1 uses CREATE TABLE IF
-- NOT EXISTS, its newer product/title columns were never created, so the
-- management-personas plussing steps failed with "no such column: l.product".
-- Preserve the legacy columns and rows while adding the columns consumed by
-- PLUSSING-3/4. The pl-ledger step writes both shapes to satisfy the legacy
-- NOT NULL constraints and keep old readers current. The same task version
-- also replaces the malformed PLUSSING-4 shipment aggregation.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_mp10_workflow
-- Rollback: INSERT OR REPLACE INTO ops_config (key, value) VALUES ('product_plus', 'off'); UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261101_mp10_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas';

CREATE TABLE IF NOT EXISTS bak_20261101_mp10_workflow AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

ALTER TABLE plus_ledger ADD COLUMN product TEXT;
ALTER TABLE plus_ledger ADD COLUMN kind TEXT;
ALTER TABLE plus_ledger ADD COLUMN title TEXT;
ALTER TABLE plus_ledger ADD COLUMN evidence TEXT;
ALTER TABLE plus_ledger ADD COLUMN predicted_outcome TEXT;
ALTER TABLE plus_ledger ADD COLUMN issue_id INTEGER;
ALTER TABLE plus_ledger ADD COLUMN pr_url TEXT;
ALTER TABLE plus_ledger ADD COLUMN outcome TEXT;
ALTER TABLE plus_ledger ADD COLUMN created_at TEXT;

UPDATE plus_ledger
SET product = product_slug,
    kind = 'plus',
    title = plus,
    evidence = 'Migrated from the legacy product plus ledger',
    predicted_outcome = predicted,
    outcome = measured,
    created_at = COALESCE(decided_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
WHERE product IS NULL;

UPDATE fleet_tasks
SET definition = json_set(
      json_set(
        definition,
        '$.steps[' || (
          SELECT key FROM json_each(fleet_tasks.definition, '$.steps')
          WHERE json_extract(value, '$.name') = 'pl-ledger'
          LIMIT 1
        ) || '].sql',
        replace(
          replace(
            json_extract(
              definition,
              '$.steps[' || (
                SELECT key FROM json_each(fleet_tasks.definition, '$.steps')
                WHERE json_extract(value, '$.name') = 'pl-ledger'
                LIMIT 1
              ) || '].sql'
            ),
            'INSERT INTO plus_ledger (product, kind, title, evidence, predicted_outcome, issue_id, status)',
            'INSERT INTO plus_ledger (product, kind, title, evidence, predicted_outcome, issue_id, status, product_slug, plus, predicted, measured, shipped_at)'
          ),
          'p.issue_id, ''proposed'' FROM roadmap_proposals p',
          'p.issue_id, ''proposed'', substr(p.request_instance, instr(p.request_instance, ''-plus-'') + 6, length(p.request_instance) - instr(p.request_instance, ''-plus-'') - 14), p.title, substr(p.rationale, 1, 400), NULL, NULL FROM roadmap_proposals p'
        )
      ),
      '$.steps[' || (
        SELECT key FROM json_each(fleet_tasks.definition, '$.steps')
        WHERE json_extract(value, '$.name') = 'pl-shipped-metric'
        LIMIT 1
      ) || '].sql',
      'UPDATE metric_registry SET last_value = CAST(COALESCE((SELECT MIN(cnt) FROM (SELECT p.product, COUNT(c.plus_id) AS cnt FROM product_registry p LEFT JOIN plus_outcome_checks c ON c.product = p.product AND c.baseline_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') WHERE p.state = ''active'' AND p.worker IS NOT NULL AND p.worker NOT IN (''qnfo-fleet-control'', ''qnfo-ops'', ''qnfo-deploy-guard'', ''qnfo-containers-pilot'', ''qnfo-autonomy-scorer'', ''qnfo-observability'', ''qnfo-code-orchestrator'', ''qnfo-code-agent'') GROUP BY p.product)), 0) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''plus_shipped_7d'''
    ),
    version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas'
  AND EXISTS (
    SELECT 1 FROM json_each(fleet_tasks.definition, '$.steps')
    WHERE json_extract(value, '$.name') = 'pl-ledger'
      AND instr(json_extract(value, '$.sql'), 'product_slug, plus, predicted, measured, shipped_at') = 0
  )
  AND EXISTS (
    SELECT 1 FROM json_each(fleet_tasks.definition, '$.steps')
    WHERE json_extract(value, '$.name') = 'pl-shipped-metric'
      AND instr(json_extract(value, '$.sql'), 'SELECT MIN((SELECT COUNT(*)') > 0
  );

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'management-personas (LEGACY-PLUS-LEDGER-1)',
  'the live plus_ledger predates the schema expected by the manager workflow, so additive compatibility preserves records while restoring the task',
  'reconcile the PLUSSING-3/4 ledger and shipment metric SQL with the live task',
  'qnfo-audit plus_ledger has product_slug and plus as required columns, while management-personas workflow SQL reads product, kind, and title',
  'pending migration application and next hourly task run',
  'plus_ledger columns and the management-personas pl-ledger step',
  'product_plus = off; the migration rollback restores the prior task definition',
  'management-personas-cron-legacy-ledger-compatibility',
  'the task no longer fails on plus_ledger schema mismatch and task-failed:management-personas disappears from v_cron_faults',
  'No product request, spend, or publication policy changes',
  'live qnfo-audit schema read; legacy-schema SQLite workflow regression'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'reconcile the PLUSSING-3/4 ledger and shipment metric SQL with the live task'
);

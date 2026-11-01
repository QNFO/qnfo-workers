-- MANAGEMENT-PERSONAS-11 / PERSONAL-METRIC-DOERS-1 (2026-11-01, charter pillar autonomy).
-- Renamed from -10: #5518 merged a different migration (LEGACY-PLUS-LEDGER-1, plus_ledger columns and the pl-ledger step) under that name and applied it, so this one,
-- which changes only the dg-request step, is a forward migration with its own backup table (the backup of -10 predates that change and would roll both back).
-- Extend DOER-ASSIGN-1 to QNFO.PERSONAL off-target metric issues. Migration 9 already
-- ranks these metrics worst-first; the request step excluded PERSONAL entirely.
-- Personal requests contain only the aggregate focus reason, not the issue title/body,
-- and remain barred from personal-* code targets and research stores.
-- Prediction: each eligible PERSONAL off-target focus metric without a doer is requested
-- in breach-rank order, within the existing age and per-tick caps.
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261101_mp11_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas'
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_mp11_workflow

CREATE TABLE IF NOT EXISTS bak_20261101_mp11_workflow AS
SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

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
          'a.title || char(10) || substr(COALESCE(a.description, ''''), 1, 1500)',
          'CASE WHEN f.program_code = ''QNFO.PERSONAL'' THEN ''Aggregate metric only: '' || f.reason || ''. Do not access personal records or research stores.'' ELSE a.title || char(10) || substr(COALESCE(a.description, ''''), 1, 1500) END'
        ),
        'AND f.program_code <> ''QNFO.PERSONAL'' AND f.entered_at',
        'AND (f.program_code <> ''QNFO.PERSONAL'' OR f.reason LIKE ''worst off-target metric %'') AND f.entered_at'
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
        'AND f.program_code <> ''QNFO.PERSONAL'' AND f.entered_at') > 0
  );

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('personal-program-assigns-worst-first-metric-doers', 'migrations/2026-11-01-management-personas-11.sql',
   'management-personas hourly workflow; migration 9 focus ranking; aggregate metric-trigger issues',
   'off-target PERSONAL metric focus issues without a doer are requested in focus-rank order; personal issue bodies are not sent',
   '2026-11-01',
   'the dg-request step selects PERSONAL only for worst off-target metric focus reasons and keeps existing age, cap, target, and opt-out rules');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'program-manager:QNFO.PERSONAL (PERSONAL-METRIC-DOERS-1)',
  'PERSONAL off-target metrics should use the existing worst-first focus order and doer workflow without exposing personal issue text',
  'request doers for PERSONAL off-target metric focus issues in focus-rank order using aggregate reasons only',
  'migration 9 ranked PERSONAL metric-trigger issues, but the management-personas dg-request step excluded QNFO.PERSONAL',
  'pending hourly workflow and metric readback after migration application',
  'management-personas dg-request step for PERSONAL focus issues; no personal records, personal-* targets, or research stores',
  'Rollback line of migrations/2026-11-01-management-personas-11.sql',
  'PERSONAL worst-first metric doer dispatch with aggregate-only context',
  'PERSONAL off-target metric focus issues without a doer receive requests in descending normalized breach order; existing caps and privacy boundaries hold',
  'No direct yield or reach gain is assumed; the change adds no spend and does not alter output quality measures.',
  'SQLite migration replay, synthetic PERSONAL breach ordering, eligible request selection, and issue-text redaction'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'request doers for PERSONAL off-target metric focus issues in focus-rank order using aggregate reasons only'
);

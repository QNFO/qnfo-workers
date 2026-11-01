-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_roadmap_upgrade_placement_rows
-- Rollback: UPDATE fleet_tasks SET definition=(SELECT definition FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action'), version=(SELECT version FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action'), updated_at=(SELECT updated_at FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action') WHERE id='portfolio-gap-action' AND EXISTS (SELECT 1 FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action'); UPDATE fleet_tasks_canonical SET definition=(SELECT canonical_definition FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action'), repo_path=(SELECT canonical_repo_path FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action'), exported_at=(SELECT canonical_exported_at FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action') WHERE id='portfolio-gap-action' AND (SELECT canonical_definition FROM bak_20261101_roadmap_upgrade_placement_task WHERE id='portfolio-gap-action') IS NOT NULL; UPDATE roadmap_implementation SET artifact_ref=(SELECT b.artifact_ref FROM bak_20261101_roadmap_upgrade_placement_rows b WHERE b.id=roadmap_implementation.id) WHERE id IN (SELECT id FROM bak_20261101_roadmap_upgrade_placement_rows);
-- ROADMAP-OPEN-UPGRADE-PLACEMENT-1 (2026-11-01, charter pillar autonomy; issue 100221).
-- portfolio-gap-action used the bare worker slug as artifact_ref for UPG rows, while v_roadmap resolves projects by project_code.
-- Store the canonical W.<worker> project code for future rows and repair existing rows only when that project exists.

CREATE TABLE IF NOT EXISTS bak_20261101_roadmap_upgrade_placement_task AS
SELECT t.id, t.definition, t.version, t.updated_at,
       c.definition AS canonical_definition, c.repo_path AS canonical_repo_path,
       c.exported_at AS canonical_exported_at
FROM fleet_tasks t
LEFT JOIN fleet_tasks_canonical c ON c.id=t.id
WHERE t.id='portfolio-gap-action';

CREATE TABLE IF NOT EXISTS bak_20261101_roadmap_upgrade_placement_rows AS
SELECT r.id, r.artifact_ref
FROM roadmap_implementation r
WHERE r.source='portfolio-gap-action' AND r.item LIKE 'UPG-%'
  AND EXISTS (SELECT 1 FROM projects p WHERE p.project_code='W.'||substr(r.item, 5));

SELECT json('ROADMAP-OPEN-UPGRADE-PLACEMENT-1: portfolio-gap-action upgrade insert anchor missing or ambiguous')
WHERE NOT EXISTS (
  SELECT 1
  FROM fleet_tasks t
  WHERE t.id='portfolio-gap-action' AND json_valid(t.definition)
    AND (
      instr(json_extract(t.definition, '$.steps[2].sql'), '''worker'', ''W.''||w.worker, ''open''') > 0
      OR length(json_extract(t.definition, '$.steps[2].sql'))
        - length(replace(json_extract(t.definition, '$.steps[2].sql'), '''worker'', w.worker, ''open''', ''))
        = length('''worker'', w.worker, ''open''')
    )
);

UPDATE fleet_tasks
SET definition=json_set(
      definition, '$.steps[2].sql',
      replace(json_extract(definition, '$.steps[2].sql'),
              '''worker'', w.worker, ''open''',
              '''worker'', ''W.''||w.worker, ''open''')),
    version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id='portfolio-gap-action' AND json_valid(definition)
  AND instr(json_extract(definition, '$.steps[2].sql'), 'INSERT INTO roadmap_implementation') > 0
  AND length(json_extract(definition, '$.steps[2].sql'))
    - length(replace(json_extract(definition, '$.steps[2].sql'), '''worker'', w.worker, ''open''', ''))
    = length('''worker'', w.worker, ''open''')
  AND json_valid(json_set(
      definition, '$.steps[2].sql',
      replace(json_extract(definition, '$.steps[2].sql'),
              '''worker'', w.worker, ''open''',
              '''worker'', ''W.''||w.worker, ''open''')));

UPDATE fleet_tasks_canonical
SET definition=(SELECT t.definition FROM fleet_tasks t WHERE t.id=fleet_tasks_canonical.id),
    repo_path='migrations/2026-11-01-roadmap-upgrade-placement.sql',
    exported_at=datetime('now')
WHERE id='portfolio-gap-action'
  AND definition=(SELECT b.definition FROM bak_20261101_roadmap_upgrade_placement_task b WHERE b.id='portfolio-gap-action')
  AND definition<>(SELECT t.definition FROM fleet_tasks t WHERE t.id=fleet_tasks_canonical.id);

UPDATE roadmap_implementation AS r
SET artifact_ref=(SELECT p.project_code FROM projects p WHERE p.project_code='W.'||substr(r.item, 5))
WHERE r.source='portfolio-gap-action' AND r.item LIKE 'UPG-%'
  AND EXISTS (SELECT 1 FROM projects p WHERE p.project_code='W.'||substr(r.item, 5))
  AND r.artifact_ref<>(SELECT p.project_code FROM projects p WHERE p.project_code='W.'||substr(r.item, 5));

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
   capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session:copilot/100221-open-roadmap-items',
  'The unplaced upgrade rows name existing projects by worker slug, but v_roadmap needs the projects.project_code key.',
  'ROADMAP-OPEN-UPGRADE-PLACEMENT-1: make portfolio-gap-action store W.<worker> in artifact_ref and correct existing upgrade rows only when their project exists.',
  'Live qnfo-audit v_roadmap read found UPG-personal-watch and UPG-voice-stt unplaced; projects contains W.personal-watch (QNFO.PERSONAL) and W.voice-stt (QNFO.INFRA).',
  'pending CI migration application and next metric refresh',
  'portfolio-gap-action task definition, its canonical copy, and matching portfolio-gap-action UPG roadmap rows',
  'Restore the task, canonical row, and artifact_ref values from the migration-created backup tables.',
  'New and existing portfolio upgrade rows resolve to their owning program without guessing for unknown projects.',
  'roadmap_open_unplaced falls from 2 to 0 at the next refresh; unmatched projects remain unplaced.',
  'No direct external reach change.',
  'Read-only qnfo-audit rows and project codes; offline roadmap-maintenance suite, generated task step, idempotence, and rollback.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE instr(action, 'ROADMAP-OPEN-UPGRADE-PLACEMENT-1:')=1
);

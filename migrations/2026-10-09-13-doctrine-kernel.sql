-- DOCTRINE-KERNEL-1 (2026-10-09, pillar autonomy; owner directive 2026-10-09, the reflexive kernel version 8.0.0, adopted
-- verbatim in docs/DOCTRINE-KERNEL.md with readings (m)-(q); it layers on revision 5). Two pieces of machinery the kernel names
-- that the fleet did not have:
--   lineage (§REGISTRIES, §KERNEL "loads only from its own durable state and lineage"; revision 4/5 continuity): doctrine_lineage
--     holds every doctrine and kernel version with its date, source and file, so a successor resumes from the record.
--   trust_ledger (§TRUST): v_trust_ledger computes trust per (surface, action class) from recorded outcomes in the last 30 days,
--     as reliability with a 0.5 prior, (ok + 5) / (ok + fail + 10), and its ladder position. Remediation probe verdicts are
--     not counted: a failing probe marks an open defect, not an unreliable action. Reading (o): it widens only fleet loop
--     scopes, through the canonical path. Each compound SELECT keeps to D1's 5-term limit (D1-COMPOUND-LIMIT-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_trust_ledger (doctrine_lineage rows are history and stay)

CREATE TABLE IF NOT EXISTS doctrine_lineage (
  version TEXT PRIMARY KEY,
  adopted_at TEXT NOT NULL,
  source TEXT NOT NULL,
  file TEXT NOT NULL,
  parent TEXT,
  note TEXT
);

INSERT OR IGNORE INTO doctrine_lineage (version, adopted_at, source, file, parent, note) VALUES
 ('rev1', '2026-10-08', 'owner directive 2026-10-08', 'docs/AUTONOMOUS-OPERATION-DOCTRINE.md', NULL, 'Autonomous Operation Doctrine revision 1'),
 ('rev2', '2026-10-08', 'owner directive 2026-10-08', 'docs/AUTONOMOUS-OPERATION-DOCTRINE.md', 'rev1', 'section 6 no silent drop'),
 ('rev3', '2026-10-09', 'owner directive 2026-10-09 (PR 827)', 'docs/AUTONOMOUS-OPERATION-DOCTRINE.md', 'rev2', 'blocker red-team across every surface; fleet delegation; readings (a)-(d)'),
 ('rev4', '2026-10-09', 'owner directive 2026-10-09 (PR 840)', 'docs/AUTONOMOUS-OPERATION-DOCTRINE.md', 'rev3', 'growth, reporting, calibration, continuity; readings (e)-(h)'),
 ('rev5', '2026-10-09', 'owner directive 2026-10-09 (PR 850)', 'docs/AUTONOMOUS-OPERATION-DOCTRINE.md', 'rev4', 'restructured into Parts I-V; readings (i)-(l)');

INSERT OR IGNORE INTO doctrine_lineage (version, adopted_at, source, file, parent, note) VALUES
 ('kernel-8.0.0', '2026-10-09', 'owner directive 2026-10-09 (self-named reflexive kernel)', 'docs/DOCTRINE-KERNEL.md', 'rev5', 'tick, recognitions, computed trust, registries; readings (m)-(q); layers on rev5');

CREATE VIEW IF NOT EXISTS v_trust_ledger AS
SELECT surface_class, ok, fail,
  ROUND((ok + 5.0) / (ok + fail + 10.0), 3) AS trust,
  CASE WHEN (ok + 5.0) / (ok + fail + 10.0) < 0.3 THEN 'observed'
       WHEN (ok + 5.0) / (ok + fail + 10.0) < 0.5 THEN 'assisted'
       WHEN (ok + 5.0) / (ok + fail + 10.0) < 0.6 THEN 'delegated'
       WHEN (ok + 5.0) / (ok + fail + 10.0) < 0.7 THEN 'autonomous'
       WHEN (ok + 5.0) / (ok + fail + 10.0) < 0.8 THEN 'self-directed'
       WHEN (ok + 5.0) / (ok + fail + 10.0) < 0.9 THEN 'self-modifying'
       ELSE 'self-extending' END AS ladder,
  evidence
FROM (
  SELECT * FROM (
    SELECT 'migration:apply' AS surface_class, COALESCE(SUM(status = 'ok'), 0) AS ok, COALESCE(SUM(status <> 'ok'), 0) AS fail, 'migration_runs, 30 days' AS evidence
      FROM migration_runs WHERE applied_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
    UNION ALL
    SELECT 'code-loop:merge', COALESCE(SUM(status = 'merged'), 0), COALESCE(SUM(status IN ('reverted', 'failed', 'publish_failed')), 0), 'code_tasks, 30 days'
      FROM code_tasks WHERE updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
    UNION ALL
    SELECT 'research:publish', COALESCE(SUM(status = 'published'), 0), COALESCE(SUM(status = 'wontfix'), 0), 'research_queue rows created in 30 days'
      FROM research_queue WHERE created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')
  )
  UNION ALL
  SELECT * FROM (
    SELECT 'deploy:fallback', COALESCE(SUM(status = 'ok'), 0), COALESCE(SUM(status <> 'ok'), 0), 'cloud_ops_events deploy-fallback'
      FROM cloud_ops_events WHERE kind = 'deploy-fallback'
    UNION ALL
    SELECT 'claim:reap', COALESCE(SUM(status = 'ok'), 0), COALESCE(SUM(status <> 'ok'), 0), 'cloud_ops_events claim-reaper'
      FROM cloud_ops_events WHERE kind = 'claim-reaper'
    UNION ALL
    SELECT 'continuity:snapshot', COALESCE(SUM(ok = 1), 0), COALESCE(SUM(ok = 0), 0), 'continuity_snapshots'
      FROM continuity_snapshots
  )
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'the kernel layers on revision 5 and binds once its registries map to live tables', 'adopted the owner kernel 8.0.0 verbatim (docs/DOCTRINE-KERNEL.md) with readings (m)-(q); doctrine_lineage and v_trust_ledger added; other registries mapped to existing tables', 'kernel text 2026-10-09; trust read before merge: migration:apply 59/11, code-loop:merge 30/35, research:publish 41/22', 'the fleet records its doctrine lineage and computes trust per action class from outcomes', 'one table and one view', 'the Rollback line', 'computed trust per surface and action class; durable doctrine lineage', 'v_trust_ledger reads code-loop:merge near 0.47 (assisted) and migration:apply near 0.80 (self-modifying) on first read', NULL, 'docs, D1 view'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'adopted the owner kernel 8.0.0%');

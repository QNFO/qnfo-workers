-- DOCTRINE-REV3-REFRESH-1 (2026-10-09, pillar autonomy). Two audit repairs.
-- (1) 2026-10-09-doctrine-rev3-metrics.sql (PR 827) failed at statement 5 (migration_runs id 56, agent_issues 2210): its
--     refresh trigger hung off metric_registry and D1 refused it as nested too deep (D1-TRIGGER-DEPTH-1); the view and both
--     metric rows landed, so blocker_survival_rate_7d and blocker_surface_coverage_7d froze at their authoring values. They
--     now refresh on the 10-minute fleet_tick, at the same depth as scorecard_v2_tick (2026-10-08-14-accounting.sql).
--     apply_migrations.py compiles every new trigger and drops it at once if D1 refuses it, so this cannot break writes.
-- (2) issues_unaccounted read 41 (v_issue_accounting.deleted_unrecorded): 41 agent_issues ids below MAX(id) have no row and no
--     tombstone. Read 2026-10-09 08:05Z: 40 of them (370-373, 808, 1232-1557 ranges, 2209) have no issue_triage row, no
--     issue_lifecycle event and no contract; every committed issue gets a triage row from agent_issues_autotriage2_ins, so they
--     are ids consumed by inserts that never committed (a guard abort or a refile merged by issue_refile_reopen). 1409 has a
--     triage row (AUTOTRIAGE-1) but no issue: deleted before the lifecycle ledger existed (2026-10-08). Each gets an explicit
--     tombstone with that disposition (doctrine section 6: a recorded disposition, not silence). Nothing is deleted.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS doctrine_rev3_tick; DELETE FROM agent_issues_tombstone WHERE status IN ('never-committed', 'deleted-pre-ledger') AND close_channel = 'DOCTRINE-REV3-REFRESH-1';

CREATE TRIGGER IF NOT EXISTS doctrine_rev3_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT CASE WHEN cards_7d + redteamed_7d = 0 THEN 0 ELSE ROUND(1.0 * owner_decisions_7d / (cards_7d + redteamed_7d), 3) END FROM v_doctrine_rev3_blockers) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'blocker_survival_rate_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT CASE WHEN redteamed_7d = 0 THEN 1 ELSE ROUND(1.0 * redteamed_with_surfaces_7d / redteamed_7d, 3) END FROM v_doctrine_rev3_blockers) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'blocker_surface_coverage_7d';
END;

UPDATE metric_registry SET source_of_truth = 'qnfo-audit.v_doctrine_rev3_blockers, refreshed by D1 trigger doctrine_rev3_tick on every fleet_tick insert (10 minutes; DOCTRINE-REV3-REFRESH-1)'
  WHERE metric IN ('blocker_survival_rate_7d', 'blocker_surface_coverage_7d');

INSERT INTO agent_issues_tombstone (id, title, description, source, category, priority, status, linked_session, created_at, updated_at, pipeline_stage, predicate_id, recheck_count, close_channel, deleted_at)
SELECT j.value, '(id gap: insert never committed)',
  'No agent_issues row, no issue_triage row, no issue_lifecycle event and no remediation contract (read 2026-10-09 08:05Z). Every committed issue gets a triage row on insert (agent_issues_autotriage2_ins), so this id was consumed by an insert that aborted or was merged into an existing issue by issue_refile_reopen. Disposition recorded by DOCTRINE-REV3-REFRESH-1.',
  'migration', 'accounting', NULL, 'never-committed', NULL, NULL, NULL, NULL, NULL, NULL, 'DOCTRINE-REV3-REFRESH-1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM json_each('[370,371,372,373,808,1232,1233,1235,1237,1253,1254,1255,1300,1398,1425,1426,1427,1428,1429,1430,1431,1432,1433,1434,1435,1439,1440,1441,1453,1464,1549,1550,1551,1552,1553,1554,1555,1556,1557,2209]') j
WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = j.value)
  AND NOT EXISTS (SELECT 1 FROM agent_issues_tombstone t WHERE t.id = j.value);

INSERT INTO agent_issues_tombstone (id, title, description, source, category, priority, status, linked_session, created_at, updated_at, pipeline_stage, predicate_id, recheck_count, close_channel, deleted_at)
SELECT 1409, '(deleted before the lifecycle ledger)',
  'issue_triage holds a row for 1409 (rc AUTOTRIAGE-1, triaged, no close evidence) but agent_issues has none and issue_lifecycle (2026-10-08) never saw it: the issue was deleted before deletes were recorded. Its title and text are not recoverable from any table. Disposition recorded by DOCTRINE-REV3-REFRESH-1.',
  'migration', 'accounting', NULL, 'deleted-pre-ledger', NULL, NULL, NULL, NULL, NULL, NULL, 'DOCTRINE-REV3-REFRESH-1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE id = 1409) AND NOT EXISTS (SELECT 1 FROM agent_issues_tombstone WHERE id = 1409);

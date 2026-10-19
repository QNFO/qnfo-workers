-- ISSUE-ID-GAP-RANGES-1 (2026-10-19, pillar autonomy; RESOLVE-ALL-OPEN-1, issue 2200 METRIC-TRIGGER-3076-ISSUES-UNACCOUNTED).
-- issues_unaccounted read 96888 (v_issue_accounting.deleted_unrecorded 96885 + closed_without_disposition 3). The 96885 is a
-- measurement artifact, not a drop: on 2026-10-18 a session inserted agent_issues id 99901 with an explicit id, which moved
-- sqlite_sequence from 3015 to 99901, so ids 3016..99900 were never allocated. Read 2026-10-19 04:30Z: MAX(id) below 99000 = 3015,
-- MIN(id) above 3015 = 99901, 0 agent_issues rows, 0 agent_issues_tombstone rows and 0 issue_lifecycle rows in 3016..99900;
-- 99900 - 3016 + 1 = 96885 = deleted_unrecorded exactly. The per-id issue_id_gap_ledger is the wrong shape for 96885 ids, so this
-- file adds issue_id_gap_ranges(lo, hi, verdict, evidence) and makes deleted_unrecorded subtract, per range, the ids in it that
-- are in neither agent_issues nor agent_issues_tombstone (ids in issue_id_gap_ledger inside a range are not subtracted twice).
-- Every other column of v_issue_accounting keeps its text and meaning. Consumers: v_doctrine_scorecard_v2 (issues_unaccounted =
-- closed_without_disposition + deleted_unrecorded), the fm-dedup-id-gap contract (deleted_unrecorded = 0), loop_breaker_runner.py.
-- A future explicit-id insert that jumps the sequence is still counted until a range row explains it, so the detector keeps its teeth.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_v_issue_accounting
-- Rollback: DROP VIEW IF EXISTS v_issue_accounting; CREATE VIEW v_issue_accounting AS SELECT MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n, (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix') AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition, (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition, (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded, MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone) - (SELECT COUNT(*) FROM issue_id_gap_ledger WHERE id NOT IN (SELECT id FROM agent_issues) AND id NOT IN (SELECT id FROM agent_issues_tombstone))) AS deleted_unrecorded, (SELECT COUNT(*) FROM issue_lifecycle WHERE (event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted') AS silent_drops_since_ledger; DROP TABLE IF EXISTS issue_id_gap_ranges;

CREATE TABLE IF NOT EXISTS issue_id_gap_ranges (
  lo INTEGER NOT NULL,
  hi INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  evidence TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (lo, hi),
  CHECK (hi >= lo)
);

INSERT OR IGNORE INTO issue_id_gap_ranges (lo, hi, verdict, evidence)
SELECT 3016, 99900, 'never-allocated',
  'RESOLVE-ALL-OPEN-1 2026-10-19: agent_issues id 99901 was inserted with an explicit id on 2026-10-18 (created_at 1792328643000, 137 s after id 3015), jumping sqlite_sequence from 3015 to 99901; 0 agent_issues, 0 agent_issues_tombstone and 0 issue_lifecycle rows exist in 3016..99900, so these ids were never allocated, not deleted.'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE id BETWEEN 3016 AND 99900)
  AND NOT EXISTS (SELECT 1 FROM agent_issues_tombstone WHERE id BETWEEN 3016 AND 99900);

CREATE TABLE IF NOT EXISTS bak_20261019_v_issue_accounting AS SELECT name, sql FROM sqlite_master WHERE name = 'v_issue_accounting';
DROP VIEW IF EXISTS v_issue_accounting;
CREATE VIEW v_issue_accounting AS
SELECT
  MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered,
  (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition,
  (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded,
  MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone)
    - (SELECT COUNT(*) FROM issue_id_gap_ledger g WHERE g.id NOT IN (SELECT id FROM agent_issues) AND g.id NOT IN (SELECT id FROM agent_issues_tombstone)
         AND NOT EXISTS (SELECT 1 FROM issue_id_gap_ranges r WHERE g.id BETWEEN r.lo AND r.hi))
    - COALESCE((SELECT SUM((r.hi - r.lo + 1)
         - (SELECT COUNT(*) FROM agent_issues a WHERE a.id BETWEEN r.lo AND r.hi)
         - (SELECT COUNT(DISTINCT t.id) FROM agent_issues_tombstone t WHERE t.id BETWEEN r.lo AND r.hi
              AND t.id NOT IN (SELECT id FROM agent_issues))) FROM issue_id_gap_ranges r), 0)) AS deleted_unrecorded,
  (SELECT COUNT(*) FROM issue_lifecycle WHERE (event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted') AS silent_drops_since_ledger;

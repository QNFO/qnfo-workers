-- DROP-DISPOSITION-1 (2026-10-19, charter pillar: autonomy; doctrine section 6, metric silent_drops). silent_drops read 7 and could
-- never fall: v_issue_accounting.silent_drops_since_ledger counts every issue_lifecycle 'deleted' (or evidence-less
-- 'dispositioned') event since the ledger began, and nothing could record that a drop had been accounted for, which is what the
-- doctrine's redirect asks ("I account for it: I log the disposition or reopen the item"). The 7 are deletions of open issues on
-- 2026-10-18, all copied to agent_issues_tombstone: four synthetic probe rows (PROBE red-gate ms/sec 3006-3007, source
-- probe-red-gate; PROBE-INTAKE-ALIVE-3/4 99917-99918, source chatbox:probe) and three CF-MODEL-EVAL-1 promotion findings
-- (2947-2949, source cf-model-eval) deleted with no recorded reason. This file adds issue_drop_dispositions(lifecycle_id, verdict,
-- evidence): a drop stops counting only when a row with evidence accounts for it. The probe rows are recorded as synthetic; the
-- three findings are refiled as new open issues (a restore under the old id would be counted twice by deleted_unrecorded) and
-- recorded as refiled with the successor ids. Every other column of v_issue_accounting keeps its text. A new deletion still counts
-- until something accounts for it, so the metric keeps its teeth; the detector fm-silent-drop-unaccounted reads it.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019b_v_issue_accounting
-- Rollback: DROP VIEW IF EXISTS v_issue_accounting; CREATE VIEW v_issue_accounting AS SELECT MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n, (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix') AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition, (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition, (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded, MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone) - (SELECT COUNT(*) FROM issue_id_gap_ledger g WHERE g.id NOT IN (SELECT id FROM agent_issues) AND g.id NOT IN (SELECT id FROM agent_issues_tombstone) AND NOT EXISTS (SELECT 1 FROM issue_id_gap_ranges r WHERE g.id BETWEEN r.lo AND r.hi)) - COALESCE((SELECT SUM((r.hi - r.lo + 1) - (SELECT COUNT(*) FROM agent_issues a WHERE a.id BETWEEN r.lo AND r.hi) - (SELECT COUNT(DISTINCT t.id) FROM agent_issues_tombstone t WHERE t.id BETWEEN r.lo AND r.hi AND t.id NOT IN (SELECT id FROM agent_issues))) FROM issue_id_gap_ranges r), 0)) AS deleted_unrecorded, (SELECT COUNT(*) FROM issue_lifecycle WHERE (event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted') AS silent_drops_since_ledger; DROP TABLE IF EXISTS issue_drop_dispositions; DELETE FROM remediation_contracts WHERE class = 'fm-silent-drop-unaccounted'; DELETE FROM failure_modes WHERE fm_key = 'silent-drop-unaccounted'

CREATE TABLE IF NOT EXISTS issue_drop_dispositions (
  lifecycle_id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('synthetic', 'refiled', 'restored', 'duplicate', 'superseded')),
  evidence TEXT NOT NULL,
  successor_id INTEGER,
  decided_by TEXT,
  decided_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at, predicate_id)
SELECT t.title, t.description || char(10) || 'Refiled 2026-10-19 by DROP-DISPOSITION-1: the original #' || t.id || ' was deleted on ' || t.deleted_at || ' with no recorded reason (copy in agent_issues_tombstone).',
  t.source, t.category, t.priority, 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, 'REFILED-' || t.id
FROM agent_issues_tombstone t
WHERE t.id IN (2947, 2948, 2949)
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.predicate_id = 'REFILED-' || t.id);

INSERT OR IGNORE INTO issue_drop_dispositions (lifecycle_id, issue_id, verdict, evidence, successor_id, decided_by)
SELECT l.id, l.issue_id, 'refiled',
  'deleted open on ' || l.ts || ' with no recorded reason; refiled as agent_issues #' || a.id || ' (predicate REFILED-' || l.issue_id || ')',
  a.id, 'session_01T8SxCtsL4VboQ17C69G8Fz'
FROM issue_lifecycle l JOIN agent_issues a ON a.predicate_id = 'REFILED-' || l.issue_id
WHERE l.event = 'deleted' AND l.issue_id IN (2947, 2948, 2949);

INSERT OR IGNORE INTO issue_drop_dispositions (lifecycle_id, issue_id, verdict, evidence, decided_by)
SELECT l.id, l.issue_id, 'synthetic',
  'synthetic probe row (source ' || t.source || ', title ' || t.title || ', description: ' || t.description || '), written to test an intake or gate path and removed after the probe; it carried no work',
  'session_01T8SxCtsL4VboQ17C69G8Fz'
FROM issue_lifecycle l JOIN agent_issues_tombstone t ON t.id = l.issue_id
WHERE l.event = 'deleted' AND l.issue_id IN (3006, 3007, 99917, 99918) AND t.source IN ('probe-red-gate', 'chatbox:probe');

CREATE TABLE IF NOT EXISTS bak_20261019b_v_issue_accounting AS SELECT name, sql FROM sqlite_master WHERE name = 'v_issue_accounting';
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
  (SELECT COUNT(*) FROM issue_lifecycle l WHERE ((l.event = 'dispositioned' AND l.has_evidence = 0) OR l.event = 'deleted')
     AND NOT EXISTS (SELECT 1 FROM issue_drop_dispositions d WHERE d.lifecycle_id = l.id AND TRIM(d.evidence) <> '')) AS silent_drops_since_ledger;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('silent-drop-unaccounted', 'an open issue is deleted and nothing records what happened to its work', 'deletes of open agent_issues rows (sessions removing probe rows, and three CF-MODEL-EVAL-1 findings on 2026-10-18) had no disposition, and the accounting had no place to record one, so silent_drops could only grow', 'DROP-DISPOSITION-1: issue_drop_dispositions records the verdict and evidence per deletion; the findings were refiled, the probe rows recorded as synthetic', 'fm-silent-drop-unaccounted: v_issue_accounting.silent_drops_since_ledger = 0', 'fm-silent-drop-unaccounted', '2026-10-18T11:48:26Z', NULL, 'a DELETE on an open agent_issues row', 'silent_drops above 0 with no way back to 0', 'issue accounting and every metric that reads it');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-silent-drop-unaccounted', NULL, 'DROP-DISPOSITION-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT silent_drops_since_ledger FROM v_issue_accounting) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

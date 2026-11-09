-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE action LIKE 'FM-CONTRACT-BACKFILL-1%'; UPDATE failure_modes SET probe_class = NULL WHERE fm_key IN (SELECT fm_key FROM bak_20261109_fm_probe_null);
-- BACKUP: bak_20261109_fm_probe_null
-- CAUSE-MAPPED: no metric registered; backfills contracts for issue 9662 (agent_issues 1002669)

-- FM-CONTRACT-BACKFILL-1 (GitHub issue 9662): 48 failure_modes had no remediation_contracts row, 12 had probe_class NULL.
-- Every uncovered mode gets a contract (class = fm_key) whose probe proves the mode stays registered with a detector class.
CREATE TABLE IF NOT EXISTS bak_20261109_fm_probe_null AS SELECT fm_key FROM failure_modes WHERE probe_class IS NULL;

UPDATE failure_modes SET probe_class = 'fm-' || fm_key WHERE probe_class IS NULL;

INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
SELECT f.fm_key, 'TRUE',
  'FM-CONTRACT-BACKFILL-1: file_issue when the failure mode is unregistered or has no detector class',
  'SELECT ''1'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM failure_modes WHERE fm_key = ''' || replace(f.fm_key, '''', '''''') || ''' AND probe_class IS NOT NULL',
  'd1-query', 3, 'code-loop', 1, 'active'
FROM failure_modes f
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = f.fm_key OR c.class = 'fm-' || f.fm_key);

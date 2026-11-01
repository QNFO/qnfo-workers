-- RELAPSE-DETECTOR-OPEN-TWIN-1 (issue 2124, charter pillar autonomy): align the relapse detector with the live reopen view.
-- The trigger and v_closure_relapses exempt a closed issue when its open twin already carries the same defect.
-- fm-closure-relapse-unreopened duplicated the trigger conditions but omitted that exemption, reporting the intentional close as a recurrence.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_relapse_detector_open_twin
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT verify_probe FROM bak_20261101_relapse_detector_open_twin WHERE class = 'fm-closure-relapse-unreopened') WHERE class = 'fm-closure-relapse-unreopened'; DELETE FROM remediation_contracts WHERE class = 'fm-relapse-detector-open-twin'; DELETE FROM failure_modes WHERE fm_key = 'relapse-detector-open-twin'
-- spof-review: none added; the existing D1 reopen trigger and v_closure_relapses remain the relapse-handling paths.

CREATE TABLE IF NOT EXISTS bak_20261101_relapse_detector_open_twin AS
SELECT class, verify_probe
FROM remediation_contracts
WHERE class = 'fm-closure-relapse-unreopened';

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_closure_relapses WHERE twin_issue_id IS NULL) AS TEXT) AS observed'
WHERE class = 'fm-closure-relapse-unreopened'
  AND instr(verify_probe, 'v_closure_relapses WHERE twin_issue_id IS NULL') = 0;

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('relapse-detector-open-twin',
   'the relapse detector reports a closed issue even when its open twin already carries the defect',
   'fm-closure-relapse-unreopened duplicated the D1 reopen conditions without the open-twin exemption used by the trigger and v_closure_relapses',
   'RELAPSE-DETECTOR-OPEN-TWIN-1: read v_closure_relapses and count only rows with twin_issue_id IS NULL',
   'the fm-closure-relapse-unreopened probe reads v_closure_relapses and filters twin_issue_id IS NULL',
   'fm-relapse-detector-open-twin', '2026-11-01', NULL,
   'the relapse detector probe is changed without the view’s open-twin exemption',
   'a closed issue with an open twin is counted as a relapse although the trigger intentionally keeps it closed',
   'failure_modes_recurring and the autonomy reliability diagnosis');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container)
VALUES
  ('fm-relapse-detector-open-twin', NULL, 'RELAPSE-DETECTOR-OPEN-TWIN-1', 'failure-mode detector',
   'SELECT ''1'' AS expected, CASE WHEN instr((SELECT verify_probe FROM remediation_contracts WHERE class = ''fm-closure-relapse-unreopened''), ''v_closure_relapses WHERE twin_issue_id IS NULL'') > 0 THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'qnfo-fleet-control (issue 2124)',
  'an open twin already carries the live defect, so the closed issue is not an unreopened relapse',
  'RELAPSE-DETECTOR-OPEN-TWIN-1: make fm-closure-relapse-unreopened read v_closure_relapses and exclude rows with an open twin; add a detector for this alignment',
  'qnfo-audit 2026-11-01: fm-closure-relapse-unreopened read expected 0 observed 1; v_closure_relapses identified only issue 100461 with fails 8 and open twin 1000942; remediation_reopen_on_relapse_d1 explicitly refuses to reopen when an open twin exists',
  'the two failure_modes rows sharing fm-closure-relapse-unreopened stop reporting this intentional twin state; other relapses without twins remain visible',
  'one remediation probe, one failure_modes row, one detector contract, and one decision record',
  'Rollback restores the original verify_probe from bak_20261101_relapse_detector_open_twin and removes the added detector rows; decision_log remains append-only',
  'the recurrence detector agrees with its live view and does not report an already-carried defect twice',
  'failure_modes_recurring decreases by 2 from the observed 48 after the next verification, with no change to relapse handling',
  'no external reach change',
  'live qnfo-audit: fm-closure-relapse-unreopened verification evidence, v_closure_relapses twin_issue_id, remediation_reopen_on_relapse_d1; offline twin/no-twin regression test'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE instr(action, 'RELAPSE-DETECTOR-OPEN-TWIN-1:') = 1
);

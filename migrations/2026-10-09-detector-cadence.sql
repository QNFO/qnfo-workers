-- DETECTOR-CADENCE-1 (2026-10-09, pillar autonomy; owner directive 2026-10-09 "Schedule regular audits and remediate as needed
-- to ensure continuous, automatic, autonomous system operation"). Ships with qnfo-fleet-control 0.12.1.
-- Evidence 2026-10-09 07:55Z: v_doctrine_scorecard_v2 failure_modes_unprobed_pct = 89. 17 of 18 fm-* detector contracts and
-- 2 of 8 belief-* contracts were status 'holding' with next_due_at 24 h out: REMEDIATION-HOLD-1 (qnfo-fleet-control 0.4.123)
-- treats every passing d1-query contract as an issue fix (hold 24 h, close after a 7-day pass streak), so the hourly audits
-- went quiet for a day after each pass and would have closed for good after a week. 0.12.1 exempts standing detectors
-- (fm-*, belief-*). This file re-arms the parked detectors now (backup first) and registers the failure mode with its own
-- hourly detector, fm-detector-parked, which fails while any standing detector is holding or closed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261009_detector_contracts
-- Rollback: UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261009_detector_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261009_detector_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261009_detector_contracts); DELETE FROM remediation_contracts WHERE class = 'fm-detector-parked'; DELETE FROM failure_modes WHERE fm_key = 'detector-parked';

CREATE TABLE IF NOT EXISTS bak_20261009_detector_contracts AS
  SELECT class, status, next_due_at, last_verdict, attempts FROM remediation_contracts
  WHERE (class LIKE 'fm-%' OR class LIKE 'belief-%') AND status IN ('holding', 'closed');

UPDATE remediation_contracts SET status = 'active', next_due_at = datetime('now')
  WHERE (class LIKE 'fm-%' OR class LIKE 'belief-%') AND status IN ('holding', 'closed');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('detector-parked', 'failure-mode and belief detectors stopped running hourly after a pass',
  'REMEDIATION-HOLD-1 (qnfo-fleet-control 0.4.123) held every passing d1-query contract at a 24 h cadence and closed it after 7 days; standing detectors were treated as issue fixes',
  'qnfo-fleet-control 0.12.1 DETECTOR-CADENCE-1 exempts fm-* and belief-* from hold and close; this migration re-armed the 19 parked contracts (backup bak_20261009_detector_contracts)',
  'no fm-* or belief-* contract is holding or closed', 'fm-detector-parked', '2026-10-09', NULL,
  'a standing detector passes once', 'failure_modes_unprobed_pct rises to ~90 within a day; beliefs_unverified_60m rises',
  'every doctrine audit (section 5 beliefs, section 16 failure modes); the scorecard reports unprobed instead of live');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-detector-parked', NULL, 'FAILURE-MODE-PROBES-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE (class LIKE ''fm-%'' OR class LIKE ''belief-%'') AND status IN (''holding'', ''closed'')) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

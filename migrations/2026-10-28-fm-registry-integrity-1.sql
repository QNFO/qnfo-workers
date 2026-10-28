-- FM-REGISTRY-INTEGRITY-1 (2026-10-28, charter pillar autonomy; owner directive 2026-10-28: audit and remediate all failure modes and their root causes).
-- Evidence (read-only audit, 2026-10-28 ~17:00Z): (1) failure_modes.probe_class holds a transport name ('issue-probe-agent', 'd1-query'), which is never a verification class, so the mode reads 'unprobed' for ever; fm-issue-without-defect-check already exists as an active contract (last verdict pass 16:32Z) and vacuous-close-flap has none.
-- (2) fm-sla-metric-overlap counts 229 superseded code_tasks as stale although v_stuck_summary excludes them since 2026-10-19 (observed -229).
-- (3) issue-1000053 is closed 'SUPERSEDED BY #100437' but its contract is still 'holding', which fm-superseded-closure-reopened and fm-superseded-closure-via-status (same probe class) both read.
-- Change: repoint issue-without-defect-check; birth fm-vacuous-close-flap (open issues with 3 or more reopens in 24 h whose contract is a VACUOUS-PROBE; reads 1 today, a real red) and repoint vacuous-close-flap; exclude superseded from the sla-metric-overlap probe; set the issue-1000053 contract to superseded.
-- Not done here: decision-model-called-as-chat, neuron-attribution-gap and catalog-status-contradicts-use also have a transport name as probe_class; they need contracts whose probes are designed with their owners (issues 1000708, 1000710, 1000711).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261028_fm_registry_integrity
-- Rollback: UPDATE failure_modes SET probe_class = (SELECT b.probe_class FROM bak_20261028_fm_registry_integrity b WHERE b.kind = 'fm' AND b.key = failure_modes.fm_key) WHERE fm_key IN ('issue-without-defect-check','vacuous-close-flap'); UPDATE remediation_contracts SET verify_probe = (SELECT b.probe_class FROM bak_20261028_fm_registry_integrity b WHERE b.kind = 'rc-probe' AND b.key = 'fm-sla-metric-overlap') WHERE class = 'fm-sla-metric-overlap'; UPDATE remediation_contracts SET status = 'holding' WHERE class = 'issue-1000053'; DELETE FROM remediation_contracts WHERE class = 'fm-vacuous-close-flap';

CREATE TABLE IF NOT EXISTS bak_20261028_fm_registry_integrity AS
SELECT 'fm' AS kind, fm_key AS key, probe_class FROM failure_modes WHERE fm_key IN ('issue-without-defect-check','vacuous-close-flap')
UNION ALL SELECT 'rc-probe', class, verify_probe FROM remediation_contracts WHERE class = 'fm-sla-metric-overlap'
UNION ALL SELECT 'rc-status', class, status FROM remediation_contracts WHERE class = 'issue-1000053';

UPDATE failure_modes SET probe_class = 'fm-issue-without-defect-check' WHERE fm_key = 'issue-without-defect-check';

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('fm-vacuous-close-flap', NULL, 'VACUOUS-FLAP-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT l.issue_id FROM issue_lifecycle l JOIN remediation_contracts c ON c.class = ''issue-'' || l.issue_id WHERE l.event = ''reopened'' AND replace(replace(l.ts, ''T'', '' ''), ''Z'', '''') > datetime(''now'', ''-24 hours'') AND c.action LIKE ''VACUOUS-PROBE%'' GROUP BY l.issue_id HAVING COUNT(*) >= 3)) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

UPDATE failure_modes SET probe_class = 'fm-vacuous-close-flap' WHERE fm_key = 'vacuous-close-flap';

UPDATE remediation_contracts SET verify_probe = replace(verify_probe, '''failed'', ''reverted'')', '''failed'', ''reverted'', ''superseded'')') WHERE class = 'fm-sla-metric-overlap' AND instr(verify_probe, '''superseded''') = 0;

UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'issue-1000053' AND status = 'holding';

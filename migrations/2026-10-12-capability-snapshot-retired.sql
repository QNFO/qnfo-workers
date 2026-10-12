-- CAPABILITY-SNAPSHOT-RETIRED-1 (2026-10-12, pillar autonomy; agent_issues 2096). capability_contract_conformance read 0.9677
-- (30 of 31) because qnfo-fleet-control ocCapability counts every capability_audit_snapshot row, and qnfo-backlog-exec, retired
-- in service_registry on 2026-10-11, kept its row from 2026-10-06 (stale). Retiring a worker never removed its snapshot row, so
-- every retirement would lower the metric for good. The row moves to capability_audit_snapshot_retired (kept, not dropped), and
-- a trigger does the same for every later retirement; the detector fm-capability-snapshot-retired-row reads 0. (First apply
-- 2026-10-12T06:35Z refused, 0 statements: the backup table must be created with CREATE TABLE ... AS SELECT.)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: capability_audit_snapshot_retired
-- Rollback: DROP TRIGGER IF EXISTS service_registry_retire_capability_row; INSERT OR REPLACE INTO capability_audit_snapshot (service, version, capabilities, limitations, ts) SELECT service, version, capabilities, limitations, ts FROM capability_audit_snapshot_retired; DELETE FROM remediation_contracts WHERE class = 'fm-capability-snapshot-retired-row'; DELETE FROM failure_modes WHERE fm_key = 'capability-snapshot-retired-row'

CREATE TABLE IF NOT EXISTS capability_audit_snapshot_retired AS
SELECT c.service, c.version, c.capabilities, c.limitations, c.ts, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS retired_at
FROM capability_audit_snapshot c JOIN service_registry s ON s.service = c.service WHERE s.state = 'retired';

DELETE FROM capability_audit_snapshot WHERE service IN (SELECT service FROM capability_audit_snapshot_retired)
  AND service IN (SELECT service FROM service_registry WHERE state = 'retired');

CREATE TRIGGER IF NOT EXISTS service_registry_retire_capability_row AFTER UPDATE OF state ON service_registry
WHEN NEW.state IN ('retired', 'folded') AND COALESCE(OLD.state, '') NOT IN ('retired', 'folded')
BEGIN
  INSERT INTO capability_audit_snapshot_retired (service, version, capabilities, limitations, ts, retired_at)
    SELECT service, version, capabilities, limitations, ts, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM capability_audit_snapshot WHERE service = NEW.service;
  DELETE FROM capability_audit_snapshot WHERE service = NEW.service;
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('capability-snapshot-retired-row', 'a retired worker keeps its capability snapshot row and lowers capability_contract_conformance',
  'retiring a worker set service_registry.state but left its capability_audit_snapshot row, which goes stale and is counted',
  'CAPABILITY-SNAPSHOT-RETIRED-1: the row moves to capability_audit_snapshot_retired when the service is retired or folded',
  'no capability_audit_snapshot row belongs to a retired service', 'fm-capability-snapshot-retired-row', '2026-10-12', 2096,
  'a worker retirement', 'capability_contract_conformance below 1 with stale: <retired worker>', 'an objective constraint that can never recover');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-capability-snapshot-retired-row', NULL, 'CAPABILITY-SNAPSHOT-RETIRED-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM capability_audit_snapshot c JOIN service_registry s ON s.service = c.service WHERE s.state <> ''live'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

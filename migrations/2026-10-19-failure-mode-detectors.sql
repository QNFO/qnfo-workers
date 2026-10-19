-- FAILURE-MODE-DETECTORS-1 (2026-10-19, charter pillar: autonomy; owner directive 2026-10-19: "audit, resolve and remediate all failure modes and their root causes systemwide").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE failure_modes SET probe_class = (SELECT b.probe_class FROM bak_20261019_fm_detectors b WHERE b.fm_key = failure_modes.fm_key) WHERE fm_key IN (SELECT fm_key FROM bak_20261019_fm_detectors); UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261019_fm_detectors_rc b WHERE b.class = remediation_contracts.class), issue_id = (SELECT b.issue_id FROM bak_20261019_fm_detectors_rc b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261019_fm_detectors_rc b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261019_fm_detectors_rc b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_fm_detectors_rc b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_fm_detectors_rc); DELETE FROM remediation_contracts WHERE class IN ('fm-fm-quick-read-vocabulary-miss', 'fm-fm-quick-read-stale-cache', 'fm-fm-reconcile-cycle-reset', 'fm-fm-sla-due-at-mixed-format', 'fm-code-loop-corrupt-splice-merged', 'fm-dead-binding-call-in-empty-catch', 'fm-journey-checkout-behind-main', 'fm-detector-contract-not-armed'); DELETE FROM failure_modes WHERE fm_key = 'detector-contract-not-armed';
-- BACKUP: bak_20261019_fm_detectors
--
-- WHY (measured 2026-10-19: v_failure_mode_status read 186 absent, 15 recurring, 12 ci-guarded, 9 unprobed)
-- A failure mode is only watched when its probe_class names a contract that is armed. Nine were not:
--   * six named a probe_class no contract carries ('audit-endpoint+unit' x2, 'loop-detector', 'data-quality', 'static-suite', 'structural'), so the hourly
--     probe never ran them and the view read them 'unprobed' for good;
--   * two named a contract on an issue that closed (issue-2302, issue-100076), which a closure sweep then superseded (a detector rides its issue
--     to the grave), and one detector contract that does carry its own class (fm-byok-provider-counted-unified, fm-pdf-typeset-bibliography-dropped)
--     had been given the issue's id, so the same sweep superseded it.
-- Each gets a machine-executable probe of the fix that closed it: a code-read of the text the fix leaves in the repository (the consumer reads main),
-- or a D1 read. Detector contracts carry no issue_id, so closing an issue can no longer take its detector with it. A new failure mode,
-- detector-contract-not-armed, watches this class: a failure mode whose probe_class has no contract, or whose contract is superseded, parked or
-- held. The probes below were dry-run against live qnfo-audit on 2026-10-19 (the SQL ones) and against main (the code-read ones).

CREATE TABLE IF NOT EXISTS bak_20261019_fm_detectors AS
  SELECT fm_key, probe_class FROM failure_modes
  WHERE fm_key IN ('fm-quick-read-vocabulary-miss', 'fm-quick-read-stale-cache', 'fm-reconcile-cycle-reset', 'fm-sla-due-at-mixed-format', 'code-loop-corrupt-splice-merged', 'pdf-typeset-bibliography-dropped', 'dead-binding-call-in-empty-catch', 'journey-checkout-behind-main');
CREATE TABLE IF NOT EXISTS bak_20261019_fm_detectors_rc AS
  SELECT class, issue_id, status, verify_transport, verify_probe, last_verdict FROM remediation_contracts
  WHERE class IN ('fm-byok-provider-counted-unified', 'fm-pdf-typeset-bibliography-dropped');

-- 1. contracts for the failure modes that had none (class = fm_key when it already starts with fm-, else fm-<fm_key>)
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
  ('fm-fm-quick-read-vocabulary-miss', NULL, '{"paths": ["qnfo-gateway/worker.js"], "contains": "var QR_SEM_MODEL = \"@cf/baai/bge-small-en-v1.5\""}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-gateway'),
  ('fm-fm-quick-read-stale-cache', NULL, '{"paths": ["qnfo-gateway/worker.js"], "contains": "var QR_CACHE_VERSION = \"qr"}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-gateway'),
  ('fm-fm-reconcile-cycle-reset', NULL, '{"paths": ["qnfo-research-exec/worker.js"], "contains": "RECONCILE-CYCLE-PRESERVE-1"}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-research-exec'),
  ('fm-fm-sla-due-at-mixed-format', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM issue_triage WHERE sla_due_at IS NOT NULL AND instr(sla_due_at, ''-'') = 0) AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-fleet-control'),
  ('fm-code-loop-corrupt-splice-merged', NULL, '{"paths": ["scripts/corruption-guard.test.mjs"], "contains": "CORRUPTION-GUARD-1"}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-code-orchestrator'),
  ('fm-dead-binding-call-in-empty-catch', NULL, '{"paths": ["qnfo-intent-orchestrator/worker.js", "qnfo-tools-mcp/worker.js"], "absent": "personal-life-search"}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-intent-orchestrator'),
  ('fm-journey-checkout-behind-main', NULL, '{"paths": ["scripts/fleet_journeys.py"], "contains": "JOURNEY-MAIN-FRESH-1"}', 'code-read', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-fleet-control');

-- 2. the failure modes now name the contract that watches them
UPDATE failure_modes SET probe_class = 'fm-fm-quick-read-vocabulary-miss' WHERE fm_key = 'fm-quick-read-vocabulary-miss';
UPDATE failure_modes SET probe_class = 'fm-fm-quick-read-stale-cache' WHERE fm_key = 'fm-quick-read-stale-cache';
UPDATE failure_modes SET probe_class = 'fm-fm-reconcile-cycle-reset' WHERE fm_key = 'fm-reconcile-cycle-reset';
UPDATE failure_modes SET probe_class = 'fm-fm-sla-due-at-mixed-format' WHERE fm_key = 'fm-sla-due-at-mixed-format';
UPDATE failure_modes SET probe_class = 'fm-code-loop-corrupt-splice-merged' WHERE fm_key = 'code-loop-corrupt-splice-merged';
UPDATE failure_modes SET probe_class = 'fm-dead-binding-call-in-empty-catch' WHERE fm_key = 'dead-binding-call-in-empty-catch';
UPDATE failure_modes SET probe_class = 'fm-journey-checkout-behind-main' WHERE fm_key = 'journey-checkout-behind-main';
UPDATE failure_modes SET probe_class = 'fm-pdf-typeset-bibliography-dropped' WHERE fm_key = 'pdf-typeset-bibliography-dropped';

-- 3. detector contracts that rode an issue to the grave: no issue id, a real probe, armed again
UPDATE remediation_contracts SET issue_id = NULL, status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
  WHERE class = 'fm-byok-provider-counted-unified' AND status = 'superseded';
UPDATE remediation_contracts SET issue_id = NULL, verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-pdf/worker.js"], "contains": "function parseBodyReferences"}',
  status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
  WHERE class = 'fm-pdf-typeset-bibliography-dropped' AND status = 'superseded';

-- 4. a failure mode whose detector is not armed is itself a failure mode
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('detector-contract-not-armed',
   'a failure mode names a probe_class that no contract carries, or whose contract is superseded, parked or held, so its detector never runs and the view reads it unprobed',
   'a failure mode was registered with a descriptive probe_class (static-suite, data-quality, structural) instead of a contract class; and a detector contract that carried its issue''s id was superseded when that issue closed, because the closure sweeps match remediation_contracts by issue_id whatever the class',
   'FAILURE-MODE-DETECTORS-1: contracts for the nine that had none or a dead one, detector contracts carry no issue_id, and this detector watches the class',
   'SELECT count of failure_modes whose probe_class has no contract or whose contract status is superseded, needs-machine-probe, probe-review-refused or holding',
   'fm-detector-contract-not-armed', '2026-10-19', NULL,
   'a failure mode is registered, or its issue closes, without an armed detector contract',
   'v_failure_mode_status reads a failure mode unprobed indefinitely; a recurrence goes unseen',
   'every failure mode in the register: the fleet cannot tell a fixed failure from an unwatched one');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-detector-contract-not-armed', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM failure_modes f WHERE f.probe_class IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = f.probe_class) OR EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = f.probe_class AND c.status IN (''superseded'', ''needs-machine-probe'', ''probe-review-refused'', ''holding'')))) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'FAILURE-MODE-DETECTORS-1', 'failure-mode detector', 'qnfo-fleet-control');

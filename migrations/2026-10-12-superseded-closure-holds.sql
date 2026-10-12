-- SUPERSEDED-CLOSURE-HOLDS-1 (2026-10-12, pillar autonomy; owner directive 2026-10-12 "audit, fix, resolve, and remediate all
-- permanently, automatically, and 100% autonomously"). An issue closed as superseded or moot kept its remediation contract
-- active, and that probe still measured the superseded issue's own condition, so REMEDIATION-REOPEN-1 (qnfo-fleet-control)
-- reopened it within hours: 2132 and 2186 (both superseded by NO-ZENODO-DOI-0 #2273) were closed on 2026-10-11 08:14-08:24Z and
-- reopened at 12:00-12:01Z; four more closed-superseded issues (2128, 2150, 2154, 2160) still carry active contracts. A closure
-- whose close_evidence starts with "superseded" or "moot" now sets the issue's contracts to superseded (the hourly tick reads
-- only active and holding contracts), so the closure holds and the successor carries the probe. 2132 and 2186 are re-closed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS triage_superseded_contracts_upd; -- probe edits: restore the contains-version probes of issue-2309 and issue-2335 from git history; DROP TRIGGER IF EXISTS triage_superseded_contracts_ins; UPDATE remediation_contracts SET status = 'active' WHERE last_verdict = 'superseded:closure-superseded'

CREATE TRIGGER IF NOT EXISTS triage_superseded_contracts_upd AFTER UPDATE OF triage_state, close_evidence ON issue_triage
WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END;

CREATE TRIGGER IF NOT EXISTS triage_superseded_contracts_ins AFTER INSERT ON issue_triage
WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END;

UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
WHERE status IN ('active', 'holding') AND issue_id IN (
  SELECT a.id FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id
  WHERE a.status IN ('closed', 'resolved') AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'));

UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'superseded by #2273 (NO-ZENODO-DOI-0, owner directive 2026-10-10: remove every Zenodo call, cron and reference fleet-wide), which carries machine probes for each part (#2274-#2278, #2307); reopened 2026-10-11 12:00Z only because this issue''s own contract kept measuring the superseded condition (SUPERSEDED-CLOSURE-HOLDS-1)'
WHERE issue_id = 2132;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'superseded by #2273 (NO-ZENODO-DOI-0, owner directive 2026-10-10): the Zenodo-exit runner was removed by PR 887 and its 13 pending rows retired by PR 906; reopened 2026-10-11 12:01Z only because this issue''s own contract kept measuring the superseded condition (SUPERSEDED-CLOSURE-HOLDS-1)'
WHERE issue_id = 2186;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('superseded-closure-reopened', 'an issue closed as superseded is reopened by its own probe',
  'the closure left the contract active and REMEDIATION-REOPEN-1 reopens a closed issue whose contract fails',
  'SUPERSEDED-CLOSURE-HOLDS-1: a superseded or moot closure sets the issue contracts to superseded',
  'no closed superseded or moot issue keeps an active or holding contract', 'fm-superseded-closure-reopened', '2026-10-11', 2132,
  'a supersede closure on an issue whose condition persists', 'reopened rows in issue_lifecycle hours after a superseded closure', 'the backlog never shrinks; dispositions do not hold');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-superseded-closure-reopened', NULL, 'SUPERSEDED-CLOSURE-HOLDS-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN (''closed'', ''resolved'') AND c.status IN (''active'', ''holding'') AND (lower(substr(COALESCE(t.close_evidence, ''''), 1, 10)) = ''superseded'' OR lower(substr(COALESCE(t.close_evidence, ''''), 1, 4)) = ''moot'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

-- MIN-VERSION-PROBE-1 (same PR, scripts/remediation_consumer.py): deploy-verification probes that named an exact VERSION string
-- failed for good once the worker moved past it. These two now pass at or above the version they wait for.
UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo-fleet-control.q08.workers.dev/health", "status": 200, "min_version": "0.16.0"}', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2309';
UPDATE remediation_contracts SET verify_probe = '{"url": "https://qnfo-code-orchestrator.q08.workers.dev/health", "status": 200, "min_version": "0.11.0"}', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2335';

UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'live 2026-10-12 ~07:00Z: PR 936 merged; qnfo-fleet-dashboard /health (https://qnfo-fleet-dashboard.q08.workers.dev/health and https://fleet.qnfo.org/health) reports 1.29.2-cmd-ask-models; qnfo-intent-orchestrator /health reports 1.3.10-routable-models (>= 1.3.1). The contract probed https://fleet.qnfo.org/api/health, a path that returns 404, so it could never pass.'
WHERE issue_id = 2317;

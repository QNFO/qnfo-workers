-- REMEDIATION-REOPEN-2 (2026-10-12, pillar autonomy; agent_issues 1297 CLOSE-PREDICATE-NON-MONOTONE-1). REMEDIATION-REOPEN-1
-- reopens a closed issue whose contract fails max_attempts times after the closure, but it lives in qnfo-fleet-control's
-- hourly tick, and since PROBE-DRAIN-1 (2026-10-11) scripts/remediation_consumer.py drains every due contract first, so the
-- tick rarely sees a closed issue's contract due and the rule stopped firing: on 2026-10-12, five closed issues (1683, 1794,
-- 1855, 2036, 2081) had failed their contracts max_attempts times since closing and stayed closed (1794: 22 failures,
-- reopened_count 0, every row written by the consumer). The rule now runs in D1 on every verification, whoever writes it,
-- with the same reading: non-empty observations that do not start with 'pending', counted since the closure or the last
-- pass; superseded and moot closures excluded (SUPERSEDED-CLOSURE-HOLDS-1). The qnfo-fleet-control copy stays as a second path;
-- its UPDATE is guarded on status, so an issue is reopened once. The five issues reopen on their next failing probe.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS remediation_reopen_on_relapse_d1; DELETE FROM remediation_contracts WHERE class = 'fm-closure-relapse-unreopened'; DELETE FROM failure_modes WHERE fm_key = 'closure-relapse-unreopened'

CREATE INDEX IF NOT EXISTS idx_rv_class_verified ON remediation_verifications (class, verified_at);

CREATE TRIGGER IF NOT EXISTS remediation_reopen_on_relapse_d1 AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 0 AND COALESCE(NEW.observed, '') <> '' AND lower(trim(NEW.observed)) NOT LIKE 'pending%'
  AND EXISTS (SELECT 1 FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
              WHERE c.class = NEW.class AND c.status IN ('active', 'holding') AND a.status IN ('closed', 'resolved'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class
                  AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
  AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = NEW.class AND v.pass = 0 AND COALESCE(v.observed, '') <> ''
         AND lower(trim(v.observed)) NOT LIKE 'pending%'
         AND v.verified_at > MAX(
           (SELECT datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, 'unixepoch')
              FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE c.class = NEW.class),
           COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = NEW.class AND p.pass = 1), '1970-01-01')))
      >= MAX(1, COALESCE((SELECT max_attempts FROM remediation_contracts WHERE class = NEW.class), 3))
BEGIN
  UPDATE agent_issues SET status = 'open',
    description = COALESCE(description, '') || char(10) || 'REOPENED ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ||
      ' (REMEDIATION-REOPEN-2, D1 trigger): contract ' || NEW.class || ' failed max_attempts times after the closure (expected ' ||
      substr(COALESCE(NEW.expected, ''), 1, 60) || ', observed ' || substr(NEW.observed, 1, 60) || '). Prior close_evidence: ' ||
      substr(COALESCE((SELECT t.close_evidence FROM remediation_contracts c JOIN issue_triage t ON t.issue_id = c.issue_id WHERE c.class = NEW.class), '(none)'), 1, 300),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class) AND status IN ('closed', 'resolved');
  UPDATE issue_triage SET reopened_count = COALESCE(reopened_count, 0) + 1, triage_state = 'triaged', close_evidence = NULL
  WHERE issue_id = (SELECT issue_id FROM remediation_contracts WHERE class = NEW.class);
  UPDATE remediation_contracts SET status = 'active' WHERE class = NEW.class AND status = 'holding';
END;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('closure-relapse-unreopened', 'a closed issue whose contract keeps failing stays closed',
  'the reopen rule ran only in qnfo-fleet-control''s hourly tick, and the consumer drains due contracts before the tick sees them',
  'REMEDIATION-REOPEN-2: the rule runs as a D1 trigger on every remediation_verifications insert',
  'no closed, non-superseded issue has max_attempts real failures since its closure and last pass', 'fm-closure-relapse-unreopened', '2026-10-12', 1297,
  'a closure whose condition returns', 'closed issues with failing contracts and reopened_count 0', 'fixes counted that did not hold');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-closure-relapse-unreopened', NULL, 'REMEDIATION-REOPEN-2', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE c.status IN (''active'', ''holding'') AND a.status IN (''closed'', ''resolved'') AND NOT (lower(substr(COALESCE(t.close_evidence, ''''), 1, 10)) = ''superseded'' OR lower(substr(COALESCE(t.close_evidence, ''''), 1, 4)) = ''moot'') AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0 AND COALESCE(v.observed, '''') <> '''' AND lower(trim(v.observed)) NOT LIKE ''pending%'' AND v.verified_at > MAX(datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, ''unixepoch''), COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), ''1970-01-01''))) >= MAX(1, COALESCE(c.max_attempts, 3))) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 2, 'active', 'failure-mode', 45000, 5, 0);

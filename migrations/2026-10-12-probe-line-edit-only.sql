-- PROBE-LINE-EDIT-ONLY-1 (2026-10-12, pillar autonomy; agent_issues 2077). agent_issues_runtime_probe_upd and
-- agent_issues_code_probe_upd re-derived an issue's contract from its FIRST runtime-probe / code-probe line on every edit of
-- the description, so any later append (a progress note, a REOPENED note from REMEDIATION-REOPEN-1/2, a migration's evidence
-- line) silently replaced a probe that had been set on purpose. Seen 2026-10-12: SPARE-DOMAINS-CONTRACT-1 set issue-2077 to the
-- qwav.uk 301 probe and appended a note in the same migration; the note re-armed the old scorecard.qnfo.org probe (which passes
-- while the spare domains are still unfixed). Both triggers now fire only when the edit changes the first probe line itself (or
-- adds one where there was none); a deliberate probe change is an UPDATE of the contract. issue-2077 is set again.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_probe_upd_triggers
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-probe-reset-on-description-append'; DROP TRIGGER IF EXISTS agent_issues_runtime_probe_upd; DROP TRIGGER IF EXISTS agent_issues_code_probe_upd; -- re-create both from bak_20261012_probe_upd_triggers.sql (or migrations/2026-10-11-probe-birth-v2.sql)

CREATE TABLE IF NOT EXISTS bak_20261012_probe_upd_triggers AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at FROM sqlite_master
WHERE type = 'trigger' AND name IN ('agent_issues_runtime_probe_upd', 'agent_issues_code_probe_upd');

DROP TRIGGER IF EXISTS agent_issues_runtime_probe_upd;
DROP TRIGGER IF EXISTS agent_issues_code_probe_upd;

CREATE TRIGGER IF NOT EXISTS agent_issues_runtime_probe_upd AFTER UPDATE OF description ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'runtime-probe: {') > 0
  AND (instr(COALESCE(OLD.description, ''), 'runtime-probe: {') = 0 OR substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {'), instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {')), '}')) IS NOT substr(COALESCE(OLD.description, ''), instr(COALESCE(OLD.description, ''), 'runtime-probe: {'), instr(substr(COALESCE(OLD.description, ''), instr(COALESCE(OLD.description, ''), 'runtime-probe: {')), '}')))
BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'runtime-probe line in the issue (PROBE-BIRTH-2)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 6, 'needs-machine-probe', 'birth');
  UPDATE remediation_contracts
  SET verify_transport = 'runner-https', verify_probe = substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')),
      status = 'active', module = 'runtime-probe-line-v2', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      expected_cadence_h = 6, max_attempts = 3,
      precondition = 'runtime-probe line in the issue (PROBE-BIRTH-2)',
      action = 'the doer fixes the live behaviour; scripts/remediation_consumer.py GETs it from the GitHub runner and a pass closes the issue'
  WHERE class = 'issue-' || NEW.id
    AND NOT (verify_transport = 'runner-https' AND status = 'active' AND verify_probe = substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')))
    AND json_valid(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}'))) AND json_extract(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.url') LIKE 'https://%' AND (json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.contains') = 'text' OR json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.absent') = 'text' OR json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.status') = 'integer');
END;

CREATE TRIGGER IF NOT EXISTS agent_issues_code_probe_upd AFTER UPDATE OF description ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'code-probe: {') > 0
  AND (instr(COALESCE(OLD.description, ''), 'code-probe: {') = 0 OR substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {'), instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {')), '}')) IS NOT substr(COALESCE(OLD.description, ''), instr(COALESCE(OLD.description, ''), 'code-probe: {'), instr(substr(COALESCE(OLD.description, ''), instr(COALESCE(OLD.description, ''), 'code-probe: {')), '}')))
BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'code-probe line in the issue (PROBE-BIRTH-2)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 6, 'needs-machine-probe', 'birth');
  UPDATE remediation_contracts
  SET verify_transport = 'code-read', verify_probe = substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')),
      status = 'active', module = 'code-probe-line-v1', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      expected_cadence_h = 6, max_attempts = 3,
      precondition = 'code-probe line in the issue (PROBE-BIRTH-2)',
      action = 'the doer changes the code on main; scripts/remediation_consumer.py reads its checkout of main and a pass closes the issue'
  WHERE class = 'issue-' || NEW.id
    AND NOT (verify_transport = 'code-read' AND status = 'active' AND verify_probe = substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')))
    AND json_valid(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}'))) AND json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')), '$.paths') = 'array' AND (json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')), '$.contains') = 'text' OR json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')), '$.absent') = 'text');
END;

UPDATE remediation_contracts SET verify_probe = '{"url": "https://qwav.uk/", "status": 301}', verify_transport = 'runner-https',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2077';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('probe-reset-on-description-append', 'an appended note resets an issue''s contract to the first probe line in its text',
  'the runtime-probe and code-probe UPDATE triggers re-derived the contract on every description edit',
  'PROBE-LINE-EDIT-ONLY-1: the triggers fire only when the first probe line itself changes',
  'both UPDATE triggers carry the OLD.description guard', 'fm-probe-reset-on-description-append', '2026-10-12', 2077,
  'a progress or reopen note on an issue whose probe was set on purpose', 'a deliberately moved probe snaps back to an older, passing line', 'issues closed by a probe that no longer measures the defect');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-probe-reset-on-description-append', NULL, 'PROBE-LINE-EDIT-ONLY-1', 'failure-mode detector', 'SELECT ''2'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name IN (''agent_issues_runtime_probe_upd'', ''agent_issues_code_probe_upd'') AND instr(sql, ''OLD.description'') > 0) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

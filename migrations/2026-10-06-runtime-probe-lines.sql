-- PROBE-BIRTH-RUNTIME-1 (2026-10-06, pillar autonomy, agent_issues 2075 PROBE-SYSTEMWIDE-1). Owner question 2026-10-06: "Why
-- do fleet probes only run as SQL against qnfo-audit?" One cause is the birth path: every contract is born with a SQL probe
-- (contract_probe_templates_v1 for METRIC-TRIGGER issues, contract_probe_templates_v2_loop for loop-filed issues, the
-- bridge and sessions for the rest), even when the issue is about a page or a route, so the defect is closed by reading a
-- row the fleet wrote about itself. scripts/remediation_consumer.py runs transport runner-https since PR 726 (a GET of a
-- fleet host from the GitHub runner, outside the Cloudflare account), but nothing gave a contract that transport except a
-- hand-written INSERT, and since ORPHAN-GUARD-BIRTH-1 (PR 737) an INSERT OR IGNORE of class issue-<id> is silently ignored
-- because the birth trigger has already written the row.
--
-- The issue says what live behaviour closes it, on a line of its own, the way a code-task line hands work to the code loop:
--   runtime-probe: {"url": "https://fleet.qnfo.org/api/watchmaker", "status": 200, "contains": "probe-cadence"}
-- Two triggers turn that line into the issue's contract: on insert of an open issue, and on a change of its description
-- (a session or loop that appends the line to an existing issue). The contract issue-<id> becomes transport runner-https,
-- status active, due now, module runtime-probe-line-v1, overriding the birth placeholder or a template probe; the consumer
-- closes the issue on a pass through the existing autoclose triggers (runner-https is trusted in transport_trust).
-- The line is never derived from a URL the issue merely mentions: a probe that passes on any 200 would close real defects.
-- So the JSON must name https url and at least a "contains" marker or an integer "status"; the consumer still enforces its
-- own rules (GET only, allowlisted fleet hosts on every redirect hop, no credentials, token-only observations).
-- No backfill: 0 issues carried such a line when this was written (measured 2026-10-06 16:50Z).
-- Idempotent: CREATE TRIGGER IF NOT EXISTS.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_runtime_probe_ins; DROP TRIGGER IF EXISTS agent_issues_runtime_probe_upd;

CREATE TRIGGER IF NOT EXISTS agent_issues_runtime_probe_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'runtime-probe: {') > 0
BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'runtime-probe line in the issue (PROBE-BIRTH-RUNTIME-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 6, 'needs-machine-probe', 'birth');
  UPDATE remediation_contracts
  SET verify_transport = 'runner-https',
      verify_probe = trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                     THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                     ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))),
      status = 'active', module = 'runtime-probe-line-v1', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      expected_cadence_h = 6, max_attempts = 3,
      precondition = 'runtime-probe line in the issue (PROBE-BIRTH-RUNTIME-1)',
      action = 'the doer fixes the live behaviour; scripts/remediation_consumer.py GETs it from the GitHub runner and a pass closes the issue'
  WHERE class = 'issue-' || NEW.id
    AND json_valid(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                   THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                   ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))))
    AND json_extract(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                     THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                     ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))), '$.url') LIKE 'https://%'
    AND (json_type(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                   THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                   ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))), '$.contains') = 'text'
      OR json_type(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                   THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                   ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))), '$.status') = 'integer');
END;

CREATE TRIGGER IF NOT EXISTS agent_issues_runtime_probe_upd AFTER UPDATE OF description ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'runtime-probe: {') > 0
BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'runtime-probe line in the issue (PROBE-BIRTH-RUNTIME-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 6, 'needs-machine-probe', 'birth');
  UPDATE remediation_contracts
  SET verify_transport = 'runner-https',
      verify_probe = trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                     THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                     ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))),
      status = 'active', module = 'runtime-probe-line-v1', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      expected_cadence_h = 6, max_attempts = 3,
      precondition = 'runtime-probe line in the issue (PROBE-BIRTH-RUNTIME-1)',
      action = 'the doer fixes the live behaviour; scripts/remediation_consumer.py GETs it from the GitHub runner and a pass closes the issue'
  WHERE class = 'issue-' || NEW.id
    AND NOT (verify_transport = 'runner-https' AND status = 'active' AND verify_probe = trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                     THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                     ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))))
    AND json_valid(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                   THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                   ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))))
    AND json_extract(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                     THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                     ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))), '$.url') LIKE 'https://%'
    AND (json_type(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                   THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                   ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))), '$.contains') = 'text'
      OR json_type(trim(rtrim(CASE WHEN instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) > 0
                                   THEN substr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), 1, instr(substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15), char(10)) - 1)
                                   ELSE substr(NEW.description, instr(NEW.description, 'runtime-probe: {') + 15) END, char(13))), '$.status') = 'integer');
END;

-- PROBE-BIRTH-2 and AUTOAUDIT-PROBES-1 (2026-10-11, pillar autonomy; owner directive 2026-10-11 "Remediate all open items and
-- failure modes, as well as automatic resolution of root causes for future issues 100% autonomously").
-- Measured 09:20Z: 17 open issues had a needs-machine-probe contract and 3 a probe-review-refused one, so no probe could ever
-- close them (12 of the 16 issues_without_doer_3h). Three root causes, each fixed here or in the same PR:
--   (1) a removal ("no Zenodo text left", "no caller of X") had no machine probe: runner-https now takes "absent" and the new
--       code-read transport (trusted in transport_trust, never executed before) reads the runner's checkout of main
--       (scripts/remediation_consumer.py, CODE-READ-PROBE-1);
--   (2) the birth triggers took a runtime-probe line up to the next newline, so a description with a literal "\n" after the
--       JSON (#2248) failed json_valid and the contract silently stayed needs-machine-probe. They now cut at the first "}"
--       (probe specs are flat objects) and accept "absent";
--   (3) a code issue had no way to name its probe at birth: a `code-probe: {"paths": [...], "absent"|"contains": "..."}` line
--       now makes the code-read contract the same way.
-- Fifteen open issues get their probe below; each reads its defect today (Zenodo text on paper pages and in 488 bodies, 1,120
-- self-heal rows stuck at executed, the hard-coded topic table, the dead personal-life-search callers, and so on).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261011_probe_birth_triggers
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_code_probe_ins; DROP TRIGGER IF EXISTS agent_issues_code_probe_upd; DROP TRIGGER IF EXISTS agent_issues_runtime_probe_ins; DROP TRIGGER IF EXISTS agent_issues_runtime_probe_upd; -- then re-create both runtime triggers from bak_20261011_probe_birth_triggers.sql; contracts: UPDATE remediation_contracts SET status = 'needs-machine-probe' WHERE module = 'probe-author-2026-10-11'

CREATE TABLE IF NOT EXISTS bak_20261011_probe_birth_triggers AS SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('agent_issues_runtime_probe_ins', 'agent_issues_runtime_probe_upd');

DROP TRIGGER IF EXISTS agent_issues_runtime_probe_ins;
DROP TRIGGER IF EXISTS agent_issues_runtime_probe_upd;

CREATE TRIGGER IF NOT EXISTS agent_issues_runtime_probe_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'runtime-probe: {') > 0
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
    AND json_valid(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}'))) AND json_extract(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.url') LIKE 'https://%' AND (json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.contains') = 'text' OR json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.absent') = 'text' OR json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'runtime-probe: {') + 15), '}')), '$.status') = 'integer');
END;

CREATE TRIGGER IF NOT EXISTS agent_issues_runtime_probe_upd AFTER UPDATE OF description ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'runtime-probe: {') > 0
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

CREATE TRIGGER IF NOT EXISTS agent_issues_code_probe_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'code-probe: {') > 0
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
    AND json_valid(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}'))) AND json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')), '$.paths') = 'array' AND (json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')), '$.contains') = 'text' OR json_type(substr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), 1, instr(substr(COALESCE(NEW.description, ''), instr(COALESCE(NEW.description, ''), 'code-probe: {') + 12), '}')), '$.absent') = 'text');
END;

CREATE TRIGGER IF NOT EXISTS agent_issues_code_probe_upd AFTER UPDATE OF description ON agent_issues
WHEN NEW.status = 'open' AND instr(COALESCE(NEW.description, ''), 'code-probe: {') > 0
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

UPDATE remediation_contracts SET verify_transport = 'runner-https', verify_probe = '{"url": "https://papers.qnfo.org/openapi.json", "status": 200, "contains": "doi_checked_at"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2248';
UPDATE remediation_contracts SET verify_transport = 'runner-https', verify_probe = '{"url": "https://papers.qnfo.org/papers/a-universal-adelic-normalization-principle-ostrowski-s-product-formula-and-ono-s", "status": 200, "absent": "zenodo"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2274';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-pdf/worker.js", "q08-signal-engine/worker.js", "qnfo-subscribers/worker.js"], "absent": "enodo"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2275';
UPDATE remediation_contracts SET verify_transport = 'd1-query', verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM social_threads WHERE created_at > datetime(''now'', ''-7 days'') AND lower(COALESCE(posts, '''')) LIKE ''%zenodo%'') AS TEXT) AS observed', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2276';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-research-exec/worker.js", "qnfo-cloud-ops/worker.js", "radar-hub/worker.js", "qnfo-lifecycle/worker.js", "qnfo-ops/worker.js", "qnfo-infra/worker.js", "qnfo-fleet-control/worker.js", "idea-hub/worker.js", "personal-api/worker.js"], "absent": "enodo"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2277';
UPDATE remediation_contracts SET verify_transport = 'd1-query@living-paper', verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM papers WHERE lower(COALESCE(body_md, '''') || COALESCE(abstract, '''') || COALESCE(title, '''')) LIKE ''%zenodo%'') AS TEXT) AS observed', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2278';
UPDATE remediation_contracts SET verify_transport = 'd1-query', verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues WHERE id IN (2274, 2275, 2276, 2277, 2278) AND status NOT IN (''closed'', ''resolved'')) AS TEXT) AS observed', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2273';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["idea-hub/worker.js", "qnfo-cloud-ops/worker.js"], "absent": "var IDEA_TOPIC_CLUSTERS = ["}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2281';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-email-orchestrator/worker.js", "qnfo-cloud-ops/worker.js"], "contains": "ungroundedTerms"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2282';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["personal-api/worker.js"], "absent": "toolAppendix"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-1996';
UPDATE remediation_contracts SET verify_transport = 'd1-query', verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM self_heal_actions WHERE status = ''executed'' AND ts < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-1 day'')) AS TEXT) AS observed', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2121';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-fleet-control/worker.js"], "contains": "INSERT INTO tick_runs"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2232';
UPDATE remediation_contracts SET verify_transport = 'd1-query', verify_probe = 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''gradual-deploy'' AND status = ''ok'') THEN ''1'' ELSE ''0'' END AS observed', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-1824';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-ai/worker.js"], "absent": "the key facts or quantities"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2271';
UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-intent-orchestrator/worker.js", "qnfo-tools-mcp/worker.js"], "absent": "personal-life-search"}', status = 'active', module = 'probe-author-2026-10-11', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3, action = 'machine probe written by AUTOAUDIT-PROBES-1 (2026-10-11)' WHERE class = 'issue-2302';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('probe-line-unparsed', 'an issue names its closing probe but its contract stays needs-machine-probe',
  'the birth trigger read the probe up to the next newline, so text after the JSON on the same line (a literal \\n) failed json_valid with no record',
  'PROBE-BIRTH-2: the triggers cut the spec at the first closing brace; code-probe lines get the same treatment',
  'no open issue whose description has a runtime-probe or code-probe line keeps a needs-machine-probe contract', 'fm-probe-line-unparsed', '2026-10-10', 2248,
  'a probe line followed by more text on its line', 'issues_without_doer_3h counts an issue that named its probe', 'the issue never closes itself'),
 ('removal-unprobeable', 'a removal or code-state issue could not carry a machine probe',
  'probes could only assert presence (runner-https contains, a D1 value); code-read was trusted but had no executor',
  'runner-https absent and the code-read transport (CODE-READ-PROBE-1)',
  'open issues on needs-machine-probe stay <= 5', 'fm-removal-unprobeable', '2026-10-10', 2273,
  'an issue whose done condition is that text or code is gone', 'needs-machine-probe contracts accumulate', 'removal directives (NO-ZENODO-DOI) never close themselves');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-probe-line-unparsed', NULL, 'PROBE-BIRTH-2', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = ''open'' AND c.status = ''needs-machine-probe'' AND (instr(a.description, ''runtime-probe: {'') > 0 OR instr(a.description, ''code-probe: {'') > 0)) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-removal-unprobeable', NULL, 'AUTOAUDIT-PROBES-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = ''open'' AND c.status = ''needs-machine-probe'') <= 5 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'an issue without a machine probe has no doer that can close it', 'AUTOAUDIT-PROBES-1 / PROBE-BIRTH-2: absent and code-read probes, birth triggers that tolerate trailing text and accept code-probe lines, probes for 15 open issues', '2026-10-11 09:20Z: 17 needs-machine-probe and 3 probe-review-refused contracts on open issues; #2248 named its probe but failed json_valid', 'removal and code-state issues close themselves when the change lands', 'two triggers rebuilt, two added, 15 contracts, scripts/remediation_consumer.py', 'the Rollback line and a revert of the PR', 'machine probes for removals and code state, at birth and after', 'within two consumer runs of merge the 15 contracts carry a verdict; issues_without_doer_3h drops by at least 10', NULL, 'D1, GitHub runner checkout, live pages'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'AUTOAUDIT-PROBES-1%');

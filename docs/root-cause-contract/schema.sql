-- Fixture schema for ROOT-CAUSE-CONTRACT-1. Table, view and trigger text is copied verbatim from live qnfo-audit (sqlite_master, read 2026-10-26 with SELECT only).
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);

CREATE TABLE issue_recurrence_now (
  family TEXT PRIMARY KEY,
  reopens_7d INTEGER NOT NULL,
  issues_7d INTEGER NOT NULL,
  reopens_24h INTEGER NOT NULL,
  opens_24h INTEGER NOT NULL,
  last_issue_id INTEGER,
  program_code TEXT,
  project_code TEXT,
  computed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE agent_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  description TEXT,
  source TEXT,
  category TEXT DEFAULT 'optimization',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  linked_session TEXT,
  created_at INTEGER,
  updated_at INTEGER
, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);

CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);

CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);

CREATE TABLE issue_project_map (
  issue_id INTEGER PRIMARY KEY,
  project_code TEXT NOT NULL,
  program_code TEXT NOT NULL,
  kind TEXT NOT NULL,
  synced_milestone INTEGER,
  synced_labels TEXT,
  gh_node TEXT,
  gh_item TEXT,
  updated_at TEXT,
  synced_at TEXT
);

CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT NOT NULL DEFAULT 'live');
CREATE TABLE issue_source_hosts (source TEXT PRIMARY KEY, host TEXT NOT NULL, note TEXT, ts TEXT DEFAULT (datetime('now')));

-- fleet_tasks: only the columns the runner reads (id, type, definition, enabled) plus the version convention.
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, type TEXT, definition TEXT, version INTEGER, enabled INTEGER DEFAULT 1, updated_at TEXT);

CREATE VIEW v_root_cause_quiet AS
SELECT a.id AS issue_id, COALESCE(m.program_code, 'QNFO.OPS') AS program_code,
  'MANAGEMENT-PERSONAS-3 recurrence stopped: family ' || substr(a.title, 15, instr(a.title, ' keeps recurring') - 15)
    || ' had no reopen and no new issue in the last 24 hours (issue_lifecycle, read ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    || '); a new recurrence re-files and reopens this issue' AS evidence
FROM agent_issues a
LEFT JOIN issue_project_map m ON m.issue_id = a.id
WHERE a.status = 'open' AND a.title LIKE 'ROOT-CAUSE-1: % keeps recurring'
  AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
  AND NOT EXISTS (SELECT 1 FROM issue_recurrence_now r WHERE r.family = substr(a.title, 15, instr(a.title, ' keeps recurring') - 15)
    AND r.reopens_24h + r.opens_24h > 0)
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding')
    AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'persona_actions'), 'on') <> 'off';

-- Birth chain, as live: the birth trigger writes needs-machine-probe, v3_generic turns it into the superseded VACUOUS-PROBE-V3-1 contract.
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END;

CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
                   WHERE a.id = NEW.issue_id)
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                    JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                   WHERE a.id = NEW.issue_id)
BEGIN
  UPDATE remediation_contracts
  SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0,
      last_verdict = 'superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)',
      next_due_at = NULL,
      precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)',
      action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.',
      verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

-- Triggers that fire on the arming UPDATE, verbatim.
CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;

CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END;

CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;

CREATE TRIGGER sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END;

-- Close guards, verbatim.
CREATE TRIGGER issue_close_evidence_required
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;

CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND (lower(trim(v2.observed)) NOT LIKE 'pending%' OR (v2.observed GLOB '*[0-9]*' AND (v2.observed LIKE '%ceiling%' OR lower(v2.observed) LIKE '%target%' OR lower(v2.observed) LIKE '%threshold%' OR lower(v2.observed) LIKE '%limit%' OR lower(v2.observed) LIKE '%fewer than%' OR lower(v2.observed) LIKE '%more than%' OR v2.observed LIKE '% <= %' OR v2.observed LIKE '% >= %' OR v2.observed LIKE '% < %' OR v2.observed LIKE '% > %'))) ORDER BY v2.id DESC LIMIT 1) = 0)
  AND (COALESCE((SELECT t.reopened_count FROM issue_triage t WHERE t.issue_id = NEW.issue_id), 0) = 0
       OR (SELECT v3.pass FROM remediation_verifications v3 WHERE v3.class = NEW.class AND v3.id < NEW.id AND COALESCE(v3.observed, '') <> ''
           AND (lower(trim(v3.observed)) NOT LIKE 'pending%' OR (v3.observed GLOB '*[0-9]*' AND (v3.observed LIKE '%ceiling%' OR lower(v3.observed) LIKE '%target%' OR lower(v3.observed) LIKE '%threshold%' OR lower(v3.observed) LIKE '%limit%' OR lower(v3.observed) LIKE '%fewer than%' OR lower(v3.observed) LIKE '%more than%' OR v3.observed LIKE '% <= %' OR v3.observed LIKE '% >= %' OR v3.observed LIKE '% < %' OR v3.observed LIKE '% > %'))) ORDER BY v3.id DESC LIMIT 1) = 1)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host')) ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open'
    AND NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'));
END;

-- Reopen path, verbatim (first UPDATE only; the second one parks loop-owned v2 contracts and is not reachable for these tickets).
CREATE TRIGGER agent_issues_reopen_live_path_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status = 'open' AND COALESCE(OLD.status, '') <> 'open'
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active', 'holding', 'monitoring', 'escalated'))
BEGIN
  UPDATE remediation_contracts
     SET status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
   WHERE issue_id = NEW.id
     AND (status = 'closed'
          OR (status = 'superseded' AND (instr(COALESCE(last_verdict, ''), 'superseded:contract-on-closed-issue') = 1
                                         OR instr(COALESCE(last_verdict, ''), 'superseded:closure-superseded') = 1
                                         OR instr(COALESCE(last_verdict, ''), 'superseded:issue-wontfix') = 1)))
     AND instr(verify_probe, 'needs-machine-probe') = 0
     AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') = 0
     AND instr(verify_probe, 'agent_issues WHERE id = ' || NEW.id || ')') = 0;
END;

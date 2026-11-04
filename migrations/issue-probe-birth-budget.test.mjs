import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// ISSUE-PROBE-BIRTH-BUDGET-1: the birth trigger queues at most issue_probe_birth_per_hour agent requests an hour; the other birth steps are unchanged.
const migration = readFileSync(new URL("./2026-11-04-issue-probe-birth-budget.sql", import.meta.url), "utf8");
assert.match(migration, /^-- APPLY-BY: ci$/m);
assert.match(migration, /^-- DB: qnfo-audit$/m);
assert.match(migration, /^-- BACKUP: bak_20261104_birth_trigger$/m);
assert.match(migration, /^-- Rollback: /m);

const SCHEMA = `
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, priority TEXT DEFAULT 'medium', status TEXT, source TEXT);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER,
    escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT);
  CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'run', prompt TEXT, instance TEXT,
    priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
  CREATE TABLE issue_probe_requests (issue_id INTEGER PRIMARY KEY, request_id INTEGER, requested_at TEXT);
  CREATE VIEW v_issue_birth_owner AS SELECT id AS issue_id, 'qnfo-fleet-control' AS owner FROM agent_issues;
  CREATE VIEW v_issue_probe_intake AS SELECT a.id AS issue_id, a.priority, 'Issue #' || a.id AS prompt FROM agent_issues a WHERE a.status = 'open';
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER,
    trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT,
    predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  -- the trigger as it stood on 2026-11-04 (ISSUE-BIRTH-DOER-PROBE-1): a request for every new open issue
  CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues
  WHEN NEW.status = 'open'
  BEGIN
    INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
    SELECT NEW.id, 'ISSUE-BIRTH-DOER-PROBE-1', 'triaged', owner, datetime('now')
    FROM v_issue_birth_owner WHERE issue_id = NEW.id;
    UPDATE issue_triage SET owner = (SELECT owner FROM v_issue_birth_owner WHERE issue_id = NEW.id),
      rc = 'ISSUE-BIRTH-DOER-PROBE-1'
    WHERE issue_id = NEW.id AND rc = 'AUTOTRIAGE-1' AND owner = 'qnfo-ops';
    INSERT OR IGNORE INTO remediation_contracts
      (class, issue_id, precondition, action, verify_probe, verify_transport,
       max_attempts, escalate_to, expected_cadence_h, status, module)
    SELECT 'issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)',
      'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1,
      'needs-machine-probe', 'birth'
    WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE issue_id = NEW.id);
    INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority)
    SELECT 'issue-probe-agent', 'run', prompt, 'probe-issue-' || issue_id, priority
    FROM v_issue_probe_intake WHERE issue_id = NEW.id
      AND COALESCE((SELECT value FROM ops_config WHERE key = 'issue_probe_agent'), 'on') <> 'off'
      AND NOT EXISTS (SELECT 1 FROM cf_agent_requests
                      WHERE requester = 'issue-probe-agent' AND instance = 'probe-issue-' || NEW.id);
    INSERT OR IGNORE INTO issue_probe_requests (issue_id, request_id, requested_at)
    SELECT NEW.id, id, created_at FROM cf_agent_requests
    WHERE requester = 'issue-probe-agent' AND instance = 'probe-issue-' || NEW.id
    ORDER BY id DESC LIMIT 1;
  END;
`;
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString().replace(/\.\d+Z$/, "Z");
const born = (db, from, n) => { for (let i = from; i < from + n; i++) db.prepare("INSERT INTO agent_issues (id, title, status) VALUES (?, ?, 'open')").run(i, "CF-OBS-ISSUE-1: overload " + i); };
const requests = (db) => db.prepare("SELECT COUNT(*) AS n FROM cf_agent_requests WHERE requester = 'issue-probe-agent'").get().n;

// Before: a burst of 10 issues queues 10 agent loops.
const before = new DatabaseSync(":memory:");
before.exec(SCHEMA);
born(before, 1, 10);
assert.equal(requests(before), 10, "before: one agent request per born issue");

// After.
const db = new DatabaseSync(":memory:");
db.exec(SCHEMA);
// two requests from the hourly step 2 hours ago do not count; one from 10 minutes ago does.
db.prepare("INSERT INTO cf_agent_requests (requester, instance, created_at) VALUES ('issue-probe-agent', 'probe-issue-900', ?)").run(ago(120));
db.prepare("INSERT INTO cf_agent_requests (requester, instance, created_at) VALUES ('issue-probe-agent', 'probe-issue-901', ?)").run(ago(121));
db.prepare("INSERT INTO cf_agent_requests (requester, instance, created_at) VALUES ('issue-probe-agent', 'probe-issue-902', ?)").run(ago(10));
db.prepare("INSERT INTO cf_agent_requests (requester, instance, created_at) VALUES ('program-manager:QNFO.OPS', 'x', ?)").run(ago(5));
db.exec(migration);
assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'agent_issues_birth_contract_ins'").get().sql, /issue_probe_birth_per_hour/);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bak_20261104_birth_trigger").get().n, 1, "the old definition is backed up");
assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'issue_probe_birth_per_hour'").get().value, "3");

born(db, 1, 10);
const inHour = db.prepare("SELECT COUNT(*) AS n FROM cf_agent_requests WHERE requester = 'issue-probe-agent' AND created_at > ?").get(ago(60)).n;
assert.equal(inHour, 3, "the hour holds the existing request plus two births, not ten: " + inHour);
// every born issue still gets its contract and triage row; the issues not asked have no probe-request row and stay in the intake view.
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE module = 'birth'").get().n, 10);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM issue_triage WHERE rc = 'ISSUE-BIRTH-DOER-PROBE-1'").get().n, 10);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM issue_probe_requests").get().n, 2, "only asked issues are recorded as asked");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM v_issue_probe_intake").get().n, 10, "unasked issues remain available to the hourly step");

// The limit is configurable and off still wins.
db.exec("UPDATE ops_config SET value = '1000' WHERE key = 'issue_probe_birth_per_hour'");
born(db, 100, 5);
assert.equal(requests(db), 3 + 2 + 5, "with the limit lifted every new issue is asked: " + requests(db));
db.exec("INSERT INTO ops_config (key, value) VALUES ('issue_probe_agent', 'off')");
const n0 = requests(db);
born(db, 200, 3);
assert.equal(requests(db), n0, "issue_probe_agent = off still stops birth requests");

// Detector: a quiet hour reads 0, more than 8 requests in the hour read 1.
const probeSql = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-issue-probe-hourly-unbounded'").get().verify_probe;
const quiet = new DatabaseSync(":memory:");
quiet.exec(SCHEMA);
quiet.exec(migration);
assert.deepEqual({ ...quiet.prepare(probeSql).get() }, { expected: "0", observed: "0" });
quiet.exec("UPDATE ops_config SET value = '1000' WHERE key = 'issue_probe_birth_per_hour'");
born(quiet, 1, 9);
assert.equal(quiet.prepare(probeSql).get().observed, "1");

// Replay is idempotent.
db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n, 1);
assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'issue_probe_birth_per_hour'").get().value, "1000", "replay keeps an operator's value");
before.close(); db.close(); quiet.close();
console.log("issue-probe-birth-budget: all passed");

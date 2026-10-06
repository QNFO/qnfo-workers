#!/usr/bin/env python3
"""Offline tests for PROBE-BIRTH-RUNTIME-1 (migrations/2026-10-06-runtime-probe-lines.sql, agent_issues 2075).

Builds a local replica of the tables and of every trigger that writes an issue's contract at birth in qnfo-audit
(agent_issues_birth_contract_ins and contract_probe_templates_v2_loop from ORPHAN-GUARD-BIRTH-1, contract_probe_templates_v1
from PROBE-TEMPLATES-1, the PROBE-SEMICOLON-NORMALIZE-1 pair; DDL copied from qnfo-audit on 2026-10-06), applies the migration
through scripts/apply_migrations.py's own statement splitter, and proves: an open issue whose description carries a
`runtime-probe: {json}` line gets contract issue-<id> on transport runner-https with exactly that JSON, whatever template ran
first; only that line is taken (later lines, a CR, trailing spaces are not); a line with invalid JSON, a non-https url, or
neither "contains" nor an integer "status" leaves the contract as the other triggers wrote it; a closed issue gets nothing;
a line appended later converts the existing contract, an unchanged line keeps its attempts, a changed line resets them; the
migration passes the runner's --check and applies twice.
Run: python3 scripts/runtime_probe_lines_test.py   (prints "N passed, 0 failed")
"""
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply_migrations as M  # noqa: E402

MIG = os.path.join(HERE, "..", "migrations", "2026-10-06-runtime-probe-lines.sql")
passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:400]))


db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT NOT NULL DEFAULT 'live');
CREATE VIEW v_metric_trigger_state AS SELECT 1 AS id, 0 AS hit, 1.0 AS val;
INSERT INTO service_registry (service, state) VALUES ('qnfo-cloud-ops', 'live');
""")
# Production triggers (qnfo-audit sqlite_master, 2026-10-06 16:55Z), verbatim.
db.executescript("""
CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues
WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id)
BEGIN
  INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
  VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 24, 'needs-machine-probe', 'birth');
END;
CREATE TRIGGER contract_probe_templates_v1
AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v1', attempts = 0, last_verdict = NULL,
      next_due_at = datetime('now'),
      verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') = 0 AND (SELECT val FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') IS NOT NULL THEN ''1'' ELSE ''0'' END AS observed'
  WHERE class = NEW.class
    AND EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND title LIKE 'METRIC-TRIGGER-%' AND CAST(substr(title, 16) AS INTEGER) > 0);
END;
CREATE TRIGGER contract_probe_templates_v2_loop AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
              WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v2-loop', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'filed by a live fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)',
      action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
      verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' ELSE ''pending'' END AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;
CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
""")

text = open(MIG, encoding="utf-8").read()
okp, problems, info = M.plan("migrations/2026-10-06-runtime-probe-lines.sql", text)
ok(okp and not problems and info.get("db") == "qnfo-audit" and info.get("destructive") == 0, "the runner's --check accepts the header (APPLY-BY ci, DB qnfo-audit, Rollback)", (problems, info))
stmts = M.statements(text)
ok(stmts is not None and len(stmts) == 2, "the runner's splitter sees two statements (two triggers)", stmts and len(stmts))
for _ in range(2):  # idempotent: CREATE TRIGGER IF NOT EXISTS
    for s in stmts:
        db.execute(s)
ok(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'agent_issues_runtime_probe_%'").fetchone()[0] == 2, "both triggers exist after applying twice")


def file_issue(title, desc, source="session_x", status="open"):
    cur = db.execute("INSERT INTO agent_issues (title, description, source, status, created_at, updated_at) VALUES (?,?,?,?,1,1)", (title, desc, source, status))
    return cur.lastrowid


def contract(iid):
    r = db.execute("SELECT verify_transport, verify_probe, status, module, attempts, expected_cadence_h FROM remediation_contracts WHERE class = ?", ("issue-%d" % iid,)).fetchone()
    return r


P = '{"url": "https://fleet.qnfo.org/api/watchmaker", "status": 200, "contains": "probe-cadence"}'
i1 = file_issue("WATCH-1: x", "Charter pillar: autonomy. Prose first.\nruntime-probe: " + P + "\ncode-task: repo=qnfo-workers path=a/worker.js\n")
c = contract(i1)
ok(c and c[0] == "runner-https" and c[1] == P and c[2] == "active" and c[3] == "runtime-probe-line-v1" and c[5] == 6, "a session issue with the line is born on runner-https with exactly that JSON", c)
ok(json.loads(c[1])["contains"] == "probe-cadence", "the stored probe is valid JSON for the consumer")

i2 = file_issue("WATCH-2: y", "runtime-probe: " + P + "   \r\nmore")
ok(contract(i2)[1] == P, "a trailing CR and spaces are not part of the probe", contract(i2))

i3 = file_issue("WATCH-3: end", "x\nruntime-probe: " + P)
ok(contract(i3)[0] == "runner-https" and contract(i3)[1] == P, "a line at the very end of the description is taken")

i4 = file_issue("LOOP-1: z", "filed by a loop\nruntime-probe: " + P, source="qnfo-cloud-ops")
ok(contract(i4)[0] == "runner-https" and contract(i4)[3] == "runtime-probe-line-v1", "a loop-filed issue's explicit line overrides the v2 loop template", contract(i4))

i5 = file_issue("METRIC-TRIGGER-1-FOO: bar", "trigger action\nruntime-probe: " + P)
ok(contract(i5)[0] == "runner-https", "a METRIC-TRIGGER issue's explicit line overrides the v1 metric template", contract(i5))

bad = [
    ("BAD-1: json", "runtime-probe: {not json}", "invalid JSON"),
    ("BAD-2: http", 'runtime-probe: {"url": "http://fleet.qnfo.org/", "status": 200}', "a non-https url"),
    ("BAD-3: weak", 'runtime-probe: {"url": "https://fleet.qnfo.org/"}', "neither contains nor an integer status"),
    ("BAD-4: strstatus", 'runtime-probe: {"url": "https://fleet.qnfo.org/", "status": "200"}', "a string status"),
]
for t, d, why in bad:
    i = file_issue(t, d)
    c = contract(i)
    ok(c and c[0] == "d1-query" and c[3] == "birth", "a line with " + why + " leaves the birth placeholder untouched", c)
iloop = file_issue("LOOP-2: weak", 'runtime-probe: {"url": "https://fleet.qnfo.org/"}', source="qnfo-cloud-ops")
ok(contract(iloop)[3] == "probe-template-v2-loop", "a weak line on a loop issue leaves the loop template in place", contract(iloop))

ic = file_issue("CLOSED-1: c", "runtime-probe: " + P, status="closed")
ok(contract(ic) is None, "a closed issue gets no contract")

ip = file_issue("PLAIN-1: p", "no line, mentions https://fleet.qnfo.org/ only in prose")
ok(contract(ip)[0] == "d1-query", "a URL mentioned in prose is never turned into a probe", contract(ip))

# Appended later: the existing contract converts.
iu = file_issue("LATER-1: u", "first version")
ok(contract(iu)[0] == "d1-query", "before the line: the birth placeholder")
db.execute("UPDATE agent_issues SET description = description || ? WHERE id = ?", ("\nruntime-probe: " + P, iu))
ok(contract(iu)[0] == "runner-https" and contract(iu)[1] == P and contract(iu)[2] == "active", "a line appended later converts the contract", contract(iu))
db.execute("UPDATE remediation_contracts SET attempts = 2 WHERE class = ?", ("issue-%d" % iu,))
db.execute("UPDATE agent_issues SET description = description || '\nPROGRESS: noted' WHERE id = ?", (iu,))
ok(contract(iu)[4] == 2, "an unrelated edit with the same line keeps the attempts", contract(iu))
P2 = '{"url": "https://fleet.qnfo.org/api/watchmaker", "status": 200, "contains": "time-gated-verification"}'
db.execute("UPDATE agent_issues SET description = replace(description, ?, ?) WHERE id = ?", (P, P2, iu))
ok(contract(iu)[1] == P2 and contract(iu)[4] == 0, "a changed line replaces the probe and resets the attempts", contract(iu))

# An issue that had no contract row at all (filed before ORPHAN-GUARD-BIRTH-1) gets one when the line is added.
db.execute("INSERT INTO agent_issues (id, title, description, source, status, created_at, updated_at) SELECT 900, 'OLD-1', 'old', 's', 'closed', 1, 1")
db.execute("UPDATE agent_issues SET status = 'open' WHERE id = 900")
ok(contract(900) is None, "precondition: the old issue has no contract row")
db.execute("UPDATE agent_issues SET description = ? WHERE id = 900", ("old\nruntime-probe: " + P,))
ok(contract(900) and contract(900)[0] == "runner-https", "an older issue with no contract row gets one from the update trigger", contract(900))

print(passed, "passed,", failed, "failed")
sys.exit(1 if failed else 0)

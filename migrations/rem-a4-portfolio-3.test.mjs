// REM-A4-PORTFOLIO-3 offline suite: replays migrations/2026-10-26-rem-a4-portfolio-3.sql on node:sqlite. Proves: the born-superseded contract of the PROBE-SEMICOLON-LINT-1 issue becomes an active code-read contract
// whose probe is the JSON of the code-probe line (no semicolon), due now; a contract a doer already replaced and another issue's contract are left alone; no issue means no change; a second apply changes nothing;
// the Rollback line restores the saved row; one decision_log row; no DELETE or DROP.
// Run: node --no-warnings migrations/rem-a4-portfolio-3.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-26-rem-a4-portfolio-3.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const one = (db, s, ...a) => db.prepare(s).get(...a);
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
ok(/^-- APPLY-BY: ci\s*$/m.test(sql) && /^-- DB: qnfo-audit\s*$/m.test(sql) && sql.split("\n").filter((l) => l.startsWith("-- Rollback:")).length === 1, "header opts in, one single-line Rollback");
ok(!/^\s*(DELETE\s+FROM|DROP\s)/im.test(sql.replace(/^--.*$/gm, "")) && !/claude\.ai|anthropic\.com/i.test(sql), "no DELETE or DROP, no claude.ai link");

const BORN = "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status)";
function world(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'open');
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT 'p', action TEXT NOT NULL DEFAULT 'a', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL DEFAULT 'd1-query', escalate_to TEXT NOT NULL DEFAULT 'x', status TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0, module TEXT, next_due_at TEXT, expected_cadence_h INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0 BEGIN UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class; END;
`);
  if (!o.none) {
    db.prepare("INSERT INTO agent_issues (id, title, description) VALUES (1000507, 'PROBE-SEMICOLON-LINT-1: scripts/apply_migrations.py --check does not refuse a semicolon', 'x')").run();
    db.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, status, last_verdict, attempts, module) VALUES ('issue-1000507', 1000507, 'VACUOUS-PROBE-V3-1: x', 'SELECT ''closed'' AS expected, NULL AS observed', ?, ?, 0, 'probe-template-v3-generic')").run(o.status ?? "superseded", o.verdict ?? BORN);
  }
  db.prepare("INSERT INTO agent_issues (id, title, description) VALUES (9, 'another', 'x')").run();
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, last_verdict, attempts) VALUES ('issue-9', 9, 'SELECT 1', 'superseded', ?, 0)").run(BORN);
  return db;
}
const a = world();
const other = JSON.stringify(one(a, "SELECT * FROM remediation_contracts WHERE class = 'issue-9'"));
const before = JSON.stringify(one(a, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000507'"));
a.exec(sql);
const c = one(a, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000507'");
ok(c.status === "active" && c.verify_transport === "code-read" && c.module === "code-probe-line-v1" && c.last_verdict === null && c.attempts === 0 && c.next_due_at !== null && c.expected_cadence_h === 6, "the born-superseded contract is replaced by an active code-read contract due now", c);
ok(JSON.parse(c.verify_probe).contains === "PROBE-SEMICOLON-LINT-1" && JSON.stringify(JSON.parse(c.verify_probe).paths) === JSON.stringify(["scripts/apply_migrations.py"]) && !c.verify_probe.includes(";"), "its probe is the JSON of the code-probe line, with no semicolon");
ok(!/VACUOUS-PROBE-V3-1/.test(c.action), "its action says what the doer does");
ok(JSON.stringify(one(a, "SELECT * FROM remediation_contracts WHERE class = 'issue-9'")) === other, "another issue's contract is untouched");
ok(one(a, "SELECT COUNT(*) AS n FROM bak_20261026_rem_a4_portfolio_3_contract").n === 1 && one(a, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'REM-A4-PORTFOLIO-3:') = 1").n === 1, "the old row is saved and the decision logged once");
const snap = (db) => JSON.stringify([db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").all()]);
const s0 = snap(a); a.exec(sql);
ok(snap(a) === s0, "a second apply changes nothing");
for (const s of rollback.split("; ")) a.exec(s);
ok(JSON.stringify(one(a, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000507'")) === before.replace(/"next_due_at":null/, '"next_due_at":null'), "Rollback restores the saved row", one(a, "SELECT status, verify_transport FROM remediation_contracts WHERE class = 'issue-1000507'"));
const b = world({ status: "active", verdict: "fail" }); const bb = JSON.stringify(one(b, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000507'")); b.exec(sql);
ok(JSON.stringify(one(b, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000507'")) === bb, "a contract a doer already replaced is left alone");
const n = world({ none: true }); n.exec(sql);
ok(one(n, "SELECT COUNT(*) AS c FROM remediation_contracts").c === 1, "with no such issue nothing changes (the backup is empty, no row is created)");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

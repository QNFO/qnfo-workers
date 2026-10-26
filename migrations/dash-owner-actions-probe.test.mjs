// DASH-OWNER-ACTIONS-1 closing-probe offline suite (agent_issues 100360; migrations/2026-10-26-dash-owner-actions-probe.sql).
// Applies the migration on SQLite (node:sqlite) over fixtures with the live column lists and the append-only decision_log triggers, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log) and that apply_migrations.py --check accepts the file;
//   2. the contract of issue-100360 becomes a runner-https min_version probe of the dashboard /health (valid JSON, no owner act in it) and is re-armed;
//   3. a contract that is not the old d1-query probe is left alone, a replay changes nothing, and the Rollback restores the old probe and removes the capability row.
// Run: node --no-warnings migrations/dash-owner-actions-probe.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const FILE = join(here, "2026-10-26-dash-owner-actions-probe.sql");
const sql = norm(readFileSync(FILE, "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 200, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai link and no skip-CI token");

const PY = ["python3", "python"].find((c) => spawnSync(c, ["-I", "-c", "print(1)"], { encoding: "utf8" }).status === 0);
if (PY) {
  const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", FILE], { encoding: "utf8" });
  ok(chk.status === 0, "apply_migrations.py --check accepts the file", String(chk.stdout) + String(chk.stderr));
}

const OLD_PROBE = "SELECT 'live-approve-recorded' AS expected, CASE WHEN EXISTS (SELECT 1 FROM human_responses WHERE kind = 'approve' AND credential = 'owner-session') AND EXISTS (SELECT 1 FROM owner_prompts WHERE mode = 'task' AND prompt LIKE 'OWNER-DECISION from %') THEN 'live-approve-recorded' ELSE 'no-live-approve-yet' END AS observed";
const DDL = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT, prerequisites TEXT, reliability TEXT, acquired_at TEXT, last_exercised_at TEXT, evidence TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
`;
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const world = (extra) => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, module, attempts, last_verdict, status) VALUES ('issue-100360', 100360, 'p', 'a', ?, 'd1-query', 'qnfo-fleet-control', 1, 'doer-authored', 4, 'fail', 'active')").run(extra && extra.probe || OLD_PROBE);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to) VALUES ('issue-100361', 100361, 'p', 'a', 'SELECT 1', 'd1-query', 'x')").run();
  return db;
};
const snap = (db) => JSON.stringify(["remediation_contracts", "capability_ledger", "decision_log"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));

const db = world();
db.exec(sql);
const c = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100360'");
let probe = null;
try { probe = JSON.parse(c.verify_probe); } catch (e) { /* asserted below */ }
ok(c.verify_transport === "runner-https" && probe && probe.url === "https://qnfo-fleet-dashboard.q08.workers.dev/health" && probe.status === 200 && probe.min_version === "1.70.2", "the contract is a runner-https min_version probe of the dashboard /health", c);
ok(!/owner-session|human_responses|approve/.test(c.verify_probe), "the probe asks for no owner act");
ok(c.attempts === 0 && c.last_verdict === null && c.next_due_at !== null && c.status === "active", "the contract is re-armed and still active", c);
ok(/1\.70\.2/.test(c.action) && /ISSUES-AUTO-APPROVE-1/.test(c.action) && /not a precondition/.test(c.action), "the action says why the owner act is gone and what is measured instead", c.action);
ok(one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-100361'").verify_probe === "SELECT 1", "another contract is untouched");
ok(q(db, "SELECT * FROM capability_ledger").length === 1 && q(db, "SELECT * FROM decision_log").length === 1, "one capability row and one decision row");

// ---- a contract someone already rewrote is left alone ----
const other = world({ probe: "SELECT 'ok' AS expected, 'ok' AS observed" });
other.exec(sql);
ok(one(other, "SELECT verify_transport t FROM remediation_contracts WHERE class = 'issue-100360'").t === "d1-query", "a contract that no longer holds the old probe is not rewritten");

// ---- replay and rollback ----
const before = snap(db);
db.exec(sql);
ok(snap(db) === before, "a replay changes nothing (including the decision row)");
db.exec(rollback);
const r = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-100360'");
ok(r.verify_transport === "d1-query" && r.verify_probe === OLD_PROBE && r.attempts === 0, "the Rollback restores the old d1-query probe", r);
ok(q(db, "SELECT * FROM capability_ledger").length === 0 && q(db, "SELECT * FROM decision_log").length === 1, "the Rollback removes the capability row and leaves the decision row");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

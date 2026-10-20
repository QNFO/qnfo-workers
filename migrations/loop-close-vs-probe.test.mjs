// LOOP-CLOSE-VS-PROBE-1 offline suite (agent_issues 100344 IL-CLOSE-VS-PROBE-1; 2562, 100163, 2158).
// Applies migrations/2026-10-20-loop-close-vs-probe.sql on SQLite (node:sqlite) over fixtures with the live column lists and the append-only decision_log triggers, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log) and that apply_migrations.py --check accepts the file;
//   2. the detector contract fm-loop-close-vs-probe-disagree (d1-query, no semicolon) reads 0 with no abort row, the count of qnfo-fleet-control rows of the last 6 hours that name the
//      abort, and 0 again for older rows and for another script; the text it looks for is the RAISE text of the live trigger (migrations/2026-10-18-close-binds-to-probe.sql);
//   3. one failure mode on issue 100344, one decision row, a replay that changes nothing, and a Rollback that removes everything but the decision row.
// Run: node --no-warnings migrations/loop-close-vs-probe.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const FILE = join(here, "2026-10-20-loop-close-vs-probe.sql");
const sql = norm(readFileSync(FILE, "utf8"));
const trigger = norm(readFileSync(join(here, "2026-10-18-close-binds-to-probe.sql"), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 100, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai link and no skip-CI token");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");

const PY = ["python3", "python"].find((c) => spawnSync(c, ["-I", "-c", "print(1)"], { encoding: "utf8" }).status === 0);
if (PY) {
  const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", FILE], { encoding: "utf8" });
  ok(chk.status === 0, "apply_migrations.py --check accepts the file", String(chk.stdout) + String(chk.stderr));
}

// the text the detector looks for is the live trigger's RAISE text
ok(/RAISE\(ABORT,'close-while-contract-fails'\)/.test(trigger), "the trigger of CLOSE-BINDS-TO-PROBE-1 raises close-while-contract-fails");
ok(sql.includes("%close-while-contract-fails%"), "the detector looks for the same text");

const DDL = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER, script_name TEXT, event_type TEXT, outcome TEXT, exceptions_json TEXT);
`;
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const world = () => { const db = new DatabaseSync(":memory:"); db.exec(DDL); return db; };
const snap = (db) => JSON.stringify(["remediation_contracts", "failure_modes", "decision_log"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));

const db = world();
db.exec(sql);
const fm = q(db, "SELECT * FROM failure_modes");
ok(fm.length === 1 && fm[0].fm_key === "loop-close-vs-probe-disagree" && fm[0].issue_id === 100344 && fm[0].probe_class === "fm-loop-close-vs-probe-disagree", "one failure mode, filed on issue 100344, naming its detector class", fm.map((r) => r.fm_key));
const c = one(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-loop-close-vs-probe-disagree'");
ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode" && c.issue_id === null, "the detector is an active d1-query failure-mode contract with no issue", c && { t: c.verify_transport, s: c.status, m: c.module });
ok(c && !c.verify_probe.includes(";") && /^SELECT/.test(c.verify_probe), "the probe is a single SELECT without a semicolon");
ok(q(db, "SELECT * FROM decision_log").length === 1, "one decision row");

// ---- the detector over fixtures ----
const probe = (d) => one(d, c.verify_probe);
const at = (minAgo) => Date.now() - minAgo * 60000;
const log = (d, script, minAgo, ex) => d.prepare("INSERT INTO worker_logs (ts_ms, script_name, event_type, outcome, exceptions_json) VALUES (?, ?, 'telemetry:scheduled', 'exception', ?)").run(at(minAgo), script, ex);
const ABORT = JSON.stringify([{ name: "Error", message: "D1_ERROR: close-while-contract-fails: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)" }]);
let p = probe(db);
ok(p.expected === "0" && p.observed === "0", "with no abort row the detector reads 0", p);
log(db, "qnfo-fleet-control", 10, ABORT);
log(db, "qnfo-fleet-control", 70, ABORT);
log(db, "qnfo-fleet-control", 350, ABORT);
p = probe(db);
ok(p.observed === "3", "three abort rows inside the 6 hour window read 3", p);
log(db, "qnfo-fleet-control", 400, ABORT);
ok(probe(db).observed === "3", "a row older than 6 hours is not counted");
log(db, "qnfo-ops", 5, ABORT);
ok(probe(db).observed === "3", "the same text from another script is not counted");
log(db, "qnfo-fleet-control", 5, JSON.stringify([{ name: "Error", message: "D1_ERROR: no such table: nothing" }]));
ok(probe(db).observed === "3", "another exception of qnfo-fleet-control is not counted");

// ---- replay and rollback ----
const before = snap(db);
db.exec(sql);
ok(snap(db) === before, "a replay changes nothing (including the decision row)");
db.exec(rollback);
ok(q(db, "SELECT * FROM failure_modes").length === 0 && q(db, "SELECT * FROM remediation_contracts").length === 0, "the Rollback removes the failure mode and the detector");
ok(q(db, "SELECT * FROM decision_log").length === 1, "the Rollback leaves the decision row");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

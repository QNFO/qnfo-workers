// CODE-LOOP-CONTROL-PLANE-1 offline suite: replays migrations/2026-10-19-code-loop-control-plane.sql on SQLite. Proves: control-plane-deny is
// marked applied once, the failure mode and its code-read detector are created once, the detector's marker text is on main in both worker.js files
// (it reads true now and false on the previous two-worker list), the decision is logged once, re-applying is harmless, and the Rollback line
// removes the registry rows. Run: node migrations/code-loop-control-plane.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const root = (f) => new URL("../" + f, import.meta.url);
const sql = readFileSync(here("2026-10-19-code-loop-control-plane.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
INSERT INTO control_registry (control, location, kind, disposition, disposition_state, evidence) VALUES ('control-plane-deny', 'qnfo-fleet-control CM_DENY', 'filter', 'replace', 'applied', 'applied 2026-10-12 | OWNER DIRECTIVE 2026-10-19: the deny no longer applies to those four workers');`);
db.exec(sql);

const cp = db.prepare("SELECT evidence, disposition_state FROM control_registry WHERE control = 'control-plane-deny'").get();
ok(cp.disposition_state === "applied" && cp.evidence.includes("APPLIED 2026-10-19 (CODE-LOOP-CONTROL-PLANE-1)") && cp.evidence.includes("OWNER DIRECTIVE 2026-10-19"), "control-plane-deny is marked applied and keeps the earlier evidence", cp);
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'code-loop-barred-from-control-plane'").get().n === 1, "one failure mode");
const det = db.prepare("SELECT verify_probe, verify_transport, module FROM remediation_contracts WHERE class = 'fm-code-loop-barred-from-control-plane'").get();
ok(det && det.verify_transport === "code-read", "one code-read detector", det);
const spec = JSON.parse(det.verify_probe);
ok(Array.isArray(spec.paths) && spec.paths.length === 2 && typeof spec.contains === "string", "the probe parses as {paths, contains}", spec);
const six = ["qnfo-ai", "qnfo-gateway", "qnfo-fleet-control", "qnfo-ops", "qnfo-deploy-guard", "qnfo-code-orchestrator"];
ok(spec.contains === JSON.stringify(six).replace(/","/g, '", "'), "the marker is the six-worker list as the workers write it", spec.contains);
for (const p of spec.paths) {
  const src = readFileSync(root(p), "utf8");
  ok(src.includes(spec.contains), p + " on main contains the marker (the detector reads ok)");
  ok(!src.includes('["qnfo-ai", "qnfo-gateway"];'), p + " no longer carries the two-worker list (the detector would fail on the old text)");
}
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'CODE-LOOP-CONTROL-PLANE-1:') = 1").get().n === 1, "one decision_log row");
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 1, "re-applying changes nothing");
ok((db.prepare("SELECT evidence FROM control_registry WHERE control = 'control-plane-deny'").get().evidence.match(/APPLIED 2026-10-19/g) || []).length === 1, "the evidence note is appended once");
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 0 && !db.prepare("SELECT evidence FROM control_registry WHERE control = 'control-plane-deny'").get().evidence.includes("APPLIED 2026-10-19"), "the Rollback line removes the rows and the note");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");
console.log(`code-loop-control-plane: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

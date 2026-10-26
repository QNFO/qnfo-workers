// IDEA-TRIAGE-COOLING-STARVE-1 offline suite: migrations/2026-10-26-triage-cooling-starve.sql registers the failure mode, its code-read detector and one decision row, idempotently,
// and the detector's text is consistent with idea-hub/worker.js on this checkout (the old ORDER BY is absent, the SQL-side cooling clause is present).
// Run: node --no-warnings migrations/triage-cooling-starve.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(here("2026-10-26-triage-cooling-starve.sql"), "utf8");
const worker = readFileSync(new URL("../idea-hub/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql), "the file carries the three migration headers");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "the body runs no DELETE or DROP");
db.exec(sql); db.exec(sql);
ok(n("failure_modes") === 1 && n("remediation_contracts") === 1 && n("decision_log") === 1, "applied twice: one failure mode, one detector contract, one decision row", [n("failure_modes"), n("remediation_contracts"), n("decision_log")]);
const c = db.prepare("SELECT * FROM remediation_contracts").get();
const probe = JSON.parse(c.verify_probe);
ok(c.verify_transport === "code-read" && c.status === "active" && c.issue_id === null && Array.isArray(probe.paths) && probe.paths[0] === "idea-hub/worker.js" && typeof probe.absent === "string", "the detector is an active code-read contract on idea-hub/worker.js with an absent text and closes no issue", c);
ok(!worker.includes(probe.absent), "the old ORDER BY the detector watches is absent from idea-hub/worker.js on this checkout", probe.absent);
ok(worker.includes("var COOLING_SQL =") && worker.includes("AND NOT (\" + COOLING_SQL + \")"), "the SQL-side cooling clause is present in the triage select");
ok(db.prepare("SELECT predicted_outcome FROM decision_log").get().predicted_outcome.indexOf(" within ") === -1, "the decision row's predicted outcome holds no ' within ' (the live prediction parser would read it)");
const down = /^-- Rollback: (.*)$/m.exec(sql)[1];
db.exec(down);
ok(n("failure_modes") === 0 && n("remediation_contracts") === 0 && n("decision_log") === 1, "the Rollback line removes the failure mode and the detector and leaves the append-only decision row");
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

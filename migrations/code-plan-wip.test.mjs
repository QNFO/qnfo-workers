// PLAN-WIP-TUNABLE-1 offline suite: runs migrations/2026-10-19-plan-wip-superseded.sql then 2026-10-19-code-plan-wip.sql on SQLite.
// Proves code_plan_wip is 40, the planner-stall detector now fails at the 2026-10-19 deadlock (WIP 12, no plan) and passes at the
// new gate, re-applying changes nothing, and the Rollback line restores the old probe and removes both rows.
// Run: node migrations/code-plan-wip.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const prior = readFileSync(new URL("./2026-10-19-plan-wip-superseded.sql", import.meta.url), "utf8");
const sql = readFileSync(new URL("./2026-10-19-code-plan-wip.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT);
CREATE TABLE issue_plans (issue_id INTEGER, planned_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);`);
db.exec(prior);
const oldProbe = db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe;
const ins = db.prepare("INSERT INTO code_tasks VALUES (?, ?)");
for (let i = 0; i < 8; i++) ins.run("q" + i, "queued");
ins.run("b", "branch_pushed"); ins.run("p1", "published"); ins.run("p2", "published"); ins.run("r", "ready_to_publish");
for (let i = 0; i < 3; i++) ins.run("x" + i, "queued"); // real WIP 12: 11 queued + 1 ready
const probe = () => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe).get().observed;
ok(probe() === "1", "BLIND SPOT: before the file the detector passes at the deadlock (real WIP 12, no plan)");
db.exec(sql);
ok(db.prepare("SELECT value FROM ops_config WHERE key = 'code_plan_wip'").get().value === "40", "code_plan_wip is 40");
ok(probe() === "0", "after the file the detector fails at the deadlock", probe());
for (let i = 0; i < 30; i++) ins.run("y" + i, "queued");
ok(probe() === "1", "and passes when real WIP reaches the new gate (40)", probe());
ok(!!db.prepare("SELECT 1 FROM failure_modes WHERE fm_key = 'code-plan-wip-steady-state'").get(), "the failure mode is recorded");
const snap = JSON.stringify(db.prepare("SELECT * FROM remediation_contracts").all()) + JSON.stringify(db.prepare("SELECT key, value FROM ops_config").all());
db.exec(sql);
ok(JSON.stringify(db.prepare("SELECT * FROM remediation_contracts").all()) + JSON.stringify(db.prepare("SELECT key, value FROM ops_config").all()) === snap, "re-applying the file changes nothing");
db.exec(sql.match(/^-- Rollback: (.*)$/m)[1]);
ok(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe === oldProbe, "the Rollback line restores the old probe");
ok(!db.prepare("SELECT 1 FROM ops_config").get() && !db.prepare("SELECT 1 FROM failure_modes WHERE fm_key = 'code-plan-wip-steady-state'").get(), "the Rollback line removes the setting and the failure mode");
console.log(`code-plan-wip: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

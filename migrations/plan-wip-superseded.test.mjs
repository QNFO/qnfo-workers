// PLAN-WIP-SUPERSEDED-1 offline suite: runs migrations/2026-10-19-plan-wip-superseded.sql on SQLite. Proves the failure mode and its
// detector are recorded, the detector fails on the 2026-10-19 shape (no plan for 20 h, 8 superseded + 11 live tasks), passes once a
// plan lands or when real WIP is at the gate, re-applying changes nothing, and the Rollback line removes both rows.
// Run: node migrations/plan-wip-superseded.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-plan-wip-superseded.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT);
CREATE TABLE issue_plans (issue_id INTEGER, planned_at TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);`);
db.exec(sql);
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'code-plan-wip-terminal-omitted'").get();
ok(fm && fm.probe_class === "fm-code-plan-wip-terminal-omitted" && fm.issue_id === 100074, "the failure mode is recorded with its detector", fm);
const rc = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-code-plan-wip-terminal-omitted'").get();
ok(rc && rc.status === "active" && rc.verify_transport === "d1-query" && rc.next_due_at, "the detector contract is active and due", rc);
const probe = () => db.prepare(rc.verify_probe).get();
const ins = db.prepare("INSERT INTO code_tasks VALUES (?, ?)");
for (let i = 0; i < 8; i++) ins.run("s" + i, "superseded");
for (let i = 0; i < 9; i++) ins.run("q" + i, "queued");
ins.run("p1", "published"); ins.run("p2", "published"); ins.run("r1", "ready_to_publish"); ins.run("r2", "ready_to_publish");
db.prepare("INSERT INTO issue_plans VALUES (1, ?)").run(new Date(Date.now() - 20 * 3600e3).toISOString());
ok(probe().observed === "0", "the 2026-10-19 shape fails: no plan for 20 h while real WIP (11) is under the gate", probe());
db.prepare("INSERT INTO issue_plans VALUES (2, ?)").run(new Date().toISOString());
ok(probe().observed === "1", "a plan in the last 120 minutes passes", probe());
db.exec("DELETE FROM issue_plans WHERE issue_id = 2");
ins.run("q9", "queued");
ok(probe().observed === "1", "real WIP at the gate (12) passes without a plan", probe());
const snap = JSON.stringify(db.prepare("SELECT * FROM failure_modes").all()) + JSON.stringify(db.prepare("SELECT * FROM remediation_contracts").all());
db.exec(sql);
ok(JSON.stringify(db.prepare("SELECT * FROM failure_modes").all()) + JSON.stringify(db.prepare("SELECT * FROM remediation_contracts").all()) === snap, "re-applying the file changes nothing");
const rb = sql.match(/^-- Rollback: (.*)$/m);
ok(!!rb, "the file has a Rollback line");
db.exec(rb[1]);
ok(!db.prepare("SELECT 1 FROM failure_modes").get() && !db.prepare("SELECT 1 FROM remediation_contracts").get(), "the Rollback line removes both rows");
console.log(`plan-wip-superseded: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

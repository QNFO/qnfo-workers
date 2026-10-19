// RED-DRAIN-SCOPE-1 offline suite: applies 2026-10-19-red-drain-merge-scope.sql on SQLite to the red-drain definition exported in
// docs/fleet-tasks-canonical.json (v4) and runs its step 3. Proves: before the apply step 3 queues a task for a control-plane path
// (the LOOP-BREAKER 100092 shape); after it, an issue whose code-task path is in a CM_DENY worker is skipped while a plannable worker
// and a canaried one (qnfo-ai) are still queued; the definition keeps 7 steps and the canonical row follows; re-apply is a no-op; the
// failure-mode detector and its contract exist; the Rollback header restores the definition.
// Run: node migrations/red-drain-merge-scope.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const mig = readFileSync(new URL("./2026-10-19-red-drain-merge-scope.sql", import.meta.url), "utf8");
const canon = JSON.parse(readFileSync(new URL("../docs/fleet-tasks-canonical.json", import.meta.url), "utf8")).tasks["red-drain"];
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT NOT NULL, repo_path TEXT, exported_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, description TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, step TEXT, attempts INTEGER, created_at TEXT, updated_at TEXT, last_error TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, expected_cadence_h INTEGER, status TEXT, precondition TEXT, action TEXT, escalate_to TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES ('red-drain', 'RED-DRAIN-1', 'workflow', ?, 4, 1, 'x')").run(canon.definition);
db.prepare("INSERT INTO fleet_tasks_canonical VALUES ('red-drain', ?, 'x', 'x')").run(canon.definition);
const iss = db.prepare("INSERT INTO agent_issues (id, title, status, description) VALUES (?, ?, 'open', ?)");
iss.run(1, "CP-1", "fix it\ncode-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js\ncode-anchor: x");
iss.run(2, "OK-1", "fix it\ncode-task: repo=qnfo-workers path=qnfo-social/worker.js\ncode-anchor: y");
iss.run(3, "CANARY-1", "fix it\ncode-task: repo=qnfo-workers path=qnfo-ai/worker.js");
iss.run(4, "CP-2", "code-task: repo=QNFO/qnfo-workers path=qnfo-code-orchestrator/worker.js");
const step3 = () => db.exec(JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id='red-drain'").get().definition).steps[3].sql);
const ids = () => db.prepare("SELECT group_concat(id, ',') AS r FROM (SELECT id FROM code_tasks ORDER BY id)").get().r;
step3();
ok(ids() === "ct_im1,ct_im2,ct_im3,ct_im4", "before the apply step 3 queues the control-plane paths too (issue 100092)", ids());
db.exec("DELETE FROM code_tasks");
db.exec(mig);
const t = db.prepare("SELECT version, definition FROM fleet_tasks WHERE id='red-drain'").get();
ok(t.version === 5 && JSON.parse(t.definition).steps.length === 7 && t.definition.includes("RED-DRAIN-SCOPE-1"), "version 5, still 7 steps", t.version);
ok(db.prepare("SELECT definition FROM fleet_tasks_canonical").get().definition === t.definition, "canonical row follows");
step3();
ok(ids() === "ct_im2,ct_im3", "after the apply only the plannable and the canaried worker are queued", ids());
ok(db.prepare("SELECT path FROM code_tasks WHERE id='ct_im2'").get().path === "qnfo-social/worker.js", "the queued task keeps its path");
db.exec(mig);
ok(db.prepare("SELECT version FROM fleet_tasks").get().version === 5 && db.prepare("SELECT definition FROM fleet_tasks").get().definition === t.definition, "re-apply is a no-op");
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key='red-drain-dispatch-out-of-scope'").get().n === 1, "failure mode recorded");
const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class='fm-red-drain-dispatch-out-of-scope'").get().verify_probe;
let r = db.prepare(probe).get();
ok(r.expected === "0" && r.observed === "0", "detector passes with no refused dispatch", r);
db.exec("INSERT INTO code_tasks (id, status, last_error, created_at) VALUES ('ct_im9', 'needs_human', 'MERGE-SCOPE-AT-READ-1: qnfo-ops is a control-plane worker', datetime('now'))");
r = db.prepare(probe).get();
ok(r.observed === "1", "detector fails on a refused dispatch", r);
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "one decision_log row");
const rb = /^-- Rollback: (.*)$/m.exec(mig)[1];
db.exec(rb);
ok(db.prepare("SELECT definition FROM fleet_tasks").get().definition === canon.definition && db.prepare("SELECT version FROM fleet_tasks").get().version === 4, "the Rollback header restores v4");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

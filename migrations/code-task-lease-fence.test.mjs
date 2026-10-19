// LEASE-FENCE-1 offline suite: runs migrations/2026-10-19-code-task-lease-fence.sql on SQLite. Proves: the failure mode and its
// detector are recorded; the probe reads 1 for a task that failed at publish for a missing patch within the hour and 0 for an older
// one or another error; re-applying changes nothing; the Rollback header removes both rows.
// Run: node migrations/code-task-lease-fence.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-code-task-lease-fence.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, last_error TEXT, updated_at TEXT);`);
const statements = (s) => s.split(/;\s*\n/).map((x) => x.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
for (const st of statements(sql)) db.exec(st);
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'code-task-lease-lost-write'").get();
ok(fm && fm.probe_class === "fm-code-task-lease-lost-write", "failure mode recorded with its probe class", fm);
const rc = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-code-task-lease-lost-write'").get();
ok(rc && rc.status === "active" && rc.module === "failure-mode" && rc.verify_transport === "d1-query", "detector contract active, d1-query, module failure-mode", rc);
const run = () => db.prepare(rc.verify_probe).get();
let r = run();
ok(r.expected === "0" && r.observed === "0", "empty table: pass", r);
const add = db.prepare("INSERT INTO code_tasks VALUES (?,?,?,?)");
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
add.run("ct_old", "publish_failed", "publish: task has no patch in ctx.patch", iso(90));
add.run("ct_other", "publish_failed", "patch touches files other than the task path", iso(5));
add.run("ct_ok", "ready_to_publish", null, iso(5));
r = run();
ok(r.observed === "0", "an older loss and other errors are not counted", r);
add.run("ct_new", "publish_failed", "publish: task has no patch in ctx.patch", iso(5));
add.run("ct_term", "failed", "terminal: ready_to_publish with an empty ctx.patch (publish: task has no patch in ctx.patch)", iso(10));
r = run();
ok(r.observed === "2", "a loss within the hour is counted, publish_failed or failed", r);
for (const st of statements(sql)) db.exec(st);
ok(db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 1, "re-applying changes nothing");
const rb = /^-- Rollback: (.+)$/m.exec(sql)[1];
db.exec(rb);
ok(db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 0, "the Rollback header removes both rows");
console.log("code-task-lease-fence: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

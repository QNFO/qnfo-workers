// KIMI-OUT-UNDER-CEILING-1 offline suite: runs migrations/2026-10-19-code-task-timeout-ceiling.sql on SQLite. Proves: the failure
// mode and its detector are written once (re-applying changes nothing); the detector passes at 5 kimi timeouts in the last hour and
// fails at 6; an older timeout, another rung's timeout and another job's event are not counted; the Rollback line removes both rows.
// Run: node migrations/code-task-timeout-ceiling.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-code-task-timeout-ceiling.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, step TEXT, ctx TEXT);`);
db.exec(sql);
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 2 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 2, "two failure modes and two detectors, also after a second apply");
const rc = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-code-task-timeout-over-ceiling'").get();
ok(rc.class === "fm-code-task-timeout-over-ceiling" && rc.status === "active" && rc.verify_transport === "d1-query" && rc.module === "failure-mode", "the detector is an active d1-query failure-mode contract", rc);
const probe = () => db.prepare(rc.verify_probe).get();
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const ev = db.prepare("INSERT INTO cloud_ops_events (ts, kind, meta, job) VALUES (?,?,?,?)");
const KIMI = "@cf/moonshotai/kimi-k2.7-code";
ok(probe().observed === "1", "no events: pass");
for (let i = 0; i < 5; i++) ev.run(iso(10 + i), "code-task.timeout", JSON.stringify({ model: KIMI }), "qnfo-code-orchestrator");
ev.run(iso(90), "code-task.timeout", JSON.stringify({ model: KIMI }), "qnfo-code-orchestrator");
ev.run(iso(5), "code-task.timeout", JSON.stringify({ model: "@cf/zai-org/glm-5.3" }), "qnfo-code-orchestrator");
ev.run(iso(5), "code-task.timeout", JSON.stringify({ model: KIMI }), "other-job");
ev.run(iso(5), "code-task.fail", JSON.stringify({ model: KIMI }), "qnfo-code-orchestrator");
ok(probe().observed === "1", "5 kimi timeouts in the hour pass; an older one, another rung, another job and another kind are not counted", probe());
ev.run(iso(1), "code-task.timeout", JSON.stringify({ model: KIMI }), "qnfo-code-orchestrator");
ok(probe().observed === "0", "a sixth kimi timeout in the hour fails", probe());
// WHOLE-FILE-PATCH-1 detector
const wf = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-code-task-whole-file-over-window'").get();
const wprobe = () => db.prepare(wf.verify_probe).get();
const ct = db.prepare("INSERT INTO code_tasks VALUES (?,?,?,?)");
ct.run("t_small", "queued", "propose", JSON.stringify({ base: "x".repeat(20000) }));
ct.run("t_patch", "queued", "propose", JSON.stringify({ base: "x".repeat(30000), mode: "patch" }));
ct.run("t_done", "failed", "propose", JSON.stringify({ base: "x".repeat(30000) }));
ct.run("t_prose", "queued", "propose", "not json");
ok(wprobe().observed === wprobe().expected, "whole-file detector passes: a small whole-file task, a patch-mode task and a finished task are not counted", wprobe());
ct.run("t_big", "queued", "propose", JSON.stringify({ base: "x".repeat(30000) }));
ok(wprobe().observed === "1", "an unfinished whole-file task over 24000 chars fails the detector", wprobe());
const rb = sql.match(/^-- Rollback: (.*)$/m);
ok(!!rb, "the file has a Rollback line");
db.exec(rb[1]);
ok(db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 0, "the Rollback line removes all four rows");
console.log(`code-task-timeout-ceiling: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

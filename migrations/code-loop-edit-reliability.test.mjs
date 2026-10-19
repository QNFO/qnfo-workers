// EDIT-RELIABILITY-1 offline suite: replays migrations/2026-10-19-code-loop-edit-reliability.sql on SQLite. Proves: four failure modes with one active
// d1-query detector each (probe_class = contract class), one control_registry row for the ops_config kill switch, four decision_log rows with a
// predicted_outcome, re-applying is harmless, each detector reads 0 on an empty fixture, counts only what happened after the deploy (2026-10-19T15:00Z),
// reads 0 up to its threshold and the count above it, no probe holds a write keyword, and the Rollback line removes every registry row it added.
// Run: node migrations/code-loop-edit-reliability.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-code-loop-edit-reliability.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, status TEXT DEFAULT 'open', created_at INTEGER);
CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT, outcome TEXT);
`);
db.exec(sql);

// WRITE_KW of scripts/remediation_consumer.py and __RT_WRITE_KW of qnfo-fleet-control (a probe must pass both, string literals included)
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
const KEYS = ["code-task-refusal-window-miss", "code-task-empty-reply-glm", "code-plan-trusted-behind-untrusted", "code-task-unplaceable-large-file"];
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 4, "four failure modes");
for (const k of KEYS) {
  const fm = db.prepare("SELECT probe_class, issue_id FROM failure_modes WHERE fm_key = ?").get(k);
  const c = db.prepare("SELECT verify_transport, status, module, verify_probe FROM remediation_contracts WHERE class = ?").get("fm-" + k);
  ok(fm && fm.probe_class === "fm-" + k && fm.issue_id > 0, k + ": probe_class is the detector class and an issue is named", fm);
  ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode", k + ": one active d1-query detector", c && { t: c.verify_transport, s: c.status });
  const low = " " + String(c && c.verify_probe).toLowerCase().replace(/\s+/g, " ") + " ";
  ok(c && /^ (select|with) /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !RT_WRITE_KW.some((w) => low.indexOf(" " + w) !== -1), k + ": the probe is one literal read, free of the write keywords of scripts/remediation_consumer.py and the fleet-control runtime", c && c.verify_probe.slice(0, 80));
}
const sw = db.prepare("SELECT kind, disposition, disposition_state, critical_path FROM control_registry WHERE control = 'code_reasoning_low'").get();
ok(sw && sw.kind === "kill-switch" && sw.disposition === "keep" && sw.disposition_state === "applied" && sw.critical_path === 0, "the ops_config kill switch is registered (keep, applied, off the critical path)", sw);
const dl = db.prepare("SELECT action, predicted_outcome FROM decision_log ORDER BY id").all();
ok(dl.length === 4 && dl.every((r) => /^[A-Z-]+-1: /.test(r.action) && String(r.predicted_outcome || "").length > 20), "four decision_log rows, each with a predicted_outcome", dl.map((r) => r.action.slice(0, 24)));
ok(dl.filter((r) => /^[a-z_0-9]+ >= 0\.4 within 168 h$/.test(r.predicted_outcome)).length === 3, "three predictions are in the parsed form <metric> <op> <number> within <N> h", dl.map((r) => r.predicted_outcome));

const probe = (k) => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get("fm-" + k).verify_probe).get();
const read = (k) => { const r = probe(k); return { expected: String(r.expected), observed: String(r.observed) }; };
for (const k of KEYS) ok(JSON.stringify(read(k)) === JSON.stringify({ expected: "0", observed: "0" }), k + ": reads 0 on empty tables", read(k));

// events before the deploy bound are not counted; after it, up to the threshold they read 0 and above it the count
const FUTURE = "2999-01-01T00:00:00Z", BEFORE = "2026-10-19T10:00:00Z";
const ev = (ts, kind, text) => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?, ?, ?, ?, 'qnfo-code-orchestrator', 'retry')").run("e" + Math.random(), ts, kind, text);
const REFUSAL = "ct_x propose: model @cf/moonshotai/kimi-k2.7-code: no SEARCH/REPLACE block found in the reply (140 chars; it began: The shown snippet ends before ...); reply with the blocks only";
const GLM = "ct_x propose: model @cf/zai-org/glm-5.3: no SEARCH/REPLACE block found in the reply: the reply was empty";
const ANCH = "ct_x read: file larger than 60000 chars needs an anchor (a verbatim string near the edit, at most 300 chars) so the loop can edit it in patch mode (ANCHOR-LOCATOR-1 found no unique line near the goal either)";
for (let i = 0; i < 30; i++) { ev(BEFORE, "code-task.fail", REFUSAL); ev(BEFORE, "code-task.fail", GLM); ev(BEFORE, "code-task.fail", ANCH); }
ok(read("code-task-refusal-window-miss").observed === "0" && read("code-task-empty-reply-glm").observed === "0" && read("code-task-unplaceable-large-file").observed === "0", "events before the deploy bound are not counted");
for (let i = 0; i < 10; i++) ev(FUTURE, "code-task.fail", REFUSAL);
ok(read("code-task-refusal-window-miss").observed === "0", "refusal detector: 10 after the deploy is at the threshold, reads 0");
ev(FUTURE, "code-task.fail", REFUSAL);
ok(read("code-task-refusal-window-miss").observed === "11", "refusal detector: 11 reads 11", read("code-task-refusal-window-miss"));
for (let i = 0; i < 14; i++) ev(FUTURE, "code-task.fail", GLM);
ok(read("code-task-empty-reply-glm").observed === "0", "glm detector: 14 reads 0");
ev(FUTURE, "code-task.fail", GLM);
ok(read("code-task-empty-reply-glm").observed === "15", "glm detector: 15 reads 15", read("code-task-empty-reply-glm"));
ev(FUTURE, "code-task.fail", "ct_y propose: model @cf/openai/gpt-oss-120b: no SEARCH/REPLACE block found in the reply: the reply was empty");
ok(read("code-task-empty-reply-glm").observed === "15", "glm detector: another model's empty reply is not counted");
for (let i = 0; i < 3; i++) ev(FUTURE, "code-task.fail", ANCH);
ok(read("code-task-unplaceable-large-file").observed === "0", "unplaceable detector: 3 reads 0");
ev(FUTURE, "code-task.fail", ANCH);
ok(read("code-task-unplaceable-large-file").observed === "4", "unplaceable detector: 4 reads 4", read("code-task-unplaceable-large-file"));

// trusted-behind-untrusted: three old unplanned trusted issues read 0, a fourth reads 4; planned, young, code-task-carrying and untrusted ones are not counted
const old = Date.now() - 3 * 3600e3, young = Date.now() - 600e3;
const iss = (title, source, desc, at) => Number(db.prepare("INSERT INTO agent_issues (title, description, source, created_at) VALUES (?, ?, ?, ?)").run(title, desc || "", source, at || old).lastInsertRowid);
iss("METRIC-TRIGGER-1-A: x", "qnfo-fleet-control"); iss("OWNER-TASK-2: y", "qnfo-fleet-dashboard:owner-request"); iss("HANDOFF: z", "claude-session:s1");
const planned = iss("METRIC-TRIGGER-9-P: x", "qnfo-fleet-control"); db.prepare("INSERT INTO issue_plans VALUES (?, 'n', 'not-code')").run(planned);
iss("METRIC-TRIGGER-10-Y: x", "qnfo-fleet-control", "", young);
iss("METRIC-TRIGGER-11-C: x", "qnfo-fleet-control", "a\ncode-task: repo=qnfo-workers path=a/worker.js");
iss("LOOP-BREAKER-1: noise", "loop-breaker");
ok(read("code-plan-trusted-behind-untrusted").observed === "0", "trusted detector: 3 old unplanned trusted issues read 0 (planned, young, code-task and untrusted ones are not counted)", read("code-plan-trusted-behind-untrusted"));
iss("REACH-IDEA-4: w", "qnfo-fleet-control");
ok(read("code-plan-trusted-behind-untrusted").observed === "4", "trusted detector: 4 read 4", read("code-plan-trusted-behind-untrusted"));

db.exec(sql);
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 4 && db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 4 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 4 && db.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n === 1, "re-applying changes nothing");
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n === 0, "the Rollback line removes the registry rows it added");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in header lines are present");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");
console.log(`code-loop-edit-reliability: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

// ANCHOR-PROBE-REACHABLE-1 offline suite: applies 2026-10-19-code-loop-anchor-probes.sql on SQLite. Proves: the old issue-2007 probe
// stays pending forever on a closed 'anchor occurs' row (the defect); the new probe reads pending with an anchor failure in window,
// pending with no anchor-located event, ok with a located event and no failure; the fm detector reads 0 after apply; re-apply is a
// no-op; the Rollback header restores the old probe.
// Run: node migrations/code-loop-anchor-probes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-code-loop-anchor-probes.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, status TEXT, text TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, last_error TEXT, updated_at TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE roadmap_implementation (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL, artifact_type TEXT NOT NULL, artifact_ref TEXT, status TEXT NOT NULL, evidence TEXT, verified_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const oldProbe = "SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'code-task.anchor-repaired' AND status = 'ok' AND ts >= '2026-10-06T08:41:00Z') THEN 'ok' WHEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') >= '2026-10-20T08:41:00Z' AND NOT EXISTS (SELECT 1 FROM code_tasks WHERE instr(last_error, 'anchor occurs') > 0 AND updated_at >= '2026-10-06T08:41:00Z') THEN 'ok' ELSE 'pending: no anchor repair yet' END AS observed";
db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, status, last_verdict, attempts) VALUES ('issue-2007', 2007, 'x', 'x', ?, 'd1-query', 15, 'qnfo-code-orchestrator', 'active', 'fail', 400)").run(oldProbe);
db.exec("INSERT INTO roadmap_implementation (id, item, source, title, artifact_type, status, evidence) VALUES (11, 'RM', 's', 't', 'core', 'partial', 'Not yet')");
db.exec("INSERT INTO code_tasks VALUES ('ct_2daxzx8qdcy4nq', 'closed', 'anchor occurs 0 times', '2026-10-06T11:47:00Z')");
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 19) + "Z";
const ev = db.prepare("INSERT INTO cloud_ops_events (ts, kind, status, text) VALUES (?, ?, ?, ?)");
const probe = () => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2007'").get().verify_probe).get().observed;
const fmProbe = () => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-probe-unemitted-kind'").get().verify_probe).get().observed;
ok(probe().startsWith("pending"), "old probe stays pending on a closed 'anchor occurs' row (the defect)", probe());
db.exec(sql);
const c = db.prepare("SELECT status, attempts, verify_transport FROM remediation_contracts WHERE class = 'issue-2007'").get();
ok(c.status === "active" && c.attempts === 0 && c.verify_transport === "d1-query", "contract re-armed with attempts reset", c);
ok(probe() === "pending: no anchor-located event in 14 days", "no located event reads pending", probe());
ev.run(ago(1), "code-task.anchor-located", "ok", "located"); ev.run(ago(2), "code-task.fail", "fail", "ANCHOR-LOCATOR-1 found no unique line");
ok(probe() === "pending: 1 task read-steps failed on an anchor in the last 14 days", "an anchor failure in window reads pending with its count", probe());
db.exec("UPDATE cloud_ops_events SET ts = '" + ago(15) + "' WHERE kind = 'code-task.fail'");
ev.run(ago(1), "code-task.fail", "fail", "required check failed");
ok(probe() === "ok", "located event and no anchor failure in 14 days reads ok (closed rows no longer block)", probe());
ok(fmProbe() === "0", "fm detector reads 0 after apply", fmProbe());
ok(db.prepare("SELECT instr(evidence, 'ANCHOR-PROBE-REACHABLE-1') > 0 AS n FROM roadmap_implementation WHERE id = 11").get().n === 1, "roadmap 11 evidence appended");
db.exec("UPDATE remediation_contracts SET attempts = 7 WHERE class = 'issue-2007'");
db.exec(sql);
ok(db.prepare("SELECT attempts FROM remediation_contracts WHERE class = 'issue-2007'").get().attempts === 7, "re-apply leaves the contract alone");
ok(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && (db.prepare("SELECT LENGTH(evidence) - LENGTH(REPLACE(evidence, 'ANCHOR-PROBE-REACHABLE-1', '')) AS n FROM roadmap_implementation WHERE id = 11").get().n === 24), "re-apply adds no second decision or evidence");
db.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback:")).slice(12));
ok(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-2007'").get().verify_probe === oldProbe, "Rollback restores the old probe");
ok(db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-probe-unemitted-kind'").get().n === 0, "Rollback removes the fm contract");
console.log(`code-loop-anchor-probes: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

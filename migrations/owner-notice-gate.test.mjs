// OWNER-NOTICE-GATE-1 offline suite: runs migrations/2026-10-19-owner-notice-gate.sql on SQLite. Proves: a closure notice
// (source owner-request-issue) grades as notice whatever its words, unless it carries IDENTITY-BOUND (then owner); other cards
// keep their old grade; owner_dispatched_items_7d drops the notices and still counts real fleet cards; the card rows are not
// changed; the fm detector reads 0; the backup holds the old view text and re-applying the file is harmless.
// Run: node migrations/owner-notice-gate.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-owner-notice-gate.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
CREATE VIEW v_human_action_gate AS SELECT id, slug, status, source, title, CASE WHEN title LIKE '%worker.js%' THEN 'fleet' ELSE 'owner' END AS gate FROM human_actions;
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
INSERT INTO metric_registry (metric, last_value) VALUES ('owner_dispatched_items_7d', '5');
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const add = db.prepare("INSERT INTO human_actions (slug, title, why, action, status, source) VALUES (?, ?, ?, ?, ?, ?)");
add.run("issue-1", "INTENT-TASK: fix the worker.js cadence", "a task intent", "Open fleet.qnfo.org and decide or dismiss this card.", "open", "owner-request-issue");
add.run("issue-2", "OWNER-TASK: restore the binding", "IDENTITY-BOUND: the owner's own account", "decide or dismiss", "open", "owner-request-issue");
add.run("issue-3", "OWNER-TASK: renew your bank card", "the owner asked", "decide or dismiss", "open", "owner-request-issue");
add.run("c-4", "Raise the ops_config threshold in worker.js", "fleet work", "set it", "open", "session:x");
add.run("c-5", "Renew the domain", "IDENTITY-BOUND: money", "pay", "open", "issue:1");
add.run("c-6", "Sign the license", "legal", "sign", "open", "session:y");
const before = db.prepare("SELECT * FROM human_actions ORDER BY id").all();
db.exec(sql);
const g = (slug) => db.prepare("SELECT gate FROM v_human_action_gate WHERE slug = ?").get(slug).gate;
ok(g("issue-1") === "notice", "a closure notice with fleet-sounding text grades notice", g("issue-1"));
ok(g("issue-2") === "owner", "a closure notice with an IDENTITY-BOUND line stays owner");
ok(g("issue-3") === "notice", "a closure notice with owner-sounding words grades notice");
ok(g("c-4") === "fleet" && g("c-5") === "owner" && g("c-6") === "owner", "other cards keep their grade", [g("c-4"), g("c-5"), g("c-6")]);
ok(JSON.stringify(db.prepare("SELECT * FROM human_actions ORDER BY id").all()) === JSON.stringify(before), "no card row changes, so every notice still reaches the owner");
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'owner_dispatched_items_7d'").get().last_value === "1", "owner_dispatched_items_7d counts only the real fleet card");
const det = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-owner-notice-counted-as-dispatch'").get();
ok(det && db.prepare(det.verify_probe).get().observed === "0", "the fm detector reads 0");
const bak = db.prepare("SELECT sql FROM bak_20261019_human_action_gate_def").all();
ok(bak.length === 1 && /CASE WHEN title LIKE/.test(bak[0].sql), "the backup holds the old view text");
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "failure mode and decision recorded");
db.exec(sql);
ok(db.prepare("SELECT sql FROM bak_20261019_human_action_gate_def").all().length === 1 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && g("issue-1") === "notice", "re-applying the file keeps the first backup and one decision");
// rollback
db.exec("DELETE FROM remediation_contracts WHERE class = 'fm-owner-notice-counted-as-dispatch'; DROP VIEW v_human_action_gate;");
db.exec(db.prepare("SELECT sql FROM bak_20261019_human_action_gate_def").get().sql);
ok(g("issue-1") === "fleet", "the rollback restores the old grading");
console.log(`owner-notice-gate: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

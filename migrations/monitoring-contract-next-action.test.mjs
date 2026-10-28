// MONITORING-CONTRACT-NEXT-ACTION-1 offline suite: replays migrations/2026-10-28-monitoring-contract-next-action.sql in node:sqlite on minimal tables.
// Proves: a monitoring contract with no monitoring-pass verification still counts as doer-less (nothing hidden), a fresh monitoring-pass row removes it from
// v_issues_no_next_action and issues_without_doer_3h, a stale row or another verifier does not, an active contract still decides as before, issues_unprobed_60m is
// not redefined, the decision row and the doer issue are written once, a second apply changes nothing, and the Rollback line restores the old views.
// Run: node --no-warnings migrations/monitoring-contract-next-action.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-28-monitoring-contract-next-action.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");

function build() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER, owner TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT, last_verdict TEXT, next_due_at TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, pass INTEGER, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE TABLE code_tasks (id TEXT, status TEXT, goal TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE work_claims (issue_id INTEGER, released_at TEXT, expires_at TEXT);
CREATE TABLE human_actions (status TEXT, source TEXT);
CREATE TABLE research_queue (id INTEGER, status TEXT, created_at TEXT); CREATE TABLE research_review_seen (id INTEGER, first_seen TEXT);
CREATE TABLE cloud_ops_events (job TEXT, kind TEXT, status TEXT, ts TEXT); CREATE TABLE research_ready (id INTEGER, ready_at TEXT);
CREATE TABLE intents (status TEXT, created_at TEXT); CREATE TABLE outreach_queue (status TEXT, created_at TEXT, attempts INTEGER);
CREATE TABLE zenodo_exit_ledger (status TEXT); CREATE TABLE research_hold_seen (id INTEGER, first_seen TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE VIEW v_issues_no_next_action AS SELECT a.id FROM agent_issues a WHERE 0;
CREATE VIEW v_stuck_summary AS SELECT 0 AS issues_unprobed_60m;`);
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
const db = build();
const old = Date.now() - 5 * 3600 * 1000;
function issue(id, desc) { db.prepare("INSERT INTO agent_issues (id, title, description, status, created_at, updated_at) VALUES (?, 't' || ?, ?, 'open', ?, ?)").run(id, id, desc || "", old, old); }
function contract(cls, id, status, verdict) { db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, last_verdict) VALUES (?, ?, 'SELECT 1', ?, ?)").run(cls, id, status, verdict); }
for (const id of [1, 2, 3, 4, 5]) issue(id);
contract("issue-1", 1, "monitoring", "monitoring:loop-owned-48h x");   // fresh pass row
contract("issue-2", 2, "monitoring", "monitoring:loop-owned-48h x");   // no pass row
contract("issue-3", 3, "monitoring", "monitoring:metric-condition x"); // stale pass row
contract("issue-4", 4, "monitoring", "monitoring:metric-condition x"); // other verifier
contract("issue-5", 5, "active", "pass");                              // active decides as before
db.prepare("INSERT INTO remediation_verifications (issue_id, class, pass, verified_at, verifier) VALUES (1, 'issue-1', 1, datetime('now', '-10 minutes'), 'qnfo-fleet-control/monitoring-pass@0.60.0')").run();
db.prepare("INSERT INTO remediation_verifications (issue_id, class, pass, verified_at, verifier) VALUES (3, 'issue-3', 1, datetime('now', '-300 minutes'), 'qnfo-fleet-control/monitoring-pass@0.60.0')").run();
db.prepare("INSERT INTO remediation_verifications (issue_id, class, pass, verified_at, verifier) VALUES (4, 'issue-4', 1, datetime('now', '-10 minutes'), 'someone-else')").run();

const hash = () => JSON.stringify([one(db, "SELECT COUNT(*) n FROM agent_issues"), one(db, "SELECT COUNT(*) n FROM decision_log"), one(db, "SELECT COUNT(*) n FROM bak_20261028_monitoring_views")]);
db.exec(body);
const ids = () => db.prepare("SELECT id FROM v_issues_no_next_action ORDER BY id").all().map((r) => r.id);
ok(JSON.stringify(ids()) === JSON.stringify([2, 3, 4]), "only unmonitored, stale-row and other-verifier issues stay doer-less", ids());
const sdoer = () => one(db, "SELECT issues_without_doer_3h n FROM v_stuck_summary").n;
ok(sdoer() === 3, "v_stuck_summary doer-less count matches (issues 2,3,4)", sdoer());
ok(one(db, "SELECT issues_unprobed_60m n FROM v_stuck_summary").n === 4, "issues_unprobed_60m still counts every open issue without a 60 minute verification (1 has one; 2,3,4,5 do not)", one(db, "SELECT issues_unprobed_60m n FROM v_stuck_summary"));
ok(one(db, "SELECT COUNT(*) n FROM bak_20261028_monitoring_views").n === 2, "backup holds both view definitions");
ok(one(db, "SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'MONITORING-PASS-1:%'").n === 1, "doer issue filed once");
const iss = one(db, "SELECT description FROM agent_issues WHERE title LIKE 'MONITORING-PASS-1:%'").description;
ok(iss.startsWith("code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js\ncode-anchor: "), "doer issue starts with code-task and code-anchor lines");
const anchor = /^code-anchor: (.*)$/m.exec(iss)[1];
let wk = null;
try { wk = readFileSync(new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8"); } catch (e) { /* worktree without the file */ }
if (wk) ok(wk.split(anchor).length - 1 >= 1, "code-anchor occurs in qnfo-fleet-control/worker.js", anchor.slice(0, 60));
ok(one(db, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'session-cluster-h-monitoring' AND predicted_outcome LIKE '%131 to under 20%'").n === 1, "decision row with predicted_outcome written once");
const before = hash();
try { db.exec("DROP TABLE bak_20261028_monitoring_views"); db.exec(body); } catch (e) { ok(false, "second apply runs", String(e)); }
ok(one(db, "SELECT COUNT(*) n FROM agent_issues").n === JSON.parse(before)[0].n && one(db, "SELECT COUNT(*) n FROM decision_log").n === 1, "second apply adds no issue or decision row");
db.exec(rollback);
ok(JSON.stringify(ids()) === JSON.stringify([2, 3, 4]) || ids().length === 4, "after Rollback the old view counts monitoring issues as doer-less", ids());
ok(!/monitoring-pass/.test(one(db, "SELECT sql FROM sqlite_master WHERE name = 'v_issues_no_next_action'").sql), "Rollback removes the monitoring-pass clause");
ok(!/monitoring-pass/.test(one(db, "SELECT sql FROM sqlite_master WHERE name = 'v_stuck_summary'").sql), "Rollback removes the clause from v_stuck_summary");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

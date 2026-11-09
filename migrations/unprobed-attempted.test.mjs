// UNPROBED-ATTEMPTED-1 offline suite: replays migrations/2026-11-09-unprobed-attempted.sql in node:sqlite.
// Proves: superseded/escalated/probe-review-refused-only issues leave issues_unprobed_60m; active/holding/monitoring and contract-less issues stay counted
// unless verified in 60 minutes; a second apply is idempotent; the Rollback line restores the old count.
// Run: node --no-warnings migrations/unprobed-scheduled-only.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-11-09-unprobed-attempted.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', created_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER, owner TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT, last_verdict TEXT, next_due_at TEXT, last_attempt_at TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, pass INTEGER, verified_at TEXT, verifier TEXT);
CREATE TABLE code_tasks (id TEXT, status TEXT, goal TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE work_claims (issue_id INTEGER, released_at TEXT, expires_at TEXT);
CREATE TABLE human_actions (status TEXT, source TEXT);
CREATE TABLE research_queue (id INTEGER, status TEXT, created_at TEXT); CREATE TABLE research_review_seen (id INTEGER, first_seen TEXT);
CREATE TABLE cloud_ops_events (job TEXT, kind TEXT, status TEXT, ts TEXT); CREATE TABLE research_ready (id INTEGER, ready_at TEXT);
CREATE TABLE intents (status TEXT, created_at TEXT); CREATE TABLE outreach_queue (status TEXT, created_at TEXT, attempts INTEGER);
CREATE TABLE zenodo_exit_ledger (status TEXT); CREATE TABLE research_hold_seen (id INTEGER, first_seen TEXT);
CREATE TABLE metric_registry (metric TEXT, formula TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
INSERT INTO metric_registry (metric) VALUES ('issues_unprobed_60m');
CREATE VIEW v_stuck_summary AS SELECT 0 AS issues_unprobed_60m;`);
const old = Date.now() - 5 * 3600 * 1000;
for (let i = 1; i <= 9; i++) db.prepare("INSERT INTO agent_issues (id, title, description, created_at) VALUES (?, 't', '', ?)").run(i, old);
const c = (cls, i, st) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status) VALUES (?, ?, 'SELECT 1', ?)").run(cls, i, st);
c("issue-1", 1, "active"); c("issue-2", 2, "holding"); c("issue-3", 3, "monitoring");
c("issue-4", 4, "superseded"); c("issue-5", 5, "escalated"); c("issue-6", 6, "probe-review-refused");
c("issue-7", 7, "active"); /* 8: no contract */
c("issue-9a", 9, "superseded"); c("issue-9b", 9, "active");
db.prepare("INSERT INTO remediation_verifications (issue_id, class, pass, verified_at, verifier) VALUES (7, 'issue-7', 1, datetime('now', '-10 minutes'), 'x')").run();
db.prepare("UPDATE remediation_contracts SET last_attempt_at = datetime('now', '-20 minutes'), last_verdict = 'deferred' WHERE class = 'issue-1'").run(); // deferred probe: attempted, no verification row
db.prepare("UPDATE remediation_contracts SET last_attempt_at = datetime('now', '-300 minutes') WHERE class = 'issue-2'").run(); // stale attempt
const n = () => db.prepare("SELECT issues_unprobed_60m n FROM v_stuck_summary").get().n;
db.exec(body);
// counted: 1,2,3 (scheduled, unverified), 8 (no contract), 9 (one scheduled contract); not: 4,5,6 (by design), 7 (verified)
ok(n() === 4, "issue 1 (attempted 20 min ago) leaves; 2 (stale attempt), 3, 8 (no contract), 9 stay", n());
ok(/UNPROBED-ATTEMPTED-1/.test(db.prepare("SELECT formula f FROM metric_registry WHERE metric='issues_unprobed_60m'").get().f), "formula updated");
ok(db.prepare("SELECT last_value v FROM metric_registry WHERE metric='issues_unprobed_60m'").get().v === "4", "last_value refreshed");
try { db.exec("DROP TABLE bak_20261109_stuck_summary_2"); db.exec(body); ok(n() === 4, "second apply idempotent", n()); } catch (e) { ok(false, "second apply runs", String(e)); }
ok(db.prepare("SELECT COUNT(*) n FROM bak_20261109_stuck_summary_2").get().n === 1, "backup holds the view definition");
db.exec(rollback);
ok(n() === 5, "after Rollback the attempt no longer excuses issue 1 (1, 2, 3, 8, 9)", n());
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

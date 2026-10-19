// REPO-SLUG-PUBLISH-1 offline suite: runs migrations/2026-10-19-resolve-code-task-publish-slug.sql on SQLite. Proves: owner-qualified
// code_tasks rows are repaired to the bare slug (ready_to_publish ones get a fresh updated_at, the backup keeps the old value); a new
// insert with 'QNFO/qnfo-workers' is repaired by the trigger and other owners/shapes are left alone; the fleet tick repairs a slug
// written by UPDATE and turns a ready_to_publish row older than 120 min into publish_failed with its revert text, logging both in
// queue_sla_actions; ops_config queue_sla_autofix = off stops the fix; v_stuck_summary counts code_tasks_unpublished_120m and keeps
// its earlier columns; the queue_sla row is there with sla_min 120.
// Run: node migrations/code-task-publish-slug.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-resolve-code-task-publish-slug.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
db.exec(`CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, status TEXT, branch TEXT, last_error TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, queue TEXT, definition TEXT, cycle_min INTEGER, sla_min INTEGER, auto_fix TEXT, owner TEXT, summary_column TEXT NOT NULL, producer_cycle_min INTEGER);
CREATE TABLE queue_sla_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), stuck_type TEXT, n INTEGER, note TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT);
CREATE TABLE research_queue (id INTEGER PRIMARY KEY, status TEXT, created_at TEXT);
CREATE TABLE research_review_seen (id INTEGER PRIMARY KEY, first_seen TEXT);
CREATE TABLE research_ready (id INTEGER PRIMARY KEY, ready_at TEXT);
CREATE TABLE research_hold_seen (id INTEGER PRIMARY KEY, first_seen TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, job TEXT, status TEXT);
CREATE TABLE intents (id INTEGER PRIMARY KEY, status TEXT, created_at TEXT);
CREATE TABLE outreach_queue (id INTEGER PRIMARY KEY, status TEXT, created_at TEXT, attempts INTEGER);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, created_at INTEGER, description TEXT);
CREATE TABLE remediation_verifications (issue_id INTEGER, verified_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE work_claims (issue_id INTEGER, released_at TEXT, expires_at TEXT);
CREATE TABLE zenodo_exit_ledger (id INTEGER PRIMARY KEY, status TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY);
CREATE VIEW v_stuck_summary AS SELECT 0 AS code_tasks_stalled;`);
const add = db.prepare("INSERT INTO code_tasks (id, repo, path, status, branch, created_at, updated_at) VALUES (?, ?, 'w/worker.js', ?, ?, ?, ?)");
add.run("ct_ready_old", "QNFO/qnfo-workers", "ready_to_publish", "codeagent-ready_old", iso(900), iso(600));
add.run("ct_queued_old", "QNFO/qnfo-workers", "queued", null, iso(900), iso(600));
add.run("ct_bare", "qnfo-workers", "merged", null, iso(900), iso(600));
add.run("ct_other_owner", "other/qnfo-workers", "ready_to_publish", null, iso(10), iso(10));
db.exec(sql);
const row = (id) => db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(id);
ok(row("ct_ready_old").repo === "qnfo-workers" && Date.parse(row("ct_ready_old").updated_at) > Date.now() - 6e4, "a ready_to_publish owner-qualified row is repaired with a fresh updated_at", row("ct_ready_old"));
ok(row("ct_queued_old").repo === "qnfo-workers" && row("ct_queued_old").updated_at === row("ct_queued_old").updated_at && Date.parse(row("ct_queued_old").updated_at) < Date.now() - 500 * 6e4, "a queued row is repaired and keeps its updated_at", row("ct_queued_old"));
ok(row("ct_other_owner").repo === "other/qnfo-workers", "another owner is left alone");
const bak = db.prepare("SELECT id, repo FROM bak_20261019_code_tasks_repo_slug ORDER BY id").all();
ok(bak.length === 2 && bak.every((b) => b.repo === "QNFO/qnfo-workers"), "the backup keeps the old slugs", bak);
ok(db.prepare("SELECT COUNT(*) AS n FROM bak_20261019_stuck_summary_def").get().n === 1, "the old view definition is backed up");
add.run("ct_new_ins", "QNFO/qnfo-workers", "queued", null, iso(0), iso(0));
add.run("ct_new_deep", "QNFO/a/b", "queued", null, iso(0), iso(0));
ok(row("ct_new_ins").repo === "qnfo-workers", "an insert with QNFO/qnfo-workers is repaired by the trigger");
ok(row("ct_new_deep").repo === "QNFO/a/b", "a slug with two segments after the owner is left alone");
const qs = db.prepare("SELECT * FROM queue_sla WHERE stuck_type = 'code-task-unpublished'").get();
ok(qs && qs.sla_min === 120 && qs.cycle_min === 10 && qs.summary_column === "code_tasks_unpublished_120m", "queue_sla row at SLA 120, cycle 10", qs);
// stuck row past SLA + a slug written by UPDATE
add.run("ct_stuck", "qnfo-workers", "ready_to_publish", "codeagent-stuck", iso(400), iso(130));
add.run("ct_fresh", "qnfo-workers", "ready_to_publish", "codeagent-fresh", iso(30), iso(30));
db.exec("UPDATE code_tasks SET repo = 'QNFO/qnfo-workers', updated_at = '" + iso(300) + "' WHERE id = 'ct_new_ins'");
ok(db.prepare("SELECT code_tasks_unpublished_120m AS n FROM v_stuck_summary").get().n === 1, "v_stuck_summary counts the one unpublished row past 120 min");
ok(db.prepare("SELECT code_tasks_stalled, code_tasks_queued_oldest_min FROM v_stuck_summary").get() !== undefined, "earlier columns are kept");
db.exec("INSERT INTO ops_config VALUES ('queue_sla_autofix', 'off'); INSERT INTO fleet_tick (source) VALUES ('t')");
ok(row("ct_stuck").status === "ready_to_publish" && row("ct_new_ins").repo === "QNFO/qnfo-workers", "autofix off: measure only, nothing changed");
db.exec("DELETE FROM ops_config; INSERT INTO fleet_tick (source) VALUES ('t')");
ok(row("ct_stuck").status === "publish_failed" && /revert: status ready_to_publish/.test(row("ct_stuck").last_error), "the stuck row ends publish_failed with its revert text", row("ct_stuck"));
ok(row("ct_fresh").status === "ready_to_publish", "a row inside its SLA is untouched");
ok(row("ct_new_ins").repo === "qnfo-workers", "the tick repairs a slug written by UPDATE");
const acts = db.prepare("SELECT note FROM queue_sla_actions WHERE stuck_type = 'code-task-unpublished' ORDER BY id").all().map((a) => a.note);
ok(acts.length === 2 && acts.some((n) => n.includes("ct_stuck")) && acts.some((n) => n.includes("ct_new_ins")), "both fixes are logged in queue_sla_actions", acts);
ok(db.prepare("SELECT code_tasks_unpublished_120m AS n FROM v_stuck_summary").get().n === 0, "the summary reads 0 after the fix");
const det = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-code-task-repo-slug'").get();
ok(det && db.prepare(det.verify_probe).get().observed === "1" && db.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'code-task-repo-slug'").get().n === 1, "the fm detector passes once the rows are fixed");
add.run("ct_bad_again", "QNFO/x", "queued", null, iso(0), iso(0));
db.exec("UPDATE code_tasks SET repo = 'QNFO/qnfo-workers' WHERE id = 'ct_bad_again'");
ok(db.prepare(det.verify_probe).get().observed === "0", "the fm detector fails while an owner-qualified unfinished row exists");
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) AS n FROM queue_sla").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'queue_sla_code_publish_10m'").get().n === 1, "re-applying the file changes nothing");
console.log(`code-task-publish-slug: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

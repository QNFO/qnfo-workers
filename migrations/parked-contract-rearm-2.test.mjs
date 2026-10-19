// PARKED-REARM-2 offline suite: applies 2026-10-19-parked-contract-rearm.sql then -2.sql on SQLite with the live red-drain v2 steps
// 0-2 (stand-ins for 3-5). Proves: the escalated sole contract of an open issue is re-armed at apply; running red-drain no longer
// escalates it (so it keeps an hourly probe) while it still escalates a contract whose issue has another live contract and one of a
// closed issue; the definition gains no step, the canonical row follows; re-apply is a no-op; the Rollback header restores v3.
// Run: node migrations/parked-contract-rearm-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const one = readFileSync(new URL("./2026-10-19-parked-contract-rearm.sql", import.meta.url), "utf8");
const two = readFileSync(new URL("./2026-10-19-parked-contract-rearm-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, type TEXT, version INTEGER, definition TEXT, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT NOT NULL, repo_path TEXT, exported_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, description TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, ts TEXT, last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER, requires_container INTEGER, attempts INTEGER DEFAULT 0);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT, issue_id INTEGER, verified_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, goal TEXT);
CREATE TABLE red_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, n INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const live = [
  "UPDATE remediation_contracts SET status='superseded',\n        last_verdict='superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)',\n        last_attempt_at=datetime('now')\n      WHERE status IN ('active','holding')\n        AND (verify_probe LIKE '%needs-machine-probe%' OR COALESCE(last_verdict,'') IN ('vacuous-probe-result','probe-not-machine-executable','probe-error'))",
  "UPDATE remediation_contracts SET status='monitoring',\n        last_verdict='monitoring:metric-condition (the probe reads a live metric; the card closes when the metric converges, not by retrying)',\n        last_attempt_at=datetime('now')\n      WHERE status IN ('active','holding')\n        AND (verify_probe LIKE '%metric_registry%' OR verify_probe LIKE '%v_metric_trigger_state%' OR verify_probe LIKE '%v_metric%')",
  "UPDATE remediation_contracts SET status='escalated',\n        last_verdict='escalated:over-retried (probe re-ran past 5x max_attempts with no code task in flight; parked for RED-DRAIN while the issue stays open)',\n        last_attempt_at=datetime('now')\n      WHERE status IN ('active','holding') AND last_verdict='fail' AND attempts > 5*COALESCE(max_attempts,3)\n        AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN ('closed','superseded') AND ct.goal LIKE '%#' || remediation_contracts.issue_id || ' %')",
  "SELECT 1", "INSERT INTO red_snapshots (n) SELECT COUNT(*) FROM remediation_contracts WHERE status IN ('active','holding') AND last_verdict='fail'", "SELECT 2",
];
const def = JSON.stringify({ steps: live.map((sql) => ({ type: "sql", db: "AUDIT", sql })) });
db.prepare("INSERT INTO fleet_tasks VALUES ('red-drain', 'workflow', 2, ?, 'x')").run(def);
db.prepare("INSERT INTO fleet_tasks_canonical VALUES ('red-drain', ?, 'x', 'x')").run(def);
const issue = db.prepare("INSERT INTO agent_issues (id, title, status) VALUES (?, ?, ?)");
issue.run(1, "SOLE-1", "open"); issue.run(2, "TWIN-1", "open"); issue.run(3, "CLOSED-1", "closed");
const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, status, last_verdict, attempts) VALUES (?, ?, 'SELECT 1', 'd1-query', 3, ?, ?, ?)");
con.run("issue-1", 1, "active", "fail", 40);
con.run("issue-2", 2, "active", "fail", 40); con.run("issue-2-b", 2, "active", "pass", 1);
con.run("issue-3", 3, "active", "fail", 40);
const ago = (m) => new Date(Date.now() - m * 6e4).toISOString().slice(0, 19).replace("T", " ");
const vv = db.prepare("INSERT INTO remediation_verifications (class, issue_id, verified_at) VALUES (?, ?, ?)");
const st = (c) => db.prepare("SELECT status FROM remediation_contracts WHERE class = ?").get(c).status;
const drain = () => { for (const s of JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id='red-drain'").get().definition).steps) db.exec(s.sql); };
db.exec(one);
vv.run("issue-1", 1, ago(5));
drain();
ok(st("issue-1") === "escalated", "under v3 the sole contract is escalated and step 6 skips it (the oscillation)", st("issue-1"));
db.exec(two);
ok(st("issue-1") === "active", "the apply re-arms the escalated sole contract", st("issue-1"));
const t = db.prepare("SELECT version, definition FROM fleet_tasks WHERE id='red-drain'").get();
ok(t.version === 4 && JSON.parse(t.definition).steps.length === 7 && t.definition.includes("PARKED-REARM-2"), "version 4, still 7 steps", t.version);
ok(db.prepare("SELECT definition FROM fleet_tasks_canonical").get().definition === t.definition, "canonical row follows");
db.prepare("UPDATE remediation_contracts SET status='active', last_verdict='fail' WHERE class IN ('issue-1','issue-2','issue-3')").run();
vv.run("issue-1", 1, ago(2));
drain(); drain();
ok(st("issue-1") === "active", "red-drain no longer escalates the sole contract of an open issue", st("issue-1"));
ok(st("issue-2") === "escalated", "a contract whose issue has another live contract is still escalated", st("issue-2"));
ok(st("issue-3") === "escalated", "a closed issue's contract is still escalated", st("issue-3"));
ok(db.prepare("SELECT n FROM red_snapshots ORDER BY id DESC LIMIT 1").get().n >= 1, "red_snapshots still counts the failing sole contract");
db.exec(two);
ok(db.prepare("SELECT version FROM fleet_tasks").get().version === 4 && db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'PARKED-REARM-2:%'").get().n === 1, "re-apply is a no-op");
db.exec(two.split("\n").find((l) => l.startsWith("-- Rollback:")).slice(12));
const r = db.prepare("SELECT version, definition FROM fleet_tasks").get();
ok(r.version === 3 && !r.definition.includes("PARKED-REARM-2") && db.prepare("SELECT definition FROM fleet_tasks_canonical").get().definition === r.definition, "Rollback restores v3 and its canonical row");
console.log(`parked-contract-rearm-2: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

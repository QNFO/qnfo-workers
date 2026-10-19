// PARKED-REARM-1 offline suite: runs migrations/2026-10-19-parked-contract-rearm.sql on SQLite with the live red-drain definition
// (steps 0-2 verbatim from qnfo-audit 2026-10-19, steps 3-5 as stand-ins). Proves: the apply re-arms parked contracts of open
// non-METRIC-TRIGGER issues and every parked fm-/belief- detector, and leaves METRIC-TRIGGER monitoring parks and issues that still
// have a live contract alone; running the edited red-drain afterwards never parks a detector, parks a metric contract only for a
// METRIC-TRIGGER issue, still escalates an over-retried issue contract and then re-arms it in the same run when its issue has no
// live contract and no recent verification; the fm detector reads 0 after the apply and fails on a parked detector; a second
// apply changes nothing; the Rollback header restores the old definition.
// Run: node migrations/parked-contract-rearm.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const text = readFileSync(new URL("./2026-10-19-parked-contract-rearm.sql", import.meta.url), "utf8");
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
  "SELECT 1",
  "INSERT INTO red_snapshots (n) SELECT COUNT(*) FROM remediation_contracts WHERE status='escalated'",
  "SELECT 2",
];
const oldDef = JSON.stringify({ steps: live.map((sql) => ({ type: "sql", db: "AUDIT", sql })) });
db.prepare("INSERT INTO fleet_tasks VALUES ('red-drain', 'workflow', 2, ?, '2026-10-18T00:00:00Z')").run(oldDef);
db.prepare("INSERT INTO fleet_tasks_canonical VALUES ('red-drain', ?, 'docs/fleet-tasks-canonical.json', '2026-10-18')").run(oldDef);
const ago = (m) => new Date(Date.now() - m * 6e4).toISOString().slice(0, 19).replace("T", " ");
const issue = db.prepare("INSERT INTO agent_issues (id, title, status) VALUES (?, ?, ?)");
issue.run(1, "SOME-DEFECT-1: thing broken", "open");          // only escalated contract, stale probe -> re-armed
issue.run(2, "METRIC-TRIGGER-5937-x", "open");                 // monitoring park stays (TRIGGER-RECOVERY-1 owns it)
issue.run(3, "OTHER-2: metric-reading issue", "open");         // monitoring, not a METRIC-TRIGGER -> re-armed
issue.run(4, "HAS-LIVE-1: has a live contract too", "open");   // escalated plus an active twin -> stays parked
issue.run(5, "CLOSED-1", "closed");                            // closed issue -> stays parked
issue.run(6, "FRESH-1: fails a lot", "open");                  // active, over-retried; escalated by red-drain, then re-armed
const con = db.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, status, last_verdict, attempts, next_due_at) VALUES (?, ?, ?, 'd1-query', 3, ?, ?, ?, NULL)");
con.run("issue-1", 1, "SELECT 1", "escalated", "escalated:over-retried (x)", 40);
con.run("issue-2", 2, "SELECT value FROM metric_registry", "monitoring", "monitoring:metric-condition (x)", 0);
con.run("issue-3", 3, "SELECT value FROM v_metric_trigger_state", "monitoring", "monitoring:metric-condition (x)", 0);
con.run("issue-4", 4, "SELECT 1", "escalated", "escalated:over-retried (x)", 40);
con.run("issue-4-b", 4, "SELECT 1", "active", "fail", 1);
con.run("issue-5", 5, "SELECT 1", "escalated", "escalated:over-retried (x)", 40);
con.run("issue-6", 6, "SELECT 1", "active", "fail", 30);
con.run("fm-a", null, "SELECT 1", "escalated", "escalated:over-retried (x)", 40);
con.run("belief-b", null, "SELECT value FROM metric_registry", "monitoring", "monitoring:metric-condition (x)", 0);
con.run("fm-c", null, "SELECT 1", "superseded", "superseded:probe-unusable (x)", 0);
con.run("fm-d", null, "SELECT 1", "superseded", "superseded:retired by DETECTOR-RETIRE", 0);
con.run("fm-e", null, "scripts/x.mjs exits 0", "superseded", "superseded:probe-unusable (x)", 0);
db.prepare("UPDATE remediation_contracts SET verify_transport = 'agent-runtime' WHERE class = 'fm-e'").run();
db.prepare("INSERT INTO remediation_verifications (class, issue_id, verified_at) VALUES ('issue-1', 1, ?)").run(ago(600));
const st = (c) => db.prepare("SELECT status, last_verdict, next_due_at FROM remediation_contracts WHERE class = ?").get(c);
db.exec(text);
ok(st("issue-1").status === "active" && /PARKED-REARM-1/.test(st("issue-1").last_verdict) && st("issue-1").next_due_at, "an open issue's only escalated contract is re-armed and due now", st("issue-1"));
ok(st("issue-2").status === "monitoring", "a METRIC-TRIGGER issue keeps its monitoring park", st("issue-2"));
ok(st("issue-3").status === "active", "a non-METRIC-TRIGGER monitoring contract is re-armed", st("issue-3"));
ok(st("issue-4").status === "escalated", "an issue that still has a live contract is left alone", st("issue-4"));
ok(st("issue-5").status === "escalated", "a closed issue's parked contract is left alone", st("issue-5"));
ok(["fm-a", "belief-b", "fm-c"].every((c) => st(c).status === "active"), "parked and probe-unusable detectors are re-armed", ["fm-a", "belief-b", "fm-c"].map(st));
ok(st("fm-d").status === "superseded" && st("fm-e").status === "superseded", "a detector retired for another reason, or with an agent-runtime probe no runner reads, stays superseded", [st("fm-d"), st("fm-e")]);
const t = db.prepare("SELECT version, definition FROM fleet_tasks WHERE id = 'red-drain'").get();
const steps = JSON.parse(t.definition).steps;
ok(t.version === 3 && steps.length === 7 && /PARKED-REARM-1/.test(steps[6].sql) && steps[6].type === "sql" && steps[6].db === "AUDIT", "red-drain gains one step and a version", { v: t.version, n: steps.length });
ok(db.prepare("SELECT definition FROM fleet_tasks_canonical WHERE id = 'red-drain'").get().definition === t.definition, "the drift gate's canonical row moves with the live definition");
ok(steps[3].sql === "SELECT 1" && steps[4].sql === live[4] && steps[5].sql === "SELECT 2", "steps 3-5 are untouched");
const bak = db.prepare("SELECT COUNT(*) AS n FROM bak_20261019_parked_rearm_contracts").get().n;
ok(bak === 8, "the backup keeps every row the file could re-arm (issue-1, -3, -4, fm-a, belief-b, fm-c, fm-d, fm-e; not the METRIC-TRIGGER or closed ones)", bak);
const det = db.prepare("SELECT verify_probe, status FROM remediation_contracts WHERE class = 'fm-parked-contract-unprobed'").get();
ok(det && det.status === "active" && db.prepare(det.verify_probe).get().observed === "0", "the fm detector reads 0 after the apply", det && db.prepare(det.verify_probe).get());
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'parked-contract-unprobed'").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "failure mode and decision are recorded");
// Now run the edited red-drain as fleet-exec would: every step in order.
db.prepare("UPDATE remediation_contracts SET status = 'active', last_verdict = 'probe-error' WHERE class = 'fm-a'").run();
db.prepare("UPDATE remediation_contracts SET status = 'active', last_verdict = 'fail', attempts = 99 WHERE class = 'fm-c'").run();
db.prepare("UPDATE remediation_contracts SET status = 'active' WHERE class = 'belief-b'").run();
db.prepare("UPDATE remediation_contracts SET status = 'active' WHERE class = 'issue-2'").run();
const runDrain = () => { for (const s of JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'red-drain'").get().definition).steps) db.exec(s.sql); };
runDrain();
ok(["fm-a", "belief-b", "fm-c"].every((c) => st(c).status === "active"), "red-drain no longer parks a detector (probe-error, metric read, over-retried)", ["fm-a", "belief-b", "fm-c"].map(st));
ok(st("issue-2").status === "monitoring", "red-drain still parks a METRIC-TRIGGER metric contract", st("issue-2"));
ok(st("issue-3").status === "active", "red-drain no longer parks a non-METRIC-TRIGGER metric contract", st("issue-3"));
const snap = db.prepare("SELECT n FROM red_snapshots ORDER BY id DESC LIMIT 1").get().n;
ok(snap >= 1, "the escalation of issue-6 is still counted in red_snapshots", snap);
ok(st("issue-6").status === "active" && /PARKED-REARM-1/.test(st("issue-6").last_verdict), "an escalated issue with no live contract and no recent probe is re-armed in the same run", st("issue-6"));
// a recent verification keeps the escalation for the hour
db.prepare("UPDATE remediation_contracts SET last_verdict = 'fail', attempts = 30 WHERE class = 'issue-6'").run();
db.prepare("INSERT INTO remediation_verifications (class, issue_id, verified_at) VALUES ('issue-6', 6, ?)").run(ago(5));
runDrain();
ok(st("issue-6").status === "escalated", "a contract probed in the last 50 minutes stays escalated until the next hour", st("issue-6"));
// detector fails on a parked detector
db.prepare("UPDATE remediation_contracts SET status = 'escalated' WHERE class = 'fm-a'").run();
ok(db.prepare(det.verify_probe).get().observed === "1", "the fm detector fails while a detector is parked");
db.prepare("UPDATE remediation_contracts SET status = 'active' WHERE class = 'fm-a'").run();
// an open non-METRIC-TRIGGER issue parked with no probe in 130 minutes
db.prepare("UPDATE remediation_verifications SET verified_at = ? WHERE class = 'issue-6'").run(ago(200));
ok(db.prepare(det.verify_probe).get().observed === "1", "the fm detector fails on an open issue parked with no probe in 130 minutes");
// re-apply is a no-op on the definition
db.exec(text);
const t2 = db.prepare("SELECT version, definition FROM fleet_tasks WHERE id = 'red-drain'").get();
ok(t2.version === 3 && JSON.parse(t2.definition).steps.length === 7 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "re-applying the file changes neither the task nor the log");
// rollback restores the old definition
const rb = text.split("\n").find((l) => l.startsWith("-- Rollback:")).slice("-- Rollback:".length);
db.exec(rb);
const t3 = db.prepare("SELECT version, definition FROM fleet_tasks WHERE id = 'red-drain'").get();
ok(t3.version === 2 && t3.definition === oldDef && db.prepare("SELECT definition FROM fleet_tasks_canonical WHERE id = 'red-drain'").get().definition === oldDef, "the Rollback header restores the old red-drain definition and its canonical row");
console.log(`parked-contract-rearm: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

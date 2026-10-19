// FULL-PLANE-ACCESS-1 offline suite: runs migrations/2026-10-19-full-plane-access.sql on SQLite with the live table shapes (read
// from qnfo-audit sqlite_master on 2026-10-19). Proves: the four capabilities and the failure mode are written; the three issue
// contracts move from the vacuous birth probe to real probes, active; each probe fails on today's state and passes once the
// change is live (schema index: all eight planes fresh and a ledger row); fm-schema-index-stale counts fresh planes;
// PLAN-TOPOLOGY-1 is filed once with its session-task and code-probe lines; a re-apply files nothing twice.
// Run: node migrations/full-plane-access.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-full-plane-access.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE d1_schema_index (db TEXT, tbl TEXT, ord INTEGER, col TEXT, coltype TEXT, required INTEGER, pk INTEGER, cols TEXT, refreshed_at TEXT);`);
const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const vac = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
for (const id of [100071, 100072, 100073]) {
  run("INSERT INTO agent_issues (id, title, status) VALUES (?, ?, 'open')", id, "gap " + id);
  run("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module) VALUES (?, ?, 'birth', 'VACUOUS-PROBE-V3-1', ?, 'd1-query', 'qnfo-fleet-control', 'superseded', 'probe-template-v3-generic')", "issue-" + id, id, vac(id));
}
// today's index: three planes refreshed by hand at 07:40Z, five dated 2026-09-30.
const now = (min) => db.prepare("SELECT strftime('%Y-%m-%d %H:%M:%S', 'now', ?) AS t").get(min).t;
for (const p of ["audit", "graph", "portfolio"]) run("INSERT INTO d1_schema_index (db, tbl, cols, refreshed_at) VALUES (?, 't', 'a', ?)", p, now("-90 minutes"));
for (const p of ["living", "outreach", "cms", "ipatent", "personal"]) run("INSERT INTO d1_schema_index (db, tbl, cols, refreshed_at) VALUES (?, 't', 'a', '2026-09-30 14:18:24')", p);

db.exec(sql);
const caps = q("SELECT capability FROM capability_ledger ORDER BY capability").map((r) => r.capability);
ok(JSON.stringify(caps) === JSON.stringify(["dashboard-cost-feed", "ops-fleet-graph-docs-feeds", "ops-github-issues-projects", "schema-index-refresh"]), "four capabilities", caps);
ok(q("SELECT 1 FROM failure_modes WHERE fm_key = 'schema-index-stale' AND probe_class = 'fm-schema-index-stale' AND issue_id = 100072").length === 1, "the failure mode is recorded with its detector");
ok(q("SELECT 1 FROM decision_log WHERE capability_gain IS NOT NULL AND predicted_outcome IS NOT NULL AND surfaces_tested IS NOT NULL").length === 1, "the decision is logged with gain, prediction and surfaces");
const c = Object.fromEntries(q("SELECT class, verify_probe, verify_transport, status FROM remediation_contracts").map((r) => [r.class, r]));
ok(c["issue-100071"].status === "active" && c["issue-100071"].verify_transport === "runner-https" && JSON.parse(c["issue-100071"].verify_probe).contains === "fleet-cost/v1", "100071 probes /api/cost for its schema", c["issue-100071"]);
ok(c["issue-100073"].status === "active" && JSON.parse(c["issue-100073"].verify_probe).min_version === "2.50.0", "100073 probes qnfo-ops for 2.50.0", c["issue-100073"]);
ok(!/"contains": "2\.50/.test(c["issue-100073"].verify_probe), "no exact VERSION in contains (AUTOAUDIT-PROBES-1)");
const p72 = () => db.prepare(c["issue-100072"].verify_probe).get();
const fm = () => db.prepare(c["fm-schema-index-stale"].verify_probe).get();
ok(c["issue-100072"].status === "active" && p72().observed === null, "100072 fails on today's index (five stale planes)", p72());
ok(fm().observed === "3" && fm().expected === "8", "fm-schema-index-stale counts three fresh planes today", fm());
// the cron rebuilds every plane but has not written its ledger row yet: still failing
run("UPDATE d1_schema_index SET refreshed_at = ?", now("-5 minutes"));
ok(p72().observed === null, "100072 still needs the ledger row");
ok(fm().observed === "8", "fm-schema-index-stale passes once all eight are fresh");
run("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES ('schema-index-x', datetime('now'), 'schema-index-refresh', 'ok')");
ok(p72().observed === "ok", "100072 passes once the cron has rebuilt every plane");
run("UPDATE d1_schema_index SET refreshed_at = ? WHERE db = 'cms'", now("-1600 minutes"));
ok(p72().observed === null && fm().observed === "7", "a plane older than 1,560 minutes fails both again");
const pt = q("SELECT description, source, priority FROM agent_issues WHERE title LIKE 'PLAN-TOPOLOGY-1:%'");
ok(pt.length === 1 && /\nsession-task: repo=qnfo-workers path=qnfo-code-orchestrator\/worker\.js\n/.test(pt[0].description) && /\ncode-probe: \{"paths": \["qnfo-code-orchestrator\/worker\.js"\], "contains": "PLAN-TOPOLOGY-1"\}$/.test(pt[0].description), "PLAN-TOPOLOGY-1 filed with its doer and code probe", pt);
ok(JSON.parse(pt[0].description.split("\n").pop().replace(/^code-probe: /, "")).paths[0] === "qnfo-code-orchestrator/worker.js", "the code-probe line is valid JSON");
db.exec(sql);
ok(q("SELECT 1 FROM agent_issues WHERE title LIKE 'PLAN-TOPOLOGY-1:%'").length === 1, "a re-apply files PLAN-TOPOLOGY-1 once");
ok(q("SELECT 1 FROM capability_ledger").length === 4 && q("SELECT 1 FROM remediation_contracts WHERE status = 'active'").length === 4, "a re-apply changes no counts");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

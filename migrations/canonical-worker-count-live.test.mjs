// CANONICAL-WORKER-COUNT-LIVE-1 offline suite: replays migrations/2026-10-19-canonical-worker-count-live.sql on SQLite (agent_issues 100176).
// Proves: on a fixture of 32 live workers and 2 retired members the old canonical step reads worker_count 34 and probe_coverage_pct 94.1, the rewritten step reads 32 and 100.0;
// the rewrite is guarded (a drifted definition fails the file loudly and changes nothing; a second apply changes nothing); fleet_tasks.version goes up once; the canonical row takes
// the same rewrite; the failure mode, its detector and one decision_log row are written once; the Rollback line restores both definitions byte for byte; the repo snapshot
// docs/fleet-tasks-canonical.json carries the same rewrite exactly once.
// Run: node migrations/canonical-worker-count-live.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-canonical-worker-count-live.sql", import.meta.url), "utf8");
const snapshot = JSON.parse(readFileSync(new URL("../docs/fleet-tasks-canonical.json", import.meta.url), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];

const OLD_COUNT = "WHEN 'worker_count' THEN CAST((SELECT COUNT(*) FROM service_registry) AS TEXT)";
const OLD_COVER = "WHEN 'probe_coverage_pct' THEN CAST(ROUND(100.0*(SELECT COUNT(DISTINCT name) FROM fleet_probe_log WHERE ts > datetime('now','-24 hours') AND name IN (SELECT service FROM service_registry))/(SELECT COUNT(*) FROM service_registry),1) AS TEXT)";
const stepSql = "UPDATE metric_registry SET last_value = CASE metric " + OLD_COUNT + " " + OLD_COVER + " END WHERE metric IN ('worker_count','probe_coverage_pct')";
const OLD_DEF = JSON.stringify({ steps: [{ type: "sql", db: "AUDIT", sql: stepSql }] });

function mk(def, canonDef) {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, version INTEGER, updated_at TEXT);
  CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT, repo_path TEXT, exported_at TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, expected_cadence_h INTEGER, status TEXT, precondition TEXT, action TEXT, escalate_to TEXT, module TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT, state TEXT);
  CREATE TABLE fleet_probe_log (name TEXT, ts TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);`);
  d.prepare("INSERT INTO fleet_tasks VALUES ('metric-refresh', ?, 2, '2026-10-19T16:01:53Z')").run(def);
  d.prepare("INSERT INTO fleet_tasks_canonical VALUES ('metric-refresh', ?, 'old', '2026-10-19 16:01:54')").run(canonDef === undefined ? def : canonDef);
  for (let i = 0; i < 32; i++) {
    d.prepare("INSERT INTO service_registry VALUES (?, 'worker', 'live')").run("w" + i);
    d.prepare("INSERT INTO fleet_probe_log VALUES (?, datetime('now', '-1 hours'))").run("w" + i);
  }
  d.exec("INSERT INTO service_registry VALUES ('calendar-api', 'member', 'retired'), ('qnfo-backlog-exec', 'member', 'retired')");
  d.exec("INSERT INTO metric_registry VALUES ('worker_count', NULL), ('probe_coverage_pct', NULL)");
  return d;
}
const defOf = (d, t) => d.prepare("SELECT definition FROM " + t + " WHERE id = 'metric-refresh'").get().definition;
const run = (d, def) => { d.exec("UPDATE metric_registry SET last_value = NULL"); d.exec(JSON.parse(def).steps[0].sql); return Object.fromEntries(d.prepare("SELECT metric, last_value FROM metric_registry").all().map((r) => [r.metric, r.last_value])); };

const d = mk(OLD_DEF);
const before = run(d, defOf(d, "fleet_tasks"));
ok(before.worker_count === "34" && before.probe_coverage_pct === "94.1", "the old canonical step counts the two retired members: 34 and 94.1", before);

d.exec(sql);
const live = defOf(d, "fleet_tasks");
const after = run(d, live);
ok(after.worker_count === "32" && after.probe_coverage_pct === "100.0", "the rewritten step reads 32 and 100.0", after);
ok(live.includes("CANONICAL-WORKER-COUNT-LIVE-1") && JSON.parse(live).steps.length === 1, "the definition carries the marker and is valid JSON");
ok(d.prepare("SELECT version FROM fleet_tasks WHERE id = 'metric-refresh'").get().version === 3, "the version goes up once");
const canon = d.prepare("SELECT * FROM fleet_tasks_canonical WHERE id = 'metric-refresh'").get();
ok(canon.definition === live && canon.repo_path === "migrations/2026-10-19-canonical-worker-count-live.sql", "the canonical row takes the same rewrite", canon.repo_path);
ok(d.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'canonical-worker-count-all-state'").get().n === 1 && d.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-canonical-worker-count-all-state'").get().n === 1, "the failure mode and its detector are written");
const det = d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-canonical-worker-count-all-state'").get().verify_probe;
ok(d.prepare(det).get().observed === "1", "the detector passes on the rewritten definition");
d.exec(sql);
ok(d.prepare("SELECT version FROM fleet_tasks WHERE id = 'metric-refresh'").get().version === 3 && d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && defOf(d, "fleet_tasks") === live, "a second apply changes nothing and keeps one decision_log row");
d.exec(rollback);
ok(defOf(d, "fleet_tasks") === OLD_DEF && defOf(d, "fleet_tasks_canonical") === OLD_DEF && d.prepare("SELECT version FROM fleet_tasks WHERE id = 'metric-refresh'").get().version === 2, "Rollback restores both definitions and the version");
ok(d.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && d.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 0, "Rollback removes the failure mode and its detector");

// A drifted live definition (anchor absent) fails the file loudly and writes nothing after the guard.
const drifted = JSON.stringify({ steps: [{ type: "sql", db: "AUDIT", sql: "UPDATE metric_registry SET last_value = '1'" }] });
const dd = mk(drifted);
let threw = false;
try { dd.exec(sql); } catch (e) { threw = /malformed JSON/.test(String(e.message)); }
ok(threw && defOf(dd, "fleet_tasks") === drifted && dd.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && dd.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 0, "a drifted definition fails the file and changes nothing after the guard");

// The canonical row that already drifted from live still takes its own rewrite, and the live one is not touched by it.
const odd = OLD_DEF.replace("END WHERE", "END /* other text */ WHERE");
const d2 = mk(OLD_DEF, odd);
d2.exec(sql);
ok(defOf(d2, "fleet_tasks_canonical").includes("CANONICAL-WORKER-COUNT-LIVE-1") && defOf(d2, "fleet_tasks_canonical").includes("/* other text */"), "a canonical row with other drift takes the rewrite by its own anchors and keeps its text");

// The repo snapshot.
const snap = snapshot.tasks["metric-refresh"].definition;
ok(snap.split("CANONICAL-WORKER-COUNT-LIVE-1").length === 2 && !snap.includes(OLD_COUNT) && snap.includes("WHERE kind = 'worker' AND state = 'live') AS TEXT)") && JSON.parse(snap).steps.length >= 1, "docs/fleet-tasks-canonical.json carries the rewrite once");
console.log("canonical-worker-count-live: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

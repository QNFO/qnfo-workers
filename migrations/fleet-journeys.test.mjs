// FLEET-JOURNEYS-1 offline suite: applies migrations/2026-10-13-fleet-journeys.sql on an in-memory SQLite and proves: the metric is
// registered trigger-exempt, the two fm- detectors read the latest journey event (fail -> observed 'fail', a later ok -> 'ok', none ->
// 'none'), and a second apply changes nothing.
// Run: node migrations/fleet-journeys.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-13-fleet-journeys.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT UNIQUE, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
db.exec(sql);
const q = (s, ...a) => db.prepare(s).all(...a);
const m = q("SELECT * FROM metric_registry WHERE metric = 'fleet_journeys_failing'")[0];
ok(m && m.refresh_class === "runner" && /^0/.test(m.target), "metric registered", m);
ok(q("SELECT COUNT(*) n FROM analytics_metric_triggers")[0].n === 0, "trigger-exempt");
ok(q("SELECT COUNT(*) n FROM failure_modes")[0].n === 2 && q("SELECT COUNT(*) n FROM capability_ledger")[0].n === 1, "fm and capability rows");
const probe = (cls) => q(q("SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls)[0].p)[0];
for (const [cls, j] of [["fm-registry-version-sweep-regex", "deploy-coherence"], ["fm-fleet-census-blind", "binding-census"]]) {
  ok(probe(cls).observed === "none" && probe(cls).expected === "ok", cls + " none before any run", probe(cls));
  db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES (?, ?, 'fleet-journey', ?)").run(`fleet-journey-${j}-2026-10-13T23:40:00Z`, "2026-10-13T23:40:00Z", "fail");
  ok(probe(cls).observed === "fail", cls + " reads the failing run", probe(cls));
  db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, status) VALUES (?, ?, 'fleet-journey', ?)").run(`fleet-journey-${j}-2026-10-14T00:40:00Z`, "2026-10-14T00:40:00Z", "ok");
  ok(probe(cls).observed === "ok", cls + " reads the newest run", probe(cls));
}
db.exec(sql);
ok(q("SELECT COUNT(*) n FROM remediation_contracts")[0].n === 2 && q("SELECT COUNT(*) n FROM failure_modes")[0].n === 2, "idempotent");
console.log(`fleet-journeys: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

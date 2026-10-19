// MODEL-HEALTH-SWEEP-1 registry migration suite: applies migrations/2026-10-19-model-health-sweep.sql on SQLite.
// Proves: the control row is a kill-switch off the critical path with a "none needed" alternate (so it adds no untested alternate to the path views); the failure mode names its
// detector; the detector reads 0 with no open model-health issue, 0 for an issue whose model is still degraded or failing, 0 for a fresh issue, and counts an open
// "[ai-cal] model probe failing" issue untouched for 120 minutes whose model reads ok (the six rows of 2026-10-19 21:5xZ); a second apply changes nothing; one decision_log row with
// a prediction in the parsed form; the Rollback header removes the three registry rows; the probe is one literal read free of write keywords; the file passes apply_migrations --check.
// Run: node migrations/model-health-sweep.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mig = readFileSync(new URL("./2026-10-19-model-health-sweep.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', module TEXT, next_due_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE ai_model_health (model_id TEXT PRIMARY KEY, status TEXT NOT NULL);
CREATE TABLE ai_calibration_runs (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, digest TEXT);
`);
db.exec(mig);

const cr = db.prepare("SELECT * FROM control_registry WHERE control = 'model-health-sweep'").get();
ok(cr && cr.kind === "kill-switch" && cr.critical_path === 0 && cr.disposition === "keep" && cr.disposition_state === "applied" && cr.issue_id === 100238, "the control row is an applied kill-switch off the critical path", cr);
ok(/^none needed/.test(cr.alternate_path) && cr.alternate_tested_at === null && cr.location.includes("sweepModelHealthIssues") && cr.evidence.includes("2026-10-19"), "its alternate reads none needed, with the reason and the location recorded");
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'model-health-issue-stale'").get();
const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-model-health-issue-stale'").get();
ok(fm && det && fm.probe_class === det.class && fm.issue_id === 100238 && det.verify_transport === "d1-query" && det.status === "active" && det.module === "failure-mode" && det.expected_cadence_h === 1, "failure mode and active d1-query detector name each other");
const low = " " + det.verify_probe.toLowerCase().replace(/\s+/g, " ") + " ";
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
const RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
ok(/^ select /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !RT_WRITE_KW.some((w) => low.indexOf(" " + w) !== -1), "the detector is one literal read free of the write keywords");
ok(!/LIKE '[^']{50,}'/.test(det.verify_probe), "no LIKE literal reaches D1's 50 byte limit");

const NOW = Math.floor(Date.now() / 1000);
const read = () => { const r = db.prepare(det.verify_probe).get(); return { e: String(r.expected), o: String(r.observed) }; };
const add = (title, ageMin, status = "open") => db.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, ?, ?, ?)").run(title, status, (NOW - ageMin * 60) * 1000, NOW * 1000);
let runN = 0;
const run = (agoMin, failing = []) => db.prepare("INSERT INTO ai_calibration_runs (id, ts, digest) VALUES (?, ?, ?)").run("r" + ++runN, (NOW - agoMin * 60) * 1000, JSON.stringify({ failing, drift_models: [], failed_probes: [] }));
ok(JSON.stringify(read()) === JSON.stringify({ e: "0", o: "0" }), "reads 0 on empty tables");
db.prepare("INSERT INTO ai_model_health (model_id, status) VALUES ('glm-5.3', 'ok'), ('kimi-k2.6', 'degraded'), ('deepseek-v4-pro-wa', 'failing'), ('gpt-oss-120b', 'ok'), ('kimi-k2.7-code', 'ok')").run();
add("[ai-cal] model probe failing: kimi-k2.6", 300); add("[ai-cal] model probe failing: deepseek-v4-pro-wa", 300);
run(10); run(40); run(70);
ok(read().o === "0", "an old issue whose model is still degraded or failing is not counted", read());
add("[ai-cal] model probe failing: glm-5.3", 60);
ok(read().o === "0", "a recovered model's issue younger than 120 minutes is not counted", read());
add("[ai-cal] model probe failing: glm-5.3", 300, "closed");
ok(read().o === "0", "a closed issue is not counted", read());
add("[ai-cal] model probe failing: gpt-oss-120b", 300);
ok(read().o === "1", "an open issue older than 120 minutes whose model reads ok and passes every run of the last 90 minutes is counted (updated_at is fresh, as the escalation loop leaves it)", read());
add("[ai-cal] model probe failing: kimi-k2.7-code", 300);
run(20, ["kimi-k2.7-code"]);
ok(read().o === "1", "a model that appears in the failing list of a run inside 90 minutes is not counted", read());
add("[ai-cal] model probe failing: retired-model", 300);
ok(read().o === "1", "a model with no health row is not counted (unmeasured, not stale)", read());
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE title LIKE '%gpt-oss-120b'").run();
ok(read().o === "0", "closing it clears the reading", read());
db.prepare("DELETE FROM ai_calibration_runs").run();
add("[ai-cal] model probe failing: gpt-oss-120b", 300);
ok(read().o === "0", "no calibration run in 90 minutes: nothing is claimed about recovery", read());

const snap = () => JSON.stringify([db.prepare("SELECT * FROM control_registry").all(), db.prepare("SELECT * FROM failure_modes").all(), db.prepare("SELECT * FROM remediation_contracts").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").get()]);
const s1 = snap();
db.exec(mig);
ok(s1 === snap(), "a second apply changes nothing");
const dl = db.prepare("SELECT action, predicted_outcome FROM decision_log").all();
ok(dl.length === 1 && /^MODEL-HEALTH-SWEEP-1: /.test(dl[0].action) && /^[a-z_0-9]+ <= \d+ within 12 h$/.test(dl[0].predicted_outcome), "one decision_log row with a prediction in the parsed form", dl);

const rb = mig.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
db.exec(rb);
ok(db.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === 0, "the Rollback header removes the three registry rows");
const chk = spawnSync("python3", [fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url)), "--check", fileURLToPath(new URL("./2026-10-19-model-health-sweep.sql", import.meta.url))], { encoding: "utf8" });
ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// REOPEN-LIVE-PATH-3 registry migration suite: applies migrations/2026-10-19-ensure-live-path-controls.sql on SQLite.
// Proves: the two control rows (kill-switch and cap, off the critical path, issue 100271) carry the first term of fm-reopen-without-live-path as their alternate; each gets one enabled read-only
// control_alternate_probes row whose probe reads ok with the detector present, active, reading contract statuses and run inside 120 minutes with the dead-end view present, and names the broken part
// otherwise; the probe is one literal read free of write keywords; a second apply changes nothing; one decision_log row with a prediction in the parsed form; the Rollback header removes the rows;
// the file passes scripts/apply_migrations.py --check.
// Run: node migrations/ensure-live-path-controls.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mig = readFileSync(new URL("./2026-10-19-ensure-live-path-controls.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT NOT NULL DEFAULT '', status TEXT DEFAULT 'active', last_attempt_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
`);
db.exec(mig);
const rows = db.prepare("SELECT * FROM control_registry ORDER BY control").all();
ok(rows.length === 2 && rows[0].control === "rt-ensure-live-path" && rows[1].control === "rt-ensure-live-path-bounds", "two control rows", rows.map((r) => r.control));
ok(rows[0].kind === "kill-switch" && rows[1].kind === "cap" && rows.every((r) => r.critical_path === 0 && r.disposition === "keep" && r.disposition_state === "applied" && r.issue_id === 100271 && r.alternate_tested_at === null), "kill-switch and cap, applied, off the critical path, issue 100271");
ok(rows.every((r) => r.alternate_path.includes("fm-reopen-without-live-path") && r.evidence.includes("2026-10-19") && r.guards_against.length > 20), "each names the detector as its alternate, a reason and what it guards against");
const probes = db.prepare("SELECT * FROM control_alternate_probes ORDER BY control").all();
ok(probes.length === 2 && probes.every((p) => p.enabled === 1 && p.last_run_at === null && /120 minutes/.test(p.window_note) && p.probe_sql === probes[0].probe_sql), "one enabled probe row per control with the same read-only SQL and a window in minutes", probes.map((p) => p.control));
const low = " " + probes[0].probe_sql.toLowerCase() + " ";
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "alter table", "create table", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
ok(/^ select /.test(low) && low.indexOf(";") === -1 && !WRITE_KW.some((w) => low.indexOf(w) !== -1) && !/\b(hours?|days?)\b/.test(low.replace(/'-120 minutes'/g, "")), "the probe is one literal read free of write keywords, windows in minutes only");

const run = () => { const r = db.prepare(probes[0].probe_sql).get(); return String(r.observed); };
ok(/missing, not active/.test(run()), "no detector row: names the missing detector", run());
db.prepare("INSERT INTO remediation_contracts (class, verify_probe, status, last_attempt_at) VALUES ('fm-reopen-without-live-path', 'SELECT 0 FROM remediation_contracts c WHERE c.status IN (''active'', ''holding'', ''monitoring'', ''escalated'')', 'active', datetime('now', '-30 minutes'))").run();
ok(/dead_end|v_issue_dead_end/.test(run()), "detector fine, dead-end view missing: names the view", run());
db.exec("CREATE VIEW v_issue_dead_end AS SELECT 1 AS id");
ok(run() === "ok", "detector active and recent, view present: ok", run());
db.prepare("UPDATE remediation_contracts SET last_attempt_at = datetime('now', '-200 minutes')").run();
ok(/did not run in 120 minutes/.test(run()), "detector not run in 120 minutes: named", run());
db.prepare("UPDATE remediation_contracts SET last_attempt_at = datetime('now', '-5 minutes'), verify_probe = 'SELECT 1' ").run();
ok(/no longer counts orphans/.test(run()), "detector rewritten so it no longer reads contract statuses: named", run());
db.prepare("UPDATE remediation_contracts SET verify_probe = 'x remediation_contracts monitoring', status = 'superseded'").run();
ok(/not active/.test(run()), "detector superseded: named", run());

const snap = () => JSON.stringify([db.prepare("SELECT * FROM control_registry").all(), db.prepare("SELECT * FROM control_alternate_probes").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").get()]);
const s1 = snap();
db.exec(mig);
ok(s1 === snap(), "a second apply changes nothing");
const dl = db.prepare("SELECT action, predicted_outcome FROM decision_log").all();
ok(dl.length === 1 && /^REOPEN-LIVE-PATH-3: /.test(dl[0].action) && /^[a-z_0-9]+ <= \d+ within 12 h$/.test(dl[0].predicted_outcome), "one decision_log row with a prediction in the parsed form", dl);
const rb = mig.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
db.exec(rb);
ok(db.prepare("SELECT COUNT(*) AS n FROM control_registry").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM control_alternate_probes").get().n === 0, "the Rollback header removes the control rows and their probes");
const chk = spawnSync("python3", [fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url)), "--check", fileURLToPath(new URL("./2026-10-19-ensure-live-path-controls.sql", import.meta.url))], { encoding: "utf8" });
ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "the file passes scripts/apply_migrations.py --check", chk.stdout + chk.stderr);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// FALLBACK-HEARTBEAT-PROOF-1 offline suite: runs migrations/2026-10-19-fallback-heartbeat-proof.sql on SQLite against the live
// fm-single-heartbeat probe text (qnfo-audit 2026-10-19). Proves: the replace matches, so the probe passes on a healthy day with no
// fallback tick but a fresh ok heartbeat; it still fails with no fallback proof, with a stale or failed heartbeat, and with no recent
// tick at all; re-applying changes nothing; the Rollback header restores the old text.
// Run: node migrations/fallback-heartbeat-proof.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const text = readFileSync(new URL("./2026-10-19-fallback-heartbeat-proof.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
const live = "SELECT '1' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tick WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-20 minutes')) AND EXISTS (SELECT 1 FROM fleet_tick WHERE source = 'cron:qnfo-code-orchestrator' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AND EXISTS (SELECT 1 FROM fleet_tick WHERE source = 'cron:qnfo-fleet-dashboard' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) THEN '1' ELSE '0' END AS observed";
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT);
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
db.prepare("INSERT INTO remediation_contracts VALUES ('fm-single-heartbeat', ?)").run(live);
const iso = (m) => new Date(Date.now() - m * 6e4).toISOString();
const tick = db.prepare("INSERT INTO fleet_tick (ts, source) VALUES (?, ?)");
tick.run(iso(5), "cron:qnfo-code-orchestrator");
tick.run(iso(60 * 30), "cron:qnfo-fleet-dashboard");
const probe = () => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe).get().observed;
ok(probe() === "0", "before: the old probe fails on a healthy day (fallback last ticked 30 h ago)");
db.exec(text);
ok(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe !== live, "the replace matched the live text");
ok(probe() === "0", "with no heartbeat row the fallback is still unproven");
const hb = db.prepare("INSERT OR REPLACE INTO fleet_heartbeat VALUES ('qnfo-fleet-dashboard', '1.44.7', ?, ?)");
hb.run(iso(10), 1);
ok(probe() === "1", "a fresh ok heartbeat proves the fallback");
hb.run(iso(10), 0);
ok(probe() === "0", "a heartbeat whose fallback insert threw does not");
hb.run(iso(45), 1);
ok(probe() === "0", "a heartbeat older than 30 minutes does not");
hb.run(iso(10), 1);
tick.run(iso(60), "cron:qnfo-fleet-dashboard");
db.exec("DELETE FROM fleet_tick WHERE source = 'cron:qnfo-code-orchestrator'");
ok(probe() === "0", "no tick in 20 minutes still fails");
tick.run(iso(3), "cron:qnfo-code-orchestrator");
ok(probe() === "1", "a recent fallback tick still counts on its own");
const after = db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe;
db.exec(text);
ok(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe === after && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "re-applying changes nothing");
db.exec(text.split("\n").find((l) => l.startsWith("-- Rollback:")).slice(12));
ok(db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe === live, "the Rollback header restores the old probe");
console.log(`fallback-heartbeat-proof: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

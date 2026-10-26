// TP-2.4-HEARTBEATS-EVERY-CRON-1 offline suite: replays migrations/2026-10-26-cron-monitor-dod-replace.sql on SQLite.
// Proves: lever tp 2 n 4 becomes verified with the new definition and the old one kept in its note; the contract of issue 1000465 is active with a probe that is one read-only SELECT; the probe
// reads 1 only when v_cron_activity is non-vacuous (20 or more workers), no worker has been silent for more than 2x its gap or has no signal, no cron fault is due, crons_unobserved is 0 and
// the worker-silent detector has fired at least once; it reads 0 in each of those failure cases; other levers and contracts are untouched; the decision is logged once; a second apply
// changes nothing; the Rollback line restores the lever and the contract status.
// Run: node --no-warnings migrations/cron-monitor-dod-replace.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-cron-monitor-dod-replace.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql), "the opt-in, DB and Rollback headers are present");
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];

const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE transformation_levers (id INTEGER PRIMARY KEY AUTOINCREMENT, tp INTEGER, n INTEGER, key TEXT, dod TEXT, status TEXT, note TEXT, landed_at TEXT, verified_at TEXT, updated_at TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT, last_verdict TEXT);
  CREATE TABLE v_cron_activity (worker TEXT, gap_min INTEGER, last_ms INTEGER);
  CREATE TABLE v_cron_fault_due (fault_key TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);
  CREATE TABLE cron_fault_seen (fault_key TEXT, kind TEXT, cleared_at TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
d.prepare("INSERT INTO transformation_levers (tp, n, key, dod, status, note) VALUES (2, 4, 'heartbeats-every-cron', 'every cron worker has a fleet_heartbeat row younger than 2x its cadence', 'session', 'needs a session: a refactor lever: not a single-file edit')").run();
d.prepare("INSERT INTO transformation_levers (tp, n, key, dod, status, note) VALUES (2, 3, 'one-probe-pass', 'requests under 3000', 'session', 'other lever')").run();
d.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, last_verdict) VALUES ('issue-1000465', 1000465, 'SELECT 1', 'monitoring', 'monitoring:loop-owned-48h')").run();
d.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status, last_verdict) VALUES ('issue-1000466', 1000466, 'SELECT 2', 'monitoring', 'monitoring:loop-owned-48h')").run();
const now = Date.now();
const healthy = () => { d.exec("DELETE FROM v_cron_activity; DELETE FROM v_cron_fault_due; DELETE FROM metric_registry; DELETE FROM cron_fault_seen;");
  for (let i = 0; i < 27; i++) d.prepare("INSERT INTO v_cron_activity (worker, gap_min, last_ms) VALUES (?, 60, ?)").run("w" + i, now - 30 * 60000);
  d.prepare("INSERT INTO metric_registry (metric, last_value) VALUES ('crons_unobserved', '0')").run();
  d.prepare("INSERT INTO cron_fault_seen (fault_key, kind, cleared_at) VALUES ('f1', 'worker-silent', '2026-10-25T09:30:00Z')").run(); };
healthy();
d.exec(sql);

const lever = d.prepare("SELECT * FROM transformation_levers WHERE tp = 2 AND n = 4").get();
ok(lever.status === "verified" && lever.landed_at && lever.verified_at && /every live cron worker has a signal/.test(lever.dod), "lever 2.4 is verified with the new definition", lever);
ok(/Previous definition of done: every cron worker has a fleet_heartbeat row younger than 2x its cadence/.test(lever.note) && /12 of the 16/.test(lever.note), "the old definition and the evidence are kept in the note");
ok(d.prepare("SELECT status FROM transformation_levers WHERE tp = 2 AND n = 3").get().status === "session", "another lever is untouched");
ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000466'").get().verify_probe === "SELECT 2", "another contract is untouched");
const c = d.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-1000465'").get();
ok(c.status === "active" && c.last_verdict === null && /^SELECT '1' AS expected/.test(c.verify_probe) && !c.verify_probe.includes(";") && !/(insert|update|delete|drop)\s/i.test(c.verify_probe), "the contract is active with one read-only SELECT", c);
const probe = () => d.prepare(c.verify_probe).get();
ok(probe().observed === "1", "healthy: 27 workers, none silent, nothing due, crons_unobserved 0, the detector has fired: reads 1", probe());
// each failure case
d.prepare("UPDATE v_cron_activity SET last_ms = ? WHERE worker = 'w3'").run(now - 130 * 60000);
ok(probe().observed === "0", "one worker silent for more than 2x its gap reads 0");
d.prepare("UPDATE v_cron_activity SET last_ms = ? WHERE worker = 'w3'").run(now - 119 * 60000);
ok(probe().observed === "1", "a worker silent for 119 minutes of a 120-minute allowance still reads 1");
d.prepare("UPDATE v_cron_activity SET last_ms = NULL WHERE worker = 'w4'").run();
ok(probe().observed === "0", "a worker with no signal at all reads 0");
healthy();
d.prepare("INSERT INTO v_cron_fault_due (fault_key) VALUES ('x')").run();
ok(probe().observed === "0", "a cron fault due reads 0");
healthy();
d.prepare("UPDATE metric_registry SET last_value = '2' WHERE metric = 'crons_unobserved'").run();
ok(probe().observed === "0", "crons_unobserved above 0 reads 0");
healthy(); d.exec("DELETE FROM metric_registry");
ok(probe().observed === "0", "crons_unobserved missing reads 0 (never assumed healthy)");
healthy(); d.exec("DELETE FROM cron_fault_seen");
ok(probe().observed === "0", "a detector that has never fired reads 0 (the measure would be vacuous)");
healthy(); d.exec("DELETE FROM v_cron_activity");
ok(probe().observed === "0", "an empty activity view reads 0 (not vacuously true)");
healthy(); d.exec("DELETE FROM v_cron_activity WHERE worker >= 'w2' AND worker <> 'w3'");
ok(probe().observed === "0", "fewer than 20 observed workers reads 0");
healthy();

// decision and idempotence
ok(d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'TP-2.4-HEARTBEATS-EVERY-CRON-1:%'").get().n === 1, "one decision is logged");
const snap = () => JSON.stringify([d.prepare("SELECT tp, n, status, dod, note FROM transformation_levers ORDER BY tp, n").all(), d.prepare("SELECT class, status, verify_probe FROM remediation_contracts ORDER BY class").all(), d.prepare("SELECT COUNT(*) AS n FROM decision_log").get()]);
const before = snap();
d.exec(sql);
ok(snap() === before, "a second apply changes nothing");
d.exec(rollback);
const l2 = d.prepare("SELECT * FROM transformation_levers WHERE tp = 2 AND n = 4").get();
ok(l2.status === "session" && l2.landed_at === null && l2.dod === "every cron worker has a fleet_heartbeat row younger than 2x its cadence", "Rollback restores the lever", l2);
ok(d.prepare("SELECT status FROM remediation_contracts WHERE class = 'issue-1000465'").get().status === "monitoring", "Rollback restores the contract status");
console.log("cron-monitor-dod-replace: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

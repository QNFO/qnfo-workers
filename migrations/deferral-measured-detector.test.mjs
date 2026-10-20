// DEFERRAL-MEASURED-1 detector suite: replays migrations/2026-10-20-deferral-measured-detector.sql on SQLite (node:sqlite).
// Proves: the detector fm-measured-pending-deferred counts an active contract whose last verdict is 'deferred' and whose NEWEST deferral event (12 h) is a
// pending that carries a number against a bound; it ignores a plain pending, a contract that reads a verdict, an older measured event superseded by a newer
// plain one, an event outside 12 h, a bound word that is only in the class name, and a parked contract; a second apply changes nothing; the Rollback removes both rows.
// Run: node migrations/deferral-measured-detector.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-deferral-measured-detector.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const iso = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, next_due_at TEXT, last_verdict TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, text TEXT);`);
db.exec(sql);
const det = () => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-measured-pending-deferred'").get().verify_probe).get();
const contract = (cls, status, verdict) => db.prepare("INSERT INTO remediation_contracts (class, status, last_verdict, verify_probe) VALUES (?, ?, ?, 'x')").run(cls, status, verdict);
const ev = (cls, observed, h) => db.prepare("INSERT INTO cloud_ops_events (ts, kind, text) VALUES (?, 'remediation.deferred', ?)").run(iso(h), "class=" + cls + " transport=d1-query expected=ok observed=" + observed);
ok(det().expected === "0" && det().observed === "0", "an empty ledger reads 0", det());
contract("m-deferred", "active", "deferred"); ev("m-deferred", "pending: unmanaged_direct_spend_share reads 0.5058 (target <= 0.5)", 1);
ok(det().observed === "1", "a deferred contract whose newest event is a measured pending is counted", det());
contract("plain", "active", "deferred"); ev("plain", "pending: waiting for the window to open", 1);
contract("plain-digits", "active", "deferred"); ev("plain-digits", "pending: 3 job rows since 2026-10-19 (needs 3)", 1);
ok(det().observed === "1", "a plain pending, with or without digits and no bound, is not counted", det());
contract("m-verdict", "active", "fail"); ev("m-verdict", "pending: worker_count 33 (needs <= 24)", 1);
contract("m-parked", "superseded", "deferred"); ev("m-parked", "pending: worker_count 33 (needs <= 24)", 1);
ok(det().observed === "1", "a contract that reads a verdict, or is parked, is not counted", det());
contract("m-then-plain", "active", "deferred"); ev("m-then-plain", "pending: share 0.51 (target <= 0.5)", 3); ev("m-then-plain", "pending: waiting for a window", 1);
ok(det().observed === "1", "an older measured event superseded by a newer plain one is not counted", det());
contract("m-old", "active", "deferred"); ev("m-old", "pending: share 0.51 (target <= 0.5)", 20);
ok(det().observed === "1", "an event older than 12 hours is not counted", det());
contract("limit-class", "active", "deferred"); ev("limit-class", "pending: waiting for a window", 1);
db.prepare("UPDATE cloud_ops_events SET text = replace(text, 'class=limit-class', 'class=target-limit-class') WHERE text LIKE 'class=limit-class%'").run();
db.prepare("UPDATE remediation_contracts SET class = 'target-limit-class' WHERE class = 'limit-class'").run();
ok(det().observed === "1", "a bound word that is only in the class name is not counted", det());
contract("m-two", "active", "deferred"); ev("m-two", "Pending: 11 failures, fewer than 3 wanted", 5); ev("m-two", "Pending: 11 failures, fewer than 3 wanted", 1);
ok(det().observed === "2", "two events of one class count the class once", det());
const n1 = db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n;
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n === n1 && db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 1, "a second apply adds nothing");
const r = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-measured-pending-deferred'").get();
ok(r.status === "active" && r.verify_transport === "d1-query" && r.module === "failure-mode", "the detector is an active d1-query failure-mode contract", r);
db.exec(rollback);
ok(!db.prepare("SELECT 1 FROM remediation_contracts WHERE class = 'fm-measured-pending-deferred'").get() && db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0, "the Rollback removes both rows");
console.log("deferral-measured-detector: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

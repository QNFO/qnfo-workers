// HANDOFFS-VZ-PRODUCER-1 offline suite: migrations/2026-10-26-handoffs-vz-producer.sql seeds the ops_config watermark, gives issue 1000176 a probe on its
// definition of done in place of its circular birth probe, registers the stall detector and records the decision. Proves:
//  * the circular contract is saved (backup table) and replaced, a contract that is not the circular template is left alone, a second apply changes nothing;
//  * a watermark the worker already moved is kept (INSERT OR IGNORE);
//  * the issue probe counts handoffs older than 90 minutes above the watermark, for both timestamp formats the table holds, and ignores younger ones;
//  * the detector is red for a missing watermark row and for a watermark that has not moved for 3 hours while a handoff older than 3 hours sits above it, green
//    while it moves (a healthy backfill), green when caught up, green when a quiet night is followed by one new handoff (the review's replay: the first version,
//    which read only updated_at, went red for ten such windows in 14 days), whatever the updated_at format (space or ISO);
//  * the capability row is written once and the Rollback line retires it;
//  * the Rollback line restores the contract and retires the detector; the file adds no trigger and no DELETE or DROP.
// Run: node --no-warnings migrations/handoffs-vz-producer.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-handoffs-vz-producer.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const CIRCULAR = "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 1000176) AS observed";

function build(contract) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, last_verdict TEXT, module TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE handoffs (id INTEGER PRIMARY KEY, session_id TEXT, summary TEXT, timestamp TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);`);
  if (contract !== null) db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES ('issue-1000176', 1000176, 'p', 'a', ?, 'd1-query', 3, 'qnfo-fleet-control', 1, ?, 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic')").run(contract.probe ?? CIRCULAR, contract.status ?? "superseded");
  return db;
}
const q = (db, s, ...a) => db.prepare(s).get(...a);
const run = (db, probe) => { const r = db.prepare(probe).get(); return r; };
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
const spaced = (minAgo) => iso(minAgo).slice(0, 19).replace("T", " ");

// 1. fresh apply
let db = build({});
db.exec(sql);
ok(q(db, "SELECT value FROM ops_config WHERE key = 'handoffs_vz_last_id'").value === "0", "the watermark is seeded at 0");
let c = q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000176'");
ok(c.status === "active" && c.verify_transport === "d1-query" && c.module === "handoffs-vz-producer-1" && c.last_verdict === null && /handoffs_vz_last_id/.test(c.verify_probe) && !/status IN \('closed'/.test(c.verify_probe), "issue 1000176 gets the real probe, active, no stale verdict", c);
ok(q(db, "SELECT COUNT(*) n FROM bak_20261026_rc_issue_1000176").n === 1 && q(db, "SELECT verify_probe FROM bak_20261026_rc_issue_1000176").verify_probe === CIRCULAR, "the circular contract is saved before it is replaced");
ok(q(db, "SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'handoffs-vz-stalled' AND issue_id = 1000176 AND probe_class = 'fm-handoffs-vz-stalled'").n === 1, "the failure mode is registered");
const det = q(db, "SELECT * FROM remediation_contracts WHERE class = 'fm-handoffs-vz-stalled'");
ok(det && det.status === "active" && det.verify_transport === "d1-query" && det.module === "failure-mode" && det.issue_id === null, "the detector contract is active, d1-query, not tied to an issue", det);
ok(q(db, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'HANDOFFS-VZ-PRODUCER-1:') = 1").n === 1, "one decision is logged");
const dec = q(db, "SELECT * FROM decision_log WHERE instr(action, 'HANDOFFS-VZ-PRODUCER-1:') = 1");
ok(/personal plane/.test(dec.action) && /charter rule 10/.test(dec.assumption) && /about 7 Workers AI embedding calls/.test(dec.blast_radius) && !/about 3 Workers AI/.test(dec.blast_radius), "the decision records the personal-plane skip and the measured load", dec);
const cap = q(db, "SELECT * FROM capability_ledger WHERE capability = 'handoffs-vector-index-hourly-producer'");
ok(cap && /1000176/.test(cap.provenance) && /unproven until the watermark moves/.test(cap.reliability) && /UPDATE ops_config SET value = 0/.test(cap.evidence), "the capability is recorded with an honest reliability and the fallback path", cap);
ok(!/\bCREATE\s+TRIGGER\b/i.test(sql) && !/^\s*(DELETE|DROP)\b/im.test(sql.replace(/^--.*$/gm, "")), "the file adds no trigger and runs no DELETE or DROP");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in headers are present");

// 2. the issue probe (definition of done)
const issueProbe = c.verify_probe;
db.exec("DELETE FROM handoffs");
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (1, 'a', '2026-07-11 08:09:47'), (2, 'b', '2026-10-20T10:00:00.000Z'), (3, 'c', ?)").run(iso(200));
let r = run(db, issueProbe);
ok(r.expected === "0" && r.observed === "3", "three old handoffs above a watermark of 0: observed 3 (both timestamp formats)", r);
db.prepare("UPDATE ops_config SET value = '3' WHERE key = 'handoffs_vz_last_id'").run();
r = run(db, issueProbe);
ok(r.observed === "0", "watermark at the highest id: observed 0", r);
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (4, 'fresh', ?)").run(iso(10));
r = run(db, issueProbe);
ok(r.observed === "0", "a handoff from 10 minutes ago above the watermark is not yet late", r);
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (5, 'late', ?)").run(iso(100));
r = run(db, issueProbe);
ok(r.observed === "1", "a handoff from 100 minutes ago above the watermark is late: observed 1", r);
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (6, 'late spaced', ?)").run(spaced(100));
r = run(db, issueProbe);
ok(r.observed === "2", "the space-formatted timestamp counts the same way", r);
db.exec("DELETE FROM ops_config");
r = run(db, issueProbe);
ok(r.observed === "5", "no watermark row means every handoff older than 90 minutes is behind (five of six, the 10-minute one is not)", r);

// 3. the stall detector
const detProbe = det.verify_probe;
const setWm = (value, updated) => { db.exec("DELETE FROM ops_config"); db.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('handoffs_vz_last_id', ?, 'n', ?)").run(String(value), updated); };
db.exec("DELETE FROM handoffs");
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (10, 'x', ?)").run(iso(500));
db.exec("DELETE FROM ops_config");
r = run(db, detProbe);
ok(r.expected === "0" && r.observed === "1", "a missing watermark row is red", r);
setWm(5, spaced(30));
r = run(db, detProbe);
ok(r.observed === "0", "moved 30 minutes ago (space format) with handoffs above it: green, a healthy backfill", r);
setWm(5, iso(30));
r = run(db, detProbe);
ok(r.observed === "0", "moved 30 minutes ago (ISO format) with handoffs above it: green", r);
setWm(5, iso(240));
r = run(db, detProbe);
ok(r.observed === "1", "not moved for 4 hours (ISO format) while handoffs sit above it: red", r);
setWm(5, spaced(240));
r = run(db, detProbe);
ok(r.observed === "1", "not moved for 4 hours (space format) while handoffs sit above it: red", r);
setWm(10, iso(240));
r = run(db, detProbe);
ok(r.observed === "0", "not moved for 4 hours but caught up (nothing above it): green", r);
setWm(5, iso(170));
r = run(db, detProbe);
ok(r.observed === "0", "not moved for 170 minutes: still inside the 3-hour window, green", r);
setWm(5, iso(190));
r = run(db, detProbe);
ok(r.observed === "1", "not moved for 190 minutes: past the window, red", r);
// the review's replay: a quiet night, then one brand-new handoff. The watermark row is 5 hours old because the worker writes it only when it indexed something.
db.exec("DELETE FROM handoffs");
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (100, 'old', ?), (101, 'new', ?)").run(iso(900), iso(5));
setWm(100, iso(300));
r = run(db, detProbe);
ok(r.observed === "0", "quiet for 5 hours, then a handoff 5 minutes old above the watermark: green (the first version read red here)", r);
setWm(100, spaced(300));
r = run(db, detProbe);
ok(r.observed === "0", "the same with a space-formatted updated_at: green", r);
db.exec("DELETE FROM handoffs WHERE id = 101");
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (101, 'stuck', ?)").run(iso(240));
setWm(100, iso(300));
r = run(db, detProbe);
ok(r.observed === "1", "a handoff 4 hours old above a watermark that is 5 hours old: the hourly run missed it, red", r);
db.exec("DELETE FROM handoffs WHERE id = 101");
db.prepare("INSERT INTO handoffs (id, summary, timestamp) VALUES (101, 'edge', ?)").run(iso(170));
r = run(db, detProbe);
ok(r.observed === "0", "a handoff 170 minutes old is still inside the 3-hour window: green", r);

// 4. second apply changes nothing, a moved watermark survives
db = build({});
db.exec(sql);
db.prepare("UPDATE ops_config SET value = '77', updated_at = ?, note = 'worker' WHERE key = 'handoffs_vz_last_id'").run(iso(5));
const snap = JSON.stringify([db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT * FROM failure_modes").all(), db.prepare("SELECT * FROM ops_config").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").get(), db.prepare("SELECT * FROM capability_ledger").all(), db.prepare("SELECT COUNT(*) n FROM bak_20261026_rc_issue_1000176").get()]);
db.exec(sql);
ok(JSON.stringify([db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT * FROM failure_modes").all(), db.prepare("SELECT * FROM ops_config").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").get(), db.prepare("SELECT * FROM capability_ledger").all(), db.prepare("SELECT COUNT(*) n FROM bak_20261026_rc_issue_1000176").get()]) === snap, "a second apply changes no row, and the watermark the worker moved (77) is kept");

// 5. a contract that is not the circular template is left alone
db = build({ probe: "SELECT '0' AS expected, '0' AS observed", status: "active" });
db.exec(sql);
c = q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000176'");
ok(c.verify_probe === "SELECT '0' AS expected, '0' AS observed" && c.status === "active" && c.module === "probe-template-v3-generic", "an issue contract that already has its own probe is not overwritten", c);

// 6. no contract row at all (issue deleted or never probed): the file still applies
db = build(null);
db.exec(sql);
ok(q(db, "SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'issue-1000176'").n === 0 && q(db, "SELECT COUNT(*) n FROM failure_modes").n === 1, "without an issue contract row the file applies and only registers the detector");

// 7. rollback
db = build({});
db.exec(sql);
db.exec(rollback);
c = q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000176'");
ok(c.verify_probe === CIRCULAR && c.status === "superseded" && c.module === "probe-template-v3-generic", "the Rollback line restores the circular contract", c);
ok(q(db, "SELECT status FROM remediation_contracts WHERE class = 'fm-handoffs-vz-stalled'").status === "superseded" && /rolled back/.test(q(db, "SELECT detector FROM failure_modes WHERE fm_key = 'handoffs-vz-stalled'").detector), "the Rollback line retires the detector and marks the failure mode");
ok(q(db, "SELECT reliability FROM capability_ledger WHERE capability = 'handoffs-vector-index-hourly-producer'").reliability === "retired by rollback", "the Rollback line retires the capability row");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

// IDEAS-CAP-DETECTOR-MINUTES-1 offline suite: replays migrations/2026-10-19-ideas-cap-rate.sql and then 2026-10-19-ideas-cap-detector-minutes.sql on SQLite.
// Proves: the detector of fm-ideas-cap-hold-no-expiry states minutes (no "hours" anywhere in the probe, the failure mode text or the closing probe of issue 100233);
// it reads 0 with no stale hold, 0 with a stale hold and a trickle event inside 120 minutes, and counts the stale holds when the last trickle event is older than
// 120 minutes or absent (a held row 119 minutes old is not stale; a row 121 minutes old is); a hold that was invisible to the 72-hour bound (50 h) is now seen;
// the closing probe of issue 100233 flips from hours-bound to ok; the decision is logged once; re-applying changes nothing and does not overwrite a later edit;
// the Rollback line restores the 72-hour probe and text byte for byte.
// Run: node migrations/ideas-cap-detector-minutes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const base = readFileSync(here("2026-10-19-ideas-cap-rate.sql"), "utf8");
const sql = readFileSync(here("2026-10-19-ideas-cap-detector-minutes.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, idea TEXT, status TEXT, created_at TEXT, decision TEXT, rationale TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;`);
db.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES ('research-admission-cap', 'idea-hub/worker.js', 'cap', 'x', 0, 'demote', 'applied', 'a', NULL, 'e', NULL, '2026-10-19T04:56:02Z')").run();
db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module, attempts, last_verdict, next_due_at) VALUES ('issue-100047', 100047, 'p', 'a', 'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN (''queued'',''researching'',''review'',''deferred'')) >= 120 THEN ''pending: research_queue at the admission cap, nothing to release yet'' ELSE ''0'' END AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'active', 'probe-template-v3-generic', 19, 'fail', '2099-01-01 00:00:00')").run();
db.exec(base);

const probeOf = (cls) => db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls).verify_probe;
const OLD_PROBE = probeOf("fm-ideas-cap-hold-no-expiry");
const OLD_FM = db.prepare("SELECT detector, symptom FROM failure_modes WHERE fm_key = 'ideas-cap-hold-no-expiry'").get();
ok(OLD_PROBE.includes("-72 hours") && OLD_FM.detector.includes("72 hours"), "the IDEAS-CAP-RATE-1 migration leaves the 72-hour bound that this one replaces");
// The closing probe of issue 100233 as filed (agent_issues 100233 contract), run against the same rows.
const CLOSING = "SELECT 'ok' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_contracts WHERE class = 'fm-ideas-cap-hold-no-expiry' AND verify_probe LIKE '%hours%') = 0 AND (SELECT COUNT(*) FROM remediation_contracts WHERE class = 'fm-ideas-cap-hold-no-expiry' AND verify_probe LIKE '%minutes%') = 1 THEN 'ok' ELSE 'hours-bound' END AS observed";
ok(db.prepare(CLOSING).get().observed === "hours-bound", "the closing probe of issue 100233 fails before the migration");

db.exec(sql);

const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-ideas-cap-hold-no-expiry'").get();
ok(det.verify_transport === "d1-query" && det.module === "failure-mode" && det.status === "active" && det.expected_cadence_h === 1, "still one active d1-query failure-mode detector", det);
ok(!/hours/i.test(det.verify_probe) && det.verify_probe.includes("minutes") && det.verify_probe.includes("idea-cap-trickle"), "the detector states minutes and reads the trickle event", det.verify_probe.slice(0, 120));
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'ideas-cap-hold-no-expiry'").get();
ok(!/hours/i.test(fm.detector) && !/hours/i.test(fm.symptom) && fm.detector.includes("120 minutes") && fm.symptom.includes("120 minutes"), "the failure mode text states 120 minutes and no hours", [fm.detector.slice(0, 90), fm.symptom.slice(0, 90)]);
ok(fm.root_cause && fm.remediation && fm.issue_id === 100047 && fm.probe_class === "fm-ideas-cap-hold-no-expiry", "the rest of the failure mode row is untouched");
ok(db.prepare(CLOSING).get().observed === "ok", "the closing probe of issue 100233 reads ok after the migration");

// The live shape: research_queue far over the cap, held rows of several ages.
const rq = db.prepare("INSERT INTO research_queue VALUES (?, 'queued')");
for (let i = 0; i < 473; i++) rq.run("q" + i);
const iso = (min) => new Date(Date.now() - min * 6e4).toISOString().slice(0, 23) + "Z";
const hold = db.prepare("INSERT INTO idea_proposals (idea, status, created_at, decision, rationale) VALUES (?, 'triaged_hold', ?, 'ACCEPT', '[research admission cap 473/120] x')");
const ev = db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, 't', '{}', 'idea-hub', 'ok')");
const read = () => db.prepare(probeOf("fm-ideas-cap-hold-no-expiry")).get();

let r = read();
ok(r.expected === "0" && r.observed === "0", "no held row: reads 0", r);
hold.run("fresh 119 min", iso(119));
r = read();
ok(r.observed === "0", "a hold 119 minutes old is not stale: reads 0", r);
hold.run("stale 50 h", iso(50 * 60));
hold.run("stale 121 min", iso(121));
r = read();
ok(r.observed === "2", "no trickle event ever: counts the two holds older than 120 minutes (the 50 h hold the 72-hour bound did not see)", r);
ev.run("e1", iso(130), "idea-cap-trickle");
r = read();
ok(r.observed === "2", "a trickle event 130 minutes old is not live: still counts", r);
ev.run("e2", iso(119), "idea-cap-trickle");
r = read();
ok(r.observed === "0", "a trickle event 119 minutes old: the rate is alive, reads 0 while the backlog drains", r);
db.exec("DELETE FROM cloud_ops_events");
ev.run("e3", iso(5), "idea-triage-budget");
r = read();
ok(r.observed === "2", "only an idea-cap-trickle event counts as liveness (an idea-triage-budget event does not)", r);
db.exec("UPDATE idea_proposals SET status = 'triaged_accepted' WHERE idea LIKE 'stale%'");
r = read();
ok(r.observed === "0", "the backlog drained (no stale hold left): reads 0 with no trickle event", r);
db.prepare("INSERT INTO idea_proposals (idea, status, created_at, decision, rationale) VALUES ('other hold', 'triaged_hold', ?, 'HOLD', 'noise/question filter')").run(iso(5000));
db.prepare("INSERT INTO idea_proposals (idea, status, created_at, decision, rationale) VALUES ('accepted other hold', 'triaged_hold', ?, 'ACCEPT', 'not a cap row')").run(iso(5000));
r = read();
ok(r.observed === "0", "holds with another rationale are not cap holds", r);

// Decision and idempotency.
const dec = () => db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'IDEAS-CAP-DETECTOR-MINUTES-1:') = 1").get().n;
ok(dec() === 1, "one decision_log row");
const dl = db.prepare("SELECT * FROM decision_log WHERE instr(action, 'IDEAS-CAP-DETECTOR-MINUTES-1:') = 1").get();
ok(dl.capability_gain && dl.predicted_outcome && dl.surfaces_tested && dl.rollback_path && dl.actor === "session_01JADz8uHqYt9eUMBTwbbBE6", "the decision names capability gain, predicted outcome, surfaces and rollback");
db.prepare("UPDATE remediation_contracts SET verify_probe = verify_probe || ' ' WHERE class = 'fm-ideas-cap-hold-no-expiry'").run();
const edited = probeOf("fm-ideas-cap-hold-no-expiry");
db.exec(sql);
ok(dec() === 1 && db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class LIKE 'fm-%'").get().n === 1, "re-applying adds no row");
ok(probeOf("fm-ideas-cap-hold-no-expiry") === edited, "a later detector edit is not overwritten by a re-apply");

// Rollback restores the 72-hour text byte for byte.
const rb = /^-- Rollback: (.*)$/m.exec(sql);
ok(rb && !/\b(DELETE|DROP)\b/i.test(rb[1]), "the Rollback line exists and deletes nothing (decision_log is append-only)");
db.exec(rb[1]);
const back = db.prepare("SELECT detector, symptom FROM failure_modes WHERE fm_key = 'ideas-cap-hold-no-expiry'").get();
ok(probeOf("fm-ideas-cap-hold-no-expiry") === OLD_PROBE && back.detector === OLD_FM.detector && back.symptom === OLD_FM.symptom, "the Rollback line restores the 72-hour probe, detector and symptom byte for byte");
ok(db.prepare(CLOSING).get().observed === "hours-bound", "after the rollback the closing probe fails again (the defect is back)");

// Header lines the migration runner requires.
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "APPLY-BY and DB headers present");
ok(!/\bDELETE\b|\bDROP\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no DELETE or DROP statement, so no BACKUP header is needed");

console.log("ideas-cap-detector-minutes: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// CENSUS-EXTERNAL-HEARTBEAT-2 offline suite: replays migrations/2026-10-26-census-heartbeat-refresh.sql on SQLite with the live table shapes.
// Proves: the attested list is seeded with the two names the runner wrote at 18:18Z and the runner's own upsert of it keeps working; a second apply adds nothing;
// the detector fm-census-heartbeat-ages-out reads 0 while every attested heartbeat is fresh and ok and reads the count when one is older than 100 minutes or not ok,
// and ignores a worker that is not on the list (a cron-only worker with its own heartbeat); an empty or missing list reads 0; the Rollback line removes the rows and
// keeps the append-only decision.
// Run: node --no-warnings migrations/census-heartbeat-refresh.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-census-heartbeat-refresh.sql", import.meta.url), "utf8");
const fj = readFileSync(new URL("../scripts/fleet_journeys.py", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in and DB headers are present");
ok(!/\b(DELETE|DROP)\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no statement deletes or drops, so no BACKUP header is needed");

const DDL = `
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT,
  first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT,
  last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL,
  evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
`;
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
const fresh = () => { const d = new DatabaseSync(":memory:"); d.exec(DDL); d.exec(body); return d; };
const count = (d, t) => d.prepare("SELECT COUNT(*) AS n FROM " + t).get().n;
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace(/\.\d+Z$/, "Z");

const d = fresh();
ok(count(d, "ops_config") === 1 && count(d, "failure_modes") === 1 && count(d, "remediation_contracts") === 1 && count(d, "decision_log") === 1, "one seed row, one failure mode, one detector contract, one decision");
const seed = d.prepare("SELECT value FROM ops_config WHERE key = 'census_external_attested'").get();
ok(JSON.stringify(JSON.parse(seed.value)) === JSON.stringify(["qnfo-workers", "voice-stt"]), "the list is seeded with the two names the runner wrote at 18:18Z", seed);
// the runner's own upsert (scripts/fleet_journeys.py ATTESTED_KEY) replaces the list, and a second apply of the file does not undo it
d.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
  .run("census_external_attested", JSON.stringify(["qnfo-workers", "voice-stt", "x"]), "n", "t");
d.exec(body);
ok(JSON.parse(d.prepare("SELECT value FROM ops_config WHERE key = 'census_external_attested'").get().value).length === 3, "a second apply keeps the list the runner extended");
ok(count(d, "failure_modes") === 1 && count(d, "remediation_contracts") === 1 && count(d, "decision_log") === 1, "and adds no other row");
ok(fj.includes('ATTESTED_KEY = "census_external_attested"'), "the key the runner reads is the key the file seeds");

const probe = d.prepare("SELECT verify_probe, verify_transport, status, expected_cadence_h FROM remediation_contracts WHERE class = 'fm-census-heartbeat-ages-out'").get();
ok(probe.verify_transport === "d1-query" && probe.status === "active" && probe.expected_cadence_h === 1, "the detector is an active, hourly d1-query contract", probe);
const read = (db) => db.prepare(probe.verify_probe).get();
const f = fresh();
ok(read(f).expected === "0" && read(f).observed === "0", "with no heartbeat rows the detector reads 0 (nothing attested is overdue)", read(f));
const beat = (db, w, min, okv = 1) => db.prepare("INSERT OR REPLACE INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, 'v', ?2, ?3)").run(w, iso(min), okv);
beat(f, "qnfo-workers", 60); beat(f, "voice-stt", 5);
ok(read(f).observed === "0", "fresh attested heartbeats (60 and 5 minutes) read 0", read(f));
beat(f, "qnfo-workers", 130);
ok(read(f).observed === "1", "an attested heartbeat older than 100 minutes reads 1 (the refresh stopped)", read(f));
beat(f, "qnfo-workers", 60, 0);
ok(read(f).observed === "1", "an attested heartbeat that is not ok reads 1", read(f));
beat(f, "qnfo-workers", 60); beat(f, "cron-only-own", 600);
ok(read(f).observed === "0", "a stale heartbeat of a worker that is not on the list is not this detector's business", read(f));
f.exec("DELETE FROM ops_config WHERE key = 'census_external_attested'");
beat(f, "qnfo-workers", 600);
ok(read(f).observed === "0", "a missing list reads 0, not an error", read(f));

const rb = fresh();
rb.exec(rollback.split("decision_log is append-only")[0]);
ok(count(rb, "ops_config") === 0 && count(rb, "failure_modes") === 0 && count(rb, "remediation_contracts") === 0 && count(rb, "decision_log") === 1, "the Rollback line removes the seed, the failure mode and the detector and keeps the decision");
rb.exec(body);
ok(count(rb, "ops_config") === 1 && count(rb, "decision_log") === 1, "and the file applies again after its rollback");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

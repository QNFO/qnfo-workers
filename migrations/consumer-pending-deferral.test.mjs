// CONSUMER-PENDING-IS-DEFERRAL-1 offline suite: runs migrations/2026-10-19-consumer-pending-deferral.sql on SQLite. Proves the failure mode, its detector
// and the decision are recorded once (the file is re-runnable), that the detector is a literal read the consumer will execute, and that it counts exactly
// the rows the consumer must no longer write: a plain pending pass = 0 row from remediation-consumer@* after the grace anchor; not a measured-pending
// row, a pass, a stale read, a row from another verifier, nor a row inside the grace window. The consumer's behaviour is covered by
// scripts/consumer-pending.test.mjs. Run: node migrations/consumer-pending-deferral.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-consumer-pending-deferral.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .*fm-consumer-pending-recorded-as-failure/m.test(sql), "the migration opts in with the three header lines and the rollback removes the detector");
ok(!/\b(DELETE|DROP)\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the body deletes and drops nothing, so it needs no BACKUP line");
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT, expected TEXT, observed TEXT, pass INTEGER, verifier TEXT, verified_at TEXT DEFAULT (datetime('now')));`);
db.exec(sql);
db.exec(sql); // re-running it changes nothing
const q = (s, ...a) => db.prepare(s).all(...a);
const fm = q("SELECT * FROM failure_modes WHERE fm_key = 'consumer-pending-recorded-as-failure'");
ok(fm.length === 1 && fm[0].issue_id === 2954 && fm[0].probe_class === "fm-consumer-pending-recorded-as-failure", "the failure mode is recorded once against issue 2954", fm);
const c = q("SELECT * FROM remediation_contracts WHERE class = 'fm-consumer-pending-recorded-as-failure'");
ok(c.length === 1 && c[0].verify_transport === "d1-query" && c[0].status === "active" && c[0].expected_cadence_h === 1 && c[0].issue_id === null, "the detector contract is active, hourly, d1-query and standing (no issue)", c);
const dl = q("SELECT * FROM decision_log WHERE instr(action, 'CONSUMER-PENDING-IS-DEFERRAL-1:') = 1");
ok(dl.length === 1 && dl[0].capability_gain && dl[0].predicted_outcome && dl[0].rollback_path, "the decision is logged once with its capability gain and predicted outcome", dl.length);
const probe = c[0].verify_probe;
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
ok(/^select /i.test(probe) && !probe.includes(";") && !WRITE_KW.some((k) => probe.toLowerCase().includes(k)), "the probe is a literal read the consumer executes (select, one statement, no write keyword)", probe.slice(0, 120));
const run = () => q(probe)[0];
ok(run().expected === "0" && run().observed === "0", "the detector passes with no rows", run());
const row = (observed, pass, verifier, when) => db.prepare("INSERT INTO remediation_verifications (class, transport, expected, observed, pass, verifier, verified_at) VALUES ('issue-1', 'd1-query', 'ok', ?, ?, ?, strftime('%Y-%m-%d %H:%M:%S', 'now', ?))").run(observed, pass, verifier, when);
const PLAIN = "pending: filed by qnfo-fleet-control, which owns it for 48h";
row(PLAIN, 0, "remediation-consumer@abc", "+0 minutes");
row(PLAIN, 0, "remediation-consumer@abc", "+60 minutes");
ok(run().observed === "0", "rows written by runs in flight at the merge (inside the 90 minute grace) are not counted", run());
row("pending: worker_count 33 (needs <= 24)", 0, "remediation-consumer@abc", "+3 hours");
row("pending: 169 open issues, ceiling 50", 0, "remediation-consumer@abc", "+3 hours");
row("stale: the filing loop did not close it within 48h", 0, "remediation-consumer@abc", "+3 hours");
row("ok", 1, "remediation-consumer@abc", "+3 hours");
row(PLAIN, 0, "qnfo-fleet-control/remediation-tick@0.37.0", "+3 hours");
row(PLAIN, 1, "remediation-consumer@abc", "+3 hours");
ok(run().observed === "0", "measured-pending, stale, pass, other-verifier and pass = 1 rows are not counted", run());
row(PLAIN, 0, "remediation-consumer@def", "+3 hours");
ok(run().observed === "1" && run().expected === "0", "one plain-pending pass = 0 row from a consumer run after the grace fails the detector", run());
row("Pending: window not open", 0, "remediation-consumer@def", "+4 hours");
row("pending", 0, "remediation-consumer@def", "+4 hours");
ok(run().observed === "3", "every plain-pending form is counted (case, bare word)", run());
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

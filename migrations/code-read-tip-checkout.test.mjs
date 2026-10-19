// CODE-READ-STALE-CHECKOUT-1 offline suite: runs migrations/2026-10-19-code-read-tip-checkout.sql on SQLite. Proves the failure mode and its
// detector are recorded, the detector passes while no active contract holds a checkout-older-than-contract verdict past 120 minutes, and
// fails for one that does (and not for a fresh one, a passing one, or a superseded one). The consumer's git behaviour is covered by
// scripts/remediation_consumer.py --selftest. Run: node migrations/code-read-tip-checkout.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-code-read-tip-checkout.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: /m.test(sql), "the migration opts in with the three header lines");
ok(!/\b(DELETE|DROP)\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the body deletes and drops nothing, so it needs no BACKUP line");
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, next_due_at TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, last_verdict TEXT, last_attempt_at TEXT);`);
db.exec(sql);
db.exec(sql); // INSERT OR IGNORE: applying it twice changes nothing
const q = (s, ...a) => db.prepare(s).all(...a);
const fm = q("SELECT * FROM failure_modes WHERE fm_key = 'code-read-checkout-false-stale'");
ok(fm.length === 1 && fm[0].issue_id === 100081 && fm[0].probe_class === "fm-code-read-checkout-false-stale", "the failure mode is recorded once against issue 100081", fm);
const c = q("SELECT * FROM remediation_contracts WHERE class = 'fm-code-read-checkout-false-stale'");
ok(c.length === 1 && c[0].verify_transport === "d1-query" && c[0].status === "active" && c[0].expected_cadence_h === 1, "the detector contract is active, hourly, d1-query", c);
const run = () => q(c[0].verify_probe)[0];
ok(run().expected === "0" && run().observed === "0", "the detector passes with no deferred contract", run());
const ins = (cls, status, verdict, ago) => db.prepare(`INSERT INTO remediation_contracts (class, status, last_verdict, last_attempt_at) VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%S', 'now', ?))`).run(cls, status, verdict, ago);
ins("issue-1", "active", "checkout-older-than-contract", "-30 minutes");
ok(run().observed === "0", "a deferral younger than 120 minutes is not yet a failure", run());
ins("issue-2", "active", "pass", "-300 minutes");
ins("issue-3", "superseded", "checkout-older-than-contract", "-300 minutes");
ok(run().observed === "0", "a passing or a superseded contract is not counted", run());
ins("issue-4", "active", "checkout-older-than-contract", "-121 minutes");
ok(run().observed === "1" && run().expected === "0", "an active contract still deferred after 120 minutes fails the detector", run());
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

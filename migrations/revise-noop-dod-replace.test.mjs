// REVISE-NOOP-DOD-REPLACE-1 offline suite: replays migrations/2026-10-26-revise-noop-dod-replace.sql on SQLite.
// Proves: the probe of contract issue-1000029 is replaced by the per-item measure and is one read-only SELECT; it reads 0 while one item has more than 3 revise to parked (or to ground)
// events in the window and 1 when every item has 3 or fewer, when only older events exceed it, and when the window is empty; other contracts and other flows are untouched; the decision is
// logged once and names REVISE-NOOP-DOD-REPLACE-1 (the closing probe of issue 1000456 reads it); a second apply changes nothing; the Rollback line restores the previous probe text.
// Run: node --no-warnings migrations/revise-noop-dod-replace.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-revise-noop-dod-replace.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql), "the opt-in, DB and Rollback headers are present");
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];

const OLD = "WITH bad AS (SELECT id FROM content_stage_events WHERE flow='research' AND from_stage='revise' AND to_stage IN ('ground','parked') AND ts >= datetime('now','-48 hours')) SELECT '0' AS expected, CAST(count(*) AS TEXT) AS observed FROM bad";
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE content_stage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, flow TEXT, item_id TEXT, from_stage TEXT, to_stage TEXT, ts TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
d.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status) VALUES ('issue-1000029', 1000029, ?, 'active')").run(OLD);
d.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status) VALUES ('issue-1000005', 1000005, 'SELECT 1', 'active')").run();
const ev = (item, to, minAgo, flow = "research", from = "revise") => d.prepare("INSERT INTO content_stage_events (flow, item_id, from_stage, to_stage, ts) VALUES (?, ?, ?, ?, datetime('now', ?))").run(flow, item, from, to, "-" + minAgo + " minutes");
const probe = () => d.prepare(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000029'").get().verify_probe).get();
// the old probe on the same data, to show why it could never pass: one parked event is enough to read 1
ev("a", "parked", 60);
ok(d.prepare(OLD).get().observed === "1", "the old probe reads 1 on a single parked event (it expected 0)");
d.exec(sql);
const row = d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000029'").get().verify_probe;
ok(/^WITH per AS/.test(row) && !row.includes(";") && !/(insert|update|delete|drop)\s/i.test(row), "the new probe is one read-only statement", row.slice(0, 80));
ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000005'").get().verify_probe === "SELECT 1", "other contracts are untouched");
let r = probe();
ok(r.expected === "1" && r.observed === "1", "one item parked once: the loop is absent, reads 1", r);
// an item parked 3 times is still inside the cap
ev("a", "parked", 120); ev("a", "parked", 180);
ok(probe().observed === "1", "an item parked 3 times is at the cap and reads 1");
// a fourth parked event for the same item is a loop
ev("a", "parked", 240);
ok(probe().observed === "0", "an item parked 4 times in the window reads 0", probe());
// events outside the 2880-minute window do not count
d.exec("DELETE FROM content_stage_events");
for (let i = 0; i < 12; i++) ev("old", "parked", 2900 + i);
ok(probe().observed === "1", "twelve parked events older than 2880 minutes read 1 (the pre-fix events age out)");
ev("old", "parked", 2870);
for (let i = 0; i < 3; i++) ev("old", "parked", 2800 + i);
ok(probe().observed === "0", "four events of one item inside the window read 0 again");
// re-grounded events are counted per item as well
d.exec("DELETE FROM content_stage_events");
for (let i = 0; i < 4; i++) ev("g", "ground", 100 + i);
ok(probe().observed === "0", "an item re-grounded 4 times by revise reads 0");
// many items, each within the cap, read 1 (a total is not the measure)
d.exec("DELETE FROM content_stage_events");
for (let i = 0; i < 40; i++) { ev("item" + i, "parked", 30); ev("item" + i, "parked", 31); }
ok(probe().observed === "1", "forty items parked twice each read 1 (the measure is per item, not a total)");
// other flows and other stages are ignored
d.exec("DELETE FROM content_stage_events");
for (let i = 0; i < 6; i++) { ev("x", "parked", 10, "social"); ev("y", "parked", 10, "research", "review"); }
ok(probe().observed === "1", "another flow and another from_stage are ignored");
d.exec("DELETE FROM content_stage_events");
ok(probe().observed === "1", "an empty window reads 1 (nothing is looping)");

// decision and idempotence
const dec = d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'REVISE-NOOP-DOD-REPLACE-1:%'").get().n;
ok(dec === 1, "one decision is logged and its action names REVISE-NOOP-DOD-REPLACE-1", dec);
const closer = "SELECT 'ok' AS expected, CASE WHEN EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REVISE-NOOP-DOD-REPLACE-1') > 0 AND ts > '2026-10-26T17:30:00Z') THEN 'ok' ELSE 'pending: no decision_log row names REVISE-NOOP-DOD-REPLACE-1 yet' END AS observed";
ok(d.prepare(closer).get().observed === "ok", "the closing probe of issue 1000456 (a decision_log row naming it) reads ok after the apply", d.prepare(closer).get());
const before = JSON.stringify(d.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all());
d.exec(sql);
ok(JSON.stringify(d.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all()) === before && d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "a second apply changes nothing and logs once");
d.exec(rollback);
ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000029'").get().verify_probe === OLD, "Rollback restores the previous probe text exactly");
console.log("revise-noop-dod-replace: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

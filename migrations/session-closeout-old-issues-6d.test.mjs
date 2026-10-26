// SESSION-CLOSEOUT-20261026-OLD-ISSUES-6D offline suite: replays migrations/2026-10-26-session-closeout-old-issues-6d.sql on SQLite.
// Proves: the superseded circular contract of issue 1000478 is replaced by a probe that measures the metric (fails on the stale 33.3 percent value and on a missing row, passes on NULL
// and on a value in 0..1), the contract is active again, a contract that is not superseded is left alone, the session row is written once with honest counts, a second apply changes
// nothing, and the Rollback line restores the old contract and removes the row.
// Run: node --no-warnings migrations/session-closeout-old-issues-6d.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-session-closeout-old-issues-6d.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in and DB headers are present");
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(!/\b(DELETE|DROP)\b/i.test(body), "no statement deletes or drops, so no BACKUP header is needed");
const OLD = "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 1000478) AS observed";
const DDL = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, status TEXT DEFAULT 'active', last_verdict TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE session_records (session_id TEXT PRIMARY KEY, wbs_code TEXT NOT NULL, agent_name TEXT, summary TEXT NOT NULL, decisions_made TEXT, files_changed TEXT, commits TEXT,
  infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`;
const fresh = (status = "superseded") => {
  const d = new DatabaseSync(":memory:");
  d.exec(DDL);
  d.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status, last_verdict) VALUES ('issue-1000478', ?1, 'd1-query', ?2, 'superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1)')").run(OLD, status);
  d.exec("INSERT INTO metric_registry VALUES ('ask_helpful_rate_30d', '33.3', '2026-10-25T08:45:00Z', 'MEASURED')");
  d.exec(body);
  return d;
};
const d = fresh();
const c = d.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-1000478'").get();
ok(c.status === "active" && c.last_verdict === null && c.verify_transport === "d1-query" && c.verify_probe !== OLD, "the contract is replaced and active again", c);
const run = (db) => db.prepare(c.verify_probe).get();
ok(run(d).expected === "ok" && run(d).observed.includes("33.3"), "the probe fails on the stale 33.3 percent value and names it", run(d));
for (const [label, setup, want] of [
  ["NULL after the next measure tick", "UPDATE metric_registry SET last_value = NULL, last_refreshed = NULL, state = 'UNMEASURED'", "ok"],
  ["a value in 0..1", "UPDATE metric_registry SET last_value = '0.25'", "ok"],
  ["a value of 1", "UPDATE metric_registry SET last_value = '1'", "ok"],
]) {
  const x = fresh();
  x.exec(setup);
  ok(run(x).observed === want, "the probe passes on " + label, run(x));
}
const gone = fresh();
gone.exec("DELETE FROM metric_registry");
ok(run(gone).observed.includes("missing"), "the probe fails when the metric row is missing (no pass by absence)", run(gone));
const act = fresh("active");
ok(act.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1000478'").get().verify_probe === OLD, "a contract that is not superseded is left alone");
const s = d.prepare("SELECT * FROM session_records").all();
ok(s.length === 1 && s[0].session_id === "session-old-issues-6d-2038" && s[0].total_tasks === 21 && s[0].completed_tasks === 11 && Math.abs(s[0].execution_ratio - 11 / 21) < 0.01, "one session row with 21 tasks, 11 completed and the matching ratio", s[0] && { t: s[0].total_tasks, c: s[0].completed_tasks, r: s[0].execution_ratio });
ok(s[0].commits.split(" ").length === 15, "the row lists the 15 pull requests", s[0].commits);
d.exec(body);
ok(d.prepare("SELECT COUNT(*) AS n FROM session_records").get().n === 1 && d.prepare("SELECT status FROM remediation_contracts").get().status === "active", "a second apply changes nothing");
d.exec(rollback);
const back = d.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-1000478'").get();
ok(back.status === "superseded" && back.verify_probe === OLD && d.prepare("SELECT COUNT(*) AS n FROM session_records").get().n === 0, "the Rollback line restores the old contract and removes the row", back);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

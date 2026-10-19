// NOOP-COPY-GOAL-PROBE-1 offline suite: replays migrations/2026-10-19-noop-copy-goal-probe.sql on SQLite.
// Proves: the closing contract of issue 100181 is restated as a d1-query probe that counts needs_human code tasks parked on a noop or no-change verdict; it reads the parked
// count while they stand and 0 once they leave needs_human; a failed or merged task with the same text is not counted; a second apply changes nothing and keeps one decision_log row;
// the Rollback line restores the earlier probe and action byte for byte; every LIKE literal is within D1's 50 byte limit.
// Run: node migrations/noop-copy-goal-probe.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-noop-copy-goal-probe.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const OLD_PROBE = rollback.match(/verify_probe = '((?:[^']|'')*)'/)[1].replace(/''/g, "'");
const OLD_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, action TEXT NOT NULL DEFAULT '', verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT, next_due_at TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, goal TEXT, last_error TEXT);`);
d.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, verify_transport, status, last_verdict, attempts) VALUES ('issue-100181', 100181, ?, ?, 'd1-query', 'active', 'fail', 19)").run(OLD_ACTION, OLD_PROBE);
d.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, verify_transport, status) VALUES ('issue-1', 1, 'keep', 'keep', 'd1-query', 'active')").run();
const get = () => d.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-100181'").get();
d.exec(sql);
const c = get();
ok(c.status === "active" && c.verify_transport === "d1-query" && c.last_verdict === null && c.attempts === 0 && /NOOP-COPY-GOAL-PROBE-1/.test(c.action), "the contract is restated, active, verdict cleared", c);
ok(!/agent_issues/.test(c.verify_probe), "the probe never reads the status of the issue itself");
ok(d.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-1'").get().verify_probe === "keep", "an unrelated contract is untouched");
const lits = [...c.verify_probe.matchAll(/LIKE '([^']*)'/g)].map((m) => Buffer.byteLength(m[1]));
ok(lits.length === 2 && lits.every((n) => n <= 50), "every LIKE literal is within 50 bytes", lits);
const ins = d.prepare("INSERT INTO code_tasks (id, status, goal, last_error) VALUES (?, ?, 'g', ?)");
const probe = () => d.prepare(get().verify_probe).get();
ins.run("a", "needs_human", "model m: noop-proposal: the edit changes only the words");
ins.run("b", "needs_human", "model m proposed no change");
ins.run("c", "needs_human", "some other reason");
ins.run("d", "failed", "model m: noop-proposal: only comments changed");
ins.run("e", "merged", null);
ok(probe().expected === "0" && probe().observed === "2", "counts only the parked noop and no-change tasks", probe());
d.exec("UPDATE code_tasks SET status = 'superseded' WHERE id IN ('a', 'b')");
ok(probe().observed === "0", "reads 0 once they leave needs_human", probe());
d.exec(sql);
ok(d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && get().attempts === 0, "a second apply changes nothing and keeps one decision_log row");
d.exec(rollback);
ok(get().verify_probe === OLD_PROBE && get().action === OLD_ACTION, "Rollback restores the earlier probe and action byte for byte");
console.log("noop-copy-goal-probe: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// ROOT-CAUSE-PROBE-AT-BIRTH-1 offline suite: migrations/2026-10-26-root-cause-probe-at-birth.sql files one issue and gives its contract a probe that reads the real condition
// (open ROOT-CAUSE-1 tickets standing on a superseded contract). Replayed in node:sqlite with the live birth shape (an issue is born with a superseded contract).
// Run: node --no-warnings migrations/root-cause-probe-at-birth.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-root-cause-probe-at-birth.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const TITLE = "ROOT-CAUSE-PROBE-AT-BIRTH-1: a ROOT-CAUSE-1 ticket is filed with a probe, so it does not breed a PROBE-NEEDED-1 twin";
const fresh = (birth = true) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, last_verdict TEXT, module TEXT, attempts INTEGER DEFAULT 0, next_due_at TEXT);`);
  if (birth) db.exec(`CREATE TRIGGER birth AFTER INSERT ON agent_issues BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'p', 'VACUOUS-PROBE-V3-1: this contract measures nothing', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'probe-template-v3-generic'); END;`);
  // ten open ROOT-CAUSE-1 tickets on superseded contracts, one on an active contract, one closed ticket, one unrelated
  const add = db.prepare("INSERT INTO agent_issues (title, description, source, status) VALUES (?, 'd', 'management-personas', ?)");
  for (let i = 0; i < 10; i++) add.run("ROOT-CAUSE-1: FAM-" + i + " keeps recurring", "open");
  add.run("ROOT-CAUSE-1: FAM-X keeps recurring", "open"); db.exec("UPDATE remediation_contracts SET status = 'active' WHERE class = 'issue-11'");
  add.run("ROOT-CAUSE-1: FAM-Y keeps recurring", "closed");
  add.run("SOMETHING-ELSE-1: unrelated", "open");
  return db;
};
const one = (db, s, ...a) => db.prepare(s).get(...a);
const probeOf = (db) => one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = ? )", TITLE).verify_probe;
const run = (db, p) => one(db, p);
const db = fresh();
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+$/m.test(sql), "the three migration headers exist");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "the body runs no DELETE or DROP");
const before = db.prepare("SELECT class, status FROM remediation_contracts ORDER BY class").all().map((r) => r.class + ":" + r.status).join(",");
db.exec(sql); db.exec(sql);
ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title = ?", TITLE).n === 1, "applied twice: exactly one issue");
const c = one(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = ?)", TITLE);
ok(c.status === "active" && c.verify_transport === "d1-query" && c.module === "root-cause-probe-at-birth-1" && c.attempts === 0, "its contract is active, d1-query, owned by this issue", c);
const p = probeOf(db), r = run(db, p);
ok(r.expected === "0" && r.observed === "10", "the probe reads 10 on the fixture (ten open ROOT-CAUSE-1 tickets on superseded contracts), not passing", r);
ok(!/\b(insert|update|delete|drop|alter|create|replace)\b/i.test(p), "the probe is a single read with no write keyword (the runners scan the text)");
const after = db.prepare("SELECT class, status FROM remediation_contracts ORDER BY class").all().filter((x) => x.class !== c.class).map((x) => x.class + ":" + x.status).join(",");
ok(before === after, "no other contract is touched", { before, after });
// the probe passes when the tickets are probed or closed, and ignores the active, the closed and the unrelated ones
db.exec("UPDATE remediation_contracts SET status = 'active' WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'ROOT-CAUSE-1:%')");
ok(run(db, p).observed === "0", "it reads 0 once every open ROOT-CAUSE-1 ticket has a live contract");
db.exec("UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'issue-3'");
ok(run(db, p).observed === "1", "it reads 1 when one ticket stands on a superseded contract again");
db.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 3");
ok(run(db, p).observed === "0", "a closed ticket is not counted");
// without a birth trigger the fallback contract insert still leaves an armed probe
const bare = fresh(false);
bare.exec(sql);
const cb = one(bare, "SELECT status, verify_transport FROM remediation_contracts WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = ?)", TITLE);
ok(cb && cb.status === "active" && cb.verify_transport === "d1-query", "with no birth contract the migration still arms one", cb);
// a contract another doer already wrote is left alone
const mine = fresh();
mine.exec(sql.split("UPDATE remediation_contracts")[0]); // issue + birth contract, no re-arm yet
mine.exec("UPDATE remediation_contracts SET status = 'active', verify_probe = 'SELECT ''x'' AS expected, ''x'' AS observed', module = 'someone-else' WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = '" + TITLE + "')");
mine.exec(sql);
ok(one(mine, "SELECT module FROM remediation_contracts WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = ?)", TITLE).module === "someone-else", "a contract that is no longer superseded is left alone");
const down = /^-- Rollback: (.*)$/m.exec(sql)[1];
db.exec(down);
ok(one(db, "SELECT status, close_channel FROM agent_issues WHERE title = ?", TITLE).status === "closed" && one(db, "SELECT close_channel FROM agent_issues WHERE title = ?", TITLE).close_channel === "rollback:ROOT-CAUSE-PROBE-AT-BIRTH-1", "the Rollback closes the issue and names its channel (an issue is never deleted)");
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

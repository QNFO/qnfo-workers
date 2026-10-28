// BREACH-DOCTOR-PHASE-B-1 offline suite. Run: node migrations/issue-age-ladder-breach-doctor.test.mjs
import { DatabaseSync } from "node:sqlite"; import { readFileSync } from "node:fs";
const db = new DatabaseSync(":memory:");
const mig = readFileSync(new URL("./2026-10-28-issue-age-ladder-breach-doctor.sql", import.meta.url), "utf8");
const m = mig.match(/^-- Rollback: (.*)$/m);
db.exec(`CREATE TABLE agent_issues(id INTEGER PRIMARY KEY, title TEXT, priority TEXT, source TEXT, status TEXT, description TEXT, created_at INTEGER);
CREATE TABLE code_tasks(goal TEXT, status TEXT); CREATE TABLE work_claims(issue_id INTEGER, path TEXT, released_at TEXT, expires_at TEXT);
CREATE TABLE issue_plans(issue_id INTEGER, outcome TEXT, planned_at TEXT, detail TEXT);
CREATE TABLE breach_diagnoses(issue_id INTEGER, mode TEXT, state TEXT, action_ref TEXT, action_kind TEXT, lease_until TEXT, last_progress_at TEXT);`);
// the old view comes from the Rollback line, which proves that text is valid SQL too
db.exec(m[1].replace(/^DROP VIEW IF EXISTS v_issue_age_ladder; /, ""));
const day = Date.now() - 30 * 3600 * 1000, iso = (d) => new Date(d).toISOString().replace(/\.\d+Z$/, "Z");
const ins = db.prepare("INSERT INTO agent_issues VALUES (?,?,?,?,?,?,?)");
for (let i = 1; i <= 5; i++) ins.run(i, "t" + i, "high", "s", "open", "", day);
const dg = db.prepare("INSERT INTO breach_diagnoses VALUES (?,?,?,?,?,?,?)");
const fut = iso(Date.now() + 3600e3), now = iso(Date.now()), stale = iso(Date.now() - 3 * 3600e3);
dg.run(1, "on", "applied", "ref", "sql", fut, now);        // counts
dg.run(2, "measure", "applied", "ref", "sql", fut, now);   // measure mode never counts
dg.run(3, "on", "diagnosed", null, "none", fut, now);      // diagnosed alone never counts
dg.run(4, "on", "applied", "ref", "sql", fut, stale);      // lease without progress
const before = db.prepare("SELECT doer FROM v_issue_age_ladder WHERE id = 1").get().doer;
db.exec("DROP VIEW v_issue_age_ladder");
db.exec(mig.replace(/^--.*$/gm, "").replace(/CREATE TABLE IF NOT EXISTS bak_[^;]*;/, "").replace(/DROP VIEW IF EXISTS v_issue_age_ladder;/, ""));
const doer = (id) => db.prepare("SELECT doer, breach FROM v_issue_age_ladder WHERE id = ?").get(id);
let fail = 0; const ok = (c, msg, x) => { if (!c) { fail++; console.log("FAIL " + msg + (x ? " " + JSON.stringify(x) : "")); } };
ok(before === null, "the old view has no doctor branch");
ok(doer(1).doer === "breach doctor" && doer(1).breach === 0, "active doctor lease is a doer", doer(1));
ok(doer(2).doer === null && doer(2).breach === 1, "measure-mode row is not a doer", doer(2));
ok(doer(3).doer === null, "diagnosed alone is not a doer");
ok(doer(4).doer === null, "a lease without progress in 120 minutes is not a doer");
ok(doer(5).doer === null, "no diagnosis, no doer");
ok(Object.keys(db.prepare("SELECT * FROM v_issue_age_ladder LIMIT 1").get()).join() === "id,title,priority,source,age_h,doer,plan_outcome,planned_at,plan_reason,rung,breach", "same columns");
ok(!/breach doctor/.test(m[1]), "Rollback restores the old text");
console.log(fail ? fail + " failed" : "all passed"); process.exit(fail ? 1 : 0);

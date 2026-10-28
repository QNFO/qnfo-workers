// CLUSTER-E-C portfolio notes: offline suite for migrations/2026-10-28-cluster-e-c-portfolio-notes.sql. Replays it on node:sqlite and proves the two cf-one-dashboard gaps are
// resolved only while a successful deploy row exists, the YT.SHORTS mapping is written once, the 1000315 contract becomes a d1-query probe that returns expected and observed
// (and passes only with a committed archive row and three ok deposits), every note is appended once, and a second apply changes nothing.
// Run: node --no-warnings migrations/cluster-e-c-portfolio-notes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-28-cluster-e-c-portfolio-notes.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql) && /^-- BACKUP: bak_\w+$/m.test(sql), "migration headers present");
ok(!/^\s*(DELETE|DROP)\s/im.test(sql.replace(/^--.*$/gm, "")), "no DELETE or DROP statement in the body");

const mk = (withDeploy) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT);
CREATE TABLE portfolio_gaps (kind TEXT, entity TEXT, detail TEXT, status TEXT, resolved_at TEXT);
CREATE TABLE deployment_history (id INTEGER PRIMARY KEY, resource_name TEXT, action TEXT, status TEXT);
CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, project_code TEXT, program_code TEXT, kind TEXT, updated_at TEXT);
CREATE TABLE projects (project_code TEXT PRIMARY KEY);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, last_verdict TEXT, next_due_at TEXT, attempts INTEGER);
CREATE TABLE portfolio_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, repo TEXT, action TEXT, status TEXT, detail TEXT);
CREATE TABLE research_run_ledger (run_id TEXT PRIMARY KEY, repo TEXT, status TEXT);
`);
  for (const id of [2993, 99953, 1000315, 1000319, 1000582, 1000583, 1000591, 1000598, 1000703, 1000704]) db.prepare("INSERT INTO agent_issues VALUES (?, 't', 'd', 'open')").run(id);
  db.exec("INSERT INTO portfolio_gaps VALUES ('deploy-unrecorded', 'qnfo-cf-one-dashboard', 'x', 'open', NULL), ('project-stale-deploy', 'W.qnfo-cf-one-dashboard', 'y', 'open', NULL), ('deploy-unrecorded', 'other', 'z', 'open', NULL)");
  if (withDeploy) db.exec("INSERT INTO deployment_history (resource_name, action, status) VALUES ('qnfo-cf-one-dashboard', 'deployed', 'success')");
  db.exec("INSERT INTO projects VALUES ('YT.SHORTS')");
  db.exec("INSERT INTO remediation_contracts VALUES ('issue-1000315', '{http}', 'external-https', 'fail', NULL, 4)");
  return db;
};

const withNo = mk(false); withNo.exec(sql);
ok(withNo.prepare("SELECT COUNT(*) n FROM portfolio_gaps WHERE status = 'open'").get().n === 3, "no deploy row, no gap is resolved");

const db = mk(true);
db.exec(sql); db.exec(sql);
const gaps = db.prepare("SELECT entity, status, detail FROM portfolio_gaps ORDER BY entity").all();
ok(gaps.filter(g => g.status === "resolved").length === 2 && gaps.find(g => g.entity === "other").status === "open", "the two cf-one-dashboard gaps resolve and an unrelated gap stays open", gaps);
ok(gaps.filter(g => /cluster-e-c/.test(g.detail)).every(g => (g.detail.match(/cluster-e-c/g) || []).length === 1), "the gap evidence is appended once after a double apply");
ok(db.prepare("SELECT COUNT(*) n FROM issue_project_map WHERE issue_id = 1000598 AND project_code = 'YT.SHORTS'").get().n === 1, "1000598 is mapped to YT.SHORTS once");
const c = db.prepare("SELECT verify_probe p, verify_transport t, last_verdict v FROM remediation_contracts").get();
ok(c.t === "d1-query" && c.v === "re-armed:cluster-e-c", "the 1000315 contract is a d1-query probe");
ok(!c.p.includes(";") && !/\b(insert|update|delete|drop|alter|create|replace)\s/i.test(c.p), "the probe has no semicolon and is read-only");
let r = db.prepare(c.p).get();
ok(r.expected === "archived" && /^pending/.test(r.observed), "the probe is pending before the ledger rows exist", r);
db.exec("INSERT INTO portfolio_actions (repo, action, status) VALUES ('qnfo-ensemble-research', 'archive', 'committed'); INSERT INTO research_run_ledger VALUES ('a', 'QNFO/qnfo-research', 'ok'), ('b', 'QNFO/qnfo-research', 'ok'), ('c', 'QNFO/qnfo-research', 'ok')");
r = db.prepare(c.p).get();
ok(r.observed === "archived", "the probe passes with a committed archive row and three ok deposits", r);
for (const id of [2993, 99953, 1000315, 1000319, 1000582, 1000583, 1000591, 1000598, 1000703, 1000704]) {
  const d = db.prepare("SELECT description d FROM agent_issues WHERE id = ?").get(id).d;
  ok((d.match(/CLUSTER-E-C 2026-10-28/g) || []).length === 1, id + ": note appended exactly once", (d.match(/CLUSTER-E-C 2026-10-28/g) || []).length);
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

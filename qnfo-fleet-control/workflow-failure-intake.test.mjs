// WORKFLOW-FAILURE-INTAKE-1 (0.43.0, agent_issues 100295) suite: a red workflow on main is recorded with its failed job and step,
// filed once with a d1-query probe, and closed with close_evidence when a later main run succeeds; cancelled runs are no verdict.
// Offline: the block runs in a vm against node:sqlite and scripted GitHub answers. Run: node qnfo-fleet-control/workflow-failure-intake.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("// ---- WORKFLOW-FAILURE-INTAKE-1:BEGIN"), b = src.indexOf("// ---- WORKFLOW-FAILURE-INTAKE-1:END");
ok(a > 0 && b > a, "the WORKFLOW-FAILURE-INTAKE-1 block is present");
ok(/ctx\.waitUntil\(workflowFailureIntake\(env\)/.test(src), "the 10-minute tick runs the intake");
const sb = { __name: (f) => f, console: { log() {}, error() {} } };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n__x = { workflowFailureIntake, wfiLatest, wfiFailedStep, wfiProbe };", sb);
const X = sb.__x;

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT, attempts INTEGER, deferred_since TEXT, next_due_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT);
CREATE TRIGGER birth AFTER INSERT ON agent_issues BEGIN INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status) VALUES ('issue-' || NEW.id, 'SELECT 1', 'd1-query', 'superseded'); END;`);
const stmt = (sql) => { let args = []; const s = { bind(...x) { args = x; return s; },
  async all() { return { results: db.prepare(sql).all(...args) }; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return s; };
const env = { AUDIT: { prepare: stmt } };
let runs = [], jobReads = 0;
const io = { gh: async (p) => {
  if (p.indexOf("/actions/runs?") === 0) return { ok: true, status: 200, j: { workflow_runs: runs } };
  const m = /^\/actions\/runs\/(\d+)\/jobs/.exec(p);
  if (m) { jobReads++; return { ok: true, status: 200, j: { jobs: [{ name: "build", conclusion: "success", steps: [] }, { name: "gate", conclusion: "failure", steps: [{ number: 1, name: "checkout", conclusion: "success" }, { number: 15, name: "SUITE-RUNNER-1", conclusion: "failure" }] }] } }; }
  return { ok: false, status: 404, j: null };
} };
const run = (id, name, conclusion, at, status) => ({ id, name, status: status || "completed", conclusion, created_at: at, html_url: "https://github.com/QNFO/qnfo-workers/actions/runs/" + id, head_sha: "abc" + id });

// pure helpers
let L = X.wfiLatest([run(1, "deploy-gate", "failure", "2026-10-20T01:00:00Z"), run(2, "deploy-gate", "success", "2026-10-20T02:00:00Z"), run(3, "deploy-gate", "cancelled", "2026-10-20T03:00:00Z"), run(4, "lint", null, "2026-10-20T03:00:00Z", "in_progress")]);
ok(L["deploy-gate"].id === 2 && !L.lint, "the newest decided run wins; cancelled and unfinished runs are no verdict", L);
ok(X.wfiFailedStep([{ name: "g", conclusion: "failure", steps: [{ number: 3, name: "s", conclusion: "failure" }] }]).step === "3 s", "the failed step is named with its number");
ok(X.wfiFailedStep([]).job === null, "no jobs: nothing named");
ok(X.wfiProbe("a'b") === "SELECT 'success' AS expected, (SELECT conclusion FROM workflow_main_state WHERE workflow = 'a''b') AS observed", "the probe quotes the workflow name");

// a red deploy-gate and a green lint: one issue, a recorded run with its step, a live probe
runs = [run(10, "deploy-gate", "failure", "2026-10-20T05:00:00Z"), run(11, "lint", "success", "2026-10-20T05:00:00Z")];
let o = await X.workflowFailureIntake(env, Date.parse("2026-10-20T05:10:00Z"), io);
ok(o.ok && o.workflows === 2 && o.filed === 1 && o.recorded === 1 && o.failing.join() === "deploy-gate", "one failing workflow filed and recorded", o);
const iss = db.prepare("SELECT * FROM agent_issues").all();
ok(iss.length === 1 && iss[0].title === "WORKFLOW-FAILED-1: deploy-gate" && /failed job "gate", step 15 SUITE-RUNNER-1/.test(iss[0].description), "the issue names the failed job and step", iss);
const wf = db.prepare("SELECT * FROM workflow_failures WHERE run_id = 10").get();
ok(wf && wf.failed_job === "gate" && wf.failed_step === "15 SUITE-RUNNER-1" && wf.issue_id === iss[0].id, "workflow_failures holds the run, its step and the issue", wf);
const c = db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + iss[0].id);
ok(c.status === "active" && /workflow_main_state WHERE workflow = 'deploy-gate'/.test(c.verify_probe), "the birth contract becomes a live d1-query probe", c);
ok(db.prepare(c.verify_probe.replace("SELECT 'success' AS expected, ", "SELECT ")).get().observed === "failure", "the probe reads failure while the workflow is red");

// the same failure next tick: nothing new, no second job read
const reads = jobReads;
o = await X.workflowFailureIntake(env, Date.parse("2026-10-20T05:20:00Z"), io);
ok(o.filed === 0 && o.recorded === 0 && jobReads === reads && db.prepare("SELECT COUNT(*) n FROM agent_issues").get().n === 1, "a known failure is not filed or read again", o);

// a cancelled newer run leaves it open; a success closes it with evidence
runs = [run(12, "deploy-gate", "cancelled", "2026-10-20T05:30:00Z")].concat(runs);
o = await X.workflowFailureIntake(env, Date.parse("2026-10-20T05:40:00Z"), io);
ok(o.closed === 0 && db.prepare("SELECT status FROM agent_issues").get().status === "open", "a cancelled run does not close the issue", o);
runs = [run(13, "deploy-gate", "success", "2026-10-20T05:50:00Z")].concat(runs);
o = await X.workflowFailureIntake(env, Date.parse("2026-10-20T06:00:00Z"), io);
const tr = db.prepare("SELECT * FROM issue_triage").get();
ok(o.closed === 1 && db.prepare("SELECT status FROM agent_issues").get().status === "closed" && /succeeded: https:\/\/github.com\/QNFO\/qnfo-workers\/actions\/runs\/13/.test(tr.close_evidence), "a green main run closes it with close_evidence", tr);
ok(db.prepare("SELECT conclusion FROM workflow_main_state WHERE workflow = 'deploy-gate'").get().conclusion === "success", "workflow_main_state follows the newest decided run");

// the kill switch, and an unreadable GitHub answer
db.prepare("INSERT INTO ops_config (key, value) VALUES ('workflow_failure_intake', 'off')").run();
o = await X.workflowFailureIntake(env, Date.now(), io);
ok(o.skipped && /off/.test(o.skipped), "ops_config workflow_failure_intake = off stops it", o);
db.prepare("DELETE FROM ops_config").run();
let threw = false;
try { await X.workflowFailureIntake(env, Date.now(), { gh: async () => ({ ok: false, status: 403, j: null }) }); } catch (e) { threw = /HTTP 403/.test(e.message); }
ok(threw, "an unreadable runs list throws with its status instead of closing anything");

console.log("workflow-failure-intake: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

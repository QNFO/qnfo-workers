/**
 * objective-constraints-close-guard.test.mjs -- offline regression lock for IL-CLOSE-VS-PROBE-2 (agent_issues 100355, 100344; PR 3342 added the helper for improvementLoopTick only).
 * objectiveConstraintsTick closed a constraint issue that meets its target without reading its contract: issue 2446 (unmanaged_direct_spend_share 0.4989 against 0.5 at 10:00:34Z) still carried a
 * contract whose last read was the 09:56 fail, so the UPDATE aborted on the live trigger issue_close_evidence_required (close-while-contract-fails) every hour and logged one console.error.
 * Runs the REAL objectiveConstraintsTick (the OBJECTIVE-CONSTRAINTS-1 block of worker.js, plus charterRows, charterOne and closeBlockedByContract) in a vm against node:sqlite with the live triggers.
 * Proves:
 *   - a constraint that meets while its issue contract is active or holding with last_verdict fail (or vacuous-probe-result, probe-error): no throw, no console.error, the issue stays open,
 *     close_deferred is 1 in the tick result and in the run row's state_json, and one console.warn names the issue id;
 *   - the same constraint after the contract reads pass: the issue closes with the OBJECTIVE-CONSTRAINTS-1 evidence and close_channel auto:fleet-control/objective-constraints;
 *   - a monitoring or superseded contract, or none, does not block the close; a constraint that does not meet files nothing and defers nothing;
 *   - the two-line mutation: with WORKER_JS pointing at a worker.js without the guard the first case fails (it closes nothing and logs the abort).
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/objective-constraints-close-guard.test.mjs        (WORKER_JS=<path> to run it against another worker.js)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(process.env.WORKER_JS || join(here, "worker.js"), "utf8");
let passed = 0, failed = 0;
const eq = (actual, expected, label) => { if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; } failed++; console.error("FAIL " + label + ": got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected)); };
const truthy = (c, label, extra) => { if (c) { passed++; return; } failed++; console.error("FAIL " + label + (extra === undefined ? "" : " :: " + JSON.stringify(extra).slice(0, 400))); };

const BEGIN = "// ---- OBJECTIVE-CONSTRAINTS-1:BEGIN", END = "// ---- OBJECTIVE-CONSTRAINTS-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i + 1); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const charter = grab("async function charterRows(env, sql) {", "async function charterFacts(env) {");
const guard = grab("async function closeBlockedByContract(env, issueId, database) {", "async function improvementLoopTick(env) {");
if (a < 0 || b < a || !charter || !/async function closeBlockedByContract/.test(src)) { console.error("FAIL blocks missing in worker.js"); console.log("1 failed"); process.exit(1); }
const HAS_GUARD = /await closeBlockedByContract\(env, openByTitle\[t\]\)/.test(src);

const logs = { error: [], warn: [] };
const sandbox = { console: { error: (s) => logs.error.push(String(s)), warn: (s) => logs.warn.push(String(s)), log() {}, info() {} }, VERSION: "test", Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, parseFloat, parseInt, Promise, Error };
vm.createContext(sandbox);
vm.runInContext(charter + "\n" + guard + "\n" + src.slice(a, b + END.length), sandbox);
// the block's data reads and the daily review are not what is under test: stub them in the sandbox, the tick calls them as globals
vm.runInContext("var __EVAL = null; ocSchema = async function() {}; ocFacts = async function() { return {}; }; ocRegister = async function() {}; ocLimitsReviewDaily = async function() { return null; }; objectiveConstraintsEvaluate = function() { return __EVAL; };", sandbox);
const CONSTRAINTS = vm.runInContext("OBJECTIVE_CONSTRAINTS.map(function(c) { return c.metric; })", sandbox);
const PREFIX = vm.runInContext("OC_ISSUE_PREFIX", sandbox);
truthy(CONSTRAINTS.length >= 3 && PREFIX === "OBJECTIVE-CONSTRAINT-BREACH-1: ", "the OBJECTIVE-CONSTRAINTS-1 block loads with its constraints and prefix", { n: CONSTRAINTS.length, PREFIX });
const METRIC = CONSTRAINTS[0];

function world() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', close_channel TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE objective_constraint_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, worker_version TEXT, healthy INTEGER, measured INTEGER, findings INTEGER, filed INTEGER, closed INTEGER, review TEXT, state_json TEXT);
-- the live trigger issue_close_evidence_required (read from live sqlite_master 2026-10-26)
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence') WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails') WHERE NEW.status IN ('closed','resolved') AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id AND c.status IN ('active','holding') AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;`);
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (2446, ?, 'd', 'objective-constraints', 'governance', 'medium', 'open', 1, 1)").run(PREFIX + METRIC);
  const env = { AUDIT: { prepare(sql) { let p = []; const s = {
    bind(...x) { p = x; return s; },
    async run() { try { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; } catch (e) { throw new Error("D1_ERROR: " + e.message + ": SQLITE_CONSTRAINT"); } },
    async all() { return { results: db.prepare(sql).all(...p) }; },
    async first() { return db.prepare(sql).get(...p) || null; } }; return s; } } };
  return { db, env };
}
function setEval(meets) {
  const constraints = CONSTRAINTS.map((m, i) => ({ metric: m, value: i === 0 ? 0.4989 : null, target: "<= 0.5", goal: 41, meets: i === 0 ? meets : null, detail: { n: 1 } }));
  sandbox.__EVAL_VALUE = { healthy: true, measured: 1, findings: [], constraints };
  vm.runInContext("__EVAL = __EVAL_VALUE;", sandbox);
}
async function tick(env) { logs.error.length = 0; logs.warn.length = 0; sandbox.__ENV = env; return vm.runInContext("objectiveConstraintsTick(__ENV)", sandbox); }
const status = (db) => db.prepare("SELECT status, close_channel FROM agent_issues WHERE id = 2446").get();
const contract = (db, st, verdict) => { db.exec("DELETE FROM remediation_contracts"); if (st) db.prepare("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES ('issue-2446', 2446, ?, ?)").run(st, verdict); };

// ---- the filed case: it meets, its contract still reads fail
for (const verdict of ["fail", "vacuous-probe-result", "probe-error"]) {
  const { db, env } = world(); contract(db, "active", verdict); setEval(true);
  const r = await tick(env);
  eq(status(db).status, "open", `contract ${verdict}: the issue stays open`);
  eq(logs.error.length, 0, `contract ${verdict}: no console.error line (the abort is not raised)`);
  eq(r.close_deferred, 1, `contract ${verdict}: close_deferred is 1 in the tick result`);
  eq(r.closed, 0, `contract ${verdict}: nothing is counted closed`);
  eq(logs.warn.length, 1, `contract ${verdict}: one console.warn`);
  truthy(/"evt":"fleet-control:objectiveConstraintsTick:close_deferred"/.test(logs.warn[0] || "") && /"issue_id":2446/.test(logs.warn[0] || ""), `contract ${verdict}: the warning names the event and the issue id`, logs.warn);
  const row = db.prepare("SELECT * FROM objective_constraint_runs ORDER BY id DESC LIMIT 1").get();
  eq(JSON.parse(row.state_json).close_deferred, 1, `contract ${verdict}: the run row's state_json carries close_deferred`);
  eq(row.closed, 0, `contract ${verdict}: the run row counts no close`);
}
{ // a holding contract that fails blocks the same way
  const { db, env } = world(); contract(db, "holding", "fail"); setEval(true);
  const r = await tick(env);
  eq([status(db).status, r.close_deferred, logs.error.length], ["open", 1, 0], "a holding contract with last_verdict fail defers too");
}

// ---- after the contract reads pass the issue closes with its evidence
{
  const { db, env } = world(); contract(db, "active", "fail"); setEval(true);
  await tick(env);
  db.exec("UPDATE remediation_contracts SET last_verdict = 'pass'");
  const r = await tick(env);
  const s = status(db), t = db.prepare("SELECT close_evidence, triage_state FROM issue_triage WHERE issue_id = 2446").get();
  eq([s.status, s.close_channel, r.closed, r.close_deferred, logs.error.length], ["closed", "auto:fleet-control/objective-constraints", 1, 0, 0], "tick 2 (contract pass): the issue closes, nothing deferred, no error");
  truthy(t && t.triage_state === "closed" && /^OBJECTIVE-CONSTRAINTS-1 \d{4}-\d{2}-\d{2}T[^:]*:[^ ]* ?/.test(t.close_evidence) && t.close_evidence.indexOf(METRIC + "=0.4989 meets <= 0.5") > 0, "the close evidence is the OBJECTIVE-CONSTRAINTS-1 text with the measured value", t);
}

// ---- what does not block
for (const [st, verdict, label] of [["monitoring", "monitoring:loop-owned-48h (x)", "a monitoring contract"], ["superseded", "superseded:closure-superseded", "a superseded contract"], [null, null, "no contract"], ["active", "pass", "an active contract that passes"], ["active", null, "an active contract with no verdict yet"]]) {
  const { db, env } = world(); contract(db, st, verdict); setEval(true);
  const r = await tick(env);
  eq([status(db).status, r.closed, r.close_deferred, logs.error.length], ["closed", 1, 0, 0], label + " does not block the close");
}
{ // a constraint that does not meet files nothing and defers nothing
  const { db, env } = world(); contract(db, "active", "fail"); setEval(false);
  const r = await tick(env);
  eq([status(db).status, r.closed, r.close_deferred, logs.error.length, logs.warn.length], ["open", 0, 0, 0, 0], "a constraint that does not meet leaves the issue open with no deferral and no warning");
}
{ // an open issue of another constraint is not touched by this one
  const { db, env } = world(); contract(db, "active", "fail"); setEval(true);
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (2447, ?, 'd', 'objective-constraints', 'governance', 'medium', 'open', 1, 1)").run(PREFIX + CONSTRAINTS[1]);
  const r = await tick(env);
  eq([db.prepare("SELECT status FROM agent_issues WHERE id = 2447").get().status, r.close_deferred], ["open", 1], "only the issue whose constraint meets is considered");
}
truthy(HAS_GUARD || process.env.WORKER_JS, "worker.js carries the guard call closeBlockedByContract(env, openByTitle[t]) (the code-probe of agent_issues 100355)");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

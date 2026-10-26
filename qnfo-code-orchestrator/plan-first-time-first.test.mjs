// PLAN-FIRST-TIME-FIRST-1 offline suite (qnfo-code-orchestrator 0.29.3, agent_issues 1000428, BREACH-DOCTOR-1 rule R2-PLAN-FIRST, pillar autonomy).
// Measured 2026-10-26 on issue_plans: 48 planner model calls (code_plan_daily_cap 48, the last at 01:47Z), 32 of them re-plans of an issue that already had a verdict and 16
// first-time plans; open high OWNER-TASK issues older than 120 minutes with no verdict at all stayed unplanned (8 when the issue was filed, 6 at 18:00Z). planIssues ordered each window
// by priority and id only, so a re-plan (a verdict older than PLAN_RECHECK_DAYS) of a low id beat a first-time plan of the same priority and a higher id. 0.29.3 inserts
// (p.issue_id IS NULL) DESC between the priority CASE and a.id, in the one string both windows (trusted, untrusted) share.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads: the harness of plan-window-trusted.test.mjs.
// Proves: 1 inside a priority class the first-time plan is taken before the re-plan of a lower id, and the re-plan follows on the next call (ordered, not starved);
//         2 the priority class still wins: a critical re-plan is taken before a high first-time plan (a plain first-time-first order would fail this);
//         3 the untrusted window (recorded without a model call, 10 a tick) records the first-time issues before the re-plans;
//         4 among first-time plans the tie-break stays by id, and the re-plan of the lowest id comes last;
//         5 the ORDER BY text on main holds the clause and the marker (the code-probe of the issue), both windows use it and the mirror is identical.
// Run: node --no-warnings qnfo-code-orchestrator/plan-first-time-first.test.mjs   (exit 0 = all passed; prints "N passed, 0 failed")
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 500) : "")); } };

function makeD1() {
  const db = new DatabaseSync(":memory:");
  const wrap = (sql) => {
    let args = [];
    const st = {
      bind: (...a) => { args = a.map((v) => (v === undefined ? null : v)); return st; },
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    };
    return st;
  };
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
    CREATE TABLE service_registry (service TEXT PRIMARY KEY, state TEXT, kind TEXT, base_url TEXT);
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  for (const n of ["q08-signal-engine", "qnfo-social", "qnfo-ai-search"]) db.prepare("INSERT INTO service_registry VALUES (?, 'live', 'worker', '')").run(n);
  return { prepare: wrap, _db: db };
}
const FILES = {
  "q08-signal-engine/worker.js": "function a() {\n  if (path === \"/api/f\") {\n    return 1;\n  }\n}",
  "qnfo-social/worker.js": "function postIt() {\n  return linkedinCadence(env);\n}",
  "qnfo-ai-search/worker.js": "function askLoop() {\n  return digestRows(env);\n}",
};
globalThis.fetch = async (u) => {
  const m = /raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const ANCHORS = { "q08-signal-engine": '  if (path === "/api/f") {', "qnfo-social": "  return linkedinCadence(env);", "qnfo-ai-search": "  return digestRows(env);" };
const FIX = (w) => JSON.stringify({ code_fixable: true, reason: "one guard in " + w, anchor: ANCHORS[w], goal: "Directly after the anchor line add a check that returns HTTP 405 for any method other than POST, and changes nothing else in the file." });
// the model answers for whichever worker the planner names in the prompt, so the reply does not depend on which issue is read first
const byWorker = (input) => FIX(/WORKER: ([a-z0-9-]+) \(file/.exec(JSON.stringify(input))[1]);
function envWith(replies) {
  const prompts = [];
  return { env: { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), AI: { run: async (model, input) => { prompts.push({ model, input }); const r = replies.shift(); return { response: typeof r === "function" ? r(input) : r }; } } }, prompts };
}
const old = Date.now() - 3600e3;
const issue = (env, f) => Number(env.AUDIT_DB._db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at) VALUES (?,?,?,?,?,?,?)").run(f.title, f.description || "", f.source === undefined ? "qnfo-fleet-control" : f.source, f.category || "reliability", f.priority || "high", "open", f.created_at || old).lastInsertRowid);
// a verdict older than PLAN_RECHECK_DAYS (7): the issue is a re-plan candidate, not a first-time plan
const replan = (env, id, outcome = "not-code") => env.AUDIT_DB._db.prepare("INSERT INTO issue_plans (issue_id, planned_at, outcome, detail, model, attempts) VALUES (?, ?, ?, 'old verdict', 'm', 1)").run(id, new Date(Date.now() - 8 * 864e5).toISOString(), outcome);
const attempts = (env, id) => env.AUDIT_DB._db.prepare("SELECT attempts a FROM issue_plans WHERE issue_id = ?").get(id)?.a;
const call = async (env, p) => (await worker.fetch(new Request("https://x" + p, { method: "POST", headers: { authorization: "Bearer t0ken" } }), env)).json();
const plan = (env) => call(env, "/v1/plan");

const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
const ver = String(h.version).match(/^(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
ok(ver[0] > 0 || ver[1] > 29 || (ver[1] === 29 && ver[2] >= 3), "health: VERSION is at least 0.29.3", h.version);

// 1. one priority class: the re-plan has the lower id, the first-time plan the higher one; the first-time plan is read first
{
  const { env, prompts } = envWith([byWorker, byWorker, byWorker]);
  await plan(env); // creates the schema
  const R = issue(env, { title: "METRIC-TRIGGER-70-R: qnfo-social cadence", description: "qnfo-social linkedinCadence should skip weekends", priority: "high" });
  const F = issue(env, { title: "OWNER-TASK-71: q08-signal-engine route", source: "qnfo-fleet-dashboard:owner-request", description: "q08-signal-engine /api/f accepts GET", priority: "high" });
  replan(env, R);
  ok(R < F, "1-setup the re-plan has the lower id", { R, F });
  const r1 = await plan(env);
  ok(r1.planned && r1.outcome === "queued" && r1.issue === F && prompts.length === 1, "1a the first-time plan (higher id) is planned before the re-plan of the same priority", r1);
  const r2 = await plan(env);
  ok(r2.planned && r2.outcome === "queued" && r2.issue === R && prompts.length === 2, "1b the re-plan follows on the next call: it is ordered after the first-time plans, not starved", r2);
  ok(attempts(env, R) === 2 && attempts(env, F) === 1, "1c the re-plan raised attempts to 2 and the first-time plan holds 1 (the two kinds were told apart)", { R: attempts(env, R), F: attempts(env, F) });
}

// 2. the priority class still wins: a critical re-plan is read before a high first-time plan
{
  const { env } = envWith([byWorker, byWorker]);
  await plan(env);
  const C = issue(env, { title: "METRIC-TRIGGER-72-C: qnfo-social cadence", description: "qnfo-social linkedinCadence should skip weekends", priority: "critical" });
  const H = issue(env, { title: "OWNER-TASK-73: q08-signal-engine route", source: "qnfo-fleet-dashboard:owner-request", description: "q08-signal-engine /api/f accepts GET", priority: "high" });
  replan(env, C);
  const r1 = await plan(env), r2 = await plan(env);
  ok(r1.issue === C && r2.issue === H, "2 a critical re-plan is planned before a high first-time plan, then the high one", { r1: r1.issue, r2: r2.issue, C, H });
}

// 3. the untrusted window: 12 re-plans of lower ids and 3 first-time issues of higher ids, ten recorded a tick, no model call
{
  const { env, prompts } = envWith([]);
  await plan(env);
  const re = [], fr = [];
  for (let i = 0; i < 12; i++) { const id = issue(env, { title: "Feed re-plan " + i, source: "radar-hub", description: "change q08-signal-engine", priority: "high" }); replan(env, id, "untrusted"); re.push(id); }
  for (let i = 0; i < 3; i++) fr.push(issue(env, { title: "Feed first " + i, source: "radar-hub", description: "change q08-signal-engine", priority: "high" }));
  const t0 = new Date(Date.now() - 5000).toISOString();
  const r = await plan(env);
  const fresh = env.AUDIT_DB._db.prepare("SELECT issue_id FROM issue_plans WHERE planned_at >= ?").all(t0).map((x) => x.issue_id);
  ok(r.planned && r.outcome === "untrusted" && fresh.length === 10 && prompts.length === 0, "3a a tick records ten untrusted rows and makes no model call", { r, fresh: fresh.length, prompts: prompts.length });
  ok(fr.every((id) => fresh.includes(id)), "3b all three first-time issues are among the ten recorded in the first tick", { fresh, fr });
  ok(re.slice(0, 7).every((id) => fresh.includes(id)) && re.slice(7).every((id) => !fresh.includes(id)), "3c the other seven are the re-plans of the lowest ids; the rest wait for the next tick", { fresh, re });
  await plan(env);
  ok(env.AUDIT_DB._db.prepare("SELECT COUNT(*) n FROM issue_plans WHERE planned_at >= ?").get(t0).n === 15, "3d the next tick records the remaining five re-plans (no issue is dropped)", env.AUDIT_DB._db.prepare("SELECT COUNT(*) n FROM issue_plans WHERE planned_at >= ?").get(t0));
}

// 4. among first-time plans the order stays by id, and the re-plan of the lowest id comes last
{
  const { env } = envWith([byWorker, byWorker, byWorker]);
  await plan(env);
  const c = issue(env, { title: "METRIC-TRIGGER-80-C: qnfo-ai-search digest", description: "digestRows in qnfo-ai-search drops the last row", priority: "high" });
  const a = issue(env, { title: "METRIC-TRIGGER-81-A: qnfo-social cadence", description: "qnfo-social linkedinCadence should skip weekends", priority: "high" });
  const b = issue(env, { title: "METRIC-TRIGGER-82-B: q08-signal-engine route", description: "q08-signal-engine /api/f accepts GET", priority: "high" });
  replan(env, c);
  const order = [(await plan(env)).issue, (await plan(env)).issue, (await plan(env)).issue];
  ok(order.join() === [a, b, c].join(), "4 two first-time plans keep their id order and the re-plan of the lowest id is last", { order, a, b, c });
}

// 5. the text on main: the marker (the code-probe of agent_issues 1000428), one ord string used by both windows, the mirror identical
{
  const src = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  const mirror = fs.readFileSync(path.join(here, "deployed-current.worker.js"), "utf8");
  ok(src === mirror, "5a deployed-current.worker.js is identical to worker.js");
  ok(src.includes("PLAN-FIRST-TIME-FIRST-1"), "5b worker.js carries PLAN-FIRST-TIME-FIRST-1");
  ok(src.includes("WHEN 'medium' THEN 2 ELSE 3 END, (p.issue_id IS NULL) DESC, a.id LIMIT \";"), "5c the ORDER BY string puts (p.issue_id IS NULL) DESC between the priority CASE and a.id");
  ok((src.match(/const ord = "/g) || []).length === 1 && src.includes("sel + tp.sql + ord + PLAN_WINDOW") && src.includes("sel + \"NOT \" + tp.sql + ord + PLAN_CHEAP_PER_TICK"), "5d one ord string, used by the trusted and the untrusted window");
  ok(src.includes("FROM agent_issues a LEFT JOIN issue_plans p ON p.issue_id = a.id"), "5e both windows read issue_plans as p, so the clause is valid in both");
}

console.log("plan-first-time-first.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

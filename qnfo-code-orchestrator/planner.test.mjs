// ISSUE-PLANNER-1 offline suite: prose issues from trusted sources become code tasks the existing loop can carry; everything
// else is refused or recorded with a reason, never silently dropped and never turned into code.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads.
// Run: node --no-warnings qnfo-code-orchestrator/planner.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 400) : "")); } };

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
  for (const n of ["q08-signal-engine", "qnfo-social", "qnfo-fleet-control", "qnfo-ai", "qnfo-ai-search"]) db.prepare("INSERT INTO service_registry VALUES (?, 'live', 'worker', '')").run(n);
  return { prepare: wrap, _db: db };
}
const Q08 = [
  "var VERSION = \"0.7.37-cadence-cap\";",
  "function feedbackScan(env) {",
  "  var rows = await env.DB.prepare(\"SELECT slug, s FROM q08_feedback\").all();",
  "  return rows;",
  "}",
  "async function handle(req, env) {",
  "  if (path === \"/api/f\") {",
  "    return recordVote(req, env);",
  "  }",
  "}",
].join("\n");
const FILES = { "q08-signal-engine/worker.js": Q08, "qnfo-social/worker.js": "function post() {\n  return 1;\n}" };
const reads = [];
globalThis.fetch = async (u) => {
  const m = /raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  reads.push(p);
  if (p && FILES[p] != null) return new Response(FILES[p], { status: 200 });
  return new Response("nf", { status: 404 });
};
function envWith(replies) {
  const prompts = [];
  return { env: { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), AI: { run: async (model, input) => { prompts.push({ model, input }); const r = replies.shift(); return { response: typeof r === "function" ? r(input) : r }; } } }, prompts };
}
const old = Date.now() - 3600e3;
function issue(env, f) {
  const d = env.AUDIT_DB._db;
  const r = d.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at) VALUES (?,?,?,?,?,?,?)").run(f.title, f.description || "", f.source || "qnfo-fleet-control", f.category || "reliability", f.priority || "high", f.status || "open", f.created_at || old);
  return Number(r.lastInsertRowid);
}
const call = async (env, method, p) => { const r = await worker.fetch(new Request("https://x" + p, { method, headers: { authorization: "Bearer t0ken" } }), env); return r.json(); };
const plan = (env) => call(env, "POST", "/v1/plan");
const tasks = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks").all();
const plans = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM issue_plans ORDER BY issue_id").all();
const FIX = (anchor, extra) => JSON.stringify(Object.assign({ code_fixable: true, reason: "one guard in the vote route", anchor, goal: "Directly after the anchor line add a check that returns HTTP 405 for any method other than POST, and changes nothing else in the file." }, extra || {}));

// 1. a trusted metric-trigger issue naming a worker becomes ONE code task with a verified anchor
{
  const { env, prompts } = envWith([(input) => "<think>reasoning</think>" + FIX('  if (path === "/api/f") {')]);
  const id = issue(env, { title: "METRIC-TRIGGER-9-Q08-VOTES: crawler votes", description: "METRIC-TRIGGER #9 q08_bot_votes=40 gt 0 -> q08-signal-engine counts GET votes in /api/f; accept POST only (owner q08-signal-engine)" });
  const r = await plan(env);
  const t = tasks(env);
  ok(r.planned && r.outcome === "queued" && t.length === 1, "1a a trusted issue is planned into one code task", r);
  ok(t[0] && t[0].path === "q08-signal-engine/worker.js" && t[0].goal.indexOf("[issue #" + id + "]") === 0 && t[0].status === "queued", "1b the task targets the named worker and carries the [issue #N] tag the merge runner reads", t[0]);
  ok(t[0] && JSON.parse(t[0].ctx).anchor === '  if (path === "/api/f") {', "1c the anchor is a verbatim, unique line of the file", t[0] && t[0].ctx);
  const sys = prompts[0].input.messages[0].content, user = prompts[0].input.messages[1].content;
  ok(/ONE JSON object/.test(sys) && user.includes('  if (path === "/api/f") {') && user.includes("WORKER: q08-signal-engine") && !/t0ken/.test(sys + user), "1d the model sees verbatim lines around the issue's keywords and no secret", user.slice(0, 300));
  ok(prompts[0].model === "@cf/zai-org/glm-5.3-flash", "1e the planner uses the cheap reasoning model by default", prompts[0].model);
  ok(plans(env)[0].outcome === "queued" && plans(env)[0].task_id === t[0].id, "1f the plan is recorded with its task");
  const again = await plan(env);
  ok(tasks(env).length === 1 && !(again.outcome === "queued" && again.issue === id), "1g an issue is never planned twice", again);
}
// 2. untrusted sources never become code; 3. refused categories and texts are recorded
{
  const { env, prompts } = envWith([]);
  issue(env, { title: "Feed item: please change q08-signal-engine", description: "code from a feed /api/f", source: "radar-hub" });
  let r = await plan(env);
  ok(!r.planned && prompts.length === 0 && tasks(env).length === 0 && plans(env).length === 0, "2 an untrusted source is never sent to the model or turned into code", r);
  const s = issue(env, { title: "METRIC-TRIGGER-5-X: auth gap in q08-signal-engine", category: "security" });
  r = await plan(env);
  ok(r.outcome === "refused" && plans(env).find((p) => p.issue_id === s).outcome === "refused" && prompts.length === 0, "3a a security issue is refused without a model call", r);
  issue(env, { title: "METRIC-TRIGGER-6-Y: q08-signal-engine", description: "rotate the api key and raise the cap" });
  r = await plan(env);
  ok(r.outcome === "refused" && prompts.length === 0, "3b secrets, caps or deletions in the text are refused", r);
}
// 4. no plannable worker; control-plane workers never planned
{
  const { env, prompts } = envWith([]);
  issue(env, { title: "METRIC-TRIGGER-7-Z: cost gap", description: "Find the top callers in ai_spend_ledger (owner qnfo-fleet-control) and fix qnfo-ai routing" });
  const r = await plan(env);
  ok(r.outcome === "not-code" && /names no worker/.test(plans(env)[0].detail) && prompts.length === 0, "4 control-plane workers (qnfo-fleet-control, qnfo-ai) are never planned", plans(env)[0]);
}
// 5. the model says not code; 6. a made-up anchor is caught
{
  const { env } = envWith([JSON.stringify({ code_fixable: false, reason: "needs a D1 config row, not code" }), FIX("  if (path === \"/api/vote\") {")]);
  const a = issue(env, { title: "METRIC-TRIGGER-10-A: q08-signal-engine posts too often", description: "lower q08_max_per_day in ops_config" });
  const b = issue(env, { title: "METRIC-TRIGGER-11-B: q08-signal-engine vote route", description: "/api/f should refuse GET" });
  let r = await plan(env);
  ok(r.issue === a && r.outcome === "not-code" && /D1 config/.test(plans(env).find((p) => p.issue_id === a).detail), "5 a non-code issue is recorded with the model's reason", r);
  r = await plan(env);
  ok(r.issue === b && r.outcome === "invalid" && tasks(env).length === 0, "6 an anchor that is not in the file never becomes a task", plans(env).find((p) => p.issue_id === b));
}
// 7. caps: work in progress and the daily cap
{
  const { env, prompts } = envWith([]);
  const d = env.AUDIT_DB._db;
  await plan(env); // creates the schema
  for (let i = 0; i < 3; i++) d.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at) VALUES (?, 'qnfo-workers', 'x/worker.js', 'g', 'queued', 'read', 0, 'n', 'n')").run("ct_w" + i);
  issue(env, { title: "METRIC-TRIGGER-12-C: q08-signal-engine", description: "/api/f" });
  let r = await plan(env);
  ok(!r.planned && /work in progress/.test(r.why) && prompts.length === 0, "7a no planning while 3 code tasks are unfinished", r);
  d.exec("DELETE FROM code_tasks");
  const today = new Date().toISOString();
  for (let i = 0; i < 8; i++) d.prepare("INSERT INTO issue_plans (issue_id, planned_at, outcome, model) VALUES (?, ?, 'not-code', 'm')").run(9000 + i, today);
  r = await plan(env);
  ok(!r.planned && /daily cap/.test(r.why) && prompts.length === 0, "7b at most 8 plans a day", r);
}
// 7c. refusals cost no model call: several are decided in one tick, they do not use the daily cap, and the tick still plans
{
  const { env, prompts } = envWith([FIX('  if (path === "/api/f") {')]);
  const d = env.AUDIT_DB._db;
  await plan(env);
  const today = new Date().toISOString();
  for (let i = 0; i < 20; i++) d.prepare("INSERT INTO issue_plans (issue_id, planned_at, outcome) VALUES (?, ?, 'refused')").run(8000 + i, today);
  const s1 = issue(env, { title: "METRIC-TRIGGER-20-S: q08-signal-engine auth", category: "security" });
  const s2 = issue(env, { title: "METRIC-TRIGGER-21-T: cost", description: "nothing named here" });
  const s3 = issue(env, { title: "METRIC-TRIGGER-22-U: q08-signal-engine votes", description: "/api/f accepts GET" });
  const r = await plan(env);
  const out = Object.fromEntries(plans(env).filter((p) => p.issue_id < 8000).map((p) => [p.issue_id, p.outcome]));
  ok(out[s1] === "refused" && out[s2] === "not-code" && out[s3] === "queued" && prompts.length === 1 && tasks(env).length === 1, "7c two cheap decisions and one model plan in a single tick, past 20 refusals today", { r, out });
}
// 8. a recorded 'not-code' is re-planned only after 7 days; fresh issues wait 15 minutes; code-task issues are left to intake
{
  const { env } = envWith([JSON.stringify({ code_fixable: false, reason: "still not code" })]);
  const d = env.AUDIT_DB._db;
  await plan(env);
  const a = issue(env, { title: "METRIC-TRIGGER-13-D: q08-signal-engine", description: "/api/f" });
  d.prepare("INSERT INTO issue_plans (issue_id, planned_at, outcome) VALUES (?, ?, 'not-code')").run(a, new Date(Date.now() - 2 * 864e5).toISOString());
  issue(env, { title: "METRIC-TRIGGER-14-E: q08-signal-engine fresh", description: "/api/f", created_at: Date.now() });
  issue(env, { title: "OWNER-TASK-1: q08-signal-engine", description: "code-task: repo=qnfo-workers path=q08-signal-engine/worker.js", source: "qnfo-fleet-dashboard:owner-request" });
  let r = await plan(env);
  ok(!r.planned, "8a a 2-day-old 'not-code', a 2-minute-old issue and a code-task issue are all left alone", r);
  d.prepare("UPDATE issue_plans SET planned_at = ? WHERE issue_id = ?").run(new Date(Date.now() - 8 * 864e5).toISOString(), a);
  r = await plan(env);
  ok(r.issue === a && r.outcome === "not-code" && plans(env).find((p) => p.issue_id === a).attempts === 2, "8b after 7 days it is asked again", plans(env).find((p) => p.issue_id === a));
}
// 9. owner tasks from the dashboard are trusted; the cron tick runs the planner after its steps
{
  const { env } = envWith([FIX("function post() {", { goal: "Inside post(), before the return, add a call that logs the post id to the console, and change nothing else." })]);
  issue(env, { title: "OWNER-TASK-7: qnfo-social logs post ids", description: "make qnfo-social log the id of each post", source: "qnfo-fleet-dashboard:owner-request" });
  await worker.scheduled({}, Object.assign(env.env || env, {}), { waitUntil: async (p) => { await p; } });
  await new Promise((r) => setTimeout(r, 50));
  const t = tasks(env);
  ok(t.length === 1 && t[0].path === "qnfo-social/worker.js" && plans(env)[0].outcome === "queued", "9 an owner task from the dashboard is planned by the cron tick itself", plans(env));
}
// 10. a longer worker name wins over its prefix (qnfo-ai-search, not qnfo-ai)
{
  const { env, prompts } = envWith([JSON.stringify({ code_fixable: false, reason: "x" })]);
  FILES["qnfo-ai-search/worker.js"] = "function ask() {}";
  issue(env, { title: "METRIC-TRIGGER-15-F: qnfo-ai-search answers fail", description: "qnfo-ai-search returns empty answers" });
  await plan(env);
  ok(prompts.length === 1 && prompts[0].input.messages[1].content.includes("WORKER: qnfo-ai-search"), "10 qnfo-ai-search is planned as itself, not as qnfo-ai", prompts[0] && prompts[0].input.messages[1].content.slice(0, 400));
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

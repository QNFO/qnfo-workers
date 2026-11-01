// NEEDS-ANCHOR-ROUTE-1 offline suite (qnfo-code-orchestrator 0.23.0, agent_issues 99925 / 2007 second half, pillar autonomy).
// ct_im99981, ct_im99982 and ct_im99989 (2026-10-19 06:17Z, RED-DRAIN-1 dispatch on a 628k-char qnfo-gateway/worker.js, a stack-trace goal with
// no code keyword) ended "file larger than 60000 chars needs an anchor ... (ANCHOR-LOCATOR-1 found no unique line near the goal either)":
// the locator was shown a list of function names and could only guess. The task still ends as before; what is new is that the issue it came
// from keeps its target as a session-task line with the reason, so the intake does not open more tasks on it, and the routing is the audit
// event code-task.anchor-routed. This suite proves it routes exactly when no anchor was given and no keyword of the goal occurs in the file,
// and never for a closed issue, an issue without a code-task line, a goal that names no issue, or a task that carried an anchor.
// Run: node --no-warnings qnfo-code-orchestrator/needs-anchor-route.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 600) : "")); } };

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
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model));
    CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));`);
  return { prepare: wrap, _db: db };
}
const pad = (tag, n) => { let s = ""; let i = 0; while (s.length < n) s += "function " + tag + "Handler" + (i++) + "() { return " + i + "; }\n"; return s; };
const BIG = pad("alpha", 70000) + "function farAway(x) { return x + 1; }\n";
const FILES = { "fx-na/worker.js": BIG, "fx-na/deployed-current.worker.js": BIG };
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/[A-Za-z0-9._-]+\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const fakeLoader = { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) };
function envWith() {
  const calls = [];
  const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", LOADER: fakeLoader,
    AI: { run: async (model, input) => { calls.push(model); return { response: "" }; } } };
  return { env, calls };
}
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (env) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 1, budgetMs: 25000, plan: false, intake: false }) }), env)).json();
const addTask = async (env, goal, anchor) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-na/worker.js", goal, anchor }) }), env)).json();
const row = (env, id) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks WHERE id=?").get(id);
const issueRow = (env, id) => env.AUDIT_DB._db.prepare("SELECT * FROM agent_issues WHERE id=?").get(id);
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT * FROM cloud_ops_events WHERE kind = ?").all(kind);
const STACK = 'CF-OBS-ISSUE-1: fx-na: {"completion_tokens":"<number>","evt":"<string>","finish_reason":"<string>"} -- issue #77 (RED-DRAIN-1 dispatch). The trace has no code in it.';
function addIssue(env, id, status, withLine, opts = {}) {
  const marker = opts.marker || "code-task";
  const path = opts.path || "fx-na/worker.js";
  env.AUDIT_DB._db.prepare("INSERT INTO agent_issues (id, title, description, source, status, created_at) VALUES (?, ?, ?, 'qnfo-fleet-control', ?, ?)")
    .run(id, "CF-OBS-ISSUE-1: fx-na", "A stack trace.\n" + (withLine ? marker + ": repo=qnfo-workers path=" + path + "\n" : "") + (opts.anchor ? "code-anchor: " + opts.anchor + "\n" : "") + "Definition of done: probe.", status, Date.now());
}
async function readOnce(env, goal, anchor) {
  const c = await addTask(env, goal, anchor);
  ok(c.ok && c.id, "task enqueued", c);
  await tick(env);
  return c.id;
}

const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(/^0\.(2[3-9]|[3-9]\d)\.|^[1-9]\d*\./.test(String(h.version)), "health: 0.23.0 or later", h.version);
ok(Array.isArray(h.capabilities) && h.capabilities.includes("anchor-route"), "health lists anchor-route", h.capabilities);
ok(BIG.length > 60000 && BIG.indexOf("completion_tokens") < 0 && BIG.indexOf("CF-OBS-ISSUE-1") < 0, "the fixture is over MAX_FILE_CHARS and holds no keyword of the goal", BIG.length);

// 1. routed: no anchor given, no keyword in the file, an open issue with a code-task line
{
  const { env } = envWith();
  addIssue(env, 77, "open", true);
  const id = await readOnce(env, STACK);
  const r = row(env, id), iss = issueRow(env, 77);
  ok(r.status === "needs_human" && /needs an anchor/.test(r.last_error || "") && /NEEDS-ANCHOR-ROUTE-1: issue #77 keeps its target as a session-task line/.test(r.last_error || ""), "1a the task ends needs_human and says where the issue went", { status: r.status, last_error: r.last_error });
  ok(/session-task: repo=qnfo-workers path=fx-na\/worker\.js/.test(iss.description) && !/code-task: repo=/.test(iss.description) && /NEEDS-ANCHOR-ROUTE-1/.test(iss.description), "1b the issue's code-task line is now a session-task line with the reason", iss.description);
  ok(Number(iss.updated_at) > 0 && iss.status === "open", "1c the issue stays open", iss.status);
  const ev = events(env, "code-task.anchor-routed");
  ok(ev.length === 1 && /issue #77/.test(ev[0].text) && JSON.parse(ev[0].meta).issue === 77, "1d event code-task.anchor-routed", ev);
  ok(events(env, "code-task.fail").length === 1, "1e the task's own failure event is unchanged", events(env, "code-task.fail").length);
}
// An issue's own exact, path-matched anchor survives a planner task that omitted the anchor.
{
  const { env } = envWith();
  const anchor = "function farAway(x) { return x + 1; }";
  addIssue(env, 77, "open", true, { marker: "session-task", anchor });
  const id = await readOnce(env, STACK);
  const r = row(env, id), iss = issueRow(env, 77);
  const ctx = JSON.parse(r.ctx || "{}");
  ok(r.status !== "needs_human" && ctx.anchor === anchor, "1f a unique issue anchor is carried into the code task", { status: r.status, ctx });
  ok(/session-task: repo=qnfo-workers path=fx-na\/worker\.js/.test(iss.description) && events(env, "code-task.anchor-from-issue").length === 1 && events(env, "code-task.anchor-routed").length === 0, "1g the task uses the explicit anchor without changing issue routing", { description: iss.description, events: events(env, "code-task.anchor-from-issue").length });
}
// 2. the locator is still asked first, and a goal whose keyword is in the file is not routed (the keyword fallback places it)
{
  const { env, calls } = envWith();
  addIssue(env, 77, "open", true);
  const id = await readOnce(env, "make farAway add two instead of one -- issue #77");
  const r = row(env, id), iss = issueRow(env, 77);
  ok(calls.length >= 1, "2a the locator model is asked before anything is routed", calls);
  ok(r.status !== "needs_human" && /code-task: repo=/.test(iss.description) && events(env, "code-task.anchor-routed").length === 0, "2b a keyword hit places the task: nothing routed", { status: r.status, step: r.step, last_error: r.last_error });
}
// 3. a closed issue, an issue with no code-task line and a goal that names no issue are left alone
{
  const { env } = envWith();
  addIssue(env, 77, "closed", true);
  const id = await readOnce(env, STACK);
  ok(row(env, id).status === "needs_human" && /code-task: repo=/.test(issueRow(env, 77).description) && events(env, "code-task.anchor-routed").length === 0 && !/NEEDS-ANCHOR-ROUTE-1: issue/.test(row(env, id).last_error), "3a a closed issue is untouched", row(env, id).last_error);
}
{
  const { env } = envWith();
  addIssue(env, 77, "open", false);
  const id = await readOnce(env, STACK);
  ok(row(env, id).status === "needs_human" && issueRow(env, 77).description.indexOf("NEEDS-ANCHOR-ROUTE-1") < 0 && events(env, "code-task.anchor-routed").length === 0, "3b an issue without a code-task line is untouched", issueRow(env, 77).description);
}
{
  const { env } = envWith();
  addIssue(env, 77, "open", true);
  const id = await readOnce(env, STACK.replace("-- issue #77 ", ""));
  ok(row(env, id).status === "needs_human" && /code-task: repo=/.test(issueRow(env, 77).description) && events(env, "code-task.anchor-routed").length === 0, "3c a goal that names no issue routes nothing", row(env, id).last_error);
}
// 4. a task that carried an anchor which does not occur in the file is a different case: not routed
{
  const { env } = envWith();
  addIssue(env, 77, "open", true);
  const id = await readOnce(env, STACK, "this anchor line occurs nowhere in the fixture file");
  const r = row(env, id);
  ok(r.status === "needs_human" && /anchor occurs 0 times/.test(r.last_error || "") && /code-task: repo=/.test(issueRow(env, 77).description) && events(env, "code-task.anchor-routed").length === 0, "4 an anchor given but absent is not routed", { status: r.status, last_error: r.last_error });
}
// An anchor on a different path cannot make this task executable.
{
  const { env } = envWith();
  addIssue(env, 77, "open", true, { path: "other/worker.js", anchor: "function farAway(x) { return x + 1; }" });
  const id = await readOnce(env, STACK);
  ok(row(env, id).status === "needs_human" && events(env, "code-task.anchor-from-issue").length === 0, "5 an anchor for another path is ignored", row(env, id).last_error);
}

console.log("needs-anchor-route.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

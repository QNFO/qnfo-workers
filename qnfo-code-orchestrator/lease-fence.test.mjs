// LEASE-FENCE-1 offline suite (qnfo-code-orchestrator 0.18.23, pillar autonomy).
// Measured 2026-10-19 in code_tasks and cloud_ops_events: ct_zogt4y5sdzauqw reached ready_to_publish at 06:26:44Z, then a lane
// whose 90 s lease had lapsed during a slow model call saved step verify with a ctx that carried no patch, and the publisher
// failed the task at 06:27:31Z with "task has no patch in ctx.patch" (6 rows in 48 h); ct_im100041 was handed off twice. This
// suite holds one lane inside its model call, lets the lease lapse, drives the task to ready_to_publish with a second lane, then
// releases the first: its writes must be refused, the ready task must keep its patch, and no second handoff may be filed.
// Run: node --no-warnings qnfo-code-orchestrator/lease-fence.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const atLeast = (v, min) => { const a = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")), b = min.split(".").map(Number); if (!a) return false; for (let i = 0; i < 3; i++) { if (+a[i + 1] !== b[i]) return +a[i + 1] > b[i]; } return true; };

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
const SRC = 'export default { fetch() { return new Response("a"); } };\n';
const FILES = { "fx-worker/worker.js": SRC, "fx-worker/deployed-current.worker.js": SRC };
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const fakeLoader = { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) };
// the model: each entry is a reply string, or an Error to throw (the Workers AI binding throws on a 3046)
function envWith(script) {
  const calls = [];
  const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", LOADER: fakeLoader,
    AI: { run: async (model, input) => { calls.push({ model }); let r = script.shift(); if (typeof r === "function") r = await r(); if (r instanceof Error) throw r; return { response: r == null ? "" : r }; } } };
  return { env, calls };
}
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (env) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 1, budgetMs: 25000, plan: false, intake: false }) }), env)).json();
const addTask = async (env) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-worker/worker.js", goal: "return b instead of a" }) }), env)).json();
const row = (env, id) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks WHERE id=?").get(id);
const ctxOf = (r) => { try { return JSON.parse(r.ctx || "{}"); } catch (e) { return {}; } };
const expire = (env, id) => env.AUDIT_DB._db.prepare("UPDATE code_tasks SET lease_until=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), id);
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT text, status FROM cloud_ops_events WHERE kind=? ORDER BY rowid").all(kind);
const GOOD = "```file\nexport default { fetch() { return new Response(\"b\"); } };\n```";
const T3046 = () => new Error("3046: Request timeout");


const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(atLeast(h.version, "0.18.23"), "health: 0.18.23+", { version: h.version });

// ===== 1. a stale lane's propose cannot overwrite a task another lane made ready =====
{
  let release;
  const held = new Promise((res) => { release = res; });
  const { env } = envWith([() => held, GOOD]);
  const c = await addTask(env);
  await tick(env); // read
  ok(row(env, c.id).step === "propose", "read ran", row(env, c.id));
  const slow = tick(env); // lane A: blocked inside its model call
  await new Promise((r) => setTimeout(r, 50));
  expire(env, c.id); // lane A's lease lapses
  for (let i = 0; i < 4 && row(env, c.id).status === "queued"; i++) await tick(env); // lane B: propose, verify, commit
  let r = row(env, c.id);
  ok(r.status === "ready_to_publish" && typeof ctxOf(r).patch === "string" && ctxOf(r).patch.length > 0, "lane B made the task ready with a patch", { status: r.status, step: r.step, keys: Object.keys(ctxOf(r)) });
  release(GOOD); // lane A answers late
  const ta = await slow;
  r = row(env, c.id);
  ok(r.status === "ready_to_publish" && r.step === "done" && typeof ctxOf(r).patch === "string" && ctxOf(r).patch.length > 0, "the stale lane wrote nothing: still ready_to_publish, step done, patch kept", { status: r.status, step: r.step, keys: Object.keys(ctxOf(r)) });
  ok(ta.done && ta.done[0] && ta.done[0].ok === false, "the stale lane's step reports not ok", ta.done);
  ok(events(env, "code-task.lease-lost").length === 1, "one code-task.lease-lost event", events(env, "code-task.lease-lost"));
}

// ===== 2. a stale lane that fails files no second handoff =====
{
  let release;
  const held = new Promise((res) => { release = res; });
  const { env } = envWith([() => held, GOOD]);
  const c = await addTask(env);
  await tick(env);
  const slow = tick(env);
  await new Promise((r) => setTimeout(r, 50));
  expire(env, c.id);
  for (let i = 0; i < 4 && row(env, c.id).status === "queued"; i++) await tick(env);
  const before = env.AUDIT_DB._db.prepare("SELECT COUNT(*) n FROM agent_issues").get().n;
  release(new Error("boom: provider exploded"));
  await slow;
  const r = row(env, c.id);
  ok(r.status === "ready_to_publish" && r.attempts === 0 && !r.last_error, "a stale failure counts no attempt and writes no error", { status: r.status, attempts: r.attempts, last_error: r.last_error });
  ok(env.AUDIT_DB._db.prepare("SELECT COUNT(*) n FROM agent_issues").get().n === before, "no issue filed by the stale lane");
}

// ===== 3. the fenced path still works for an ordinary single lane =====
{
  const { env } = envWith([GOOD]);
  const c = await addTask(env);
  for (let i = 0; i < 5 && row(env, c.id).status === "queued"; i++) await tick(env);
  const r = row(env, c.id);
  ok(r.status === "ready_to_publish" && events(env, "code-task.lease-lost").length === 0, "single lane: ready, no lease-lost event", { status: r.status, step: r.step, err: r.last_error });
}

console.log("lease-fence: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

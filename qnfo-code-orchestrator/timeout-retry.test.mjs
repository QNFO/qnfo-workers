// TIMEOUT-RETRY-1 offline suite (qnfo-code-orchestrator 0.6.0, agent_issues 2099, pillar autonomy).
// Measured 2026-10-07T08:10Z in cloud_ops_events kind code-task.fail: "step threw: 3046: Request timeout" was 11 of the 21
// failures since 2026-10-06 18:00Z, each costing an attempt and, at the third, a round's backoff (SELF-REPAIR-1). This suite
// proves that a provider timeout keeps the attempt count, parks the task for TIMEOUT_WAIT_MS, moves to the next rung, and
// that the timeout after TIMEOUT_MAX, or any other throw, still takes the ordinary failure path.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads.
// Run: node --no-warnings qnfo-code-orchestrator/timeout-retry.test.mjs   (exit 0 = all passed)
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
    AI: { run: async (model, input) => { calls.push({ model }); const r = script.shift(); if (r instanceof Error) throw r; return { response: r == null ? "" : r }; } } };
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

// ===== 1. health =====
const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(atLeast(h.version, "0.6.0") && h.capabilities.indexOf("timeout-retry") >= 0, "health: 0.6.0+ with the timeout-retry capability", { version: h.version });

// ===== 2. a timeout keeps the attempt, parks the task, moves to the next rung =====
{
  const { env, calls } = envWith([T3046(), T3046(), GOOD]);
  const c = await addTask(env);
  ok(c.ok && c.id, "task enqueued", c);
  let t = await tick(env);
  let r = row(env, c.id);
  ok(r.step === "propose" && r.attempts === 0, "the read step ran", { step: r.step, attempts: r.attempts, done: t.done });
  const t0 = Date.now();
  t = await tick(env);
  r = row(env, c.id);
  const wait = Date.parse(r.lease_until || "") - t0;
  ok(t.done && t.done.length === 1 && t.done[0].ok === false && t.done[0].timeout === true && t.done[0].retry_at && /3046/.test(t.done[0].error), "the tick reports the timeout with its retry time, not a failure", t.done);
  ok(r.status === "queued" && r.step === "propose" && r.attempts === 0 && ctxOf(r).timeouts === 1, "first timeout: attempts 0, ctx.timeouts 1, still queued at propose", { status: r.status, step: r.step, attempts: r.attempts, ctx: ctxOf(r) });
  ok(wait > 9.5 * 60 * 1000 && wait < 10.5 * 60 * 1000, "the task is parked for about 10 minutes (lease_until)", { wait });
  ok(ctxOf(r).base === SRC && "sha" in ctxOf(r), "the read step's ctx (base, sha) survives the timeout", { keys: Object.keys(ctxOf(r)), base: ctxOf(r).base });
  const ev = events(env, "code-task.timeout");
  ok(ev.length === 1 && ev[0].status === "retry" && /\(1 of 6\)/.test(ev[0].text) && /3046/.test(ev[0].text), "one code-task.timeout event, status retry, naming 1 of 6", ev);
  ok(events(env, "code-task.fail").length === 0 && r.last_error == null, "no code-task.fail event and no last_error", { last_error: r.last_error });
  // a parked task is not claimed before its lease ends
  t = await tick(env);
  ok(t.done.length === 0 && calls.length === 1, "the parked task is not stepped while its lease runs", { done: t.done.length, calls: calls.length });
  expire(env, c.id);
  t = await tick(env);
  r = row(env, c.id);
  ok(calls.length === 2 && calls[1].model !== calls[0].model, "the second try runs on the next rung, not the one that timed out", calls);
  ok(r.attempts === 0 && ctxOf(r).timeouts === 2 && events(env, "code-task.timeout").length === 2, "second timeout: attempts still 0, ctx.timeouts 2", { attempts: r.attempts, ctx: ctxOf(r).timeouts });
  expire(env, c.id);
  t = await tick(env);
  r = row(env, c.id);
  ok(calls.length === 3 && r.attempts === 0 && r.step !== "propose" && r.status !== "failed", "a reply after two timeouts carries the task on with no attempt spent", { step: r.step, status: r.status, attempts: r.attempts });
  ok(!("timeouts" in ctxOf(r)), "0.8.0: a propose that answered resets ctx.timeouts, so a later round starts at rung 1", Object.keys(ctxOf(r)));
  // ORCH-NEURON-ATTR-1: the one call that answered is counted in ai_call_counters (the two that timed out threw before accounting)
  const cnt = env.AUDIT_DB._db.prepare("SELECT worker, purpose, model, calls, in_tok, out_tok, neurons FROM ai_call_counters").all();
  const led = env.AUDIT_DB._db.prepare("SELECT caller, calls, usd FROM ai_spend_ledger").all();
  ok(cnt.length === 1 && cnt[0].worker === "qnfo-code-orchestrator" && cnt[0].purpose === "ladder" && cnt[0].calls === 1 && cnt[0].model === calls[2].model && cnt[0].neurons > 0 && cnt[0].in_tok > 0, "ORCH-NEURON-ATTR-1: the answered ladder call is one ai_call_counters row with neurons", cnt);
  ok(led.length === 1 && led[0].caller === "qnfo-code-orchestrator" && led[0].calls === 1 && led[0].usd > 0 && Math.abs(led[0].usd - cnt[0].neurons * 0.011 / 1000) < 1e-9, "the ledger row and the counters row agree (usd = neurons x $0.011/1k)", led);
}

// ===== 3. the timeout after TIMEOUT_MAX takes the ordinary failure path =====
{
  const { env } = envWith([T3046()]);
  const c = await addTask(env);
  await tick(env);
  env.AUDIT_DB._db.prepare("UPDATE code_tasks SET ctx = json_set(ctx, '$.timeouts', 6) WHERE id=?").run(c.id);
  const t = await tick(env);
  const r = row(env, c.id);
  ok(t.done[0].ok === false && r.attempts === 1 && /^step threw: 3046/.test(r.last_error || "") && ctxOf(r).timeouts === 6, "the seventh timeout counts as a failed attempt (SELF-REPAIR-1 takes over)", { attempts: r.attempts, last_error: r.last_error, done: t.done });
  ok(events(env, "code-task.timeout").length === 0 && events(env, "code-task.fail").length === 1, "it writes code-task.fail, not code-task.timeout", { fail: events(env, "code-task.fail") });
}

// ===== 4. any other throw is a failed attempt, as before =====
{
  const { env } = envWith([new Error("boom: the model returned garbage")]);
  const c = await addTask(env);
  await tick(env);
  await tick(env);
  const r = row(env, c.id);
  ok(r.attempts === 1 && /^step threw: boom/.test(r.last_error || "") && ctxOf(r).timeouts == null && events(env, "code-task.timeout").length === 0, "a non-timeout throw costs the attempt and writes no timeout event", { attempts: r.attempts, last_error: r.last_error });
}

console.log("timeout-retry.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

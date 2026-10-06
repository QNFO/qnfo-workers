// CLAIMS-FIRST-1 (0.3.21, transformation lever T1.14): every code task holds the WORK-CLAIM-1 claim on its file through
// qnfo-deploy-guard /work-lock from enqueue to its end; a file a session holds makes the task wait; a finished task releases
// its claim with the pull request and the outcome; the guard unreachable never breaks the loop.
// Run: node qnfo-code-orchestrator/claims-first.test.mjs
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const atLeast = (v, min) => { const a = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")), b = min.split(".").map(Number); if (!a) return false; for (let i = 0; i < 3; i++) { if (+a[i + 1] !== b[i]) return +a[i + 1] > b[i]; } return true; }; // semver minimum, so a minor bump keeps passing
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
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  return { prepare: wrap, _db: db };
}

// the deploy-guard stub: acquire (409 while a session holds the key and no token renews it), release, or down
const guard = { calls: [], held: null, down: false, tokens: 0 };
const GUARD = "https://qnfo-deploy-guard";
// raw reads fail: a step ends in a read error, which is not this suite's subject; the guard is reached only over the binding
globalThis.fetch = async () => new Response("nf", { status: 404 });
const guardFetch = async (u, init) => {
  const url = String(u);
  if (url.startsWith(GUARD + "/work-lock/")) {
    if (guard.down) throw new Error("ECONNRESET");
    const body = JSON.parse(init.body);
    guard.calls.push({ path: url.slice(GUARD.length), body });
    if (url.endsWith("/acquire")) {
      if (guard.held && !body.token) return new Response(JSON.stringify({ key: body.key, acquired: false, reason: "work_claims", holder: guard.held, expires_at: "2099-01-01T00:00:00Z", intent: "a session edits it" }), { status: 409 });
      const token = body.token || ("tok" + (++guard.tokens));
      return new Response(JSON.stringify({ acquired: true, renewed: !!body.token, key: body.key, token, holder: body.owner, expires_at: new Date(Date.now() + body.ttl_sec * 1000).toISOString(), in_flight: [] }), { status: 200 });
    }
    if (url.endsWith("/release")) return new Response(JSON.stringify({ released: true, key: body.key }), { status: 200 });
  }
  return new Response("nf", { status: 404 });
};
let aiCalls = 0;
const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", AI: { run: async () => { aiCalls++; return { response: "" }; } },
  LOADER: { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) }, DEPLOY_GUARD: { fetch: guardFetch } };
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (o) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify(Object.assign({ maxSteps: 1, budgetMs: 25000, plan: false, intake: false }, o || {})) }), env)).json();
const addTask = async (goal) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-worker/worker.js", goal }) }), env)).json();
const db = env.AUDIT_DB._db;
const row = (id) => db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(id);
const ctxOf = (id) => JSON.parse(row(id).ctx || "{}");
const acquires = () => guard.calls.filter((x) => x.path === "/work-lock/acquire");
const releases = () => guard.calls.filter((x) => x.path === "/work-lock/release");

// 1. enqueue takes the claim
const a = await addTask("claims-first fixture: a task holds its file");
ok(a.ok && /^ct_/.test(a.id), "task enqueued", a);
let c = ctxOf(a.id).claim;
ok(acquires().length === 1 && acquires()[0].body.key === "file:fx-worker/worker.js" && acquires()[0].body.owner === "qnfo-code-orchestrator:" + a.id && acquires()[0].body.ttl_sec === 7200 && /claims-first fixture/.test(acquires()[0].body.intent) && !acquires()[0].body.token, "enqueue acquires file:<path> as qnfo-code-orchestrator:<task> with the goal as intent, ttl 7200", acquires());
ok(c && c.token === "tok1" && c.key === "file:fx-worker/worker.js" && c.expires_at && !c.released_at, "the claim (token, expiry) is recorded on the task", c);

// 2. a fresh claim costs no guard call at the step; the step itself runs
guard.calls.length = 0;
let t = await tick();
ok(acquires().length === 0 && t.steps === 1 && !t.done[0].deferred, "a task with a fresh claim steps without a guard call", { calls: guard.calls, t });
ok(t.claims && typeof t.claims.taken === "number" && t.claims.held === 0, "the tick reports the claims sweep", t.claims);

// 3. a claim near expiry is renewed with its token
db.prepare("UPDATE code_tasks SET ctx = json_set(ctx, '$.claim.expires_at', ?), status = 'queued', lease_until = NULL WHERE id = ?").run(new Date(Date.now() + 10 * 60e3).toISOString(), a.id);
guard.calls.length = 0;
t = await tick();
ok(acquires().length >= 1 && acquires()[0].body.token === "tok1" && ctxOf(a.id).claim.renewals >= 1 && Date.parse(ctxOf(a.id).claim.expires_at) - Date.now() > 60 * 60e3, "a claim under 45 minutes from expiry is renewed with its token", { ren: acquires(), c: ctxOf(a.id).claim });

// 4. a file a session holds: the step is deferred, no model call, the hold recorded
db.prepare("UPDATE code_tasks SET ctx = json_remove(ctx, '$.claim'), status = 'queued', lease_until = NULL WHERE id = ?").run(a.id);
guard.held = "session_other"; guard.calls.length = 0; aiCalls = 0;
t = await tick();
ok(t.done.length === 1 && t.done[0].deferred === true && /held by session_other/.test(t.done[0].error) && aiCalls === 0, "a task whose file a session holds is deferred without a model call", t.done);
const r4 = row(a.id);
ok(r4.status === "queued" && r4.lease_until && Date.parse(r4.lease_until) > Date.now() + 15 * 60e3, "the task keeps its place and waits CLAIM_WAIT_MS", r4);
ok(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'code-task.claim-held'").get().n >= 1 && t.claims.held >= 1, "the hold is recorded (event and sweep count)", t.claims);

// 5. the file is free again: the task takes the claim and steps
guard.held = null; guard.calls.length = 0;
db.prepare("UPDATE code_tasks SET lease_until = NULL WHERE id = ?").run(a.id);
t = await tick();
ok(t.done.length === 1 && !t.done[0].deferred && ctxOf(a.id).claim && ctxOf(a.id).claim.token === "tok2", "once the file is free the task claims it and steps", { t, c: ctxOf(a.id).claim });

// 6. a finished task releases its claim with the pull request and the outcome
db.prepare("UPDATE code_tasks SET status = 'merged', pr_url = 'https://github.com/QNFO/qnfo-workers/pull/777' WHERE id = ?").run(a.id);
guard.calls.length = 0;
t = await tick();
ok(releases().length === 1 && releases()[0].body.token === "tok2" && releases()[0].body.key === "file:fx-worker/worker.js" && releases()[0].body.pr === 777 && releases()[0].body.outcome === "merged" && t.claims.released === 1, "a merged task releases its claim with the PR number and outcome merged", { rel: releases(), claims: t.claims });
c = ctxOf(a.id).claim;
ok(c.released_at && c.outcome === "merged" && c.release_status === 200, "the release is recorded on the task", c);
guard.calls.length = 0;
t = await tick();
ok(guard.calls.length === 0, "a released claim is never released twice", guard.calls);

// 7. the guard unreachable: nothing breaks, the step still runs, the sweep counts the error
guard.down = true;
const b = await addTask("claims-first fixture: guard down");
ok(b.ok && !ctxOf(b.id).claim, "enqueue survives an unreachable guard, without a claim", ctxOf(b.id));
t = await tick();
ok(t.ok && t.steps === 1 && !t.done[0].deferred && t.claims.errors >= 1, "the step runs and the sweep counts the guard error", t);
guard.down = false;

// 8. outcome names: a failed task releases as abandoned, without a PR
db.prepare("UPDATE code_tasks SET status = 'failed', ctx = json_set(COALESCE(ctx,'{}'), '$.claim', json(?)) WHERE id = ?").run(JSON.stringify({ key: "file:fx-worker/worker.js", token: "tokX", expires_at: "2099-01-01T00:00:00Z" }), b.id);
guard.calls.length = 0;
t = await tick();
ok(releases().length === 1 && releases()[0].body.outcome === "abandoned" && releases()[0].body.token === "tokX" && !("pr" in releases()[0].body), "a failed task releases as abandoned, without a PR", releases());

// 9. no DEPLOY_GUARD binding: claims are skipped and counted, nothing reaches the network
{
  const envNo = Object.assign({}, env, { DEPLOY_GUARD: undefined });
  let guardCalls = 0; const f0 = globalThis.fetch; globalThis.fetch = async (...a) => { if (/deploy-guard|work-lock/.test(String(a[0]))) guardCalls++; return f0(...a); };
  const c9 = await (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-worker/other.js", goal: "no binding" }) }), envNo)).json();
  const t9 = await (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 0, plan: false, intake: false }) }), envNo)).json();
  ok(c9.ok && !ctxOf(c9.id).claim && t9.claims && t9.claims.errors >= 1 && t9.claims.taken === 0 && guardCalls === 0, "without the binding no claim is taken, the sweep counts it, and no guard call leaves the worker", { c9, claims: t9.claims, guardCalls });
  globalThis.fetch = f0;
}

// 10. /health names the behaviour
const h = await (await worker.fetch(new Request("https://x/health"), env)).json();
ok(atLeast(h.version, "0.3.21") && (h.limitations || []).some((l) => /CLAIMS-FIRST-1/.test(l)), "health names CLAIMS-FIRST-1 and the version is 0.3.21+", { v: h.version });

console.log(`claims-first: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// CLAIM-AT-RUN-1 (0.14.5, agent_issues 2491 CODE-QUEUE-CLAIM-HOLD-1, pillar autonomy): a code task takes its file claim when it
// starts, not when it is queued. Live on 2026-10-13 12:32Z ct_47mzp4hr1ttd7o held file:qnfo-fleet-dashboard/worker.js from its
// enqueue at 10:11Z, renewed by the claims sweep to 13:32Z, without having run a step. This suite proves:
//   1. enqueue sends no acquire and records no claim;
//   2. the sweep sends no guard call for a queued task that has not started;
//   3. an unstarted task that still holds a claim taken at enqueue (before 0.14.5) is released, never renewed, and the release is
//      audited as code-task.claim-unstarted; a session can then take the file;
//   4. the task takes a claim at its first step, and once started a near-expiry claim is renewed again;
//   5. a task in a TIMEOUT-RETRY-1 wait on its read step (no attempt yet, ctx.timeouts 1) has started and keeps its claim.
// Run: node qnfo-code-orchestrator/claim-at-run.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const atLeast = (v, min) => { const a = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")), b = min.split(".").map(Number); if (!a) return false; for (let i = 0; i < 3; i++) { if (+a[i + 1] !== b[i]) return +a[i + 1] > b[i]; } return true; }; // semver minimum, so a later bump keeps passing
const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 700) : "")); } };

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

// The deploy-guard stub, shaped like qnfo-deploy-guard workAcquire/release: a held token renews; a token that no longer holds the
// lease falls through to a fresh acquire; a session's claim or another lease on the key refuses with its holder.
const guard = { calls: [], lease: {}, session: {}, down: false, tokens: 0 };
const GUARD = "https://qnfo-deploy-guard";
const guardFetch = async (u, init) => {
  const url = String(u);
  if (!url.startsWith(GUARD + "/work-lock/")) return new Response("nf", { status: 404 });
  if (guard.down) throw new Error("ECONNRESET");
  const body = JSON.parse(init.body);
  guard.calls.push({ path: url.slice(GUARD.length), body });
  const lease = guard.lease[body.key];
  const exp = (s) => new Date(Date.now() + s * 1000).toISOString();
  if (url.endsWith("/acquire")) {
    if (body.token && lease && lease.token === body.token) return new Response(JSON.stringify({ acquired: true, renewed: true, key: body.key, token: body.token, holder: lease.owner, expires_at: exp(body.ttl_sec) }), { status: 200 });
    if (guard.session[body.key] && guard.session[body.key] !== body.owner) return new Response(JSON.stringify({ key: body.key, acquired: false, reason: "work_claims", holder: guard.session[body.key], expires_at: "2099-01-01T00:00:00Z" }), { status: 409 });
    if (lease) return new Response(JSON.stringify({ key: body.key, acquired: false, holder: lease.owner, expires_at: "2099-01-01T00:00:00Z" }), { status: 409 });
    const token = "tok" + (++guard.tokens);
    guard.lease[body.key] = { token, owner: body.owner };
    if (/^session_/.test(body.owner)) guard.session[body.key] = body.owner;
    return new Response(JSON.stringify({ acquired: true, renewed: false, key: body.key, token, holder: body.owner, expires_at: exp(body.ttl_sec) }), { status: 200 });
  }
  if (url.endsWith("/release")) {
    if (!lease || lease.token !== body.token) return new Response(JSON.stringify({ key: body.key, released: false, error: "not_holder" }), { status: 409 });
    delete guard.lease[body.key]; delete guard.session[body.key];
    return new Response(JSON.stringify({ key: body.key, released: true }), { status: 200 });
  }
  return new Response("nf", { status: 404 });
};
// raw reads fail, so every step is a failed read attempt: the round end, not the edit, is this suite's subject
globalThis.fetch = async () => new Response("nf", { status: 404 });
let aiCalls = 0;
const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", AI: { run: async () => { aiCalls++; return { response: "" }; } }, DEPLOY_GUARD: { fetch: guardFetch } };
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (o) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify(Object.assign({ maxSteps: 1, budgetMs: 25000, plan: false, intake: false }, o || {})) }), env)).json();
const db = env.AUDIT_DB._db;
// startClaim stands for a claim a task already holds (taken at enqueue before 0.14.5, or at a step).
const startClaim = async (id, p) => {
  const r = await (await guardFetch(GUARD + "/work-lock/acquire", { body: JSON.stringify({ key: "file:" + p, owner: "qnfo-code-orchestrator:" + id, ttl_sec: 7200 }) })).json();
  db.prepare("UPDATE code_tasks SET ctx = json_set(COALESCE(ctx, '{}'), '$.claim', json(?)) WHERE id = ?").run(JSON.stringify({ key: "file:" + p, token: r.token, expires_at: r.expires_at, since: new Date().toISOString(), renewals: 0 }), id);
  return r.token;
};
const addTask = async (p, goal) => {
  const r = await (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: p, goal }) }), env)).json();
  return r;
};
const row = (id) => db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(id);
const ctxOf = (id) => JSON.parse(row(id).ctx || "{}");
const callsFor = (p, key) => guard.calls.filter((x) => x.path === p && x.body.key === key);
const inMin = (m) => new Date(Date.now() + m * 60e3).toISOString();
const setClaim = (id, patch) => db.prepare("UPDATE code_tasks SET ctx = json_set(ctx, '$.claim', json(?)) WHERE id = ?").run(JSON.stringify(Object.assign({}, ctxOf(id).claim, patch)), id);

// 1. enqueue takes no claim
const KA = "file:fx-a/worker.js";
const A = await addTask("fx-a/worker.js", "claim-at-run fixture A: queued, not started");
ok(A.ok && callsFor("/work-lock/acquire", KA).length === 0 && !ctxOf(A.id).claim && !guard.lease[KA], "1 enqueue sends no acquire and records no claim", { calls: guard.calls, ctx: ctxOf(A.id) });

// 2. the sweep never claims an unstarted task (not due: a 15-minute claim-held deferral)
db.prepare("UPDATE code_tasks SET lease_until = ? WHERE id = ?").run(inMin(15), A.id);
guard.calls.length = 0;
let t = await tick();
ok(t.steps === 0 && guard.calls.length === 0 && t.claims.taken === 0 && t.claims.renewed === 0, "2 the sweep sends no guard call for a queued task that has not started", { t, calls: guard.calls });

// 3. a claim taken at enqueue before 0.14.5, near expiry: released, never renewed
const tokA = await startClaim(A.id, "fx-a/worker.js");
setClaim(A.id, { expires_at: inMin(10), renewals: 3 });
guard.calls.length = 0;
t = await tick();
const relA = callsFor("/work-lock/release", KA);
let ca = ctxOf(A.id).claim;
ok(callsFor("/work-lock/acquire", KA).length === 0, "3a the sweep never renews an unstarted task's claim, even under 45 minutes from expiry", guard.calls);
ok(relA.length === 1 && relA[0].body.token === tokA && relA[0].body.outcome === "abandoned" && t.claims.unstarted === 1 && ca.released_at && ca.unstarted === true && !guard.lease[KA], "3b the sweep releases it (outcome abandoned) and records it on the task", { relA, claims: t.claims, ca });
ok(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'code-task.claim-unstarted' AND text LIKE ?").get(A.id + "%").n === 1, "3c the release is audited as code-task.claim-unstarted");
const s1 = await (await guardFetch(GUARD + "/work-lock/acquire", { body: JSON.stringify({ key: KA, owner: "session_x", ttl_sec: 3600 }) })).json();
ok(s1.acquired === true, "3d a session can take the file the queued task has not started on", s1);
await guardFetch(GUARD + "/work-lock/release", { body: JSON.stringify({ key: KA, token: s1.token }) });
guard.calls.length = 0;
t = await tick();
ok(guard.calls.length === 0 && t.claims.unstarted === 0, "3e a released claim is released once", { calls: guard.calls, claims: t.claims });

// 4. the first step takes the claim; once started, the claim renews as before
db.prepare("UPDATE code_tasks SET lease_until = ? WHERE id = ?").run(inMin(-1), A.id);
guard.calls.length = 0;
t = await tick();
const acA = callsFor("/work-lock/acquire", KA);
ca = ctxOf(A.id).claim;
ok(t.done.length === 1 && t.done[0].id === A.id && !t.done[0].deferred && acA.length === 1 && !acA[0].body.token && acA[0].body.owner === "qnfo-code-orchestrator:" + A.id && ca.token && ca.token !== tokA && !ca.released_at && guard.lease[KA], "4a the task takes a new claim at its first step and steps", { done: t.done, acA, ca });
ok(row(A.id).attempts === 1 && t.claims.unstarted === 0 && callsFor("/work-lock/release", KA).length === 0, "4b after its step the task has started and the sweep keeps its claim", { r: row(A.id), claims: t.claims });
db.prepare("UPDATE code_tasks SET lease_until = ? WHERE id = ?").run(inMin(15), A.id);
setClaim(A.id, { expires_at: inMin(10) });
guard.calls.length = 0;
t = await tick();
const renA = callsFor("/work-lock/acquire", KA);
ok(renA.length === 1 && renA[0].body.token === ca.token && t.claims.renewed === 1 && ctxOf(A.id).claim.renewals >= 1, "4c a started task's claim is renewed near expiry", { renA, claims: t.claims });

// 5. a timeout retry on the read step has started: it keeps and renews its claim
const KB = "file:fx-b/worker.js";
const B = await addTask("fx-b/worker.js", "claim-at-run fixture B: read step timed out once");
const tokB = await startClaim(B.id, "fx-b/worker.js");
db.prepare("UPDATE code_tasks SET lease_until = ?, ctx = json_set(ctx, '$.timeouts', 1) WHERE id = ?").run(inMin(10), B.id);
setClaim(B.id, { expires_at: inMin(10) });
guard.calls.length = 0;
t = await tick();
const acB = callsFor("/work-lock/acquire", KB);
ok(acB.length === 1 && acB[0].body.token === tokB && callsFor("/work-lock/release", KB).length === 0 && !ctxOf(B.id).claim.released_at, "5 a read step in a TIMEOUT-RETRY-1 wait keeps and renews its claim", { acB, c: ctxOf(B.id).claim });

// 6. /health names the behaviour; the version is a minimum, never an exact string
const h = await (await worker.fetch(new Request("https://x/health"), env)).json();
ok(atLeast(h.version, "0.14.5") && (h.limitations || []).some((l) => /CLAIM-AT-RUN-1/.test(l)), "6 health names CLAIM-AT-RUN-1 and the version is 0.14.5+", { v: h.version });

console.log(`claim-at-run: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

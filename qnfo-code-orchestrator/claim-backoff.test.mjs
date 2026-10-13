// CLAIM-HELD-IN-BACKOFF-1 (0.14.2, pillar autonomy): a code task waiting in a SELF-REPAIR-1 backoff does not hold its file.
// Live on 2026-10-13 07:34Z ct_ne8sjnxe748hiz held file:qnfo-research-exec/worker.js from 01:30:55Z, renewed 4 times by the
// claims sweep, while it sat queued with lease_until 11:50:55Z, so every session was refused the file. This suite proves:
//   1. a task that enters a backoff releases its claim (outcome backoff since 0.16.0) and records released_at and backoff_until;
//   2. the claims sweep never takes or renews the claim of a parked task (queued, next attempt over 30 minutes away), and it
//      releases a claim that a task parked before 0.14.2 still holds; a release the guard never answered is retried;
//   3. tasks that are being worked still renew: one waiting on the merge runner, one in a short TIMEOUT-RETRY-1 wait, and a due
//      task before its step;
//   4. on resume the task takes a new claim through the usual acquire, and a session holding the file defers it (queued,
//      CLAIM_WAIT_MS) instead of failing it.
// Run: node qnfo-code-orchestrator/claim-backoff.test.mjs   (exit 0 = all passed)
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
// CLAIM-AT-RUN-1 (0.14.5): enqueue takes no claim. These fixtures stand for tasks that already started and hold their file, so
// the claim is taken here the way claimEnsure takes it at the first step (owner qnfo-code-orchestrator:<task>, ttl 7200).
let enqueueAcquires = 0;
const startClaim = async (id, p) => {
  const r = await (await guardFetch(GUARD + "/work-lock/acquire", { body: JSON.stringify({ key: "file:" + p, owner: "qnfo-code-orchestrator:" + id, ttl_sec: 7200 }) })).json();
  db.prepare("UPDATE code_tasks SET ctx = json_set(COALESCE(ctx, '{}'), '$.claim', json(?)) WHERE id = ?").run(JSON.stringify({ key: "file:" + p, token: r.token, expires_at: r.expires_at, since: new Date().toISOString(), renewals: 0 }), id);
};
const addTask = async (p, goal) => {
  const n0 = guard.calls.length;
  const r = await (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: p, goal }) }), env)).json();
  enqueueAcquires += guard.calls.length - n0;
  if (r.ok) await startClaim(r.id, p);
  return r;
};
const row = (id) => db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(id);
const ctxOf = (id) => JSON.parse(row(id).ctx || "{}");
const callsFor = (p, key) => guard.calls.filter((x) => x.path === p && x.body.key === key);
const inMin = (m) => new Date(Date.now() + m * 60e3).toISOString();
const setClaim = (id, patch) => db.prepare("UPDATE code_tasks SET ctx = json_set(ctx, '$.claim', json(?)) WHERE id = ?").run(JSON.stringify(Object.assign({}, ctxOf(id).claim, patch)), id);

// 1. a task that enters a SELF-REPAIR-1 backoff releases its claim
const KA = "file:fx-a/worker.js";
const A = await addTask("fx-a/worker.js", "claim-backoff fixture A: a task that fails its round");
ok(A.ok && enqueueAcquires === 0 && ctxOf(A.id).claim && ctxOf(A.id).claim.token === "tok1" && guard.lease[KA], "1a the started task holds its claim (enqueue itself sent no acquire)", ctxOf(A.id));
db.prepare("UPDATE code_tasks SET attempts = 2 WHERE id = ?").run(A.id);
guard.calls.length = 0;
let t = await tick();
let ra = row(A.id), ca = ctxOf(A.id).claim;
ok(t.done.length === 1 && t.done[0].id === A.id && ra.status === "queued" && ra.attempts === 3 && Date.parse(ra.lease_until) - Date.now() > 50 * 60e3 && /SELF-REPAIR-1: round 1 of 3 failed/.test(ra.last_error), "1b the third failed attempt ends the round: queued, backoff of an hour", { done: t.done, ra });
const relA = callsFor("/work-lock/release", KA);
ok(relA.length === 1 && relA[0].body.token === "tok1" && relA[0].body.outcome === "backoff" && !("pr" in relA[0].body), "1c the backoff releases the claim with its token, outcome backoff (FAIL-SIGNATURE-STOP-1)", relA);
ok(ca.released_at && ca.release_status === 200 && ca.outcome === "backoff" && ca.backoff_until === ra.lease_until && !guard.lease[KA], "1d released_at and backoff_until are recorded on the task and the guard lease is gone", ca);
ok(callsFor("/work-lock/acquire", KA).length === 0 && t.claims.parked === 0 && t.claims.taken === 0 && t.claims.renewed === 0, "1e the sweep in the same tick neither re-takes nor renews the parked task", { calls: guard.calls, claims: t.claims });
ok(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'code-task.claim-parked' AND text LIKE ?").get(A.id + "%").n === 1, "1f the release is audited (code-task.claim-parked)");
const s1 = await (await guardFetch(GUARD + "/work-lock/acquire", { body: JSON.stringify({ key: KA, owner: "session_x", ttl_sec: 3600 }) })).json();
ok(s1.acquired === true, "1g a session can now take the file the task waits on", s1);
await guardFetch(GUARD + "/work-lock/release", { body: JSON.stringify({ key: KA, token: s1.token }) });

// 2. the sweep skips a parked task, and releases what a task parked before 0.14.2 still holds
guard.calls.length = 0;
t = await tick();
ok(t.steps === 0 && guard.calls.length === 0, "2a a later tick sends no guard call for the parked task (not due, never renewed)", { t, calls: guard.calls });
const KB = "file:fx-b/worker.js";
const B = await addTask("fx-b/worker.js", "claim-backoff fixture B: parked by 0.14.1 with its claim");
const tokB = ctxOf(B.id).claim.token;
db.prepare("UPDATE code_tasks SET attempts = 6, step = 'propose', lease_until = ? WHERE id = ?").run(inMin(5 * 60), B.id);
setClaim(B.id, { expires_at: inMin(10), renewals: 4 }); // near expiry: 0.14.1's sweep renewed exactly this
guard.calls.length = 0;
t = await tick();
ok(callsFor("/work-lock/acquire", KB).length === 0, "2b the sweep never renews a parked task's claim, even under 45 minutes from expiry", callsFor("/work-lock/acquire", KB));
const relB = callsFor("/work-lock/release", KB);
const cb = ctxOf(B.id).claim;
ok(relB.length === 1 && relB[0].body.token === tokB && relB[0].body.outcome === "backoff" && t.claims.parked === 1 && cb.released_at && cb.backoff_until === row(B.id).lease_until && !guard.lease[KB], "2c the sweep releases the claim a task parked earlier still holds", { relB, claims: t.claims, cb });
ok(row(B.id).status === "queued" && row(B.id).attempts === 6, "2d the parked task keeps its place in the queue", row(B.id));
guard.calls.length = 0;
t = await tick();
ok(guard.calls.length === 0 && t.claims.parked === 0, "2e a released claim is released once", { calls: guard.calls, claims: t.claims });

// 3. tasks being worked still renew
const C = await addTask("fx-c/worker.js", "claim-backoff fixture C: waits on the merge runner");
const D = await addTask("fx-d/worker.js", "claim-backoff fixture D: a short timeout wait");
const E = await addTask("fx-e/worker.js", "claim-backoff fixture E: due now");
const tokC = ctxOf(C.id).claim.token, tokD = ctxOf(D.id).claim.token, tokE = ctxOf(E.id).claim.token;
db.prepare("UPDATE code_tasks SET status = 'pr_open', step = 'done', pr_url = 'https://github.com/QNFO/qnfo-workers/pull/901' WHERE id = ?").run(C.id);
db.prepare("UPDATE code_tasks SET step = 'propose', lease_until = ? WHERE id = ?").run(inMin(10), D.id);
for (const id of [C.id, D.id, E.id]) setClaim(id, { expires_at: inMin(10) });
guard.calls.length = 0;
t = await tick();
const acC = callsFor("/work-lock/acquire", "file:fx-c/worker.js"), acD = callsFor("/work-lock/acquire", "file:fx-d/worker.js"), acE = callsFor("/work-lock/acquire", "file:fx-e/worker.js");
ok(acC.length === 1 && acC[0].body.token === tokC && acC[0].body.pr === 901 && ctxOf(C.id).claim.renewals >= 1 && !ctxOf(C.id).claim.released_at, "3a a task waiting on the merge runner is renewed with its token and PR", { acC, c: ctxOf(C.id).claim });
ok(acD.length === 1 && acD[0].body.token === tokD && ctxOf(D.id).claim.renewals >= 1 && callsFor("/work-lock/release", "file:fx-d/worker.js").length === 0, "3b a queued task in a 10-minute TIMEOUT-RETRY-1 wait keeps and renews its claim", { acD, d: ctxOf(D.id).claim });
ok(t.done.length === 1 && t.done[0].id === E.id && !t.done[0].deferred && acE.length >= 1 && acE[0].body.token === tokE && ctxOf(E.id).claim.renewals >= 1, "3c a due task renews its claim before its step", { done: t.done, acE });
ok(Date.parse(ctxOf(C.id).claim.expires_at) - Date.now() > 60 * 60e3 && Date.parse(ctxOf(D.id).claim.expires_at) - Date.now() > 60 * 60e3, "3d the renewed claims run for the full TTL again");
db.prepare("UPDATE code_tasks SET status = 'closed' WHERE id IN (?, ?, ?)").run(C.id, D.id, E.id);
await tick(); // the finished tasks release their claims

// 4. resume: a session holds the file, so the task waits (queued) instead of failing; once free it takes a new claim
db.prepare("UPDATE code_tasks SET lease_until = ? WHERE id = ?").run(inMin(-1), A.id);
const sy = await (await guardFetch(GUARD + "/work-lock/acquire", { body: JSON.stringify({ key: KA, owner: "session_y", ttl_sec: 3600 }) })).json();
ok(sy.acquired === true, "4a fixture: a session holds fx-a", sy);
guard.calls.length = 0; aiCalls = 0;
t = await tick();
ra = row(A.id);
const acA = callsFor("/work-lock/acquire", KA);
ok(t.done.length === 1 && t.done[0].id === A.id && t.done[0].deferred === true && /held by session_y/.test(t.done[0].error) && aiCalls === 0, "4b the resumed task is deferred while the session holds the file", t.done);
ok(acA.length >= 1 && !acA[0].body.token, "4c the resume asks for a new claim (the released token is never sent)", acA);
ok(ra.status === "queued" && ra.attempts === 3 && Date.parse(ra.lease_until) - Date.now() > 15 * 60e3 && Date.parse(ra.lease_until) - Date.now() < 30 * 60e3, "4d the task stays queued with its attempts and waits CLAIM_WAIT_MS", ra);
await guardFetch(GUARD + "/work-lock/release", { body: JSON.stringify({ key: KA, token: sy.token }) });
db.prepare("UPDATE code_tasks SET lease_until = ? WHERE id = ?").run(inMin(-1), A.id);
const t0 = new Date(Date.now() - 1000).toISOString();
guard.calls.length = 0;
t = await tick();
ca = ctxOf(A.id).claim;
ok(t.done.length === 1 && t.done[0].id === A.id && !t.done[0].deferred && ca.token && ca.token !== "tok1" && !ca.released_at && ca.since >= t0 && !ca.renewals && guard.lease[KA] && guard.lease[KA].token === ca.token, "4e once the file is free the task takes a new claim (new token, new since, no renewals) and steps", { done: t.done, ca });
ok(row(A.id).status === "queued" && row(A.id).attempts === 4, "4f the step ran: the second round's first attempt", row(A.id));

// 5. a release the guard never answered is not recorded as released; the next sweep releases it
const KF = "file:fx-f/worker.js";
const F = await addTask("fx-f/worker.js", "claim-backoff fixture F: guard down at the round end");
const tokF = ctxOf(F.id).claim.token;
db.prepare("UPDATE code_tasks SET status = 'closed' WHERE id = ?").run(A.id); await tick(); // F is the only due task
db.prepare("UPDATE code_tasks SET attempts = 2 WHERE id = ?").run(F.id);
guard.down = true;
t = await tick();
ok(row(F.id).status === "queued" && Date.parse(row(F.id).lease_until) - Date.now() > 50 * 60e3 && !ctxOf(F.id).claim.released_at, "5a guard unreachable at the round end: the backoff holds, the claim is not marked released", { r: row(F.id), c: ctxOf(F.id).claim });
guard.down = false; guard.calls.length = 0;
t = await tick();
const relF = callsFor("/work-lock/release", KF);
ok(relF.length === 1 && relF[0].body.token === tokF && t.claims.parked === 1 && ctxOf(F.id).claim.released_at && callsFor("/work-lock/acquire", KF).length === 0, "5b the next sweep releases it and never renews it", { relF, claims: t.claims });

// 6. /health names the behaviour; the version is a minimum, never an exact string
const h = await (await worker.fetch(new Request("https://x/health"), env)).json();
ok(atLeast(h.version, "0.14.2") && (h.limitations || []).some((l) => /CLAIM-HELD-IN-BACKOFF-1/.test(l) && /30 minutes/.test(l)), "6 health names CLAIM-HELD-IN-BACKOFF-1 and the version is 0.14.2+", { v: h.version });

console.log(`claim-backoff: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

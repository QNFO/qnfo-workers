// CLAIM-PUBLISHED-RELEASE-1 (qnfo-code-orchestrator 0.18.20, 2026-10-18). A 'published' task is not in
// CODE_TASK_DONE — that list also decides whether a file is busy for CODE-DISPATCH-DEDUPE-1 and whether a retry is
// refused as in flight — so the claims sweep renewed its claim for ever. Measured 21:13Z: ct_im2925 published at
// 13:55:57Z still held file:qnfo-social/worker.js and deferred 9 tasks 104 times in 28 minutes. This suite proves the
// sweep now releases a published task's claim, keeps the file busy for dedupe, and does not re-take the claim.
// Run: node qnfo-code-orchestrator/claim-published-release.test.mjs
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
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
    CREATE UNIQUE INDEX idx_agent_issues_open_title ON agent_issues(title) WHERE status = 'open';
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  return { prepare: wrap, _db: db };
}

const guard = { released: [], lease: {}, tokens: 0, acquires: [] };
const guardFetch = async (u, init) => {
  const url = String(u), body = JSON.parse(init.body);
  const exp = (s) => new Date(Date.now() + s * 1000).toISOString();
  if (url.endsWith("/acquire")) {
    guard.acquires.push(body.key);
    const lease = guard.lease[body.key];
    if (body.token && lease && lease.token === body.token) return new Response(JSON.stringify({ acquired: true, renewed: true, key: body.key, token: body.token, expires_at: exp(body.ttl_sec) }), { status: 200 });
    if (lease) return new Response(JSON.stringify({ key: body.key, acquired: false, holder: lease.owner }), { status: 409 });
    const token = "tok" + (++guard.tokens);
    guard.lease[body.key] = { token, owner: body.owner };
    return new Response(JSON.stringify({ acquired: true, renewed: false, key: body.key, token, expires_at: exp(body.ttl_sec) }), { status: 200 });
  }
  if (url.endsWith("/release")) {
    const lease = guard.lease[body.key];
    guard.released.push(body.key + ":" + body.token);
    if (!lease || lease.token !== body.token) return new Response(JSON.stringify({ released: false, error: "not_holder" }), { status: 409 });
    delete guard.lease[body.key];
    return new Response(JSON.stringify({ released: true }), { status: 200 });
  }
  return new Response("nf", { status: 404 });
};
globalThis.fetch = async () => new Response("nf", { status: 404 });

const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", LOADER: { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) },
  DEPLOY_GUARD: { fetch: guardFetch }, AI: { run: async () => ({ response: "" }) } };
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async () => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 1, budgetMs: 2000, plan: false, intake: false }) }), env)).json();
const db = env.AUDIT_DB._db;
const now = new Date().toISOString();
const KEY = "file:fxpub/fxpub/worker.js", TOKEN = "pubtok";

const first = await tick();
ok(first && first.ok === true, "a tick creates the schema and runs", first && first.error);

db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, branch, pr_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
  .run("ct_pub_1", "qnfo-workers", "fxpub/fxpub/worker.js", "g", "published", "done", 1,
    JSON.stringify({ claim: { key: KEY, token: TOKEN, expires_at: new Date(Date.now() + 3600e3).toISOString(), released_at: null } }),
    "codex/x", "https://github.com/QNFO/qnfo-workers/pull/1", now, now);
guard.lease[KEY] = { token: TOKEN, owner: "qnfo-code-orchestrator:ct_pub_1" };

const res = await tick();
ok(guard.released.some((x) => x === KEY + ":" + TOKEN), "the sweep releases a published task's claim", guard.released);
const claim = JSON.parse(db.prepare("SELECT ctx FROM code_tasks WHERE id = ?").get("ct_pub_1").ctx).claim;
ok(!!claim.released_at, "the published row is stamped released", claim);
ok(res.claims && res.claims.released >= 1 && !res.claims.error, "the sweep reports the release with no error", res.claims);

guard.acquires.length = 0;
await tick();
ok(guard.acquires.indexOf(KEY) < 0, "the released claim is not re-taken by the next sweep", guard.acquires);

// the file stays busy for dedupe: CODE_TASK_DONE must NOT have gained 'published'
const post = await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr,
  body: JSON.stringify({ repo: "qnfo-workers", path: "fxpub/fxpub/worker.js", goal: "second change on the same file" }) }), env);
const body = await post.json();
ok(post.status !== 200 || body.status === "duplicate" || body.refused,
   "a second task on a file with a published PR is still refused (CODE-DISPATCH-DEDUPE-1 untouched)", { status: post.status, body });

console.log(pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;

// CTX-JSON-GUARD-1 (qnfo-code-orchestrator 0.18.18, 2026-10-18). Failure mode: one malformed row disables a fleet sweep.
// ct_plain_language_1 carried 11112 chars of prose in the JSON ctx column; every claimsSweep query calls
// json_extract(ctx, ...), so the statement threw and the finished-task release never ran. ct_im2936 stayed 'superseded'
// and kept file:qnfo-fleet-dashboard/worker.js from 20:18Z, deferring four tasks on every tick until the row was
// repaired. This suite proves the sweep now releases a finished task's claim even when a poison row sits in the table.
// Run: node qnfo-code-orchestrator/claims-sweep-resilient.test.mjs
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
    CREATE UNIQUE INDEX idx_agent_issues_open_title ON agent_issues(title) WHERE status = 'open';
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  return { prepare: wrap, _db: db };
}

const guard = { released: [], lease: {}, tokens: 0 };
const guardFetch = async (u, init) => {
  const url = String(u), body = JSON.parse(init.body);
  const exp = (s) => new Date(Date.now() + s * 1000).toISOString();
  if (url.endsWith("/acquire")) {
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
const tick = async (o) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify(Object.assign({ maxSteps: 1, budgetMs: 3000, plan: false, intake: false }, o || {})) }), env)).json();
const db = env.AUDIT_DB._db;

// 1. first tick creates the schema
const first = await tick({});
ok(first && first.ok === true, "a first tick runs (the schema exists after it)", first && first.error);

// 2. seed: a finished task holding a claim, and a poison row whose ctx is prose.
// The write guard shipped later (CTX-JSON-1, 0.18.19) refuses exactly this row, so the two triggers are dropped first:
// the row being simulated is one written BEFORE that guard existed, which is the case the reader must survive.
db.exec("DROP TRIGGER IF EXISTS code_tasks_ctx_json_ins; DROP TRIGGER IF EXISTS code_tasks_ctx_json_upd;");
const HOLD = "ct_hold_superseded_1", POISON = "ct_poison_1";
db.prepare("UPDATE code_tasks SET ctx = ? WHERE id = ?").run(
  JSON.stringify({ claim: { key: "file:fx-res/fx/worker.js", token: "holdtok", expires_at: new Date(Date.now() + 3600e3).toISOString(), released_at: null } }), HOLD);
const seed = db.prepare("INSERT OR REPLACE INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
seed.run(HOLD, "qnfo-workers", "fx-res/fx/worker.js", "hold fixture", "superseded", "done", 0, "{}", new Date().toISOString(), new Date().toISOString());
seed.run(HOLD, "qnfo-workers", "fx-res/fx/worker.js", "hold fixture", "superseded", "done", 0,
  JSON.stringify({ claim: { key: "file:fx-res/fx/worker.js", token: "holdtok", expires_at: new Date(Date.now() + 3600e3).toISOString(), released_at: null } }),
  new Date().toISOString(), new Date().toISOString());
seed.run(POISON, "qnfo-workers", "fx-res/fx/worker.js", "poison fixture", "queued", "read", 0,
  "RED-TEAM CORRECTION (this is prose, not JSON) ... ", new Date().toISOString(), new Date().toISOString());
guard.lease["file:fx-res/fx/worker.js"] = { token: "holdtok", owner: "qnfo-code-orchestrator:" + HOLD };

// 3. the tick must survive the poison row and release the finished task
const res = await tick({});
ok(res && res.ok === true, "a tick with a prose ctx row still completes", res && (res.error || res.claims));
const row = db.prepare("SELECT ctx FROM code_tasks WHERE id = ?").get(HOLD);
const claim = JSON.parse(row.ctx || "{}").claim || {};
ok(guard.released.some((x) => x === "file:fx-res/fx/worker.js:holdtok"), "the sweep asked the guard to release the finished task", guard.released);
ok(!!claim.released_at, "the finished task's claim is stamped released", claim);
ok(res.claims && res.claims.released >= 1 && !res.claims.error, "the sweep reports a release and no error", res.claims);

console.log(pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;

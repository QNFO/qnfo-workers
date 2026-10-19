// MERGE-SCOPE-AT-READ-1 (qnfo-code-orchestrator 0.18.22, 2026-10-19, agent_issues 99951/2983/3000). The RED-DRAIN-1
// dispatch wrote code_tasks rows straight into D1 with repo "QNFO/qnfo-workers": ct_im2909 on qnfo-fleet-control/worker.js
// (CM_DENY) and ct_im2581 on scripts/remediation_consumer.py (CM_SCRIPT_DENY). Neither passed enqueue(), and mergeScopeWhy
// compared the raw slug, so both spent 4-5 model attempts before the merge runner refused them. This suite proves such a row
// now ends needs_human at the read step with no model call, and an in-scope owner-qualified row still proceeds to read.
// Run: node qnfo-code-orchestrator/merge-scope-at-read.test.mjs
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
const lease = {}; let tokens = 0;
const guardFetch = async (u, init) => {
  const url = String(u), body = JSON.parse(init.body);
  if (url.endsWith("/acquire")) {
    const l = lease[body.key];
    if (l && l.token !== body.token) return new Response(JSON.stringify({ key: body.key, acquired: false, holder: l.owner }), { status: 409 });
    const token = body.token || "tok" + (++tokens); lease[body.key] = { token, owner: body.owner };
    return new Response(JSON.stringify({ acquired: true, key: body.key, token, expires_at: new Date(Date.now() + body.ttl_sec * 1000).toISOString() }), { status: 200 });
  }
  if (url.endsWith("/release")) { delete lease[body.key]; return new Response(JSON.stringify({ released: true }), { status: 200 }); }
  return new Response("nf", { status: 404 });
};
globalThis.fetch = async () => new Response("nf", { status: 404 });
let aiCalls = 0;
const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", LOADER: { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) },
  DEPLOY_GUARD: { fetch: guardFetch }, AI: { run: async () => { aiCalls++; return { response: "" }; } } };
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async () => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 4, budgetMs: 4000, plan: false, intake: false }) }), env)).json();
const db = env.AUDIT_DB._db;

const first = await tick();
ok(first && first.ok === true, "a tick creates the schema and runs", first);
const now = new Date().toISOString();
const add = (id, p) => db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
  .run(id, "QNFO/qnfo-workers", p, "g", "queued", "read", 0, now, now);
add("ct_scope_cp", "qnfo-observability/worker.js");
add("ct_scope_sc", "scripts/remediation_consumer.py");
add("ct_scope_ok", "fxok/worker.js");
// agent_issues 100092 (LOOP-BREAKER-1): ct_im100009, ct_im100020, ct_im100072 and ct_im100091 (qnfo-fleet-control), ct_im100073 (qnfo-ops) and ct_im100062 and ct_im100075
// (qnfo-code-orchestrator) were refused at the read step on 2026-10-19 before 0.22.0; with CODE-LOOP-CONTROL-PLANE-1 the four workers the owner named
// are in the loop's scope there too, an owner-qualified slug included, so the read step reaches the file read (a 404 here) and never names the scope rule.
const LOOP_WORKERS = ["qnfo-fleet-control", "qnfo-ops", "qnfo-deploy-guard", "qnfo-code-orchestrator"];
for (const w of LOOP_WORKERS) add("ct_scope_loop_" + w, w + "/worker.js");
await tick(); await tick(); await tick();
const row = (id) => db.prepare("SELECT status, step, attempts, last_error FROM code_tasks WHERE id = ?").get(id);
for (const id of ["ct_scope_cp", "ct_scope_sc"]) {
  const r = row(id);
  ok(r.status === "needs_human", id + " ends needs_human", r);
  ok(String(r.last_error || "").includes("MERGE-SCOPE-AT-READ-1"), id + " names the scope rule", r);
}
for (const w of LOOP_WORKERS) {
  const r = row("ct_scope_loop_" + w);
  ok(r && !String(r.last_error || "").includes("MERGE-SCOPE-AT-READ-1") && !String(r.last_error || "").includes("CM_DENY"), w + "/worker.js is not refused by the read-step scope guard (CODE-LOOP-CONTROL-PLANE-1)", r);
}
const okr = row("ct_scope_ok");
ok(!String(okr.last_error || "").includes("MERGE-SCOPE-AT-READ-1"), "an in-scope owner-qualified row is not refused by scope", okr);
ok(aiCalls === 0, "no model call was spent on the out-of-scope rows", aiCalls);
ok(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'code-task.scope-refused'").get().n >= 2, "each refusal is audited");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

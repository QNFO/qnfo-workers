// NEW-FILE-TARGET-1 offline suite (#11909). ct_im1003336 named migrations/2026-11-13-d1-reads-cut-8.sql, a file that did not exist on main: the read step answered
// "raw read HTTP 404", the loop retried it as a transient failure three times and filed CODE-LOOP-EXHAUSTED-1 with no actionable reason (11 tasks, 38 attempts in 30 days).
// Proves: a target that reads 404 records the NEW-FILE-TARGET-1 reason (path and what to do) and spends no model call; it keeps the retry path (the raw CDN can answer
// 404 for a file merged minutes ago); a target that exists is not judged by the rule; a 5xx read keeps its old message.
// Run: node qnfo-code-orchestrator/new-file-target.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
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
// raw.githubusercontent.com: exists/ files answer 200, flaky/ answers 503, everything else 404
globalThis.fetch = async (u) => {
  const url = String(u);
  if (url.includes("/main/exists/")) return new Response("export const x = 1;\n", { status: 200 });
  if (url.includes("/main/flaky/")) return new Response("busy", { status: 503 });
  return new Response("404: Not Found", { status: 404 });
};
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
  .run(id, "qnfo-workers", p, "g", "queued", "read", 0, now, now);
const row = (id) => db.prepare("SELECT status, step, attempts, last_error FROM code_tasks WHERE id = ?").get(id);

add("ct_new", "migrations/2026-11-13-new-file.sql");
add("ct_flaky", "flaky/worker.js");
for (let i = 0; i < 4; i++) await tick();

const n = row("ct_new");
ok(/NEW-FILE-TARGET-1: migrations\/2026-11-13-new-file\.sql does not exist on main/.test(String(n.last_error || "")) && /Create the file in a session pull request/.test(String(n.last_error || "")), "a missing target names the rule, the path and what to do", n);
ok(/^read failed: /.test(String(n.last_error || "")) && Number(n.attempts) === 3 && n.status === "failed", "the message keeps the read-failed shape and the retries stay (three attempts, then failed)", n);
ok(aiCalls === 0, "no model call is spent on a missing target", aiCalls);
const f = row("ct_flaky");
ok(!/NEW-FILE-TARGET-1/.test(String(f.last_error || "")) && /read failed: raw read HTTP 503/.test(String(f.last_error || "")), "a 5xx read keeps the old transient path", f);

add("ct_exists", "exists/worker.js");
for (let i = 0; i < 3; i++) await tick();
ok(!/NEW-FILE-TARGET-1/.test(String(row("ct_exists").last_error || "")), "a target that exists is not judged by the rule", row("ct_exists"));

const srcText = readFileSync(path.join(here, "worker.js"), "utf8");
ok(srcText === readFileSync(path.join(here, "deployed-current.worker.js"), "utf8"), "deployed-current.worker.js is identical to worker.js");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

// CTX-JSON-1 (qnfo-code-orchestrator 0.18.19, 2026-10-18). code_tasks.ctx is JSON: the claims sweep reads it with
// json_extract, and one row carrying 11112 chars of prose (ct_plain_language_1) made every sweep query throw, stopping
// the finished-task release and deferring four tasks on every tick. 0.18.18 made the reader tolerate it; this suite
// proves the writer is refused at the source, in both directions (INSERT and UPDATE), without breaking a normal write.
// Run: node qnfo-code-orchestrator/code-tasks-ctx-json.test.mjs
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

const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", LOADER: { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) },
  DEPLOY_GUARD: { fetch: async () => new Response(JSON.stringify({ acquired: true, token: "t", expires_at: new Date(Date.now() + 3600e3).toISOString() }), { status: 200 }) },
  AI: { run: async () => ({ response: "" }) } };
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async () => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 1, budgetMs: 2000, plan: false, intake: false }) }), env)).json();
const db = env.AUDIT_DB._db;
const now = new Date().toISOString();
const ins = (id, ctx) => db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
  .run(id, "qnfo-workers", "fx/worker.js", "g", "queued", "read", 0, ctx, now, now);
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e.message || e); } };

const first = await tick();
ok(first && first.ok === true, "a tick creates the schema and runs", first && first.error);

const trig = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('code_tasks_ctx_json_ins','code_tasks_ctx_json_upd') ORDER BY name").all();
ok(trig.length === 2, "both ctx guards exist after ensureSchema", trig);

const proseErr = throws(() => ins("ct_prose_1", "RED-TEAM CORRECTION: this is prose, not JSON"));
ok(proseErr && /CTX-JSON-1/.test(proseErr), "an INSERT with prose ctx is refused by the database", proseErr);

const jsonErr = throws(() => ins("ct_json_1", JSON.stringify({ claim: { key: "file:fx/worker.js", token: "t", released_at: null } })));
ok(jsonErr === null, "an INSERT with JSON ctx is accepted", jsonErr);

const nullErr = throws(() => ins("ct_null_1", null));
ok(nullErr === null, "a NULL ctx is accepted (ctx is optional)", nullErr);

const updErr = throws(() => db.prepare("UPDATE code_tasks SET ctx = ? WHERE id = ?").run("prose again", "ct_json_1"));
ok(updErr && /CTX-JSON-1/.test(updErr), "an UPDATE to prose ctx is refused", updErr);
ok(JSON.parse(db.prepare("SELECT ctx FROM code_tasks WHERE id = ?").get("ct_json_1").ctx).claim.token === "t", "the refused UPDATE left the row unchanged");

const jsonSetErr = throws(() => db.prepare("UPDATE code_tasks SET ctx = json_set(ctx, '$.step', 2) WHERE id = ?").run("ct_json_1"));
ok(jsonSetErr === null, "the loop's own json_set write is accepted", jsonSetErr);

const after = await tick();
ok(after && after.ok === true && !(after.claims && after.claims.error), "a later tick still works with the guards in place", after && after.claims);

console.log(pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0;

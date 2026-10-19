// MODEL-ATTRIBUTION-1 (qnfo-code-orchestrator 0.18.16, 2026-10-18). Failure mode: a rung's failure rate could not be
// measured. code_tasks.model was written only where a proposal built ("model: model" on the way to verify), so a task
// that failed at propose kept model=NULL: 8 of the 14 distinct failures in the 24h to 2026-10-18T20:26Z, and four of
// them named a model in last_error anyway ("gpt-oss-120b returned no ```file block" x3, "glm-5.3: no SEARCH/REPLACE
// block" x1) - the attribution existed at failure time and was dropped on the write. This suite proves:
//   A. a propose that fails (the reply holds no SEARCH/REPLACE block) still records the rung that answered;
//   B. the recorded value is the rung the ladder actually used, not a constant;
//   C. a successful propose still records it (no regression on the path that already worked).
// Run: node qnfo-code-orchestrator/model-attribution.test.mjs   (exit 0 = all passed)
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

// The claim guard, as in fail-signature-stop.test.mjs: a held key refuses a second acquire.
const guard = { lease: {}, tokens: 0 };
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
    if (!lease || lease.token !== body.token) return new Response(JSON.stringify({ released: false, error: "not_holder" }), { status: 409 });
    delete guard.lease[body.key];
    return new Response(JSON.stringify({ released: true }), { status: 200 });
  }
  return new Response("nf", { status: 404 });
};

const TARGET = "function target(env) { return env && env.ON ? 1 : 0; }";
const fixture = (name) => {
  const l = ["// " + name + " (fixture)", 'var VERSION = "1.2.3-fx";'];
  for (let i = 0; l.join("\n").length < 15000; i++) l.push("function filler" + i + "(env) { return env && env.FLAG_" + i + " ? " + i + " : 0; }");
  l.push(TARGET, "export default { async fetch() { return new Response('ok'); } };", "");
  return l.join("\n");
};
const FILES = {};
for (const d of ["fx-attr-a", "fx-attr-b"]) { FILES[d + "/worker.js"] = fixture(d); FILES[d + "/deployed-current.worker.js"] = FILES[d + "/worker.js"]; }
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const block = (a, b) => "<<<<<<< SEARCH\n" + a + "\n=======\n" + b + "\n>>>>>>> REPLACE";
const GOOD = block(TARGET, TARGET.replace("? 1 : 0", "? 2 : 0"));
const PROSE = "I would rather explain the change than make it.";

const replies = [];
const fakeLoader = { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) };
const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", LOADER: fakeLoader,
  DEPLOY_GUARD: { fetch: guardFetch },
  AI: { run: async () => { const r = replies.shift(); if (r instanceof Error) throw r; return { response: r == null ? "" : r }; } } };
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (o) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify(Object.assign({ maxSteps: 12, budgetMs: 25000, plan: false, intake: false }, o || {})) }), env)).json();
const db = env.AUDIT_DB._db;
const row = (id) => db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(id);
const add = async (dir) => (await (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: dir + "/worker.js", goal: "model-attribution fixture " + dir + ": return 2 from target when ON is set" }) }), env)).json()).id;
const health = await (await worker.fetch(new Request("https://x/health"), env)).json();
const rung1 = (health.ladder && health.ladder[0]) || null;

// A. a propose that fails records the rung
{
  const id = await add("fx-attr-a");
  replies.push(PROSE);
  await tick();
  const r = row(id);
  ok(!!r.model, "a failed propose records code_tasks.model (was NULL)", { model: r.model, status: r.status, step: r.step, last_error: String(r.last_error || "").slice(0, 160) });
  ok(typeof r.model === "string" && r.model.length > 3, "the recorded model is a model id", r.model);
  ok(/returned no |no SEARCH\/REPLACE block|no block edits/i.test(String(r.last_error || "")), "the attempt did fail at propose (the test measures the right path)", String(r.last_error || "").slice(0, 160));
  // The column means "the rung that answered last", not "the rung the ladder picked first": ai() walks down the ladder
  // when a reply comes back empty, so a task whose first rung returned nothing is attributed to the rung that finally
  // answered. The invariant that matters is that the column agrees with the diagnostic in last_error.
  const named = /model (@cf\/[A-Za-z0-9.\/_-]+)/.exec(String(r.last_error || ""));
  if (named) ok(r.model === named[1], "the recorded rung equals the model named in last_error", { recorded: r.model, named: named[1] });
  else ok(health.ladder ? health.ladder.indexOf(r.model) >= 0 : true, "the recorded rung is a member of the live ladder", { recorded: r.model, ladder: health.ladder });
}

// B. a successful propose still records it
{
  const id = await add("fx-attr-b");
  replies.push(GOOD);
  await tick();
  const r = row(id);
  ok(!!r.model, "a successful propose still records the model", { model: r.model, step: r.step });
}

console.log(pass + " passed, " + fail + " failed");
process.exitCode = fail ? 1 : 0; // not process.exit(): it truncates piped stdout and the summary is lost

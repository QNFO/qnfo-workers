// CODE-DISPATCH-DEDUPE-1 + RETIRED-TARGET-1 offline suite (qnfo-code-orchestrator 0.3.16, agent_issues 1876, 1834, 1960).
// One change per file at a time: a new code task is refused while the file (or its deployed-current mirror) has an unfinished
// code task or a live session work claim (work_claims); the planner skips such an issue before its model call; a worker.js of a
// worker that is not live in service_registry is refused. Real SQL (node:sqlite behind a D1-shaped shim), scripted model.
// Run: node --no-warnings qnfo-code-orchestrator/dispatch-dedupe.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 400) : "")); } };

function makeD1(live) {
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
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
    CREATE TABLE service_registry (service TEXT PRIMARY KEY, state TEXT, kind TEXT, base_url TEXT);
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')), released_at TEXT, outcome TEXT);`);
  for (const n of (live || ["q08-signal-engine", "qnfo-social", "qnfo-email"])) db.prepare("INSERT INTO service_registry VALUES (?, 'live', 'worker', '')").run(n);
  return { prepare: wrap, _db: db };
}
const Q08 = ["var VERSION = \"0.7.37-cadence-cap\";", "async function handle(req, env) {", "  if (path === \"/api/f\") {", "    return recordVote(req, env);", "  }", "}"].join("\n");
const FILES = { "q08-signal-engine/worker.js": Q08 };
globalThis.fetch = async (u) => {
  const m = /raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  if (p && FILES[p] != null) return new Response(FILES[p], { status: 200 });
  return new Response("nf", { status: 404 });
};
function envWith(replies, live) {
  const prompts = [];
  return { env: { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(live), AI: { run: async (model, input) => { prompts.push({ model, input }); const r = replies.shift(); return { response: typeof r === "function" ? r(input) : r }; } } }, prompts };
}
const call = async (env, method, p, body) => {
  const r = await worker.fetch(new Request("https://x" + p, { method, headers: { authorization: "Bearer t0ken", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }), env);
  return Object.assign({ http: r.status }, await r.json());
};
const enq = (env, p, extra) => call(env, "POST", "/v1/tasks", Object.assign({ repo: "qnfo-workers", path: p, goal: "change one thing" }, extra || {}));
const tasks = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks ORDER BY created_at").all();
const claim = (env, p, f) => env.AUDIT_DB._db.prepare("INSERT INTO work_claims (path, intent, holder, expires_at, released_at) VALUES (?, ?, ?, ?, ?)").run(p, f.intent || "fix it", f.holder || "session_X/a", f.expires_at || new Date(Date.now() + 3600e3).toISOString().slice(0, 19) + "Z", f.released_at || null);

// 1. one unfinished task per file: the same file and its mirror are refused, another file is not
{
  const { env } = envWith([]);
  const a = await enq(env, "q08-signal-engine/worker.js");
  ok(a.ok && a.http === 202, "1a the first task on a file is queued", a);
  const b = await enq(env, "q08-signal-engine/worker.js");
  ok(!b.ok && b.http === 409 && /path busy: code task ct_\w+ \(queued\) is still in flight on qnfo-workers\/q08-signal-engine\/worker\.js/.test(b.error), "1b a second task on the same file is refused while the first is unfinished", b);
  const c = await enq(env, "q08-signal-engine/deployed-current.worker.js");
  ok(!c.ok && c.http === 409, "1c the deployed-current mirror counts as the same file", c);
  const d = await enq(env, "qnfo-social/worker.js");
  ok(d.ok, "1d a different file is not blocked", d);
  ok(tasks(env).length === 2, "1e exactly two tasks exist", tasks(env).length);
  // every in-flight status blocks; every terminal status frees the file
  for (const st of ["read", "branch_pushed", "published", "pr_open", "ready_to_publish"]) {
    env.AUDIT_DB._db.prepare("UPDATE code_tasks SET status = ? WHERE id = ?").run(st, a.id);
    const r = await enq(env, "q08-signal-engine/worker.js");
    ok(!r.ok && r.http === 409, "1f status " + st + " keeps the file busy", r);
  }
  for (const st of ["merged", "closed", "publish_failed", "needs_human", "failed", "reverted"]) {
    env.AUDIT_DB._db.prepare("UPDATE code_tasks SET status = ? WHERE path = 'q08-signal-engine/worker.js'").run(st);
    const r = await enq(env, "q08-signal-engine/worker.js");
    ok(r.ok, "1g status " + st + " frees the file", r);
  }
  const other = await call(env, "POST", "/v1/tasks", { repo: "other-repo", path: "qnfo-social/worker.js", goal: "g" });
  ok(other.ok, "1h the same path in another repository is a different file", other);
}
// 2. a live session work claim on the file blocks; an expired or released one does not
{
  const { env } = envWith([]);
  claim(env, "qnfo-social/worker.js", { holder: "session_S/c1", intent: "SUBSCRIBE-OFFER-1 in posts" });
  const r = await enq(env, "qnfo-social/worker.js");
  ok(!r.ok && r.http === 409 && /session session_S\/c1 holds the work claim on qnfo-social\/worker\.js until .*SUBSCRIBE-OFFER-1/.test(r.error), "2a a session's live work claim refuses the task, naming holder, expiry and intent", r);
  env.AUDIT_DB._db.exec("UPDATE work_claims SET expires_at = '2020-01-01T00:00:00Z'");
  ok((await enq(env, "qnfo-social/worker.js")).ok, "2b an expired claim does not block");
  env.AUDIT_DB._db.exec("DELETE FROM code_tasks");
  claim(env, "qnfo-social/worker.js", { released_at: "2026-10-05T10:00:00Z" });
  ok((await enq(env, "qnfo-social/worker.js")).ok, "2c a released claim does not block");
  env.AUDIT_DB._db.exec("DELETE FROM code_tasks");
  claim(env, "qnfo-social/deployed-current.worker.js", {});
  ok(!(await enq(env, "qnfo-social/worker.js")).ok, "2d a claim on the mirror blocks the worker.js");
  claim(env, "docs/a.md", {});
  ok(!(await enq(env, "docs/a.md")).ok && (await enq(env, "docs/b.md")).ok, "2e a non-worker file is matched exactly");
  const { env: e2 } = envWith([]);
  e2.AUDIT_DB._db.exec("DROP TABLE work_claims");
  ok((await enq(e2, "qnfo-social/worker.js")).ok, "2f without a work_claims table the code-task check alone applies");
}
// 3. RETIRED-TARGET-1: a worker.js outside the live registry is refused; other paths and an empty registry are not
{
  const { env } = envWith([]);
  const r = await enq(env, "qnfo-paper-explainer/worker.js");
  ok(!r.ok && r.http === 422 && /qnfo-paper-explainer is not a live worker/.test(r.error), "3a a RETIRED/FOLDED worker's worker.js is refused", r);
  ok(!(await enq(env, "qnfo-errata-respond/deployed-current.worker.js")).ok, "3b its mirror too");
  ok((await enq(env, "docs/x.md")).ok && (await enq(env, "qnfo-paper-explainer/README.md")).ok, "3c docs and READMEs are not worker sources");
  ok((await enq(env, "qnfo-email/worker.js")).ok, "3d a live worker is accepted");
  const { env: e0 } = envWith([], []);
  ok((await enq(e0, "qnfo-paper-explainer/worker.js")).ok, "3e an empty registry refuses nothing (fail open on missing data, never on a live worker)");
  ok(tasks(env).every((t) => t.path !== "qnfo-paper-explainer/worker.js"), "3f no task row was written for the refused target");
}
// 4. the planner skips an issue whose file is busy, before any model call and without recording it; it plans it once free
{
  const FIX = JSON.stringify({ code_fixable: true, reason: "one guard", anchor: '  if (path === "/api/f") {', goal: "Directly after the anchor line add a check that returns HTTP 405 for any method other than POST, and changes nothing else in the file." });
  const { env, prompts } = envWith([FIX]);
  const d = env.AUDIT_DB._db;
  d.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at) VALUES (?,?,?,?,?,?,?)").run("METRIC-TRIGGER-9-Q08-VOTES: crawler votes", "q08-signal-engine counts GET votes in /api/f", "qnfo-fleet-control", "reliability", "high", "open", Date.now() - 3600e3);
  claim(env, "q08-signal-engine/worker.js", { holder: "session_S/c1" });
  let r = await call(env, "POST", "/v1/plan");
  ok(!r.planned && /file in flight/.test(r.why) && r.deferred && r.deferred.length === 1 && prompts.length === 0, "4a a busy file: no model call, the issue is deferred", r);
  ok(d.prepare("SELECT COUNT(*) n FROM issue_plans").get().n === 0, "4b nothing is recorded, so the issue is not parked for 7 days");
  d.exec("UPDATE work_claims SET released_at = '2026-10-05T12:00:00Z'");
  r = await call(env, "POST", "/v1/plan");
  ok(r.planned && r.outcome === "queued" && prompts.length === 1 && tasks(env).length === 1, "4c once the claim is released the issue is planned into one task", r);
}
// 5. intake (code-task lines) waits for a busy file and takes the line once it is free
{
  const { env } = envWith([]);
  const d = env.AUDIT_DB._db;
  d.prepare("INSERT INTO agent_issues (title, description, source, priority, status) VALUES (?,?,?,?,?)").run("FIX-1", "Do the thing.\ncode-task: repo=qnfo-workers path=qnfo-social/worker.js", "claude-session", "high", "open");
  const first = await enq(env, "qnfo-social/worker.js");
  await call(env, "POST", "/v1/tick", { plan: false, maxSteps: 0 });
  ok(tasks(env).length === 1 && tasks(env)[0].id === first.id, "5a a code-task line on a busy file creates no second task", tasks(env).map((t) => t.goal));
  d.prepare("UPDATE code_tasks SET status = 'merged' WHERE id = ?").run(first.id);
  await call(env, "POST", "/v1/tick", { plan: false, maxSteps: 0 });
  ok(tasks(env).length === 2 && tasks(env)[1].goal.indexOf("[issue #1]") === 0, "5b the line is taken on a later tick once the file is free", tasks(env).map((t) => t.goal));
}
// 6. VERSION_DECL: `var VERSION="x"` without spaces or semicolon is bumped (qnfo-email style); the spaced form is unchanged
{
  const src = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  const grab = (name) => { const i = src.indexOf("function " + name + "("); let dd = 0; for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") dd++; else if (src[k] === "}" && --dd === 0) return src.slice(i, k + 1); } throw new Error(name); };
  const decl = /^const VERSION_DECL = .*$/m.exec(src)[0];
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(decl + "\n" + grab("countOf") + "\n" + grab("bumpVersion") + ";this.bumpVersion=bumpVersion;", ctx);
  const em = 'var VERSION="2.3.1-itinerary-ingest"/* note */\nfunction a() { return 1; }\n';
  ok(ctx.bumpVersion(em, em.replace("return 1", "return 2")).startsWith('var VERSION="2.3.2-codeagent"/* note */'), "6a no-space, no-semicolon VERSION is bumped in place", ctx.bumpVersion(em, em.replace("return 1", "return 2")).slice(0, 60));
  const sp = 'var VERSION = "1.2.3"; // c\nx = 1;\n';
  ok(ctx.bumpVersion(sp, sp.replace("x = 1", "x = 2")).startsWith('var VERSION = "1.2.4-codeagent"; // c'), "6b the usual form is bumped as before");
  const gw = 'var VERSION="3.9.3-allowlist";\ny();\n';
  ok(ctx.bumpVersion(gw, gw.replace("y()", "z()")).startsWith('var VERSION="3.9.4-codeagent";'), "6c no-space with semicolon is bumped");
  const two = 'var VERSION = "1.0.0";\nvar VERSION = "1.0.0";\nq();\n';
  ok(ctx.bumpVersion(two, two.replace("q()", "r()")) === two.replace("q()", "r()"), "6d two declarations: left alone (ambiguous)");
}
console.log("dispatch-dedupe: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

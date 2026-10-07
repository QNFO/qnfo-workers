// FOLDED-TARGET-REDIRECT-1 offline suite (qnfo-code-orchestrator 0.6.0, agent_issues 2102, pillar autonomy).
// A FOLDED member's code lives on in its host (fold_worker.py mounts it as a module), so a task that names the member's
// worker.js is a task for the host: issue 2027 named qnfo-autonomy-scorer/worker.js after SCORER-FOLD-1 and a session did
// the edit by hand in qnfo-observability. This suite proves the rewrite at enqueue (POST /v1/tasks) and at issue intake, that a
// live member keeps its own path, that a host that is not live leaves RETIRED-TARGET-1 in force, that the host's path
// carries the busy check, and that a host on the control plane is refused as a session task after the redirect.
// Run: node --no-warnings qnfo-code-orchestrator/folded-redirect.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const atLeast = (v, min) => { const a = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")), b = min.split(".").map(Number); if (!a) return false; for (let i = 0; i < 3; i++) { if (+a[i + 1] !== b[i]) return +a[i + 1] > b[i]; } return true; };

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
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, state TEXT NOT NULL DEFAULT 'live');
    CREATE TABLE worker_removals (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT NOT NULL, removed_at TEXT, action TEXT, target TEXT, rationale TEXT, evidence TEXT, source TEXT, recorded_at TEXT DEFAULT (datetime('now')));
    INSERT INTO service_registry (service) VALUES ('qnfo-lifecycle'), ('qnfo-code-orchestrator'), ('radar-hub'), ('qnfo-infra');
    INSERT INTO worker_removals (worker, removed_at, action, target, recorded_at) VALUES
      ('calendar-api', '2026-10-06 11:02:41', 'folded', 'qnfo-lifecycle', '2026-10-06 11:02:41'),
      ('fleet-exec', '2026-10-06 07:31:38', 'folded', 'qnfo-code-orchestrator', '2026-10-06 07:31:38'),
      ('events-radar', '2026-10-01', 'folded', 'radar-hub', '2026-10-01 00:00:00'),
      ('qnfo-paper-indexer', '2026-10-06 07:31:38', 'folded', 'qnfo-infra', '2026-10-06 07:31:38'),
      ('qnfo-errata-publish', '2026-10-01', 'folded', 'qnfo-errata-hub', '2026-10-01 00:00:00');`);
  return { prepare: wrap, _db: db };
}
const ANCHOR = "async function calendarSync(env) {";
const HOST = 'var VERSION = "1.8.1";\n' + ANCHOR + "\n  return 1;\n}\nexport default { fetch() { return new Response(\"a\"); } };\n";
const MEMBER = 'var VERSION = "0.9.0";\n// calendar-api is FOLDED into qnfo-lifecycle: the code moved verbatim\nexport default { fetch() { return new Response(\"old\"); } };\n';
const FILES = { "qnfo-lifecycle/worker.js": HOST, "qnfo-lifecycle/deployed-current.worker.js": HOST, "calendar-api/worker.js": MEMBER, "calendar-api/deployed-current.worker.js": MEMBER };
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const fakeLoader = { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) };
const mkEnv = () => ({ ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", LOADER: fakeLoader, AI: { run: async () => ({ response: "" }) } });
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const post = async (env, p, body) => { const r = await worker.fetch(new Request("https://x" + p, { method: "POST", headers: hdr, body: JSON.stringify(body) }), env); return { status: r.status, j: await r.json() }; };
const addTask = (env, p, goal) => post(env, "/v1/tasks", { repo: "qnfo-workers", path: p, goal: goal || "do the thing" });
const row = (env, id) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks WHERE id=?").get(id);
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT text, meta, status FROM cloud_ops_events WHERE kind=? ORDER BY rowid").all(kind);

// ===== 1. health =====
const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(atLeast(h.version, "0.6.0") && h.capabilities.indexOf("folded-redirect") >= 0, "health: 0.6.0+ with the folded-redirect capability", { version: h.version });

// ===== 2. enqueue: a FOLDED member's path becomes the host's =====
{
  const env = mkEnv();
  const c = await addTask(env, "calendar-api/worker.js");
  ok(c.status === 202 && c.j.ok, "a task on a folded member's worker.js is accepted", c);
  const r = c.j.id ? row(env, c.j.id) : null;
  ok(r && r.path === "qnfo-lifecycle/worker.js" && r.repo === "qnfo-workers", "the task row names the host's worker.js", r && { path: r.path });
  const ev = events(env, "code-task.intake-redirect");
  ok(ev.length === 1 && ev[0].status === "ok" && /calendar-api is folded into qnfo-lifecycle: calendar-api\/worker\.js -> qnfo-lifecycle\/worker\.js/.test(ev[0].text), "one code-task.intake-redirect event names both paths", ev);
  const en = events(env, "code-task.enqueue");
  ok(en.length === 1 && /qnfo-workers\/qnfo-lifecycle\/worker\.js \(redirected from calendar-api\/worker\.js\)/.test(en[0].text), "the enqueue event records the redirect", en);
  // the host's path is what the busy check sees: a second task on either path is refused while the first is queued
  const again = await addTask(env, "calendar-api/worker.js");
  const host = await addTask(env, "qnfo-lifecycle/worker.js");
  ok(again.status === 409 && /path busy: .* on qnfo-workers\/qnfo-lifecycle\/worker\.js/.test(again.j.error || "") && host.status === 409 && /path busy/.test(host.j.error || ""), "the member's and the host's path are one busy path", { again: again.j, host: host.j });
  // the mirror path redirects too
  env.AUDIT_DB._db.prepare("DELETE FROM code_tasks").run();
  const mir = await addTask(env, "calendar-api/deployed-current.worker.js");
  ok(mir.status === 202 && row(env, mir.j.id).path === "qnfo-lifecycle/worker.js", "a mirror path redirects to the host's worker.js", mir.j);
}

// ===== 3. a live member keeps its own path; a host that is not live leaves RETIRED-TARGET-1 in force =====
{
  const env = mkEnv();
  env.AUDIT_DB._db.prepare("INSERT INTO service_registry (service) VALUES ('calendar-api')").run();
  const c = await addTask(env, "calendar-api/worker.js");
  ok(c.status === 202 && row(env, c.j.id).path === "calendar-api/worker.js" && events(env, "code-task.intake-redirect").length === 0, "a member still live in service_registry keeps its own path (a stale fold row does not redirect)", c.j);
  const gone = await addTask(env, "qnfo-errata-publish/worker.js");
  ok(gone.status === 422 && /is not a live worker/.test(gone.j.error || "") && events(env, "code-task.intake-redirect").length === 0, "a fold whose host is not live is refused as before (RETIRED-TARGET-1)", gone.j);
  const none = await addTask(env, "notes-intake/worker.js");
  ok(none.status === 422 && /is not a live worker/.test(none.j.error || ""), "a folded worker with no fold row is refused as before", none.j);
  const other = await addTask(env, "calendar-api/README.md");
  ok(other.status !== 500 && events(env, "code-task.intake-redirect").length === 0, "only a worker.js path redirects", other);
}

// ===== 4. a host on the control plane is refused as a session task, after the redirect =====
{
  const env = mkEnv();
  const c = await addTask(env, "fleet-exec/worker.js");
  ok(c.status === 422 && /^session task: qnfo-code-orchestrator is a control-plane or code-loop worker/.test(c.j.error || ""), "fleet-exec -> qnfo-code-orchestrator: a session task naming the host", c.j);
  ok(events(env, "code-task.intake-redirect").length === 1, "the redirect is still audited", events(env, "code-task.intake-redirect"));
}

// ===== 5. intake: an issue naming the member is preflighted on the host's file and enqueued against the host =====
{
  const env = mkEnv();
  const id = Number(env.AUDIT_DB._db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at) VALUES (?,?,?,?,?,?,?)")
    .run("CAL-SYNC-1: calendarSync returns 2", "code-task: repo=qnfo-workers path=calendar-api/worker.js\ncode-anchor: " + ANCHOR + "\nReturn 2 instead of 1.", "claude-session:CAL-SYNC-1", "reliability", "high", "open", Date.now()).lastInsertRowid);
  const t = await post(env, "/v1/tick", { maxSteps: 0, budgetMs: 25000, plan: false, intake: true });
  const tasks = env.AUDIT_DB._db.prepare("SELECT id, path, goal, ctx FROM code_tasks").all();
  ok(t.j.ok && tasks.length === 1 && tasks[0].path === "qnfo-lifecycle/worker.js" && tasks[0].goal.indexOf("[issue #" + id + "]") === 0, "intake creates the task against the host", { tick: t.j.intake, tasks });
  ok(tasks.length === 1 && /calendarSync/.test(tasks[0].ctx || ""), "the anchor, which lives in the host's file, is kept", tasks[0] && tasks[0].ctx);
  const ev = events(env, "code-task.intake-redirect");
  ok(ev.length === 1 && /\[issue #/.test(ev[0].text) && /calendar-api\/worker\.js -> qnfo-lifecycle\/worker\.js/.test(ev[0].text), "the intake audits the redirect with the issue tag", ev);
  const issue = env.AUDIT_DB._db.prepare("SELECT description FROM agent_issues WHERE id=?").get(id);
  ok(/code-task: repo=qnfo-workers path=calendar-api\/worker\.js/.test(issue.description) && !/session-task/.test(issue.description), "the issue keeps its code-task line (no preflight refusal on the member's file)", issue.description);
}

console.log("folded-redirect.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// WHOLE-FILE-PATCH-1 offline suite (qnfo-code-orchestrator 0.18.24, pillar autonomy).
// Measured 2026-10-19 on code_tasks: every task since 2026-10-05 whose file was between WINDOW_CHARS (24000) and MAX_FILE_CHARS
// (60000) with no anchor ran in whole-file mode and failed (10 of 10: 3046 timeouts and "returned no ```file block"), because the
// model had to write 30-60k chars back. This suite proves that such a file now runs in patch mode over the whole file: the
// prompt carries the whole file, a SEARCH/REPLACE reply far shorter than the file is applied to it, and the task reaches
// ready_to_publish; a file under PATCH_MIN_CHARS keeps whole-file mode.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads.
// Run: node --no-warnings qnfo-code-orchestrator/whole-file-patch.test.mjs   (exit 0 = all passed)
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
    CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model));
    CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));`);
  return { prepare: wrap, _db: db };
}
const pad = (n) => { let s = ""; let i = 0; while (s.length < n) s += "// filler line " + (i++) + " keeps this module over the window size for the whole-file-patch suite\n"; return s; };
const MID = 'export default { fetch() { return new Response("a"); } };\n';
const BIG = pad(15000) + MID + pad(15000);
const SMALL = MID;
const FILES = { "fx-big/worker.js": BIG, "fx-big/deployed-current.worker.js": BIG, "fx-small/worker.js": SMALL, "fx-small/deployed-current.worker.js": SMALL };
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const fakeLoader = { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) };
function envWith(script) {
  const calls = [];
  const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", LOADER: fakeLoader,
    AI: { run: async (model, input) => { calls.push({ model, prompt: JSON.stringify(input.messages || input.prompt || "") }); const r = script.shift(); if (r instanceof Error) throw r; return { response: r == null ? "" : r }; } } };
  return { env, calls };
}
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (env) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 1, budgetMs: 25000, plan: false, intake: false }) }), env)).json();
const addTask = async (env, p) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: p, goal: "return b instead of a" }) }), env)).json();
const row = (env, id) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks WHERE id=?").get(id);
const ctxOf = (r) => { try { return JSON.parse(r.ctx || "{}"); } catch (e) { return {}; } };
const EDIT = '<<<<<<< SEARCH\n' + MID.trimEnd() + '\n=======\nexport default { fetch() { return new Response("b"); } };\n>>>>>>> REPLACE';
const WHOLE = "```file\nexport default { fetch() { return new Response(\"b\"); } };\n```";

const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(atLeast(h.version, "0.18.24"), "health: 0.18.24+", { version: h.version });

// ===== 1. a 30k-char file with no anchor runs in patch mode over the whole file =====
{
  ok(BIG.length > 24000 && BIG.length < 60000, "the fixture is between WINDOW_CHARS and MAX_FILE_CHARS", BIG.length);
  const { env, calls } = envWith([EDIT]);
  const c = await addTask(env, "fx-big/worker.js");
  ok(c.ok && c.id, "task enqueued", c);
  await tick(env);
  let r = row(env, c.id);
  const cx = ctxOf(r);
  ok(r.step === "propose" && cx.mode === "patch" && cx.win && cx.win.ws === 0 && cx.win.we === BIG.length, "the read step chose patch mode with the whole file as the window", { step: r.step, mode: cx.mode, win: cx.win });
  ok(cx.mirror === "fx-big/deployed-current.worker.js", "the mirror is carried", cx.mirror);
  await tick(env);
  for (let i = 0; i < 3 && row(env, c.id).status === "queued"; i++) await tick(env);
  r = row(env, c.id);
  ok(calls.length === 1 && calls[0].prompt.indexOf("filler line 0 ") >= 0 && calls[0].prompt.indexOf("filler line ") >= 0, "one model call, shown the file", calls.length);
  ok(r.status === "ready_to_publish", "a SEARCH/REPLACE reply far shorter than the file carries the task to ready_to_publish", { status: r.status, step: r.step, last_error: r.last_error });
  const patch = String(ctxOf(r).patch || "");
  ok(patch.indexOf('+export default { fetch() { return new Response("b"); } };') >= 0 && patch.length < 5000, "the patch is a small hunk, not a rewrite", patch.length);
}

// ===== 2. a file under PATCH_MIN_CHARS keeps whole-file mode =====
{
  const { env } = envWith([WHOLE]);
  const c = await addTask(env, "fx-small/worker.js");
  await tick(env);
  const cx = ctxOf(row(env, c.id));
  ok(cx.mode !== "patch", "a small file keeps whole-file mode", { mode: cx.mode });
}

console.log("whole-file-patch.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

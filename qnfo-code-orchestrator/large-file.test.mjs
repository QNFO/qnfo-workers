// LARGE-FILE-WINDOW-1 offline suite (qnfo-code-orchestrator 0.4.0, agent_issues 2073, transformation lever T1.22, pillar autonomy).
// Before 0.4.0 a file over MAX_PATCH_FILE_CHARS (900,000 chars, the D1 row bound for base + ctx) ended needs_human as "too large
// for the loop": ct on qnfo-research-exec/worker.js (1.03M chars, issue 2052) on 2026-10-06. The loop now keeps only the anchor
// window in the task row and re-reads main at every later step. This suite proves, on a 1.2M-char fixture:
//   A. the task reads, proposes, verifies and reaches ready_to_publish; ctx holds the window and never the base; the patch is a
//      small hunk that carries the change, the VERSION bump and the mirror, and `git apply --check` accepts it against the file;
//   B. lines added above the window on main between read and propose: the window is found again (ctx.moved) and the patch
//      applies to the changed file, not to the one that was read;
//   C. the anchor line removed from main between read and propose: the task re-reads from the anchor (code-task.reread) and
//      then ends needs_human with "anchor occurs 0 times";
//   D. a large file without an anchor ends needs_human with the LARGE-FILE-WINDOW-1 reason, with no model call;
//   E. a small file still stores its base (the pre-0.4.0 path is unchanged);
//   F. /health names the capability.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads, one tick step per call.
// Run: node --no-warnings qnfo-code-orchestrator/large-file.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

// ---- the fixture: a worker of 1.2M chars; the anchor (an audit line) sits after the filler ----
const AUDIT_LINE = `  await audit(env, "ready", task.id + " ready_to_publish on " + task.branch, "ok");`;
const FILLER = Array.from({ length: 40000 }, (_, i) => "function filler" + i + "() { return " + i + "; }").join("\n");
const BIG = [
  "// fixture worker (test data)",
  'var VERSION = "1.2.3-fixture";',
  'const WORKER = "fx";',
  FILLER,
  "async function audit(env, kind, text, status) { return env.AUDIT_DB.prepare(\"INSERT INTO cloud_ops_events (kind, text, status) VALUES (?,?,?)\").bind(kind, text, status).run(); }",
  "async function publish(env, task) {",
  AUDIT_LINE,
  "  return { ok: true };",
  "}",
  "export default { async fetch() { return new Response('ok'); } };",
  "",
].join("\n");
const SMALL = BIG.replace(FILLER + "\n", "");
ok(BIG.length > 1100000 && SMALL.length < 12000, "fixture: the large file is over 1.1M chars, the small one under 12k", { big: BIG.length, small: SMALL.length });
const FILES = {};
const serve = (text) => { FILES["fx-worker/worker.js"] = text; FILES["fx-worker/deployed-current.worker.js"] = text; };
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const fakeLoader = { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) };
function envWith(replies) {
  const calls = [];
  const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", LOADER: fakeLoader,
    AI: { run: async (model, input) => { calls.push({ model, prompt: input.messages[1].content }); const r = replies.shift(); return { response: r == null ? "" : r }; } } };
  return { env, calls };
}
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const step = async (env) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 1, budgetMs: 25000, plan: false, intake: false, claims: false }) }), env)).json();
const addTask = async (env, goal, anchor) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-worker/worker.js", goal, anchor }) }), env)).json();
const row = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks").get();
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT * FROM cloud_ops_events WHERE kind = ?").all(kind);
const block = (a, b) => "<<<<<<< SEARCH\n" + a + "\n=======\n" + b + "\n>>>>>>> REPLACE";
const GOAL = "At ready_to_publish, also push the branch through the GitHub Contents API with the fleet token, then set status branch_pushed.";
const REAL = [
  `  const r = await fetch("https://api.github.com/repos/QNFO/qnfo-workers/contents/" + task.path, { method: "PUT", headers: { authorization: "Bearer " + env.GITHUB_TOKEN } });`,
  `  await audit(env, "ready", task.id + (r.ok ? " branch_pushed on " : " push failed on ") + task.branch, r.ok ? "ok" : "error");`,
].join("\n");
// `git apply --check` of the parked patch against the file as it is on main at publish time (code-task-publish does the same).
function applies(fileText, patch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lfw-"));
  fs.mkdirSync(path.join(dir, "fx-worker"));
  fs.writeFileSync(path.join(dir, "fx-worker", "worker.js"), fileText);
  fs.writeFileSync(path.join(dir, "fx-worker", "deployed-current.worker.js"), fileText);
  fs.writeFileSync(path.join(dir, "p.patch"), patch);
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const r = spawnSync("git", ["apply", "--check", "p.patch"], { cwd: dir, encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: r.status === 0, err: (r.stderr || "").slice(0, 300) };
}

// ===== A. a 1.2M-char file reads, proposes, verifies and lands; the row never holds the base =====
{
  serve(BIG);
  const { env, calls } = envWith([block(AUDIT_LINE, REAL)]);
  const a = await addTask(env, GOAL, AUDIT_LINE);
  ok(a.ok === true, "A0 the task is queued", a);
  await step(env);
  let t = row(env), cx = JSON.parse(t.ctx);
  ok(t.step === "propose" && cx.large === true && cx.base == null && cx.mode === "patch" && typeof cx.win_text === "string" && cx.win_text.length > 1000 && cx.win_text.length < 30000 && cx.win_text.indexOf(AUDIT_LINE) >= 0 && cx.base_len === BIG.length && cx.mirror === "fx-worker/deployed-current.worker.js",
    "A1 after read: patch mode, large, the window text (not the base) is stored, the mirror is seen", { step: t.step, large: cx.large, hasBase: cx.base != null, wt: (cx.win_text || "").length, mirror: cx.mirror });
  ok(t.ctx.length < 60000, "A1 the task row stays small (" + t.ctx.length + " chars of ctx for a " + BIG.length + "-char file)", t.ctx.length);
  await step(env); await step(env); await step(env);
  t = row(env); cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && t.attempts === 0 && t.last_error == null && calls.length === 1, "A2 propose, verify and commit landed the task ready_to_publish with one model call", { st: t.status, a: t.attempts, err: t.last_error, calls: calls.length });
  ok(cx.base == null && typeof cx.patch === "string" && cx.patch.length < 6000 && /api\.github\.com/.test(cx.patch) && /1\.2\.4-codeagent/.test(cx.patch) && /deployed-current\.worker\.js/.test(cx.patch),
    "A3 the parked patch is a small hunk with the change, the VERSION bump and the mirror; the base is still not stored", { hasBase: cx.base != null, len: (cx.patch || "").length });
  const ap = applies(BIG, cx.patch);
  ok(ap.ok, "A4 git apply --check accepts the patch against the file", ap.err);
  ok(/function filler39990\(\)/.test(calls[0].prompt) && !/function filler100\(\)/.test(calls[0].prompt), "A5 the model saw the anchor window, not the whole file", calls[0].prompt.length);
}

// ===== B. lines added above the window after the read: the window is found again and the patch applies to the new file =====
{
  serve(BIG);
  const { env, calls } = envWith([block(AUDIT_LINE, REAL)]);
  await addTask(env, GOAL, AUDIT_LINE);
  await step(env);
  const MOVED = BIG.replace('const WORKER = "fx";', 'const WORKER = "fx";\nconst ADDED_LATER = 1;\nconst ADDED_LATER_2 = 2;');
  serve(MOVED);
  await step(env); await step(env); await step(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && cx.moved >= 1 && cx.base_len === MOVED.length && calls.length === 1, "B1 the window moved by two lines and was found again; the task still landed", { st: t.status, moved: cx.moved, len: cx.base_len, err: t.last_error });
  const ap = applies(MOVED, cx.patch), apOld = applies(BIG, cx.patch);
  ok(ap.ok, "B2 the patch applies to the file as it is now on main", ap.err);
  ok(!apOld.ok || /ADDED_LATER/.test(cx.patch) === false, "B3 the patch was built on the current file (context lines are the new file's)", { old: apOld.ok });
}

// ===== C. the anchor line removed from main after the read: re-read from the anchor, then needs_human with the reason =====
{
  serve(BIG);
  const { env, calls } = envWith([block(AUDIT_LINE, REAL)]);
  await addTask(env, GOAL, AUDIT_LINE);
  await step(env);
  serve(BIG.replace(AUDIT_LINE + "\n", ""));
  const s2 = await step(env);
  let t = row(env);
  ok(t.step === "read" && t.status === "queued" && JSON.parse(t.ctx).rereads === 1 && events(env, "code-task.reread").length === 1 && calls.length === 0, "C1 the vanished window sends the task back to read (code-task.reread), no model call", { step: t.step, st: t.status, ctx: t.ctx, s2: s2.done });
  await step(env);
  t = row(env);
  ok(t.status === "needs_human" && /anchor occurs 0 times/.test(t.last_error), "C2 the re-read finds no anchor and ends needs_human with the reason", { st: t.status, err: t.last_error });
}

// ===== D. a large file with no anchor: one locator pick (ANCHOR-LOCATOR-1); when it finds nothing the task parks with both reasons =====
{
  serve(BIG);
  const { env, calls } = envWith(["  nothing like this line exists in the file();"]);
  await addTask(env, GOAL);
  await step(env);
  const t = row(env);
  ok(t.status === "needs_human" && /LARGE-FILE-WINDOW-1 edits it from the anchor window alone/.test(t.last_error) && /ANCHOR-LOCATOR-1 found no unique line/.test(t.last_error) && calls.length === 1 && /FILE EXCERPTS/.test(calls[0].prompt), "D1 no anchor on a large file: one locator call, then needs_human with both reasons", { st: t.status, err: t.last_error, calls: calls.length });
}
{
  serve(BIG);
  const { env, calls } = envWith([AUDIT_LINE, block(AUDIT_LINE, REAL)]);
  await addTask(env, GOAL);
  await step(env); await step(env); await step(env); await step(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && cx.large === true && cx.anchor === AUDIT_LINE && calls.length === 2 && events(env, "code-task.anchor-located").length === 1, "D2 no anchor on a large file: the locator's pick becomes the anchor and the task lands", { st: t.status, anchor: cx.anchor, calls: calls.length, err: t.last_error });
}

// ===== E. a small file keeps the pre-0.4.0 path: the base is stored =====
{
  serve(SMALL);
  const { env } = envWith([block(AUDIT_LINE, REAL)]);
  await addTask(env, GOAL, AUDIT_LINE);
  await step(env);
  const cx = JSON.parse(row(env).ctx);
  ok(cx.large == null && cx.base === SMALL && cx.win_text == null, "E1 a small file stores its base as before", { large: cx.large, hasBase: cx.base != null });
}

// ===== F. /health =====
{
  const { env } = envWith([]);
  const h = await (await worker.fetch(new Request("https://x/health"), env)).json();
  ok(/^0\.([4-9]|\d\d)\.\d+-/.test(h.version) && h.capabilities.includes("large-file-window") && h.limitations.some((l) => /LARGE-FILE-WINDOW-1/.test(l) && /900000/.test(l) && /6000000/.test(l)), "F1 /health names the capability and its bounds", { v: h.version });
}

console.log("large-file: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

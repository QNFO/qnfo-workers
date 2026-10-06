// ANCHOR-LOCATOR-1 offline suite (qnfo-code-orchestrator 0.4.0, agent_issues 2007 second half, human_actions 60, pillar autonomy).
// ANCHOR-REPAIR-1 (0.3.19) repairs an anchor without a model call (whitespace, longest unique line). What still parked tasks
// needs_human on 2026-10-06: an anchor that occurs 0 times and cannot be repaired (ct_qjjo05t4elayld on qnfo-ipatent), an anchor
// that occurs twice, and a file over 60,000 chars filed without an anchor. The loop now asks the cheapest rung once for one
// verbatim line among the file excerpts near the goal's keywords (the planner's own excerpt builder) and takes it when it occurs
// exactly once. This suite proves, on a 66k-char fixture:
//   A. no anchor: the pick becomes the anchor, the task lands with two model calls, the locator saw excerpts not the whole file;
//   B. an anchor that occurs 0 times and is not repairable: the pick (even inside a code fence) becomes the anchor;
//   C. an anchor that occurs twice: the pick becomes the anchor;
//   D. a pick that is not a unique line of the file: needs_human with the old reason plus ANCHOR-LOCATOR-1, one model call;
//   E. a small file without an anchor is untouched (whole-file mode, no locator call);
//   F. /health names the capability.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads.
// Run: node --no-warnings qnfo-code-orchestrator/anchor-locator.test.mjs   (exit 0 = all passed)
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

const AUDIT_LINE = `  await audit(env, "ready", task.id + " ready_to_publish on " + task.branch, "ok");`;
const DUP_LINE = "  return { ok: true };";
const FILLER = Array.from({ length: 2200 }, (_, i) => "function filler" + i + "() { return " + i + "; }").join("\n");
const mk = (filler) => [
  "// fixture worker (test data)",
  'var VERSION = "1.2.3-fixture";',
  'const WORKER = "fx";',
  filler,
  "async function audit(env, kind, text, status) { return env.AUDIT_DB.prepare(\"INSERT INTO cloud_ops_events (kind, text, status) VALUES (?,?,?)\").bind(kind, text, status).run(); }",
  "async function other(env) {",
  DUP_LINE,
  "}",
  "async function publish(env, task) {",
  AUDIT_LINE,
  DUP_LINE,
  "}",
  "export default { async fetch() { return new Response('ok'); } };",
  "",
].join("\n");
const MID = mk(FILLER), SMALL = mk("");
ok(MID.length > 60000 && MID.length < 900000 && SMALL.length < 12000, "fixture: 60k < mid < 900k, small under 12k", { mid: MID.length, small: SMALL.length });
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
    AI: { run: async (model, input) => { calls.push({ model, prompt: input.messages[1].content, sys: input.messages[0].content }); const r = replies.shift(); return { response: r == null ? "" : r }; } } };
  return { env, calls };
}
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (env) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 12, budgetMs: 25000, plan: false, intake: false, claims: false }) }), env)).json();
const addTask = async (env, goal, anchor) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-worker/worker.js", goal, anchor }) }), env)).json();
const row = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks").get();
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT * FROM cloud_ops_events WHERE kind = ?").all(kind);
const block = (a, b) => "<<<<<<< SEARCH\n" + a + "\n=======\n" + b + "\n>>>>>>> REPLACE";
const GOAL = "At ready_to_publish, also push the branch through the GitHub Contents API with the fleet token, then set status branch_pushed.";
const REAL = [
  `  const r = await fetch("https://api.github.com/repos/QNFO/qnfo-workers/contents/" + task.path, { method: "PUT", headers: { authorization: "Bearer " + env.GITHUB_TOKEN } });`,
  `  await audit(env, "ready", task.id + (r.ok ? " branch_pushed on " : " push failed on ") + task.branch, r.ok ? "ok" : "error");`,
].join("\n");

// ===== A. no anchor on a 66k file: the pick becomes the anchor =====
{
  serve(MID);
  const { env, calls } = envWith([AUDIT_LINE, block(AUDIT_LINE, REAL)]);
  const a = await addTask(env, GOAL);
  ok(a.ok === true, "A0 the task is queued without an anchor", a);
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && cx.mode === "patch" && cx.anchor === AUDIT_LINE && calls.length === 2, "A1 the locator's pick became the anchor and the task landed with two model calls", { st: t.status, anchor: cx.anchor, calls: calls.length, err: t.last_error });
  ok(/FILE EXCERPTS from fx-worker\/worker\.js/.test(calls[0].prompt) && calls[0].prompt.indexOf(AUDIT_LINE) >= 0 && !/function filler1000\(\)/.test(calls[0].prompt) && calls[0].prompt.length < 16000, "A2 the locator saw excerpts near the goal's keywords, not the whole file", calls[0].prompt.length);
  const ev = events(env, "code-task.anchor-located");
  ok(ev.length === 1 && /none -> /.test(ev[0].text) && JSON.parse(ev[0].meta).had === false, "A3 one code-task.anchor-located event records the pick", ev);
  ok(/1\.2\.4-codeagent/.test(cx.patch) && /api\.github\.com/.test(cx.patch), "A4 the patch carries the change and the bump", (cx.patch || "").length);
}

// ===== B. an anchor that occurs 0 times and cannot be repaired: the pick (inside a fence) becomes the anchor =====
{
  serve(MID);
  const { env, calls } = envWith(["```js\n" + AUDIT_LINE + "\n```", block(AUDIT_LINE, REAL)]);
  await addTask(env, GOAL, '  await audit(env, "gone", "this line is not in the file at all", "ok");');
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  const ev = events(env, "code-task.anchor-located");
  ok(t.status === "ready_to_publish" && cx.anchor === AUDIT_LINE && calls.length === 2 && ev.length === 1 && JSON.parse(ev[0].meta).had === true && JSON.parse(ev[0].meta).n === 0, "B1 an unrepairable anchor is replaced by the pick (fence stripped) and the task lands", { st: t.status, anchor: cx.anchor, err: t.last_error, ev: ev.length });
  ok(/occurs 0 times in the file, so it cannot be used/.test(calls[0].prompt), "B2 the locator was told the given anchor occurs 0 times", calls[0].prompt.slice(0, 300));
}

// ===== C. an anchor that occurs twice: the pick becomes the anchor =====
{
  serve(MID);
  const { env, calls } = envWith([AUDIT_LINE, block(AUDIT_LINE, REAL)]);
  await addTask(env, GOAL, DUP_LINE);
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  const ev = events(env, "code-task.anchor-located");
  ok(t.status === "ready_to_publish" && cx.anchor === AUDIT_LINE && calls.length === 2 && ev.length === 1 && JSON.parse(ev[0].meta).n === 2, "C1 an anchor that occurs twice is replaced by the pick and the task lands", { st: t.status, anchor: cx.anchor, err: t.last_error });
}

// ===== D. a pick that is not a unique line of the file: the task parks with both reasons =====
{
  serve(MID);
  const { env, calls } = envWith(["  nothing like this line exists in the file();"]);
  await addTask(env, GOAL, DUP_LINE);
  await tick(env);
  const t = row(env);
  ok(t.status === "needs_human" && /anchor occurs 2 times in the file/.test(t.last_error) && /ANCHOR-LOCATOR-1 found no unique line near the goal either/.test(t.last_error) && calls.length === 1 && events(env, "code-task.anchor-located").length === 0, "D1 a useless pick parks the task needs_human with the old reason plus the locator's, one model call", { st: t.status, err: t.last_error, calls: calls.length });
}
{
  serve(MID);
  const { env, calls } = envWith([DUP_LINE]);
  await addTask(env, GOAL);
  await tick(env);
  const t = row(env);
  ok(t.status === "needs_human" && /needs an anchor/.test(t.last_error) && /ANCHOR-LOCATOR-1/.test(t.last_error) && calls.length === 1, "D2 a pick that occurs twice is refused like any anchor", { st: t.status, err: t.last_error });
}

// ===== E. a small file without an anchor: whole-file mode, no locator call =====
{
  serve(SMALL);
  const { env, calls } = envWith(["```file\n" + SMALL.replace(AUDIT_LINE, REAL) + "```"]);
  await addTask(env, GOAL);
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && cx.mode !== "patch" && calls.length === 1 && !/FILE EXCERPTS/.test(calls[0].prompt), "E1 a small file keeps whole-file mode and never calls the locator", { st: t.status, mode: cx.mode, calls: calls.length });
}

// ===== F. /health =====
{
  const { env } = envWith([]);
  const h = await (await worker.fetch(new Request("https://x/health"), env)).json();
  ok(h.capabilities.includes("anchor-locator") && h.limitations.some((l) => /ANCHOR-LOCATOR-1/.test(l) && /exactly once/.test(l)), "F1 /health names the locator and its rule", { v: h.version });
}

console.log("anchor-locator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

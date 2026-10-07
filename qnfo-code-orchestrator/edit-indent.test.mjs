// EDIT-INDENT-TOLERANT-1 offline suite (qnfo-code-orchestrator 0.8.0, agent_issues 2111, pillar autonomy).
// Replays ct_ygmwselr4c3dnj (qnfo-infra/worker.js, 2026-10-07): rung 1 answered two SEARCH blocks indented by 6 spaces where the
// file indents by 4, so "SEARCH text occurs 0 times in the shown content" failed the attempt although the lines were the file's.
// Proves: a SEARCH that differs only in indentation applies, its REPLACE re-indented to the file, audited as code-task.edit-indent;
// a SEARCH whose trimmed lines occur twice still fails with the 0-times text; an exact match is unchanged and writes no event;
// blank-only SEARCH blocks never match; the patch the task parks carries the re-indented lines.
// Run: node --no-warnings qnfo-code-orchestrator/edit-indent.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const atLeast = (v, min) => { const a = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")), b = min.split(".").map(Number); if (!a) return false; for (let i = 0; i < 3; i++) { if (+a[i + 1] !== b[i]) return +a[i + 1] > b[i]; } return true; };

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
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  return { prepare: wrap, _db: db };
}
// The fixture: qnfo-infra's shape around the paper-indexer lines ct_ygmwselr4c3dnj edited (4-space indent inside a function).
const L1 = '    const row = await env.QNFO_AUDIT.prepare("SELECT id, status FROM papers WHERE slug = ?1").bind(slug).first();';
const L2 = '    if (!row) return { ok: false, error: "no paper" };';
const L3 = '    return { ok: true, status: String(row.status || "draft") };';
const ANCHOR = "async function paperStatus(env, slug) {";
const lines = ['var VERSION = "2.3.1-fixture";', "// qnfo-infra (fixture)"];
for (let i = 0; i < 40; i++) lines.push("function filler" + i + "(env) { return env && env.FLAG_" + i + " ? " + i + " : 0; }");
lines.push(ANCHOR, L1, L2, L3, "}");
lines.push("function twice(a) {", "  if (a) {", "    return 1;", "  }", "  if (a) {", "    return 1;", "  }", "  return 0;", "}");
for (let i = 40; i < 60; i++) lines.push("function filler" + i + "(env) { return env && env.FLAG_" + i + " ? " + i + " : 0; }");
lines.push("export default { async fetch(req, env) { return new Response('ok'); } };", "");
const SRC = lines.join("\n");
const FILES = { "qnfo-infra/worker.js": SRC, "qnfo-infra/deployed-current.worker.js": SRC };
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
const tick = async (env, n) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: n || 1, budgetMs: 25000, plan: false, intake: false }) }), env)).json();
const addTask = async (env, goal) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "qnfo-infra/worker.js", goal: goal, anchor: ANCHOR }) }), env)).json();
const row = (env, id) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks WHERE id=?").get(id);
const ctxOf = (r) => { try { return JSON.parse(r.ctx || "{}"); } catch (e) { return {}; } };
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT text, meta, status FROM cloud_ops_events WHERE kind=? ORDER BY rowid").all(kind);
const block = (a, b) => "<<<<<<< SEARCH\n" + a + "\n=======\n" + b + "\n>>>>>>> REPLACE";
const ind = (s, n) => s.split("\n").map((l) => (l.trim() ? " ".repeat(n) + l.trim() : l)).join("\n");
// Steps the task until it parks its patch (pull mode: status ready_to_publish), fails once, or runs out of steps.
const runTask = async (env, id) => {
  for (let i = 0; i < 8; i++) {
    const r = row(env, id);
    if (!r || r.status !== "queued" || events(env, "code-task.fail").length) break;
    env.AUDIT_DB._db.prepare("UPDATE code_tasks SET lease_until=NULL WHERE id=?").run(id);
    await tick(env);
  }
  return row(env, id);
};
const firstFail = (env) => (events(env, "code-task.fail")[0] || {}).text || "";

// ===== 1. health =====
const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(atLeast(h.version, "0.8.0") && h.capabilities.indexOf("edit-indent") >= 0, "health: 0.8.0+ with the edit-indent capability", { version: h.version });

// ===== 2. the live failure: both blocks indented by 6 where the file has 4 =====
{
  const wrong = ind(L2 + "\n" + L3, 6);
  const fix = ind('    if (!row) return { ok: false, error: "no paper: " + slug };\n    return { ok: true, status: String(row.status || "draft"), id: row.id };', 6);
  const { env, calls } = envWith([block(wrong, fix)]);
  const c = await addTask(env, "paperStatus names the slug in its error and returns the id");
  const r = await runTask(env, c.id);
  const cx = ctxOf(r);
  ok(calls.length === 1 && r.attempts === 0 && r.status === "ready_to_publish", "a 6-space SEARCH over a 4-space file applies, verifies and parks its patch: no failed attempt", { step: r.step, status: r.status, attempts: r.attempts, last_error: r.last_error });
  const ev = events(env, "code-task.edit-indent");
  ok(ev.length === 1 && ev[0].status === "ok" && /edit 1 indented 6 -> 4 chars/.test(ev[0].text) && JSON.parse(ev[0].meta).indents[0].to === 4, "one code-task.edit-indent event names the edit and the indents", ev);
  const patch = String(cx.patch || "");
  ok(/\+    if \(!row\) return \{ ok: false, error: "no paper: " \+ slug \};/.test(patch) && /\+    return \{ ok: true, status: String\(row\.status \|\| "draft"\), id: row\.id \};/.test(patch) && !/\n\+ {6}/.test(patch), "the parked patch carries the REPLACE lines re-indented to 4 spaces", patch.slice(0, 900));
  // the patch carries worker.js and its mirror (two hunks of the same change), so every removed line appears twice
  ok(/-    if \(!row\) return/.test(patch) && /-    return \{ ok: true, status: String\(row\.status \|\| "draft"\) \};/.test(patch) && (patch.match(/^-    (if|return) /gm) || []).length === 4 && (patch.match(/^-var VERSION/gm) || []).length === 2, "exactly the two matched file lines (and the VERSION line) are removed, in the file and its mirror", (patch.match(/^-[^-]/gm) || []));
}

// ===== 3. an exact match is unchanged and writes no event =====
{
  const { env } = envWith([block(L2, '    if (!row) return { ok: false, error: "no paper: " + slug };')]);
  const c = await addTask(env, "name the slug");
  const r = await runTask(env, c.id);
  ok(r.attempts === 0 && r.status === "ready_to_publish" && events(env, "code-task.edit-indent").length === 0 && /no paper: " \+ slug/.test(String(ctxOf(r).patch || "")), "an exact SEARCH applies as before, no edit-indent event", { status: r.status, step: r.step, attempts: r.attempts });
}

// ===== 4. a SEARCH whose trimmed lines occur twice still fails, naming both counts =====
{
  const { env } = envWith([block("      if (a) {\n        return 1;\n      }", "      if (a) {\n        return 2;\n      }")]);
  const c = await addTask(env, "return 2 in twice");
  const r = await runTask(env, c.id);
  ok(r.attempts >= 1 && /occurs 0 times in the shown content exactly and 2 times with the indentation ignored/.test(firstFail(env)) && events(env, "code-task.edit-indent").length === 0, "a non-unique trimmed match is never guessed at: the attempt fails with both counts", { first_fail: firstFail(env), attempts: r.attempts });
}

// ===== 5. a SEARCH that is not in the file at all keeps the 0-times text (the probe on 2111 counts it) =====
{
  const { env } = envWith([block("    if (!row) return { ok: false, error: 'missing' };", "    x();")]);
  const c = await addTask(env, "x");
  const r = await runTask(env, c.id);
  ok(r.attempts >= 1 && /SEARCH text occurs 0 times in the shown content \(it must be copied verbatim/.test(firstFail(env)), "a SEARCH absent from the file still fails with the verbatim 0-times text", firstFail(env));
}

// ===== 6. a SEARCH of blank lines only never matches =====
{
  const { env } = envWith([block("\n  \n", "    y();")]);
  const c = await addTask(env, "y");
  const r = await runTask(env, c.id);
  ok(r.attempts >= 1 && /occurs 0 times in the shown content \(it must be copied verbatim/.test(firstFail(env)), "blank-only SEARCH: refused as before, not matched to any blank lines", firstFail(env));
}

// ===== 7. a deeper REPLACE line keeps its extra indent; a shallower SEARCH (column 0) gains the file's prefix =====
{
  // a single column-0 line is an exact substring of the indented file line (the old path); two lines are not, so the trimmed path runs
  const search0 = ind(L2 + "\n" + L3, 0);
  const fix0 = 'if (!row) {\n  return { ok: false, error: "no paper" };\n}\nreturn { ok: true, status: String(row.status || "draft") };';
  const { env } = envWith([block(search0, fix0)]);
  const c = await addTask(env, "braces");
  const r = await runTask(env, c.id);
  const patch = String(ctxOf(r).patch || "");
  // the re-indented last REPLACE line equals the file's own line, so the diff shows it as context, not as an added line
  ok(r.attempts === 0 && /\n\+    if \(!row\) \{\n\+      return \{ ok: false, error: "no paper" \};\n\+    \}\n     return \{ ok: true, status: String\(row\.status \|\| "draft"\) \};\n/.test(patch), "a column-0 two-line SEARCH gains the file's 4 spaces on every REPLACE line, deeper lines keep their extra indent", patch.slice(0, 900));
  ok(/edit 1 indented 0 -> 4 chars/.test((events(env, "code-task.edit-indent")[0] || {}).text || ""), "the event names 0 -> 4", events(env, "code-task.edit-indent"));
}

console.log("edit-indent.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// Offline suite for the 0.12.0 code-loop quality levers (pillar autonomy; issues 2111, 2007, 2008, 1834, 2313, 2168).
// Each case replays a failure read from qnfo-audit.code_tasks on 2026-10-12 (the last 40 failed / publish_failed rows):
//   WINDOW-LONG-LINE-1      ct_i03tgmilanmuzk: a 128,767-char window on a file with very long lines (5021 / timeouts / search 0);
//   SEARCH-FUZZY-1          (PR 941, 0.11.0) still holds beside the new gates: spacing drift applies;
//   SEARCH-NEAREST-BLOCK-1  a SEARCH that matches nowhere is shown the file's own lines at the place one of its lines occurs;
//   DANGLING-REF-GATE-1     ct_7xtqmvrmppmoxw (parseRefLine called, never defined), ct_kxidt9fse2j7yu (WRITER_PROMPT removed, still used);
//   REPAIR-SHOWS-EDITS-1    a retry after edits that applied shows the model those edits;
//   VERIFY-DEFER-PUBLISHER-1 a JavaScript task this worker cannot verify goes on to the publisher instead of needs_human;
//   GOAL-VERSION-1          ct_x18gl289qtiggu: the goal names the VERSION the change must carry.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads.
// Run: node --no-warnings qnfo-code-orchestrator/loop-quality.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orch-quality-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), fs.readFileSync(path.join(here, "worker.js"), "utf8") +
  "\nexport { windowFor as __windowFor, windowCut as __windowCut, applyEdits as __applyEdits, danglingRefs as __dangling, bumpVersion as __bump, intakeIssues as __intake, goalVersion as __goalVersion, promptForPatch as __prompt, randId as __randId, VERSION as __version, WINDOW_CHARS as __WINDOW };\n");
const mod = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
const worker = mod.default;
const atLeast = (v, min) => { const a = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || "")), b = min.split(".").map(Number); if (!a) return false; for (let i = 0; i < 3; i++) { if (+a[i + 1] !== b[i]) return +a[i + 1] > b[i]; } return true; };

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
const FILES = {};
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  return p && FILES[p] != null ? new Response(FILES[p], { status: 200 }) : new Response("nf", { status: 404 });
};
const serve = (text) => { FILES["fx-worker/worker.js"] = text; FILES["fx-worker/deployed-current.worker.js"] = text; };
const fakeLoader = { load: () => ({ getEntrypoint: () => ({ fetch: async () => new Response("ok") }) }) };
function envWith(replies, over) {
  const calls = [];
  const env = Object.assign({ ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull", JS_VERIFY: "dynamic", LOADER: fakeLoader,
    AI: { run: async (model, input) => { calls.push({ model, prompt: input.messages[1].content, sys: input.messages[0].content }); const r = replies.shift(); return { response: r == null ? "" : r }; } } }, over || {});
  return { env, calls };
}
const hdr = { authorization: "Bearer t0ken", "content-type": "application/json" };
const tick = async (env) => (await worker.fetch(new Request("https://x/v1/tick", { method: "POST", headers: hdr, body: JSON.stringify({ maxSteps: 12, budgetMs: 25000, plan: false, intake: false, claims: false }) }), env)).json();
const addTask = async (env, goal, anchor) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-worker/worker.js", goal, anchor }) }), env)).json();
const row = (env) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks").get();
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT * FROM cloud_ops_events WHERE kind = ?").all(kind);
const block = (a, b) => "<<<<<<< SEARCH\n" + a + "\n=======\n" + b + "\n>>>>>>> REPLACE";

ok(atLeast(mod.__version, "0.12.0"), "the worker is 0.12.0 or later", mod.__version);

// ===== 1. WINDOW-LONG-LINE-1 =====
{
  const W = mod.__WINDOW;
  const longLine = 'const PAGE = "' + "x".repeat(150000) + '";';
  const ANCH = "async function countUsage(env, kind, text, ua) {";
  const small = Array.from({ length: 300 }, (_, i) => "function f" + i + "() { return " + i + "; }").join("\n");
  const base = [small, longLine, ANCH, "  return 1;", "}", longLine, small, ""].join("\n");
  const win = mod.__windowFor(base, ANCH);
  ok(win.we - win.ws <= W + 2 * 4000 + ANCH.length && win.we - win.ws >= W / 2, "1a a window between two 150k-char lines stays near WINDOW_CHARS (it was the two whole lines)", { size: win.we - win.ws });
  ok(base.slice(win.ws, win.we).indexOf(ANCH) >= 0 && mod.__windowCut(base, win) === true, "1b the clamped window still holds the anchor and reports that its edge lines are cut");
  const plain = [small, ANCH, "  return 1;", "}", small, ""].join("\n");
  const w2 = mod.__windowFor(plain, ANCH);
  ok((w2.ws === 0 || plain.charAt(w2.ws - 1) === "\n") && (w2.we === plain.length || plain.charAt(w2.we - 1) === "\n") && mod.__windowCut(plain, w2) === false, "1c a file of ordinary lines keeps its line-aligned window", w2);
  const p = mod.__prompt({ goal: "g", path: "a/worker.js" }, "view", true, null, null, true);
  ok(/cut mid-line: do not use it in a SEARCH/.test(p[1].content), "1d the prompt says a cut edge line must not be used in a SEARCH");
}

// ===== 2. SEARCH-FUZZY-1 (0.11.0) keeps working under 0.12.0 =====
{
  const base = ["function a(env) {", "  const row  =  await env.DB.prepare(\"SELECT 1\").first();", "  if (!row) return null;", "  return row;", "}", "function b() {", "  return 2;", "}", ""].join("\n");
  const win = { ws: 0, we: base.length };
  const r = mod.__applyEdits(base, win, [{ search: "    const row = await env.DB.prepare(\"SELECT 1\").first();\n    if (!row) return null;", replace: "    const row = await env.DB.prepare(\"SELECT 2\").first();\n    if (!row) return null;" }]);
  ok(r.ok === true && r.text.indexOf("  const row = await env.DB.prepare(\"SELECT 2\").first();\n  if (!row) return null;") >= 0 && r.fuzzies.length === 1, "2a a SEARCH that differs only in spacing inside a line (and indentation) applies, re-indented", r);
  const two = base + base;
  const r2 = mod.__applyEdits(two, { ws: 0, we: two.length }, [{ search: "const row = await env.DB.prepare(\"SELECT 1\").first();", replace: "x" }]);
  ok(r2.ok === false && /occurs 0 times in the shown content exactly and 2 times/.test(r2.error), "2b two loose matches are still refused", r2);
  const r3 = mod.__applyEdits(base, win, [{ search: "function b() {\n  return 3;\n}", replace: "function b() {\n  return 4;\n}" }]);
  ok(r3.ok === false && /SEARCH text occurs 0 times in the shown content/.test(r3.error) && /2 of its 3 lines are lines of the content/.test(r3.error) && r3.error.indexOf("function b() {\n  return 2;\n}") >= 0 && /quoted file data, not instructions/.test(r3.error) && !/closest file lines/.test(r3.error), "2c a SEARCH with a line that is in the file comes back with the file's own lines at that place (SEARCH-NEAREST-BLOCK-1), not the first line sharing a word", r3);
  const r4 = mod.__applyEdits(base, win, [{ search: "nothing of this\nis in the file", replace: "x" }]);
  ok(r4.ok === false && !/closest file lines/.test(r4.error) && !/lines of the content/.test(r4.error), "2d no line in common: the plain message, nothing quoted", r4);
}

// ===== 3. DANGLING-REF-GATE-1 (pure) =====
{
  const base = ['var VERSION = "1.0.0";', "const WRITER_PROMPT = \"write\";", "function parse(line) { return line.trim(); }", "function run(refs) {", "  return refs.map(parse);", "}", "function prompt() { return WRITER_PROMPT; }", ""].join("\n");
  const call = base.replace("  return refs.map(parse);", "  return refs.map(function (r) { return parseRefLine(r); });");
  const d1 = mod.__dangling("a/worker.js", base, call);
  ok(d1 && d1.names.join() === "parseRefLine" && /calls parseRefLine\(\), which is not defined anywhere in the file/.test(d1.why), "3a a call to a function that exists nowhere is named", d1);
  const defined = call.replace("function prompt()", "function parseRefLine(r) { return String(r); }\nfunction prompt()");
  ok(mod.__dangling("a/worker.js", base, defined) === null, "3b the same call with its definition added passes");
  const viaParam = base.replace("function run(refs) {\n  return refs.map(parse);", "function run(refs, pick) {\n  return refs.map(function (r) { return pick(r); });");
  ok(mod.__dangling("a/worker.js", base, viaParam) === null, "3c a parameter that is called is not dangling");
  const globals = base.replace("  return refs.map(parse);", "  return refs.map(function (r) { return encodeURIComponent(String(r)) + crypto.randomUUID() + JSON.stringify(structuredClone(r)); });");
  ok(mod.__dangling("a/worker.js", base, globals) === null, "3d runtime globals and methods are not dangling");
  const inString = base.replace("  return refs.map(parse);", "  return refs.map(function (r) { return \"SELECT COUNT(x), frobnicate(y) FROM t\" + r; });");
  ok(mod.__dangling("a/worker.js", base, inString) === null, "3e a call written inside a string literal is not code");
  const removed = base.replace("const WRITER_PROMPT = \"write\";\n", "");
  const d2 = mod.__dangling("a/worker.js", base, removed);
  ok(d2 && d2.names.join() === "WRITER_PROMPT" && /removes the declaration of WRITER_PROMPT while the file still uses it/.test(d2.why), "3f a removed top-level declaration that is still used is named", d2);
  const removedBoth = removed.replace("function prompt() { return WRITER_PROMPT; }\n", "");
  ok(mod.__dangling("a/worker.js", base, removedBoth) === null, "3g a declaration removed together with its last use passes");
  const redeclared = base.replace("const WRITER_PROMPT = \"write\";", "const WRITER_PROMPT = \"write better\";");
  ok(mod.__dangling("a/worker.js", base, redeclared) === null, "3h a changed declaration is not a removal");
  ok(mod.__dangling("a/notes.md", base, call) === null, "3i only JavaScript is judged");
}

// ===== 4. the gate in the loop: refused once with the reason, the edits shown to the next rung; a repeat is let through =====
const lines = ['var VERSION = "2.3.1-fixture";', "// fixture"];
for (let i = 0; i < 40; i++) lines.push("function filler" + i + "(env) { return env && env.FLAG_" + i + " ? " + i + " : 0; }");
const ANCHOR = "async function citationCheck(env, refs) {";
lines.push(ANCHOR, "  const out = [];", "  for (const r of refs) out.push(String(r));", "  return out;", "}", "export default { async fetch() { return new Response('ok'); } };", "");
const FIX = lines.join("\n");
const GOAL = "citationCheck must resolve every reference line before it returns.";
const BAD = block("  for (const r of refs) out.push(String(r));", "  for (const r of refs) out.push(parseRefLine(r));");
const GOOD = block("  for (const r of refs) out.push(String(r));", "  for (const r of refs) out.push(String(r).trim().toLowerCase());");
{
  serve(FIX);
  const { env, calls } = envWith([BAD, GOOD]);
  await addTask(env, GOAL, ANCHOR);
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  const refused = events(env, "code-task.dangling-refused");
  ok(t.status === "ready_to_publish" && calls.length === 2 && refused.length === 1 && /parseRefLine/.test(refused[0].text), "4a a dangling call is refused once and the next rung lands the task", { st: t.status, err: t.last_error, calls: calls.length });
  ok(/dangling-reference: the edit calls parseRefLine\(\)/.test(calls[1].prompt) && /YOUR PREVIOUS EDITS/.test(calls[1].prompt) && calls[1].prompt.indexOf("out.push(parseRefLine(r));") >= 0 && /they replace the previous edits/.test(calls[1].prompt), "4b the next rung sees the reason and its previous edits (REPAIR-SHOWS-EDITS-1)", calls[1].prompt.slice(-900));
  ok(!/YOUR PREVIOUS EDITS/.test(calls[0].prompt), "4c a first attempt shows no previous edits");
  ok(/toLowerCase/.test(cx.patch) && !/parseRefLine/.test(cx.patch), "4d the parked patch is the repaired one");
}
{
  serve(FIX);
  const { env, calls } = envWith([BAD, BAD]);
  await addTask(env, GOAL, ANCHOR);
  await tick(env);
  const t = row(env);
  ok(t.status === "ready_to_publish" && calls.length === 2 && events(env, "code-task.dangling-refused").length === 1 && events(env, "code-task.dangling-passed").length === 1, "4e a name that comes back after one refusal is let through and audited (the gate costs one attempt at most)", { st: t.status, err: t.last_error });
}
{
  // a search that matches nowhere: the edits are not shown again (they never applied), the nearest lines are
  serve(FIX);
  const { env, calls } = envWith([block("  for (const r of refs) out.push(r);\n  return out;", "  return refs.map(String);"), GOOD]);
  await addTask(env, GOAL, ANCHOR);
  await tick(env);
  const t = row(env);
  ok(t.status === "ready_to_publish" && /1 of its 2 lines are lines of the content/.test(calls[1].prompt) && calls[1].prompt.indexOf("  for (const r of refs) out.push(String(r));\n  return out;") >= 0 && !/YOUR PREVIOUS EDITS/.test(calls[1].prompt), "4f a failed SEARCH retries with the file's own lines at that place and no stale edits", { st: t.status, tail: calls[1] && calls[1].prompt.slice(-600) });
}

// ===== 5. VERIFY-DEFER-PUBLISHER-1 =====
{
  serve(FIX);
  const { env } = envWith([GOOD], { JS_VERIFY: "off" });
  await addTask(env, GOAL, ANCHOR);
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && !t.last_error && /JavaScript verification/.test(cx.verify_deferred || "") && events(env, "code-task.verify-deferred").length === 1 && /toLowerCase/.test(cx.patch || ""), "5a with the JS verifier off a pull-mode task is parked for the publisher with the reason, not needs_human", { st: t.status, err: t.last_error, d: cx.verify_deferred });
}
{
  serve(FIX);
  const { env } = envWith([GOOD], { JS_VERIFY: "off", PR_PUBLISH_MODE: "" });
  await addTask(env, GOAL, ANCHOR);
  await tick(env);
  const t = row(env);
  ok(t.status === "needs_human" && /verification/.test(t.last_error || ""), "5b without the pull publisher nothing is deferred: the task still parks", { st: t.status, err: t.last_error });
}
{
  FILES["fx-worker/notes.toml2"] = "a = 1\n".repeat(10);
  const { env } = envWith(["```file\na = 2\n```"], { JS_VERIFY: "off" });
  await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: "fx-worker/notes.toml2", goal: "set a to 2 in the notes file" }) }), env);
  await tick(env);
  const t = row(env);
  ok(t.status === "needs_human" && /no deterministic verifier/.test(t.last_error || ""), "5c a file type with no verifier anywhere still parks", { st: t.status, err: t.last_error });
}

// ===== 6. GOAL-VERSION-1 =====
{
  const a = 'var VERSION = "1.12.4-x"; // c\nlet q = 1;\n', b = 'var VERSION = "1.12.4-x"; // c\nlet q = 2;\n';
  ok(mod.__bump(a, b, "1.13.0-ds402-fallback") === 'var VERSION = "1.13.0-ds402-fallback"; // c\nlet q = 2;\n', "6a the goal's next-minor version replaces the patch bump");
  ok(mod.__bump(a, b, null) === 'var VERSION = "1.12.5-codeagent"; // c\nlet q = 2;\n' && mod.__bump(a, b, "1.12.4") === mod.__bump(a, b, null) && mod.__bump(a, b, "0.16.1-perf-pin") === mod.__bump(a, b, null) && mod.__bump(a, b, "1.14.0") === mod.__bump(a, b, null) && mod.__bump(a, b, "2.0.0") === mod.__bump(a, b, null), "6b a version that is not the next step (same, older, another worker's, two minors, a major) keeps the patch bump");
  const g = mod.__goalVersion("Bump VERSION to 1.13.0-ds402-fallback and add the breaker.");
  ok(g && g.text === "1.13.0-ds402-fallback" && mod.__goalVersion("the version is 1.13.0 on main") === null && mod.__goalVersion("no number here") === null && mod.__goalVersion('set var VERSION = "0.4.2-x"').text === "0.4.2-x", "6c the goal's version is read only from an instruction (to, =, :, as)", g);
  serve(FIX);
  const { env } = envWith([GOOD]);
  await addTask(env, GOAL + " Bump VERSION to 2.4.0-citation-check.", ANCHOR);
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && cx.version_want === "2.4.0-citation-check" && /\+var VERSION = "2\.4\.0-citation-check";/.test(cx.patch), "6d the task's patch carries the goal's version and ctx.version_want keeps it for the publisher's rebase", { st: t.status, want: cx.version_want });
}

// ===== 7. ids and the bearer check =====
{
  const ids = new Set(Array.from({ length: 200 }, () => mod.__randId("ct_")));
  ok(ids.size === 200 && [...ids].every((i) => /^ct_[a-z0-9]{14}$/.test(i)), "7a ids keep their shape (ct_ + 14 base-36 characters) and do not repeat");
  const { env } = envWith([]);
  const bad = await worker.fetch(new Request("https://x/v1/tasks", { headers: { authorization: "Bearer t0keN" } }), env);
  const good = await worker.fetch(new Request("https://x/v1/tasks", { headers: { authorization: "Bearer t0ken" } }), env);
  const none = await worker.fetch(new Request("https://x/v1/tasks"), env);
  ok(bad.status === 401 && none.status === 401 && good.status === 200, "7b the bearer check still accepts the key and refuses anything else", { bad: bad.status, good: good.status, none: none.status });
  const h = await (await worker.fetch(new Request("https://x/health"), env)).json();
  ok(["search-fuzzy", "window-clamp", "dangling-ref-gate", "repair-shows-edits", "verify-deferred", "goal-version", "multi-file"].every((c) => h.capabilities.indexOf(c) >= 0), "7c /health names the new capabilities", h.capabilities);
}

// ===== 7d. EDITS-RESOLVED-1: edits that applied through a tolerant match are parked as the file's own text =====
{
  serve(FIX);
  const loose = block("      for (const r of refs) out.push(String(r));", "      for (const r of refs) out.push(String(r).trim().toLowerCase());");
  const { env } = envWith([loose]);
  await addTask(env, GOAL, ANCHOR);
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && cx.edits.length === 1 && cx.edits[0].search === "  for (const r of refs) out.push(String(r));" && cx.edits[0].replace === "  for (const r of refs) out.push(String(r).trim().toLowerCase());" && FIX.split(cx.edits[0].search).length === 2, "7d a SEARCH indented differently from the file is parked as the file's exact text (it occurs once in the whole file, so a rebuild can re-apply it)", { st: t.status, edits: cx.edits });
  ok(/\+  for \(const r of refs\) out\.push\(String\(r\)\.trim\(\)\.toLowerCase\(\)\);/.test(cx.patch), "7e the parked patch is the same change");
  serve(FIX);
  const { env: env2 } = envWith([GOOD]);
  await addTask(env2, GOAL, ANCHOR);
  await tick(env2);
  const cx2 = JSON.parse(row(env2).ctx);
  ok(cx2.edits[0].search === "  for (const r of refs) out.push(String(r));" && cx2.edits[0].replace === "  for (const r of refs) out.push(String(r).trim().toLowerCase());", "7f an exact SEARCH is parked as the model wrote it", cx2.edits);
}

// ===== 7g. READ-KEEPS-REPAIR-1: a task sent back to read keeps its repair count, the reason and the refusal =====
{
  serve(FIX);
  const { env, calls } = envWith([GOOD]);
  await addTask(env, GOAL, ANCHOR);
  const refusal = { reasons: [{ by: "goal-review", line: 44, why: "the loop never trims" }] };
  env.AUDIT_DB._db.prepare("UPDATE code_tasks SET ctx = ?").run(JSON.stringify({ anchor: ANCHOR, repair_round: 1, lastError: "the merge runner refused your pull request: the loop never trims", refusal }));
  await tick(env);
  const t = row(env), cx = JSON.parse(t.ctx);
  ok(t.status === "ready_to_publish" && cx.repair_round === 1 && JSON.stringify(cx.refusal) === JSON.stringify(refusal) && /Your previous attempt FAILED: the merge runner refused your pull request: the loop never trims/.test(calls[0].prompt), "7g the read step keeps repair_round and refusal, and the first proposal after it is told the reason", { st: t.status, rr: cx.repair_round, refusal: cx.refusal, tail: calls[0] && calls[0].prompt.slice(-200) });
}

// ===== 8. INTAKE-ANCHOR-INHERIT-1: a retry without a code-anchor line starts from its earlier task's anchor =====
{
  serve(FIX);
  const { env } = envWith([]);
  const db = env.AUDIT_DB._db;
  await worker.fetch(new Request("https://x/v1/tasks", { headers: hdr }), env); // creates code_tasks
  db.prepare("INSERT INTO agent_issues (title, description, source, created_at, updated_at) VALUES (?,?,?,?,?)").run("FX-CITE-1: resolve references", GOAL + "\ncode-task: repo=qnfo-workers path=fx-worker/worker.js\n", "claude-session-test", 1, 1);
  const old = new Date(Date.now() - 86400000).toISOString();
  const ins = db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, last_error, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  ins.run("ct_prevwithanchor", "qnfo-workers", "fx-worker/worker.js", "[issue #1] FX-CITE-1: resolve references", "failed", "done", 1, JSON.stringify({ anchor: ANCHOR, mode: "patch" }), "merge-runner: required check(s) failed", new Date(Date.now() - 2 * 86400000).toISOString(), new Date(Date.now() - 2 * 86400000).toISOString());
  ins.run("ct_prevnoanchor00", "qnfo-workers", "fx-worker/worker.js", "[issue #1] [retry 1] FX-CITE-1: resolve references", "needs_human", "read", 1, null, "file larger than 60000 chars needs an anchor", old, old);
  const r = await mod.__intake(env, 2);
  const t = db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(r.created[0] || "");
  ok(r.created.length === 1 && t && JSON.parse(t.ctx).anchor === ANCHOR && /^\[issue #1\] \[retry 2\]/.test(t.goal) && events(env, "code-task.anchor-inherited").length === 1, "8a the retry carries the anchor of the issue's latest task that had one", { r, ctx: t && t.ctx, goal: t && t.goal.slice(0, 60) });
  const { env: env2 } = envWith([]);
  await worker.fetch(new Request("https://x/v1/tasks", { headers: hdr }), env2);
  env2.AUDIT_DB._db.prepare("INSERT INTO agent_issues (title, description, source, created_at, updated_at) VALUES (?,?,?,?,?)").run("FX-CITE-2: resolve references", GOAL + "\ncode-task: repo=qnfo-workers path=fx-worker/worker.js\n", "claude-session-test", 1, 1);
  const r2 = await mod.__intake(env2, 2);
  const t2 = env2.AUDIT_DB._db.prepare("SELECT * FROM code_tasks").get();
  ok(r2.created.length === 1 && t2.ctx === null && events(env2, "code-task.anchor-inherited").length === 0, "8b a first task inherits nothing", { ctx: t2.ctx });
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

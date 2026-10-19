// REFUSAL-RELOCATE-1 offline suite (qnfo-code-orchestrator 0.23.0, agent_issues 2111 / 99925, pillar autonomy).
// Measured 2026-10-19 on cloud_ops_events kind code-task.fail: 20 replies of kimi-k2.7-code since 2026-10-18T13Z held no block because the
// model said the content it was shown lacked the code it was asked to change ("The shown snippet ends before the `learnerRecordPost` call
// sites ..."), and each cost an attempt. In ct_im2381 (qnfo-social/worker.js, 273,763 chars) that name occurs once, at offset 169,881, and the
// anchor window was 0-24,318. This suite proves that such a reply moves the window to the name it put in backticks, runs the propose again
// without spending an attempt, that the next reply then applies, and that a name which is absent from the file, already in the window,
// a file name, in more than three places, or a reply that holds a (broken) SEARCH block never relocates; the bound is WINDOW_RELOCATE_MAX.
// Run: node --no-warnings qnfo-code-orchestrator/refusal-relocate.test.mjs   (exit 0 = all passed)
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
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model));
    CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));`);
  return { prepare: wrap, _db: db };
}
const pad = (tag, n) => { let s = ""; let i = 0; while (s.length < n) s += "// " + tag + " filler line " + (i++) + " keeps the target far from the anchor window\n"; return s; };
const ANCHOR = "function topAnchor() { return 1; }";
const TARGET = "function learnerRecordPost(env, row) { return row; }";
const TWO = "function pairHelper(a) { return a; }";
const MANY = "  // uses sharedHelper here\n".repeat(4);
const BIG = pad("a", 2000) + ANCHOR + "\n" + pad("b", 70000) + TARGET + "\n" + pad("c", 6000) + MANY + pad("d", 6000) + TWO + "\n" + "// calls pairHelper(1)\n" + pad("e", 6000) + 'export default { fetch() { return new Response("a"); } };\n';
const FILES = { "fx-ref/worker.js": BIG, "fx-ref/deployed-current.worker.js": BIG };
globalThis.fetch = async (u) => {
  const m = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/[A-Za-z0-9._-]+\/main\/(.+)$/.exec(String(u));
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
const addTask = async (env, p, anchor) => (await worker.fetch(new Request("https://x/v1/tasks", { method: "POST", headers: hdr, body: JSON.stringify({ repo: "qnfo-workers", path: p, goal: "make learnerRecordPost return row.id instead of row", anchor }) }), env)).json();
const row = (env, id) => env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks WHERE id=?").get(id);
const ctxOf = (r) => { try { return JSON.parse(r.ctx || "{}"); } catch (e) { return {}; } };
const free = (env, id) => env.AUDIT_DB._db.prepare("UPDATE code_tasks SET lease_until = NULL WHERE id = ?").run(id);
const events = (env, kind) => env.AUDIT_DB._db.prepare("SELECT * FROM cloud_ops_events WHERE kind = ?").all(kind);
const EDIT = "<<<<<<< SEARCH\n" + TARGET + "\n=======\nfunction learnerRecordPost(env, row) { return row.id; }\n>>>>>>> REPLACE";
const refuse = (name) => "The shown snippet ends before the `" + name + "` call sites, so I cannot produce a valid SEARCH/REPLACE block for the requested change.";

const h = await (await worker.fetch(new Request("https://x/health"), {})).json();
ok(/^0\.(2[3-9]|[3-9]\d)\.|^[1-9]\d*\./.test(String(h.version)), "health: 0.23.0 or later", h.version);
ok(Array.isArray(h.capabilities) && h.capabilities.includes("refusal-relocate"), "health lists refusal-relocate", h.capabilities);

async function toPropose(script) {
  const { env, calls } = envWith(script);
  const c = await addTask(env, "fx-ref/worker.js", ANCHOR);
  ok(c.ok && c.id, "task enqueued", c);
  await tick(env);
  const r = row(env, c.id), cx = ctxOf(r), at = BIG.indexOf(TARGET);
  ok(r.step === "propose" && cx.mode === "patch" && cx.win.we < at, "read: patch mode, window around the anchor, the target outside it", { step: r.step, win: cx.win, at });
  return { env, calls, id: c.id, at };
}

// ===== 1. a refusal naming code that sits outside the window moves the window there, spends no attempt, and the next reply applies =====
{
  const { env, calls, id, at } = await toPropose([refuse("learnerRecordPost"), EDIT]);
  await tick(env);
  let r = row(env, id), cx = ctxOf(r);
  ok(r.status === "queued" && r.step === "propose" && Number(r.attempts) === 0, "the relocation spends no attempt", { status: r.status, step: r.step, attempts: r.attempts, last_error: r.last_error });
  ok(cx.relocated === 1 && cx.win.ws <= at && cx.win.we >= at + TARGET.length && cx.anchor === TARGET, "the window now holds the name and its line is the anchor", { win: cx.win, relocated: cx.relocated, anchor: cx.anchor });
  ok(/your reply said the content shown lacks `learnerRecordPost`/.test(cx.lastError || ""), "the next prompt says why the content changed", cx.lastError);
  const ev = events(env, "code-task.window-relocated");
  ok(ev.length === 1 && /REFUSAL-RELOCATE-1/.test(ev[0].text) && JSON.parse(ev[0].meta).by === "refusal", "event code-task.window-relocated recorded with by=refusal", ev);
  free(env, id);
  for (let i = 0; i < 4 && row(env, id).status === "queued"; i++) { await tick(env); free(env, id); }
  r = row(env, id);
  ok(calls.length === 2 && calls[1].prompt.indexOf("learnerRecordPost") >= 0 && calls[1].prompt.indexOf("topAnchor") < 0, "the second call was shown the target and no longer the top of the file", calls.length);
  ok(r.status === "ready_to_publish", "the reply with a block then applies and the task reaches ready_to_publish", { status: r.status, step: r.step, last_error: r.last_error });
  ok(String(ctxOf(r).patch || "").indexOf("+function learnerRecordPost(env, row) { return row.id; }") >= 0, "the patch carries the change", String(ctxOf(r).patch || "").slice(0, 200));
}

// ===== 2. a name that is nowhere in the file is an ordinary failure =====
{
  const { env, id } = await toPropose([refuse("neverWritten")]);
  await tick(env);
  const r = row(env, id);
  ok(Number(r.attempts) === 1 && /no SEARCH\/REPLACE block found in the reply \(/.test(r.last_error || "") && !ctxOf(r).relocated, "an absent name spends an attempt and does not relocate", { attempts: r.attempts, last_error: r.last_error });
}

// ===== 3. a name the model was shown is not a reason to move =====
{
  const { env, id } = await toPropose([refuse("topAnchor")]);
  await tick(env);
  const r = row(env, id);
  ok(Number(r.attempts) === 1 && !ctxOf(r).relocated, "a name already inside the window does not relocate", { attempts: r.attempts, relocated: ctxOf(r).relocated });
}

// ===== 4. a file name, a SEARCH/REPLACE marker and a name in more than three places are never used =====
{
  const { env, id } = await toPropose(["I cannot edit `fx-ref/worker.js` or `SEARCH/REPLACE` blocks without `sharedHelper` in view."]);
  await tick(env);
  const r = row(env, id);
  ok(Number(r.attempts) === 1 && !ctxOf(r).relocated, "a path, a marker and a name that occurs 4 times do not relocate", { attempts: r.attempts, relocated: ctxOf(r).relocated, anchor: ctxOf(r).anchor });
}

// ===== 5. the name with the fewest places wins; a two-place name is usable =====
{
  const { env, id } = await toPropose(["I cannot see `pairHelper` or `learnerRecordPost` in the shown content, so I will not invent a block."]);
  await tick(env);
  const r = row(env, id), cx = ctxOf(r);
  ok(Number(r.attempts) === 0 && cx.relocated === 1 && cx.anchor === TARGET, "the one-place name beats the two-place name", { attempts: r.attempts, anchor: cx.anchor });
}
{
  const { env, id } = await toPropose(["The shown snippet has no `pairHelper` declaration, so I cannot write a block."]);
  await tick(env);
  const r = row(env, id), cx = ctxOf(r);
  ok(Number(r.attempts) === 0 && cx.relocated === 1 && cx.anchor === TWO, "a name that occurs twice (its declaration line is unique) still names the place", { attempts: r.attempts, anchor: cx.anchor });
}

// ===== 6. a reply that holds a SEARCH block, even a broken one, is a bad block and not a refusal =====
{
  const { env, id } = await toPropose(["<<<<<<< SEARCH\n" + TARGET + "\nI would change `learnerRecordPost` here but forgot the rest"]);
  await tick(env);
  const r = row(env, id);
  ok(Number(r.attempts) === 1 && /a SEARCH block was opened but not closed/.test(r.last_error || "") && !ctxOf(r).relocated, "an unclosed SEARCH block fails as before", { attempts: r.attempts, last_error: r.last_error });
}

// ===== 7. an empty reply is not a refusal; a SEARCH that misses is still WINDOW-RELOCATE-1's =====
{
  const { env, id } = await toPropose([null]);
  await tick(env);
  const r = row(env, id);
  ok(Number(r.attempts) === 1 && /the reply was empty/.test(r.last_error || "") && !ctxOf(r).relocated, "an empty reply spends an attempt", { attempts: r.attempts, last_error: r.last_error });
}
{
  const { env, id } = await toPropose([EDIT]);
  await tick(env);
  const cx = ctxOf(row(env, id));
  ok(cx.relocated === 1 && /occurs once elsewhere in the file/.test(cx.lastError || ""), "a SEARCH found once elsewhere still relocates by WINDOW-RELOCATE-1, with its own message", cx.lastError);
  ok(JSON.parse(events(env, "code-task.window-relocated")[0].meta).by === "search", "and its event says by=search", events(env, "code-task.window-relocated"));
}

// ===== 8. bounded by WINDOW_RELOCATE_MAX =====
{
  const { env, id } = await toPropose([refuse("learnerRecordPost")]);
  const cx = ctxOf(row(env, id)); cx.relocated = 2;
  env.AUDIT_DB._db.prepare("UPDATE code_tasks SET ctx = ? WHERE id = ?").run(JSON.stringify(cx), id);
  await tick(env);
  const r = row(env, id);
  ok(Number(r.attempts) === 1 && ctxOf(r).relocated === 2, "past the bound the refusal is an ordinary failure", { attempts: r.attempts, relocated: ctxOf(r).relocated });
}

// ===== 9. a large file keeps only its window: the stored window text moves with the relocation =====
{
  const L = pad("a", 2000) + ANCHOR + "\n" + pad("b", 930000) + TARGET + "\n" + pad("c", 4000);
  FILES["fx-ref/large.js"] = L; FILES["fx-ref/deployed-current.large.js"] = L;
  FILES["fx-ref/worker.js"] = L; FILES["fx-ref/deployed-current.worker.js"] = L;
  const { env, calls } = envWith([refuse("learnerRecordPost"), EDIT]);
  const c = await addTask(env, "fx-ref/worker.js", ANCHOR);
  await tick(env);
  let r = row(env, c.id), cx = ctxOf(r);
  ok(cx.large === true && cx.win_text && cx.win_text.indexOf(TARGET) < 0, "read: a large task holds only the anchor window", { large: cx.large, len: String(cx.win_text || "").length });
  await tick(env);
  r = row(env, c.id); cx = ctxOf(r);
  ok(Number(r.attempts) === 0 && cx.relocated === 1 && String(cx.win_text || "").indexOf(TARGET) >= 0 && cx.anchor === TARGET, "the stored window text now holds the name", { attempts: r.attempts, relocated: cx.relocated, anchor: cx.anchor, hasTarget: String(cx.win_text || "").indexOf(TARGET) });
  free(env, c.id);
  for (let i = 0; i < 4 && row(env, c.id).status === "queued"; i++) { await tick(env); free(env, c.id); }
  ok(calls.length === 2 && row(env, c.id).status === "ready_to_publish", "the large task then reaches ready_to_publish", { calls: calls.length, status: row(env, c.id).status, last_error: row(env, c.id).last_error });
}

console.log("refusal-relocate.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

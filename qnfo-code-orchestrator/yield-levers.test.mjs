// MODEL-YIELD-DEMOTE-1 + PATCH-CAP-CHANGED-LINES-1 regression suite (0.49.0).
// Run: node --no-warnings qnfo-code-orchestrator/yield-levers.test.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qnfo-yield-levers-"));
const source = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const workerPath = path.join(tempDir, "worker.mjs");
fs.writeFileSync(workerPath, `${source}\nexport { yieldDemotions, yieldDemoteEnv, ladder, patchChangeChars, hunkPatch, wholeFilePatch, MAX_PATCH_CHARS, PATCH_HARD_MAX, DEMOTE_MIN_OUTCOMES };\n`);
const W = await import(pathToFileURL(workerPath).href);
const worker = W.default;

let pass = 0, fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else { fail++; console.log("FAIL " + message + (value !== undefined ? " -- " + JSON.stringify(value).slice(0, 500) : "")); }
};
const KIMI = "@cf/moonshotai/kimi-k2.7-code", GLM = "@cf/zai-org/glm-5.3", OSS = "@cf/openai/gpt-oss-120b";
const LIVE = [KIMI, GLM, OSS]; // the live MODEL_LADDER order on 2026-11-14 (/health)

function makeD1() {
  const db = new DatabaseSync(":memory:");
  const wrap = (sql) => {
    let args = [];
    const statement = {
      bind: (...values) => { args = values.map((value) => value === undefined ? null : value); return statement; },
      run: async () => { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    };
    return statement;
  };
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
    CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model));
    CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
    CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL, goal TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', step TEXT NOT NULL DEFAULT 'read', attempts INTEGER NOT NULL DEFAULT 0, model TEXT, ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, claim_token_set INTEGER, claim_open INTEGER, superseded_flag INTEGER);`);
  return { prepare: wrap, _db: db };
}
function seedOutcomes(db, model, merged, failed) {
  const now = new Date().toISOString();
  const ins = db._db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, model, created_at, updated_at) VALUES (?, 'qnfo-workers', 'x/worker.js', 'g', ?, ?, ?, ?)");
  for (let i = 0; i < merged; i++) ins.run("ct_m_" + model.slice(-8) + "_" + i, "merged", model, now, now);
  for (let i = 0; i < failed; i++) ins.run("ct_f_" + model.slice(-8) + "_" + i, "failed", model, now, now);
}

// ---- MODEL-YIELD-DEMOTE-1: the pure decision ----
const live = [{ model: OSS, n: 249, merged: 129 }, { model: GLM, n: 116, merged: 57 }, { model: KIMI, n: 100, merged: 7 }];
let d = W.yieldDemotions(live, LIVE);
ok(d.models.length === 1 && d.models[0] === KIMI, "the measured 7-day yields (oss 129/249, glm 57/116, kimi 7/100) demote kimi only", d);
d = W.yieldDemotions([{ model: OSS, n: 249, merged: 129 }, { model: KIMI, n: W.DEMOTE_MIN_OUTCOMES - 1, merged: 0 }], LIVE);
ok(d.models.length === 0, "a rung with fewer than DEMOTE_MIN_OUTCOMES outcomes is not judged (re-trial after it ages out)", d);
d = W.yieldDemotions([{ model: OSS, n: 100, merged: 12 }, { model: KIMI, n: 100, merged: 10 }, { model: GLM, n: 100, merged: 11 }], LIVE);
ok(d.models.length === 0, "rungs that fail alike are not demoted: a low share needs a peer at 3x it", d);
d = W.yieldDemotions([{ model: OSS, n: 100, merged: 50 }, { model: KIMI, n: 100, merged: 2 }], [OSS, KIMI]);
ok(d.models.length === 0, "a two-rung ladder never loses a rung", d);
d = W.yieldDemotions([{ model: OSS, n: 100, merged: 50 }, { model: KIMI, n: 100, merged: 2 }, { model: GLM, n: 100, merged: 1 }], LIVE);
ok(d.models.length === 1 && d.models[0] === GLM, "two bad rungs on a three-rung ladder: only the worst leaves, two rungs stay", d);
d = W.yieldDemotions([{ model: OSS, n: 100, merged: 50 }, { model: "@cf/other/model", n: 100, merged: 0 }], LIVE);
ok(d.models.length === 0, "a model outside the configured ladder is ignored", d);
d = W.yieldDemotions([{ model: OSS, n: 100, merged: 0 }, { model: KIMI, n: 100, merged: 0 }, { model: GLM, n: 100, merged: 0 }], LIVE);
ok(d.models.length === 0, "an all-zero ladder demotes nothing (no peer is better)", d);

// ---- the ladder honours _demoted ----
ok(JSON.stringify(W.ladder({ MODEL_LADDER: LIVE.join(","), _demoted: [KIMI] })) === JSON.stringify([GLM, OSS]), "ladder() drops a demoted rung", W.ladder({ MODEL_LADDER: LIVE.join(","), _demoted: [KIMI] }));
ok(JSON.stringify(W.ladder({ MODEL_LADDER: LIVE.join(","), _demoted: [KIMI], _cc: { order: true } })) === JSON.stringify([GLM, OSS]), "COST-CUT order still applies after the demotion");
ok(JSON.stringify(W.ladder({ MODEL_LADDER: LIVE.join(","), _cc: { order: true } })) === JSON.stringify([GLM, KIMI, OSS]), "no demotion: the cost-cut ladder is unchanged (glm before kimi)");
ok(W.ladder({ MODEL_LADDER: [OSS, KIMI].join(","), _demoted: [KIMI] }).length === 2, "a demotion that would leave one rung is ignored");
ok(W.ladder({ MODEL_LADDER: LIVE.join(",") }).length === 3, "without _demoted every rung stays");

// ---- yieldDemoteEnv reads code_tasks once and writes one event ----
{
  const db = makeD1();
  seedOutcomes(db, OSS, 40, 30); seedOutcomes(db, GLM, 20, 20); seedOutcomes(db, KIMI, 2, 38);
  const off = await W.yieldDemoteEnv({ AUDIT_DB: db, MODEL_LADDER: LIVE.join(",") });
  ok(Array.isArray(off._demoted) && off._demoted.length === 1 && off._demoted[0] === KIMI, "yieldDemoteEnv demotes the measured rung", off._demoted);
  ok(JSON.stringify(W.ladder(off)) === JSON.stringify([GLM, OSS]), "the env it returns climbs glm then gpt-oss", W.ladder(off));
  const ev = db._db.prepare("SELECT text FROM cloud_ops_events WHERE kind = 'code-task.model-demoted'").all();
  ok(ev.length === 1 && /kimi-k2\.7-code 2\/40/.test(ev[0].text), "one code-task.model-demoted event names the yields", ev);
  await W.yieldDemoteEnv({ AUDIT_DB: db, MODEL_LADDER: LIVE.join(",") });
  ok(db._db.prepare("SELECT COUNT(*) c FROM cloud_ops_events WHERE kind = 'code-task.model-demoted'").get().c === 1, "an unchanged demotion writes no second event");
  db._db.prepare("INSERT INTO ops_config (key, value) VALUES ('code_model_demote', 'off')").run();
  const env2 = await W.yieldDemoteEnv({ AUDIT_DB: db, MODEL_LADDER: LIVE.join(",") });
  ok(!env2._demoted && W.ladder(env2).length === 3, "ops_config code_model_demote = off restores the full ladder", env2._demoted);
  ok((await W.yieldDemoteEnv({ MODEL_LADDER: LIVE.join(",") }))._demoted === undefined, "no AUDIT_DB: nothing is demoted");
}

// ---- PATCH-CAP-CHANGED-LINES-1 ----
{
  // qnfo-fleet-control's shape: a short VERSION line followed by a 32,888-char line; one small edit far away.
  const pre = Array.from({ length: 5 }, (_, i) => "// head " + i);
  const longLine = "// " + "n".repeat(32885);
  const mid = Array.from({ length: 400 }, (_, i) => "const k" + i + " = " + i + ";");
  const base = pre.concat(['var VERSION = "0.71.4";', longLine, "// " + "m".repeat(8000)], mid).join("\n") + "\n";
  const next = base.replace('var VERSION = "0.71.4";', 'var VERSION = "0.71.5-codeagent";').replace("const k200 = 200;", "const k200 = 201;");
  const patch = W.hunkPatch("a/worker.js", base, next) + W.hunkPatch("a/deployed-current.worker.js", base, next);
  ok(patch.length > W.MAX_PATCH_CHARS, "the fixture reproduces the artifact: the whole patch is over the old cap", patch.length);
  ok(W.patchChangeChars(patch) === 2 * ("-const k200 = 200;".length + "+const k200 = 201;".length), "only the changed lines count (the VERSION bump and the context do not)", W.patchChangeChars(patch));
  const big = base.replace(mid.join("\n"), mid.map((l) => l + " // " + "z".repeat(200)).join("\n"));
  const bigPatch = W.hunkPatch("a/worker.js", base, big) + W.hunkPatch("a/deployed-current.worker.js", base, big);
  ok(W.patchChangeChars(bigPatch) > W.MAX_PATCH_CHARS, "a genuinely large change still counts over the cap", W.patchChangeChars(bigPatch));
  const whole = W.wholeFilePatch("a/x.md", "a\nb\n", "a\nc\n");
  ok(W.patchChangeChars(whole) === 8, "a whole-file patch counts every removed and added line, not its headers", W.patchChangeChars(whole));
  const sql = W.hunkPatch("m.sql", "-- one\nSELECT 1;\n", "SELECT 1;\n");
  ok(W.patchChangeChars(sql) === "--- one".length, "a removed SQL comment line (--- in the patch) is a changed line, not a header", { n: W.patchChangeChars(sql), sql });
  ok(W.PATCH_HARD_MAX < 1500000, "the hard cap stays below the publisher's MAX_PATCH");
}

// ---- end to end: a small edit next to a long line reaches ready_to_publish ----
{
  const lines = Array.from({ length: 40 }, (_, i) => "line-" + i);
  lines.splice(21, 0, "context " + "q".repeat(90000));
  const base = lines.join("\n") + "\n";
  const files = { "docs/long-line.md": base };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const match = /^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(url));
    const file = match ? decodeURIComponent(match[1]) : null;
    return file && files[file] != null ? new Response(files[file], { status: 200 }) : new Response("nf", { status: 404 });
  };
  const replies = ["<<<<<<< SEARCH\nline-20\n=======\nline-20 edited\n>>>>>>> REPLACE"];
  const env = {
    ORCH_TOKEN: "test-token", AUDIT_DB: makeD1(), PR_PUBLISH_MODE: "pull",
    MODEL_LADDER: [OSS, GLM, KIMI].join(","),
    AI: { run: async () => ({ response: replies.shift() || "" }) },
  };
  const headers = { authorization: "Bearer test-token", "content-type": "application/json" };
  const call = async (method, endpoint, body) => (await worker.fetch(new Request("https://x" + endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env)).json();
  const task = await call("POST", "/v1/tasks", { repo: "qnfo-workers", path: "docs/long-line.md", goal: "edit line 20", anchor: "line-20" });
  ok(task.ok && task.id, "task enqueued", task);
  for (let i = 0; i < 6; i++) await call("POST", "/v1/tick", { maxSteps: 1, budgetMs: 25000, plan: false, intake: false });
  const row = env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(task.id);
  const ctx = JSON.parse(row.ctx || "{}");
  ok(row.status === "ready_to_publish" && String(ctx.patch || "").length > W.MAX_PATCH_CHARS && /\+line-20 edited/.test(ctx.patch || ""),
    "a one-line edit beside a 90k-char line publishes (was: patch too large)", { status: row.status, step: row.step, err: row.last_error, plen: String(ctx.patch || "").length });
  const health = await (await worker.fetch(new Request("https://x/health"), env)).json();
  ok(Array.isArray(health.ladder_demoted), "/health reports ladder_demoted", health.ladder_demoted);
  globalThis.fetch = origFetch;
}

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("yield-levers: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// AUTOAUDIT-DEAD-CALLERS-1 (agent_issues 2302) offline suite for qnfo-intent-orchestrator.
// Proves: the worker names no retired search worker; an activity intent is stored in the vector index and ends done with
// processed_at set; a store failure ends the intent failed with the error logged (never swallowed); GET /personal/search
// needs the bearer token, validates q and answers from the personal index; ids do not come from Math.random.
// Run: node qnfo-intent-orchestrator/activity-store.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + (e && e.message || e)); } };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion"); };

function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) || null,
    run: async () => { db.prepare(sql).run(...args); return { success: true }; }
  });
  return { prepare: (sql) => stmt(sql) };
}
function mkEnv(opts = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, source TEXT, device TEXT, type TEXT, domain TEXT, priority TEXT, summary TEXT, due TEXT, status TEXT, wbs_code TEXT, created_at TEXT, processed_at TEXT)");
  const upserts = { p: [], r: [] };
  const vec = new Array(768).fill(0.01);
  const index = (k) => ({
    upsert: async (rows) => { if (opts.upsertFails) throw new Error("vectorize down"); upserts[k].push(...rows); },
    query: async (v, o) => ({ matches: upserts[k].slice(0, o.topK).map((x) => ({ id: x.id, score: 0.9, metadata: x.metadata })) })
  });
  const env = { INTENT_TOKEN: "tok-test", D1: d1(db), AI: { run: async () => ({ data: [vec] }) }, VZ_P: index("p"), VZ_R: index("r") };
  return { env, db, upserts };
}
const post = (env, desire) => worker.fetch(new Request("https://x/intent", { method: "POST", headers: { Authorization: "Bearer tok-test", "Content-Type": "application/json" }, body: JSON.stringify({ desire }) }), env, { waitUntil() {} });

await t("worker.js names no retired search worker and no removed binding", async () => {
  ok(!/personal-life-search/.test(src), "retired worker named");
  ok(!/env\.PLS\b/.test(src), "removed binding used");
});
await t("VERSION is at least 1.4.0", async () => {
  const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(m && (Number(m[1]) > 1 || (Number(m[1]) === 1 && Number(m[2]) >= 4)), "version " + (m && m[0]));
});
await t("ids are not drawn from Math.random", async () => { ok(!/Math\.random\(\)/.test(src)); });
await t("an activity intent is stored and ends done with processed_at", async () => {
  const { env, db, upserts } = mkEnv();
  const r = await post(env, "I attended the family dinner at home on 2026-10-10");
  const j = await r.json();
  ok(r.status === 201 && j.type === "activity" && j.status === "done", JSON.stringify(j));
  const row = db.prepare("SELECT status, processed_at FROM intents WHERE id = ?").get(j.id);
  ok(row.status === "done" && row.processed_at, JSON.stringify(row));
  ok(upserts.p.length === 1 && upserts.p[0].id === "activity:" + j.id && upserts.p[0].metadata.doc === "activity" && upserts.p[0].metadata.date === "2026-10-10", JSON.stringify(upserts.p[0] && upserts.p[0].metadata));
});
await t("a store failure is recorded as failed and logged, not swallowed", async () => {
  const { env, db } = mkEnv({ upsertFails: true });
  const logged = [];
  const orig = console.error; console.error = (...a) => logged.push(a.join(" "));
  let j;
  try { j = await (await post(env, "I visited the museum this weekend")).json(); } finally { console.error = orig; }
  ok(j.status === "failed" && /vectorize down/.test(j.error), JSON.stringify(j));
  const row = db.prepare("SELECT status, processed_at FROM intents WHERE id = ?").get(j.id);
  ok(row.status === "failed" && row.processed_at, JSON.stringify(row));
  ok(logged.some((l) => /activity-store/.test(l) && /vectorize down/.test(l)), "no log line");
});
await t("GET /personal/search needs the token, validates q and answers from the personal index", async () => {
  const { env } = mkEnv();
  await post(env, "I attended the family dinner at home on 2026-10-10");
  const no = await worker.fetch(new Request("https://x/personal/search?q=dinner"), env, {});
  ok(no.status === 401, "status " + no.status);
  const h = { Authorization: "Bearer tok-test" };
  const bad = await worker.fetch(new Request("https://x/personal/search", { headers: h }), env, {});
  ok(bad.status === 400, "status " + bad.status);
  const r = await worker.fetch(new Request("https://x/personal/search?q=dinner&topK=3", { headers: h }), env, {});
  const j = await r.json();
  ok(r.status === 200 && j.count === 1 && /^activities\/2026-10-10\//.test(j.files[0].path) && j.files[0].bestScore === 0.9 && /family dinner/.test(j.files[0].snippet), JSON.stringify(j));
});

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);

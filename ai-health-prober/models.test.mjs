// PROBER-MODELS-1 offline suite: the four text models that writing loops depend on are probed, shared ids are probed once,
// and a healthy model is not re-probed inside the 9-hour interval. Run: node ai-health-prober/models.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ai_model_health (model_id TEXT PRIMARY KEY, status TEXT, ctx_override INTEGER, vision_override INTEGER, reasoning_override INTEGER, last_probe_ts INTEGER, last_latency_ms INTEGER, consecutive_failures INTEGER DEFAULT 0, updated_at TEXT, gateway_failures INTEGER DEFAULT 0)");
const prep = (sql0) => { const order = []; const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(Number(n) - 1); return "?"; }); let a = []; const st = { bind: (...x) => { a = order.length ? order.map((i) => (x[i] === undefined ? null : x[i])) : x; return st; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: /^\s*(SELECT|WITH|PRAGMA)/i.test(sql) ? db.prepare(sql).all(...a) : (db.prepare(sql).run(...a), []) }) }; return st; };
const seen = [];
const env = { AI: { run: async (id) => { seen.push(id); return { response: "p" }; } }, QNFO_AUDIT: { prepare: prep, batch: async (l) => { for (const s of l) await s.run(); return []; } } };
const run = async (q) => w.fetch(new Request("https://p.test/run" + (q || "?force=1"), { method: "POST" }), env, { waitUntil() {} });
const r1 = await run(); await r1.text();
const want = ["@cf/nvidia/nemotron-3-120b-a12b", "@cf/google/gemma-4-26b-a4b-it", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"];
for (const id of want) assert.ok(seen.includes(id), "probes " + id);
assert.equal(seen.filter((x) => x === "@cf/deepseek-ai/deepseek-v4-pro-0813").length, 1, "an id shared by two entries is probed once");
const rows = db.prepare("SELECT model_id, status FROM ai_model_health").all().map((x) => x.model_id);
for (const n of ["nemotron-3-120b-a12b", "gemma-4-26b-a4b-it", "qwen3-30b-a3b-fp8", "llama-3.3-70b-instruct-fp8-fast"]) assert.ok(rows.includes(n), "health row " + n);
const before = seen.length;
const r2 = await run("?x=1"); await r2.text();
assert.equal(seen.length, before, "healthy models are not re-probed inside the interval");
const unique = new Set(seen).size;
assert.ok(unique >= 13, "13 unique ids probed (" + unique + ")");
console.log("models.test.mjs ok");

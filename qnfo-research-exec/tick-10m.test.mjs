// TICK-10M-1 + RECLAIM-KEEP-STAGE-1 + IDEA-TO-PUBLISH-METRIC-1 (qnfo-research-exec 0.18.38, owner directive 2026-10-18:
// idea to publication < 100 h). Proves on node:sqlite: a stale reclaim keeps a resumable stage and sends a pre-draft row to
// ground (RESUME-DRAFT-1 at claim re-checks the draft in R2); a fresh claim is not reclaimed; the cron is */10; the metric
// helper exists and is called. Run: node qnfo-research-exec/tick-10m.test.mjs
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reclaimStaleResearching } from "./worker.js";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, claimed_at TEXT, attempt INTEGER DEFAULT 0, error TEXT, recover_count INTEGER DEFAULT 0, paper_slug TEXT, created_at TEXT, score REAL); CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);");
function stmt(sql) { let a = []; const o = { bind(...x) { a = x; return o; }, async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; }, async all() { return { results: db.prepare(sql).all(...a) }; } }; return o; }
const env = { QNFO_AUDIT: { prepare: stmt } };
const get = (id) => db.prepare("SELECT * FROM research_queue WHERE id=?").get(id);
const old = "2020-01-01T00:00:00Z";
db.prepare("INSERT INTO research_queue (id,status,stage,claimed_at) VALUES ('rv','researching','revise',?),('rw','researching','review',?),('gr','researching','ensemble',?),('fresh','researching','revise',?)").run(old, old, old, new Date().toISOString());
const r = await reclaimStaleResearching(env);
assert.equal(r.requeued, 3);
assert.equal(get("rv").stage, "revise", "a stale revise row keeps its stage");
assert.equal(get("rw").stage, "review", "a stale review row keeps its stage");
assert.equal(get("gr").stage, "ground", "a stale pre-draft row restarts at ground");
assert.equal(get("fresh").status, "researching", "a row with recent progress is not reclaimed");
assert.match(src, /_hasDraft = !!\(await env\.MIRROR\.head\("pipeline\/"/, "RESUME-DRAFT-1 re-checks the draft at claim");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
assert.match(toml, /crons = \["\*\/10 \* \* \* \*"\]/, "the cron is */10");
assert.equal((src.match(/async function ideaToPublishMetric\(env\)/g) || []).length, 1, "metric helper defined once");
assert.match(src, /await ideaToPublishMetric\(env\)/, "metric helper is called");
console.log("tick-10m: all assertions passed");

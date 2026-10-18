// IDEA-TO-PUBLISH-METRIC-1 + TICK-10M-1 (qnfo-research-exec 0.18.38, owner directive 2026-10-18: idea to publication < 100 h).
// Proves on node:sqlite: ideaToPublishMetric computes the median hours to publish over the last 7 days and writes
// metric_registry; a cron tick on the :00 minute runs it; the cron schedule is */10 (TICK-10M-1, 144/day ceiling).
// Run: node qnfo-research-exec/idea-to-publish-metric.test.mjs
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ideaToPublishMetric } from "./worker.js";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, status TEXT, published_at TEXT, created_at TEXT); CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, created_at TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);");
function stmt(sql) { let a = []; const o = { bind(...x) { a = x; return o; }, async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; }, async all() { return { results: db.prepare(sql).all(...a) }; } }; return o; }
const env = { QNFO_AUDIT: { prepare: stmt } };
// three published papers: 50h, 100h, 150h since idea created_at -> median 100.0
db.prepare("INSERT INTO idea_proposals (id, created_at) VALUES (1,'2026-10-14T00:00:00Z')").run();
db.prepare("INSERT INTO research_queue (id,source,source_id,status,published_at,created_at) VALUES ('a','proposal','1','published','2026-10-16T02:00:00Z','2026-10-14T00:00:00Z'),('b','proposal','1','published','2026-10-18T04:00:00Z','2026-10-14T00:00:00Z'),('c','proposal','1','published','2026-10-20T06:00:00Z','2026-10-14T00:00:00Z')").run();
const r = await ideaToPublishMetric(env);
assert.equal(r.n, 3, "three published papers counted");
assert.equal(r.p50, 100, "median hours = 100 (the 100h row)");
const reg = db.prepare("SELECT * FROM metric_registry WHERE metric='idea_to_publish_h_p50_7d'").get();
assert.ok(reg && reg.state === 'MEASURED', "metric_registry row written as MEASURED");
// an empty window returns { n: 0 } and writes nothing
db.prepare("DELETE FROM research_queue").run();
const empty = await ideaToPublishMetric(env);
assert.equal(empty.n, 0, "no published rows -> { n: 0 }");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
assert.match(toml, /crons = \["\*\/10 \* \* \* \*"\]/, "the cron is */10 (TICK-10M-1)");
assert.match(src, /if \(_sMin === 0\) \{\s*[\s\S]*?ideaToPublishMetric\(env\)/, "the :00 tick runs ideaToPublishMetric");
console.log("idea-to-publish-metric: all assertions passed");

// EXTERNAL-PROPERTIES-1 offline suite (q08-signal-engine 0.28.0, charter pillar: reach).
// Proves: mirrorPipeline copies finished runs (ok -> published, gate_failed -> rejected) of the last 7 days from engine_runs into
// qnfo-audit.content_external_items with property q08.org, only rows newer than the last mirrored id, in statements of at most 10 rows
// (80 bound values), removes rows older than 7 days, skips deferred, skipped and running rows, and never throws.
// Run: node q08-signal-engine/pipeline-mirror.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\n//" + Math.random()).toString("base64"));
const P = mod.__pipeline;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
function d1(db, log) {
  const stmt = (sql, args) => ({ sql, args, bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...(args || [])) || null, all: async () => ({ results: db.prepare(sql).all(...(args || [])) }), run: async () => { log && log.push({ sql, n: (args || []).length }); return db.prepare(sql).run(...(args || [])); } });
  return { prepare: (sql) => stmt(sql, []), batch: async (list) => { for (const s of list) await s.run(); return []; } };
}
const audit = new DatabaseSync(":memory:"), q08 = new DatabaseSync(":memory:");
audit.exec("CREATE TABLE content_external_items (property TEXT NOT NULL, flow TEXT NOT NULL, item_id TEXT NOT NULL, title TEXT, raw_status TEXT, stage TEXT NOT NULL, state TEXT NOT NULL, since TEXT NOT NULL, updated_at TEXT, PRIMARY KEY (property, item_id))");
q08.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), signals_scraped INTEGER, signals_scored INTEGER, piece_published INTEGER, top_signal TEXT, model TEXT, ms INTEGER, status TEXT, error TEXT)");
const at = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString().replace("T", " ").slice(0, 19);
const ins = q08.prepare("INSERT INTO engine_runs (ran_at, top_signal, status, error, piece_published) VALUES (?, ?, ?, ?, ?)");
ins.run(at(60 * 24 * 9), "hn:too old", "ok", null, 1);
for (let i = 0; i < 23; i++) ins.run(at(600 - i * 20), "arxiv:Paper " + i, i % 4 === 0 ? "ok" : "gate_failed", "accuracy: unsupported claim: x" + i, i % 4 === 0 ? 1 : 0);
ins.run(at(30), "q08-forecast:2026-10-14-a-forecast", "ok", null, 1);
ins.run(at(25), "", "deferred", "the essay waits", 0);
ins.run(at(5), "", "running", "run-id:x", 0);
audit.prepare("INSERT INTO content_external_items (property, flow, item_id, title, raw_status, stage, state, since) VALUES ('q08.org', 'essay', 'run-0', 'stale', 'x', 'rejected', 'rejected', ?)").run(new Date(Date.now() - 9 * 864e5).toISOString());
audit.prepare("INSERT INTO content_external_items (property, flow, item_id, title, raw_status, stage, state, since) VALUES ('papers.qnfo.org', 'research', 'keep', 't', 'x', 'published', 'done', ?)").run(new Date(Date.now() - 9 * 864e5).toISOString());
const log = [];
const env = { AUDIT: d1(audit, log), DB: d1(q08) };
let r = await P.mirrorPipeline(env);
const rows = audit.prepare("SELECT * FROM content_external_items WHERE property = 'q08.org' ORDER BY CAST(substr(item_id, 5) AS INTEGER)").all();
ok(r.ok === true && r.mirrored === 24 && rows.length === 24, "24 finished runs of the last 7 days are mirrored; the 9-day-old run, the deferred and the running rows are not", { r, n: rows.length });
ok(rows.filter((x) => x.stage === "published" && x.state === "done").length === 7 && rows.filter((x) => x.stage === "rejected" && x.state === "rejected").length === 17, "ok -> published/done, gate_failed -> rejected/rejected");
const fc = rows.find((x) => x.flow === "forecast");
ok(fc && fc.title === "2026-10-14-a-forecast" && /Z$/.test(fc.since) && rows.every((x) => /^arxiv:/.test(x.title) === false), "forecasts get their own flow; source prefixes are dropped from titles; since is ISO UTC", fc);
ok(/^gate_failed: accuracy: unsupported claim/.test(rows.find((x) => x.stage === "rejected").raw_status), "a rejection keeps its gate reason");
ok(log.filter((x) => /^INSERT OR REPLACE/.test(x.sql)).every((x) => x.n <= 80) && log.filter((x) => /^INSERT OR REPLACE/.test(x.sql)).length === 3, "three statements of at most 10 rows (80 bound values)", log.map((x) => x.n));
ok(!audit.prepare("SELECT 1 FROM content_external_items WHERE item_id = 'run-0'").get() && audit.prepare("SELECT 1 FROM content_external_items WHERE item_id = 'keep'").get(), "rows of this property older than 7 days are removed; other properties are untouched");
ins.run(at(1), "hn:New one", "ok", null, 1);
log.length = 0;
r = await P.mirrorPipeline(env);
ok(r.mirrored === 1 && audit.prepare("SELECT COUNT(*) n FROM content_external_items WHERE property = 'q08.org'").get().n === 25, "the next tick mirrors only the new run", r);
r = await P.mirrorPipeline({ AUDIT: { prepare: () => { throw new Error("d1 down"); } }, DB: d1(q08) });
ok(r.ok === false && /d1 down/.test(r.error), "a failure is returned and logged, never thrown", r);
ok(/async function q08Heartbeat\(env, ok\) \{\n  await mirrorPipeline\(env\);/.test(src), "every tick ends with the mirror (q08Heartbeat runs on both crons)");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] >= 28), "VERSION is at least 0.28.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

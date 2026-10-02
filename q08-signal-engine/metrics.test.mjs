// Q08-METRICS-1 offline suite (#1759): the real q08 fetch handler over in-memory SQLite. A human GET of /p/<slug> counts
// as human, a crawler or empty user agent as crawler, an unknown slug not at all; GET /api/metrics and /health carry the
// 7d aggregates that qnfo-fleet-control SURFACE-METRICS-1 reads into metric_registry. Run: node q08-signal-engine/metrics.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href); const w = mod.default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, reads INTEGER DEFAULT 0, sources_json TEXT, feedback_score REAL, signal_source TEXT, signal_id TEXT);
CREATE TABLE engine_runs (id INTEGER PRIMARY KEY, ran_at TEXT DEFAULT (datetime('now')), status TEXT, piece_published INTEGER DEFAULT 0, error TEXT, ms INTEGER, signals_scraped INTEGER, signals_scored INTEGER, top_signal TEXT, model TEXT);
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER NOT NULL DEFAULT 0, crawler INTEGER NOT NULL DEFAULT 0);
CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY, slug TEXT, signal TEXT, ip_key TEXT, created_at TEXT);
CREATE TABLE subscribers (email TEXT, status TEXT, token TEXT, created_at TEXT, confirmed_at TEXT);`);
const now = new Date().toISOString();
db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, published_at) VALUES ('p1','s1','T','body text here', ?)").run(now);
db.exec("INSERT INTO engine_runs (status, piece_published) VALUES ('ok',1),('gate_failed',0),('gate_failed',0),('running',0)");
db.prepare("INSERT INTO q08_feedback (slug, signal, created_at) VALUES ('s1','good','2026-10-01T00:00:00Z')").run();
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => db.prepare(sql).run(...a), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
const writes = [];
const audit = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => ({ n: 9000 }), run: async () => { if (/^UPDATE metric_registry/.test(sql)) { writes.push(a[0] + "=" + a[1]); return { meta: { changes: 1 } }; } return {}; }, all: async () => ({ results: [] }) }; return st; } };
const env = { DB: shim, AUDIT: audit };
const waits = []; const ctx = { waitUntil: (p) => waits.push(p) };
const get = async (path, ua) => w.fetch(new Request("https://q08.org" + path, { headers: ua ? { "user-agent": ua } : {} }), env, ctx);
let fails = 0; const check = (l, c, x) => { console.log((c ? "PASS " : "FAIL ") + l + (x !== undefined ? " -- " + JSON.stringify(x) : "")); if (!c) fails++; };
await get("/p/s1", "Mozilla/5.0 (Macintosh) Safari/605");
await get("/p/s1", "Googlebot/2.1");
await get("/p/s1", "");
await Promise.all(waits);
const r = db.prepare("SELECT * FROM q08_daily_reads").get();
check("one human and two crawler reads counted", r && r.human === 1 && r.crawler === 2, r);
const m = await (await get("/api/metrics")).json();
const d = m.windows["7d"];
check("/api/metrics 7d aggregates", d.published === 1 && d.finished_runs === 3 && d.gate_pass_rate === 0.333 && d.human_reads === 1 && d.crawler_reads === 2 && d.verified_votes === 0 && d.neurons === 9000 && d.neurons_per_published_piece === 9000 && d.confirmed_subscribers === 0, d);
const h = await (await get("/health")).json();
check("/health carries metrics_7d", h.metrics_7d && h.metrics_7d.human_reads === 1 && /^\d+\.\d+\.\d+/.test(h.version), { v: h.version });
const p404 = await get("/p/none", "Mozilla/5.0");
check("unknown piece is 404 and not counted", p404.status === 404 && db.prepare("SELECT human FROM q08_daily_reads").get().human === 1);
// The generation cron writes q08's own registry values afterwards (no network in this test: every fetch fails fast).
globalThis.fetch = async () => { throw new Error("offline test"); };
const cronWaits = [];
await w.scheduled({ cron: "0 */2 * * *" }, env, { waitUntil: (p) => cronWaits.push(p) });
await Promise.all(cronWaits);
check("after the generation cron, q08 writes its five registry values", writes.sort().join(",") === "q08_confirmed_subscribers=0,q08_gate_pass_rate_7d=0.333,q08_human_reads_7d=1,q08_neurons_per_published_piece_7d=9000,q08_verified_votes_7d=0", writes);
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);

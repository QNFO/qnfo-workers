// WORKERS-BEST-PRACTICES-1 offline suite (q08-signal-engine 0.11.13): the read-count write on GET /p/<slug> rides
// ctx.waitUntil (it was an un-awaited D1 call that the runtime may cancel once the response returns), a failed background
// write is logged as one structured line instead of being swallowed, the x-loop-token gate compares in constant time and
// still refuses near-miss tokens, and row ids no longer come from Math.random.
// Run: node q08-signal-engine/best-practices.test.mjs   -> prints "N passed, 0 failed"
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, "worker.js")).href); const w = mod.default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, reads INTEGER DEFAULT 0, sources_json TEXT, feedback_score REAL, signal_source_id TEXT);
CREATE TABLE q08_run_rate (ip_key TEXT, created_at TEXT);
CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), ms INTEGER, status TEXT, error TEXT);
CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT);
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER DEFAULT 0, crawler INTEGER DEFAULT 0);`);
db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, published_at) VALUES ('p1','s1','A Title','A body paragraph.', ?)").run(new Date().toISOString());
let failReadsWrite = false;
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
  run: async () => { if (failReadsWrite && /^UPDATE published_pieces SET reads/.test(sql)) throw new Error("d1 unavailable"); return db.prepare(sql).run(...a); },
  first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const mkCtx = () => { const pending = []; return { pending, waitUntil: (p) => { pending.push(Promise.resolve(p)); } }; };
const reads = () => db.prepare("SELECT reads FROM published_pieces WHERE slug='s1'").get().reads;
const daily = () => { const r = db.prepare("SELECT COALESCE(SUM(human),0)+COALESCE(SUM(crawler),0) n FROM q08_daily_reads").get(); return r ? r.n : 0; };

// 1. the read counter is scheduled on ctx.waitUntil and lands once the background work settles
let ctx = mkCtx();
let r = await w.fetch(new Request("https://q08.org/p/s1", { headers: { "cf-connecting-ip": "9.9.9.9" } }), { DB: shim }, ctx);
ok(r.status === 200, "GET /p/s1 answers 200 (got " + r.status + ")");
ok(ctx.pending.length >= 2, "the reads write and the daily counter are both handed to ctx.waitUntil (got " + ctx.pending.length + ")");
await Promise.all(ctx.pending);
ok(reads() === 1, "published_pieces.reads is 1 after the background work settles (got " + reads() + ")");
ok(daily() === 1, "q08_daily_reads counts the read once (got " + daily() + ")");

// 2. a failing background write is logged as one structured line, the page still renders, and nothing rejects
failReadsWrite = true;
const logged = []; const origErr = console.error; console.error = (...a) => { logged.push(a.join(" ")); };
ctx = mkCtx();
r = await w.fetch(new Request("https://q08.org/p/s1", { headers: { "cf-connecting-ip": "9.9.9.9" } }), { DB: shim }, ctx);
let settled = true; try { await Promise.all(ctx.pending); } catch (e) { settled = false; }
console.error = origErr; failReadsWrite = false;
ok(r.status === 200, "the page still renders when the counter write fails (got " + r.status + ")");
ok(settled, "a failed background write does not reject the waitUntil promise");
const line = logged.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).find((x) => x && x.evt === "reads_increment_failed");
ok(!!line && line.slug === "s1" && /d1 unavailable/.test(line.err), "the failure is logged as {evt:reads_increment_failed, slug, err}");
ok(reads() === 1, "a failed write leaves reads unchanged (got " + reads() + ")");

// 3. the x-loop-token gate: constant-time compare still refuses near misses and accepts the exact token
const keyed = { DB: shim, LOOP_TOKEN: "correct-horse-battery" };
const post = (headers) => w.fetch(new Request("https://q08.org/regen", { method: "POST", headers: Object.assign({ "cf-connecting-ip": "9.9.9.9" }, headers || {}) }), keyed, mkCtx());
ok((await post({ "x-loop-token": "correct-horse-battery" })).status === 400, "the exact token passes the gate (no slug -> 400)");
ok((await post({ "x-loop-token": "correct-horse-batterz" })).status === 401, "a token differing in the last character answers 401");
ok((await post({ "x-loop-token": "correct-horse-batter" })).status === 401, "a prefix of the token answers 401");
ok((await post({ "x-loop-token": "correct-horse-battery-extra" })).status === 401, "a longer token answers 401");
ok((await post({ "x-loop-token": "" })).status === 401, "an empty token answers 401");
ok((await post({})).status === 401, "a missing header answers 401");

// 4. ids come from crypto, not Math.random
const src = readFileSync(join(here, "worker.js"), "utf8");
ok(!/Math\.random\(\)\.toString\(36\)/.test(src), "no row id or slug salt is built from Math.random().toString(36)");
ok(/crypto\.getRandomValues\(new Uint8Array\(n \* 2\)\)/.test(src) && /< 252/.test(src), "rnd36 draws from crypto.getRandomValues with rejection sampling (no modulo bias)");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

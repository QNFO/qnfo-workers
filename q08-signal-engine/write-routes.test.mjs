// Q08-WRITE-ROUTES-TOKEN-1 offline suite (q08-signal-engine 0.8.6, agent_issues 1995): POST /run and POST /regen spend
// model calls (and /regen rewrites a published essay without the cross-family panel), so both need x-loop-token; without
// LOOP_TOKEN on the worker they answer 401; reads stay open.
// Run: node q08-signal-engine/write-routes.test.mjs   -> prints "N passed, 0 failed"
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href); const w = mod.default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, reads INTEGER DEFAULT 0, sources_json TEXT, feedback_score REAL, signal_source_id TEXT);
CREATE TABLE q08_run_rate (ip_key TEXT, created_at TEXT);
CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), ms INTEGER, status TEXT, error TEXT);`);
db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, published_at) VALUES ('p1','s1','Original Title','original body', ?)").run(new Date().toISOString());
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => db.prepare(sql).run(...a), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
const ctx = { waitUntil: () => {} };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const post = (path, env, headers) => w.fetch(new Request("https://q08.org" + path, { method: "POST", headers: Object.assign({ "cf-connecting-ip": "9.9.9.9" }, headers || {}) }), env, ctx);

const open = { DB: shim };
let r = await post("/regen?slug=s1", open);
ok(r.status === 401, "/regen without LOOP_TOKEN on the worker answers 401 (got " + r.status + ")");
r = await post("/run", open);
ok(r.status === 401, "/run without LOOP_TOKEN on the worker answers 401 (got " + r.status + ")");
ok(db.prepare("SELECT body_md FROM published_pieces WHERE slug='s1'").get().body_md === "original body", "the published essay is unchanged");
ok(db.prepare("SELECT COUNT(*) n FROM q08_run_rate").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM engine_runs").get().n === 0, "a refused call writes nothing and starts no run");

const keyed = { DB: shim, LOOP_TOKEN: "t0k" };
r = await post("/regen?slug=s1", keyed, { "x-loop-token": "wrong" });
ok(r.status === 401, "a wrong x-loop-token answers 401 (got " + r.status + ")");
r = await post("/regen", keyed, { "x-loop-token": "t0k" });
ok(r.status === 400, "the right token passes the gate (no slug -> 400, got " + r.status + ")");
const body = await (await post("/run", keyed)).json();
ok(/x-loop-token/.test(body.error || ""), "the refusal says what is needed");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

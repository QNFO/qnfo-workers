// IDEAS-CAP-GENERATED-RELEASE-1 (1.11.1) offline suite, updated for IDEAS-CAP-RATE-1 (1.12.0). Runs the worker's own triageProposals in
// a vm against in-memory SQLite.
// Proves the room path: with two slots under the cap, the held rows are re-queued oldest first, only as many as fit, with the cap note
// stripped and no trickle counted; at the cap the remaining held row is admitted by the trickle (1.11.1 released nothing there, which
// left 80 rows held with no expiry; idea-hub/cap-trickle.test.mjs covers the rate itself); with nothing held nothing is released.
// Run: node idea-hub/cap-release.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {");
const sb = { console: { log() {}, error() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { triageProposals, RESEARCH_ADMISSION_CAP };", sb);
const api = sb.__x;
const db = new DatabaseSync(":memory:");
const shim = (db) => ({ prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) ?? null; }, async run() { const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } });
db.exec(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, created_at TEXT, UNIQUE(source, source_id));
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE ai_cache_counters (day TEXT, worker TEXT, model TEXT, calls INTEGER DEFAULT 0, cached_calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, cached_tok INTEGER DEFAULT 0, PRIMARY KEY (day, worker, model));`);
const env = { QNFO_AUDIT: shim(db), AI: { async run() { return { response: "{}" }; } } };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const CAP = api.RESEARCH_ADMISSION_CAP;
const fill = db.prepare("INSERT INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) VALUES (?, 'seed', ?, 'x', '', 0.5, 'ACCEPT', 'queued', datetime('now'))");
for (let i = 0; i < CAP - 2; i++) fill.run("seed-" + i, "seed-" + i);
const hold = db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at, decision, score, rationale) VALUES ('auto-scan', ?, 'triaged_hold', ?, 'ACCEPT', 0.8, ?)");
hold.run("held A oldest", "2026-10-17T10:00:00Z", "[research admission cap 130/120] good idea A");
hold.run("held B", "2026-10-17T11:00:00Z", "[research admission cap 131/120] good idea B");
hold.run("held C newest", "2026-10-18T11:00:00Z", "[research admission cap 132/120] good idea C");
db.prepare("INSERT INTO idea_proposals (name, idea, status, created_at, decision, rationale) VALUES ('x', 'a real hold', 'triaged_hold', '2026-10-16T00:00:00Z', 'HOLD', 'noise/question filter')").run();
const st = (idea) => db.prepare("SELECT status, rationale FROM idea_proposals WHERE idea = ?").get(idea);
const queued = (idea) => !!db.prepare("SELECT 1 FROM research_queue WHERE idea = ?").get(idea);
let out = await api.triageProposals(env);
ok(out.cap_released === 2 && out.cap_trickled === 0, "two slots under the cap release two rows by room, not by trickle", [out.cap_released, out.cap_trickled]);
ok(st("held A oldest").status === "triaged_accepted" && st("held B").status === "triaged_accepted" && st("held C newest").status === "triaged_hold", "oldest first", [st("held A oldest"), st("held C newest")]);
ok(st("held A oldest").rationale === "good idea A", "the cap note is stripped", st("held A oldest").rationale);
ok(queued("held A oldest") && queued("held B") && !queued("held C newest"), "released rows are in research_queue");
ok(st("a real hold").status === "triaged_hold", "a hold for another reason is untouched");
const n = db.prepare("SELECT COUNT(*) AS n FROM research_queue WHERE status IN ('queued','researching','review','deferred')").get().n;
ok(n === CAP, "the queue is filled exactly to the cap", n);
out = await api.triageProposals(env);
ok(out.cap_released === 1 && out.cap_trickled === 1 && st("held C newest").status === "triaged_accepted" && queued("held C newest"), "at the cap the trickle admits the last held row (1.11.1 released nothing here)", [out.cap_released, out.cap_trickled]);
out = await api.triageProposals(env);
ok(out.cap_released === 0 && out.cap_trickled === 0, "nothing held, nothing released");
ok(st("a real hold").status === "triaged_hold", "a hold for another reason is still untouched");
console.log(`cap-release: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

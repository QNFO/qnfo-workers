// BP26-AI-LABEL-1 offline suite (q08-signal-engine 0.37.0): every piece page carries a visible "AI-generated" label linked to the
// method note and JSON-LD creditText (EU AI Act Art. 50(4)); HTML responses carry the secure-headers baseline.
// The real fetch handler over in-memory SQLite. Run: node q08-signal-engine/ai-label.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, sources_json TEXT, reads INTEGER DEFAULT 0, feedback_score REAL, kind TEXT DEFAULT 'analysis');
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER NOT NULL DEFAULT 0, crawler INTEGER NOT NULL DEFAULT 0);
CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY, slug TEXT, signal TEXT, ip_key TEXT, note TEXT, created_at TEXT);
CREATE TABLE subscribers (email TEXT, status TEXT, token TEXT, created_at TEXT, confirmed_at TEXT);
CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT);
CREATE TABLE q08_audits (slug TEXT PRIMARY KEY, verdict TEXT, stage TEXT, models TEXT, unsupported_json TEXT, checked_at TEXT);`);
db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, core_concept, published_at) VALUES (?,?,?,?,?,?)")
  .run("a", "2026-10-26-one", "A plain title for the label test", "First paragraph of a piece.\n\nSecond paragraph.", "mechanism", "2026-10-26T07:00:00Z");
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { try { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } catch (e) { return { meta: { changes: 0 } }; } }, first: async () => { try { return db.prepare(sql).get(...a) || null; } catch (e) { return null; } }, all: async () => { try { return { results: db.prepare(sql).all(...a) }; } catch (e) { return { results: [] }; } } }; return st; } };
const env = { DB: shim };
const ctx = { waitUntil() {} };
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const r = await w.fetch(new Request("https://q08.org/p/2026-10-26-one"), env, ctx);
const t = await r.text();
ok(r.status === 200, "piece 200", r.status);
ok(/<p class="q-meta"[^>]*>[\s\S]*?<a class="q-badge" href="https:\/\/q08\.org\/p\/2026-10-26-how-q08-researches-writes-and-scores-its-forecasts-m3th0d"[^>]*>AI-generated<\/a><\/p>/.test(t), "visible AI-generated label in the meta line, linked to the method note", t.match(/<p class="q-meta"[^\n]{0,600}/));
ok(/"creditText":"Researched and written by AI;[^"]*No human reviews pieces before they appear\./.test(t), "JSON-LD creditText states AI generation and the absence of human review", t.match(/"creditText":"[^"]*"/));
ok(r.headers.get("X-Content-Type-Options") === "nosniff", "nosniff header", r.headers.get("X-Content-Type-Options"));
ok(/max-age=31536000/.test(r.headers.get("Strict-Transport-Security") || ""), "HSTS header", r.headers.get("Strict-Transport-Security"));
ok(r.headers.get("X-Frame-Options") === "SAMEORIGIN", "frame protection header", r.headers.get("X-Frame-Options"));
ok(r.headers.get("Referrer-Policy") === "strict-origin-when-cross-origin", "existing referrer policy kept");
console.log(`ai-label: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

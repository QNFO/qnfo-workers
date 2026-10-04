// Q08-NOTE-1 offline suite: POST /api/f stores a sanitized optional note, a vote without a note still works, a second
// vote from the same visitor is refused, and the verdict form carries the note field.
// Run: node q08-signal-engine/note.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href); const w = mod.default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, reads INTEGER DEFAULT 0, sources_json TEXT, feedback_score REAL, signal_source TEXT, signal_id TEXT);
CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, signal TEXT NOT NULL, ip_key TEXT, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER NOT NULL DEFAULT 0, crawler INTEGER NOT NULL DEFAULT 0);`);
db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, published_at) VALUES ('p1','s1','T','body text here', ?)").run(new Date().toISOString());
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => db.prepare(sql).run(...a), first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
const env = { DB: shim };
const ctx = { waitUntil: () => {} };
const UA = "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0";
function vote(slug, s, ip, note) {
  const body = new URLSearchParams(note == null ? {} : { note });
  return w.fetch(new Request("https://q08.org/api/f?slug=" + slug + "&s=" + s, { method: "POST", headers: { "user-agent": UA, "cf-connecting-ip": ip, "content-type": "application/x-www-form-urlencoded" }, body }), env, ctx).then((r) => r.json());
}
const a = await vote("s1", "flat", "1.1.1.1", "  too   shallow <b>x</b> see https://evil.test/a?b=1\n");
assert.equal(a.ok, true); assert.equal(a.note_stored, true);
const b = await vote("s1", "no", "2.2.2.2", null);
assert.equal(b.ok, true); assert.equal(b.note_stored, false);
const c = await vote("s1", "good", "1.1.1.1", "second try");
assert.equal(c.updated, false);
const rows = db.prepare("SELECT signal, note FROM q08_feedback ORDER BY id").all();
assert.equal(rows.length, 2);
assert.equal(rows[0].note, "too shallow b x /b see [link]");
assert.equal(rows[1].note, null);
const long = await vote("s1", "good", "3.3.3.3", "a".repeat(500));
assert.equal(long.ok, true);
assert.equal(db.prepare("SELECT note FROM q08_feedback WHERE id = 3").get().note.length, 280);
const page = await (await w.fetch(new Request("https://q08.org/p/s1", { headers: { "user-agent": UA } }), env, ctx)).text();
assert.ok(/<textarea[^>]*name="note"[^>]*maxlength="280"/.test(page), "verdict form carries the note field");
console.log("note.test.mjs ok");

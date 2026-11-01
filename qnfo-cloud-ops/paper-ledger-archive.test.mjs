// PAPER-LEDGER-ARCHIVE-1 (qnfo-cloud-ops 1.38.0, 2026-10-26, charter pillar research) offline suite. Run: node qnfo-cloud-ops/paper-ledger-archive.test.mjs   -> prints "N passed, 0 failed"
// living-paper keeps the full prior body of every paper revision in paper_change_bodies (about 50 KB each). A stored body may leave the database only after paper_change_body_archive holds an
// off-database copy of the same size (a trigger enforces it), and nothing wrote those copies. Now the hourly quality sweep copies the oldest bodies to the RELEASES bucket once the table exceeds its
// limit, verifies each object by SHA-256 read-back, inserts the proof and deletes the stored body in one atomic batch; paperLedgerBody() reads a body from either place. This suite runs the real
// functions against the real ledger migration in SQLite and a fake R2 bucket.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const ledgerSql = readFileSync(new URL("../migrations/living-paper/2026-10-26-paper-change-ledger.sql", import.meta.url), "utf8");
const provenanceSql = readFileSync(new URL("../migrations/2026-11-01-paper-provenance-metadata.sql", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { paperLedgerArchiveStep as __step, paperLedgerBody as __body, paperLedgerFingerprint as __fp, VERSION as __version };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 900) : "")); } };

function d1(dbx) {
  const stmt = (sql) => { let args = []; const self = { sql, bind(...a) { args = a; return self; }, exec() { return dbx.prepare(sql).run(...args); },
    async all() { return { results: dbx.prepare(sql).all(...args) }; }, async first() { return dbx.prepare(sql).get(...args) || null; }, async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return self; };
  return { prepare: stmt, async batch(stmts) { dbx.exec("BEGIN"); try { for (const s of stmts) s.exec(); dbx.exec("COMMIT"); } catch (e) { dbx.exec("ROLLBACK"); throw e; } return stmts.map(() => ({ success: true })); } };
}
function r2(opts = {}) {
  const store = new Map();
  return { store, async put(key, body) { if (opts.putFails) throw new Error("R2 put refused"); store.set(key, String(body)); },
    async get(key) { if (!store.has(key)) return null; const t = opts.corrupt ? store.get(key) + "x" : store.get(key); return { async text() { return t; } }; } };
}
function mkLiving(bodies) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, title TEXT DEFAULT '', authors TEXT DEFAULT '[]', abstract TEXT, doi TEXT, version TEXT DEFAULT '1.0.0', subtitle TEXT, license TEXT, keywords TEXT, journal TEXT, paper_type TEXT, zenodo_doi TEXT, categories TEXT, "references" TEXT,
    slug TEXT, status TEXT, body_md TEXT, updated_at TEXT, release_gate_pass INTEGER DEFAULT 0, release_gate_at TEXT, release_gate_reason TEXT);
    CREATE TABLE paper_body_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, status TEXT, title TEXT, body_md TEXT NOT NULL, captured_at TEXT NOT NULL, reason TEXT);
    CREATE TABLE publication_gate_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, run_at TEXT DEFAULT (datetime('now')), slug TEXT, status TEXT, mode TEXT, decision TEXT, reason TEXT, score INTEGER, quality_flag TEXT, body_len INTEGER, has_abstract INTEGER, refs INTEGER, gate_version TEXT);`);
  db.exec(ledgerSql);
  db.exec(provenanceSql);
  db.prepare("INSERT INTO papers (identifier, slug, status, body_md) VALUES ('p1', 'one', 'published', ?)").run(bodies[0]);
  // each body edit writes a ledger row and keeps the prior body: edit i stores body i-1, so the last body written stays only in papers
  bodies.slice(1).forEach((b, i) => { db.prepare("UPDATE papers SET body_md = ?, change_actor = ?, change_reason = ? WHERE slug = 'one'").run(b, "test:edit:" + (i + 1), "edit " + (i + 1)); });
  return db;
}
const mk = (n, ch = "a") => Array.from({ length: n }, (_, i) => "# Revision " + i + "\n\n" + ch.repeat(600) + "\n");
const stored = (db) => db.prepare("SELECT COUNT(*) n, COALESCE(SUM(length(CAST(body_md AS BLOB))), 0) b FROM paper_change_bodies").get();

{ // under the limit: the step measures and archives nothing
  const db = mkLiving(mk(8)); const bucket = r2();
  const before = stored(db);
  const r = await mod.__step({ LIVING: d1(db), RELEASES: bucket }, { limitBytes: 1e9 });
  ok(r.status === "ok" && r.notes.archived === 0 && r.notes.stored_n === before.n && r.notes.stored_bytes === before.b, "under the limit it only measures", r);
  ok(bucket.store.size === 0 && stored(db).n === before.n, "nothing is copied or deleted under the limit");
}
{ // over the limit: the oldest bodies are archived, verified, deleted; the ledger rows stay; every body is recoverable
  const bodies = mk(12); const db = mkLiving(bodies); const bucket = r2();
  const before = stored(db); const ledgerBefore = db.prepare("SELECT COUNT(*) n FROM paper_change_ledger").get().n;
  const limit = Math.floor(before.b / 2);
  const r = await mod.__step({ LIVING: d1(db), RELEASES: bucket }, { limitBytes: limit, batch: 50 });
  const after = stored(db);
  ok(r.status === "ok" && r.notes.archived > 0 && r.notes.verify_failed === 0 && r.notes.errors === 0, "over the limit it archives without errors", r);
  ok(after.b <= limit + 700, "the stored bodies come down to the limit (within one body)", { before, after, limit });
  ok(bucket.store.size === r.notes.archived && db.prepare("SELECT COUNT(*) n FROM paper_change_body_archive").get().n === r.notes.archived, "one object and one proof for each archived body");
  ok(db.prepare("SELECT COUNT(*) n FROM paper_change_ledger").get().n === ledgerBefore, "no ledger row is removed");
  const oldest = db.prepare("SELECT seq, r2_key, bytes, fingerprint FROM paper_change_body_archive ORDER BY seq LIMIT 1").get();
  ok(oldest && /^paper-ledger\/\d+\.md$/.test(oldest.r2_key) && /^sha256:[0-9a-f]{64}$/.test(oldest.fingerprint), "the proof names the object and a sha256 fingerprint", oldest);
  const minStored = db.prepare("SELECT MIN(seq) s FROM paper_change_bodies").get().s;
  ok(oldest.seq < minStored, "the oldest bodies went first", { archivedFirst: oldest.seq, oldestKept: minStored });
  // restore: from the bucket for an archived body, from the database for a kept one, matching the original text
  const rb = await mod.__body({ LIVING: d1(db), RELEASES: bucket }, oldest.seq);
  ok(rb && rb.source === "r2" && rb.body.startsWith("# Revision") && (await mod.__fp(rb.body)) === oldest.fingerprint, "an archived body is restored from R2 and matches its fingerprint", rb && { source: rb.source, head: rb.body.slice(0, 20) });
  const kept = await mod.__body({ LIVING: d1(db), RELEASES: bucket }, minStored);
  ok(kept && kept.source === "d1", "a kept body is read from the database");
  ok((await mod.__body({ LIVING: d1(db), RELEASES: bucket }, 99999999)) === null, "an unknown seq answers null");
  // a second run with nothing over the limit changes nothing
  const r2nd = await mod.__step({ LIVING: d1(db), RELEASES: bucket }, { limitBytes: limit + 5000, batch: 50 });
  ok(r2nd.notes.archived === 0, "a second run under the limit archives nothing", r2nd.notes);
}
{ // multi-byte text: the proof stores SQLite length(), which is what the delete trigger compares
  const db = mkLiving(["# 多字节 ✓ " + "é".repeat(400) + " 😀".repeat(50) + "\n", "second " + "b".repeat(300)]); const bucket = r2();
  const r = await mod.__step({ LIVING: d1(db), RELEASES: bucket }, { limitBytes: 10, batch: 10 });
  ok(r.status === "ok" && r.notes.archived >= 1 && r.notes.errors === 0, "bodies with accents, CJK and emoji archive cleanly", r);
  const a = db.prepare("SELECT seq, bytes FROM paper_change_body_archive ORDER BY seq LIMIT 1").get();
  const back = await mod.__body({ LIVING: d1(db), RELEASES: bucket }, a.seq);
  ok(back && back.body.includes("😀") && back.body.includes("多字节"), "the multi-byte text comes back unchanged", back && back.body.slice(0, 30));
  ok(back && back.body.length >= a.bytes, "bytes in the proof is the character count the trigger compares");
}
{ // a read-back that does not match keeps the body
  const db = mkLiving(mk(6)); const bucket = r2({ corrupt: true });
  const before = stored(db);
  const r = await mod.__step({ LIVING: d1(db), RELEASES: bucket }, { limitBytes: 100, batch: 10 });
  ok(r.status === "degraded" && r.notes.verify_failed > 0 && r.notes.archived === 0 && /read-back/.test(r.reason), "a mismatching read-back degrades the run and archives nothing", r);
  ok(stored(db).n === before.n && db.prepare("SELECT COUNT(*) n FROM paper_change_body_archive").get().n === 0, "no body is deleted and no proof is written");
}
{ // an R2 write that fails keeps the body
  const db = mkLiving(mk(6)); const before = stored(db);
  const r = await mod.__step({ LIVING: d1(db), RELEASES: r2({ putFails: true }) }, { limitBytes: 100, batch: 10 });
  ok(r.status === "degraded" && r.notes.errors > 0 && stored(db).n === before.n, "a failing R2 put keeps every body and degrades the run", r);
}
{ // no bucket bound while over the limit
  const db = mkLiving(mk(6)); const before = stored(db);
  const r = await mod.__step({ LIVING: d1(db) }, { limitBytes: 100 });
  ok(r.status === "degraded" && /RELEASES bucket is not bound/.test(r.reason) && stored(db).n === before.n, "without the bucket it says so and deletes nothing", r);
  const under = await mod.__step({ LIVING: d1(db) }, { limitBytes: 1e12 });
  ok(under.status === "ok", "without the bucket but under the limit it is ok", under);
}
{ // no ledger installed; no database
  const bare = new DatabaseSync(":memory:");
  const r = await mod.__step({ LIVING: d1(bare), RELEASES: r2() }, { limitBytes: 1 });
  ok(r.status === "skipped" && /not installed/.test(r.reason), "a database without the ledger is skipped, not an error", r);
  ok((await mod.__step({}, {})).status === "skipped", "no LIVING binding is skipped");
}
{ // the database refuses to lose a body that has no proof
  const db = mkLiving(mk(3));
  let err = ""; try { db.prepare("DELETE FROM paper_change_bodies WHERE seq = (SELECT MIN(seq) FROM paper_change_bodies)").run(); } catch (e) { err = String(e.message); }
  ok(/off-database copy of the same size/.test(err), "deleting a stored body without an archive proof is refused by the trigger", err);
  let err2 = ""; db.prepare("INSERT INTO paper_change_body_archive (seq, r2_key, bytes, fingerprint) VALUES (999, 'k', 1, 'f')").run();
  try { db.prepare("DELETE FROM paper_change_body_archive WHERE seq = 999").run(); } catch (e) { err2 = String(e.message); }
  ok(/append-only/.test(err2), "an archive proof cannot be deleted", err2);
}
// wiring
ok(/paperLedgerArchiveStep\(env\)/.test(src) && /notes\.ledger_archive = arch\.notes/.test(src) && /arch\.status !== "skipped"/.test(src), "the quality sweep calls the step in its own try and records the notes");
ok(/\[\[r2_buckets\]\]\s*\nbinding = "RELEASES"\s*\nbucket_name = "qnfo-releases"/.test(toml), "wrangler.toml binds RELEASES to qnfo-releases");
ok(mirror === src, "the deployed-current mirror is identical to worker.js");
const [maj, min] = String(mod.__version).split(/[.-]/).map(Number);
ok(maj > 1 || (maj === 1 && min >= 38), "VERSION is at least 1.38 (minor bump: a new capability)", mod.__version);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

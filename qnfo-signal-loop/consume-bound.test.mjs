// IDEA-CHAIN-SINGLE-PRODUCER-1 offline suite (qnfo-signal-loop 1.1.4). Drives the real /run/consume handler against an
// in-memory SQLite D1. Proves: the L8 consume leg never takes the count of new idea_proposals above 30 (the "Idea intake
// -> triage" chain ceiling): over it, or at it, it pauses and writes nothing, and just under it it writes only what fits; under the ceiling it proposes at most 2 signals x 3 questions a run (it wrote
// every question of up to 25 signals before: 55 rows in one run on 2026-10-02); each consumed signal records how many of
// its questions were proposed; signal_worker_boundary permitted=0 still stops it; commit=0 stays a dry run.
// Run: node qnfo-signal-loop/consume-bound.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

function mk({ pendingNew = 0, signals = 6, questions = 15, permitted = 1 } = {}) {
  const db = new DatabaseSync(":memory:");
  // Same columns as the live qnfo-audit tables (sqlite_master, 2026-10-02).
  db.exec(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT DEFAULT (datetime('now')), decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);`);
  const ins = db.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('auto-scan', ?, '', 'new', 'x', '2026-10-02T08:00:00Z')");
  for (let i = 0; i < pendingNew; i++) ins.run("pending idea " + i);
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const env = { QNFO_AUDIT: { prepare: prep }, LIVING_PAPER: { prepare: prep } };
  return { env, db, async seed() {
    await worker.fetch(new Request("https://x/health"), env); // ensureSchema creates signals + signal_worker_boundary
    db.prepare("INSERT INTO signal_worker_boundary (worker, source, permitted) VALUES ('qnfo-signal-loop', 'artifact_reentry', ?)").run(permitted);
    const s = db.prepare("INSERT INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES (?, ?, 'artifact_reentry', ?, 't', ?, 0.9, 'research', 'new', ?)");
    for (let i = 0; i < signals; i++) {
      const oq = Array.from({ length: questions }, (_, j) => "Open question " + j + " of paper " + i + " remains to be settled?");
      s.run("artifact_reentry:p" + i, "2026-10-02T09:00:0" + i + "Z", "10.5281/zenodo." + i, JSON.stringify(oq), "2026-10-02T09:00:0" + i + "Z");
    }
  } };
}
const consume = async (env, commit) => (await worker.fetch(new Request("https://qnfo-signal-loop.q08.workers.dev/run/consume" + (commit ? "?commit=1" : "")), env)).json();
const count = (db, sql) => Number(db.prepare(sql).get().n);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// A. over the chain ceiling: pause, write nothing, consume no signal
{
  const t = mk({ pendingNew: 71 });
  await t.seed();
  const r = await consume(t.env, true);
  ok(typeof r.paused === "string" && /71 new idea_proposals, ceiling 30/.test(r.paused), "A1 pauses above 30 new and says why");
  ok(r.proposals === 0 && count(t.db, "SELECT COUNT(*) n FROM idea_proposals WHERE name='auto-reentry'") === 0, "A2 writes no proposal while paused");
  ok(count(t.db, "SELECT COUNT(*) n FROM signals WHERE status='consumed'") === 0, "A3 consumes no signal while paused");
}
// B. the ceiling is a level: at 30 new it pauses; at 28 it writes only the 2 that fit
{
  const t = mk({ pendingNew: 30 });
  await t.seed();
  const r = await consume(t.env, true);
  ok(typeof r.paused === "string" && r.proposals === 0, "B1 at 30 new it pauses (a batch would step over the ceiling)");
  const u = mk({ pendingNew: 28 });
  await u.seed();
  const r2 = await consume(u.env, true);
  ok(!r2.paused && r2.proposals === 2 && count(u.db, "SELECT COUNT(*) n FROM idea_proposals WHERE status='new'") === 30, "B2 at 28 new it writes 2 and stops at 30");
  ok(count(u.db, "SELECT COUNT(*) n FROM signals WHERE status='consumed'") === 1, "B3 only the signal it proposed from is consumed");
}
// C. under the ceiling: at most 2 signals x 3 questions a run, the rest left for later runs
{
  const t = mk({ pendingNew: 0, signals: 25, questions: 15 });
  await t.seed();
  const r = await consume(t.env, true);
  ok(r.candidate === 2 && r.consumed === 2, "C1 reads at most 2 signals a run (was 25)");
  ok(r.proposals === 6 && count(t.db, "SELECT COUNT(*) n FROM idea_proposals WHERE name='auto-reentry' AND status='new'") === 6, "C2 proposes at most 6 questions a run (was every question: up to 375)");
  ok(count(t.db, "SELECT COUNT(*) n FROM signals WHERE status='new'") === 23, "C3 the other 23 signals stay new for later runs");
  const d = t.db.prepare("SELECT decision FROM signals WHERE status='consumed' ORDER BY id LIMIT 1").get();
  ok(d && /qnfo-signal-loop 1\.1\.4[^:]*: 3 of 15 open questions proposed/.test(d.decision), "C4 a consumed signal records how many of its questions were proposed");
  const r2 = await consume(t.env, true);
  ok(r2.proposals === 6 && count(t.db, "SELECT COUNT(*) n FROM idea_proposals WHERE name='auto-reentry'") === 12, "C5 the next run takes the next 2 signals");
}
// D. the boundary row still gates the leg
{
  const t = mk({ pendingNew: 0, permitted: 0 });
  await t.seed();
  const r = await consume(t.env, true);
  ok(r.proposals === 0 && r.skipped_boundary === 2 && count(t.db, "SELECT COUNT(*) n FROM idea_proposals") === 0, "D1 signal_worker_boundary permitted=0 writes nothing");
}
// E. commit=0 is a dry run under the same bounds
{
  const t = mk({ pendingNew: 0 });
  await t.seed();
  const r = await consume(t.env, false);
  ok(r.proposals === 6 && count(t.db, "SELECT COUNT(*) n FROM idea_proposals") === 0 && count(t.db, "SELECT COUNT(*) n FROM signals WHERE status='consumed'") === 0, "E1 commit=0 counts 6 and writes nothing");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

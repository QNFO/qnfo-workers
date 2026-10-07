// PUB-GATE-LOOP-1 (1.23.0, agent_issues 2105) offline suite for qnfo-cloud-ops.
// Proves the failure modes found live on 2026-10-07: the quality sweep wrote only the first 200 of 466 published papers
// (stmts.slice(0, 200)) and still reported ok, and nothing ever wrote papers.release_gate_* or a second
// publication_gate_audit run. Now: every paper is scored, every paper gets a gate verdict, a changed verdict is audited,
// an unchanged one is not rewritten, a score under 25 quarantines in enforce mode only, a mass demote acts on none.
// Run: node qnfo-cloud-ops/publication-gate.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { jobQualityScore as __job, pubGateScore as __score, pubGateVerdict as __verdict, CRON_COMPANIONS as __comp, JOBS as __jobs, AMS_SCHEDULE as __sched, PUB_GATE_MAX_DEMOTES as __maxDemotes, PUB_GATE_MAX_CHANGES as __maxChanges, VERSION as __version };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

function stmtOn(dbx, sql) {
  let args = [];
  const self = {
    sql,
    bind(...a) { args = a; return self; },
    exec() { return dbx.prepare(sql).run(...args); },
    async all() { return { results: dbx.prepare(sql).all(...args) }; },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
function d1(dbx, counter) {
  return {
    prepare: (sql) => stmtOn(dbx, sql),
    async batch(stmts) { counter.batches++; counter.maxBatch = Math.max(counter.maxBatch, stmts.length); dbx.exec("BEGIN"); try { for (const s of stmts) s.exec(); dbx.exec("COMMIT"); } catch (e) { dbx.exec("ROLLBACK"); throw e; } return stmts.map(() => ({ success: true })); }
  };
}

const good = "# T\n\n## Related work\n\n" + "x".repeat(5000) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const thin = "# T\n\n" + "y".repeat(4400);           // score 44: thin, no refs, no lit, no table
const junk = "# T\n\n" + "z".repeat(900);            // score 9: quarantine-candidate

function freshEnv({ papers, mode }) {
  const audit = new DatabaseSync(":memory:");
  audit.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);");
  if (mode) audit.prepare("INSERT INTO ops_config VALUES ('publication_gate_mode', ?)").run(mode);
  const living = new DatabaseSync(":memory:");
  living.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, slug TEXT, status TEXT, body_md TEXT, updated_at TEXT, release_gate_pass INTEGER DEFAULT 0, release_gate_at TEXT, release_gate_reason TEXT);
    CREATE TABLE publication_gate_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, run_at TEXT DEFAULT (datetime('now')), slug TEXT, status TEXT, mode TEXT, decision TEXT, reason TEXT, score INTEGER, quality_flag TEXT, body_len INTEGER, has_abstract INTEGER, refs INTEGER, gate_version TEXT);`);
  const ins = living.prepare("INSERT INTO papers (identifier, slug, status, body_md) VALUES (?, ?, ?, ?)");
  for (const [slug, status, body] of papers) ins.run(slug, slug, status, body);
  const counter = { batches: 0, maxBatch: 0 };
  const env = { AUDIT: d1(audit, counter), LIVING: d1(living, counter) };
  return { env, audit, living, counter };
}

// 1. Scorer and verdicts.
ok(mod.__score(good).score >= 50 && mod.__verdict(mod.__score(good)).decision === "pass", "a referenced paper with a table passes", mod.__score(good));
const tq = mod.__score(thin);
ok(tq.flag === "thin" && mod.__verdict(tq).decision === "revise" && mod.__verdict(tq).pass === 0, "a thin paper is revise, not pass", tq);
ok(/missing=refs<3,no-prior-work-section,no-table-or-code/.test(mod.__verdict(tq).reason), "the revise reason names what is missing", mod.__verdict(tq));
ok(mod.__verdict(mod.__score(junk)).decision === "demote", "a score under 25 is demote");

// 2. The 2026-10-07 defect: 466 published papers, the sweep scored 200. Every paper is scored and gated now.
{
  const papers = [];
  for (let i = 0; i < 466; i++) papers.push(["p" + i, "published", i % 3 ? good : thin]);
  papers.push(["draft-1", "draft", junk]);
  const { env, audit, living, counter } = freshEnv({ papers });
  const r = await mod.__job(env);
  const scored = audit.prepare("SELECT COUNT(*) n, COUNT(DISTINCT slug) d FROM quality_scores").get();
  ok(r.status === "ok" && r.rows === 466 && scored.n === 466 && scored.d === 466, "all 466 published papers scored (was 200)", { r, scored });
  ok(counter.maxBatch <= 100, "no batch over 100 statements", counter);
  const gated = living.prepare("SELECT COUNT(*) n FROM papers WHERE release_gate_at IS NOT NULL").get().n;
  const lim = mod.__maxChanges;
  ok(gated === Math.min(466, lim) && r.notes.gate_backlog === 466 - Math.min(466, lim), "first run gates up to PUB_GATE_MAX_CHANGES papers and reports the backlog", { gated, notes: r.notes });
  ok(living.prepare("SELECT release_gate_at FROM papers WHERE slug='draft-1'").get().release_gate_at === null, "a draft is not gated or touched");
  // Following daily runs drain the backlog, then write nothing when nothing changed.
  let r2 = r;
  for (let k = 0; k < 5 && r2.notes.gate_backlog > 0; k++) r2 = await mod.__job(env);
  const all = living.prepare("SELECT SUM(release_gate_pass) p, COUNT(*) n, SUM(release_gate_at IS NOT NULL) g FROM papers WHERE status='published'").get();
  ok(all.g === 466 && all.p === papers.filter((p) => p[1] === "published" && p[2] === good).length, "after the backlog drains every published paper has a verdict; release_gate_pass = 1 exactly on passing papers", all);
  const auditN = living.prepare("SELECT COUNT(*) n FROM publication_gate_audit").get().n;
  const r3 = await mod.__job(env);
  ok(r3.notes.verdicts_changed === 0 && living.prepare("SELECT COUNT(*) n FROM publication_gate_audit").get().n === auditN, "an unchanged verdict is not rewritten or re-audited", r3.notes);
  ok(auditN === 466 && living.prepare("SELECT COUNT(DISTINCT run_id) n FROM publication_gate_audit").get().n >= 2, "one audit row per verdict, each run with its own run_id");
  // A paper revised to pass flips its verdict and gets an audit row.
  living.prepare("UPDATE papers SET body_md = ? WHERE slug = 'p0'").run(good);
  const r4 = await mod.__job(env);
  const p0 = living.prepare("SELECT release_gate_pass, release_gate_reason FROM papers WHERE slug='p0'").get();
  ok(r4.notes.verdicts_changed === 1 && p0.release_gate_pass === 1 && /^ok score=/.test(p0.release_gate_reason), "a revised paper flips to pass with an audit row", { notes: r4.notes, p0 });
}

// 3. Enforce (default) quarantines a score under 25; shadow records without acting.
{
  const { env, living } = freshEnv({ papers: [["a", "published", good], ["b", "published", junk]] });
  const r = await mod.__job(env);
  const b = living.prepare("SELECT status, release_gate_pass FROM papers WHERE slug='b'").get();
  const ab = living.prepare("SELECT decision, mode, status FROM publication_gate_audit WHERE slug='b'").get();
  ok(r.notes.mode === "enforce" && r.notes.quarantined === 1 && b.status === "quarantined" && b.release_gate_pass === 0, "enforce is the default and quarantines a demote", { notes: r.notes, b });
  ok(ab && ab.decision === "demote" && ab.mode === "enforce" && ab.status === "quarantined", "the quarantine is audited", ab);
  ok(living.prepare("SELECT status FROM papers WHERE slug='a'").get().status === "published", "a passing paper stays published");
}
{
  const { env, living } = freshEnv({ papers: [["b", "published", junk]], mode: "shadow" });
  const r = await mod.__job(env);
  ok(r.notes.mode === "shadow" && r.notes.quarantined === 0 && living.prepare("SELECT status FROM papers WHERE slug='b'").get().status === "published", "shadow mode records the demote without acting", r.notes);
  ok(living.prepare("SELECT decision FROM publication_gate_audit WHERE slug='b'").get().decision === "demote", "shadow demote is audited");
}

// 4. A mass demote (broken scorer, emptied bodies) quarantines nothing and reports degraded.
{
  const papers = [];
  for (let i = 0; i < mod.__maxDemotes + 5; i++) papers.push(["j" + i, "published", junk]);
  const { env, living } = freshEnv({ papers });
  const r = await mod.__job(env);
  ok(r.status === "degraded" && /none quarantined/.test(r.reason) && r.notes.quarantined === 0, "over PUB_GATE_MAX_DEMOTES demotes: none acted on, degraded", r);
  ok(living.prepare("SELECT COUNT(*) n FROM papers WHERE status='published'").get().n === papers.length, "every paper stays published");
}

// 5. Wiring: still the existing every-day quality-score slot, no new schedule slot; minor release.
ok(mod.__jobs["quality-score"] === mod.__job, "quality-score dispatches to the gated sweep");
ok(mod.__sched["quality-score"] && mod.__sched["quality-score"].days === "*", "runs in the existing daily slot");
const [maj, min] = String(mod.__version).split(/[.-]/).map(Number);
ok(maj > 1 || (maj === 1 && min >= 23), "VERSION is at least 1.23 (minor bump for a new capability)", mod.__version);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

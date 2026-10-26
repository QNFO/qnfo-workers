// QUALITY-SCORE-MEMORY-1 (qnfo-cloud-ops 1.37.1, agent_issues 1000297) offline suite. No network, synthetic data, Node 22 node:sqlite.
// Proves: the hourly quality-score / publication-gate sweep never holds more than one page of papers.body_md. Cloudflare Observability recorded
// "exceededMemory" on qnfo-cloud-ops at 2026-10-25T05:21:06Z, four seconds after a 693-paper sweep reported ok; the old jobQualityScore read every
// published paper (about 40 MB of body_md at 1,000 papers) in one SELECT and kept the bodies again in its `judged` list. Now the papers (and the
// quarantined papers it restores) are read in keyset pages by rowid, scored and written page by page.
// Here: (1) no papers read returns more than one page of rows, every paper is read once, by `rowid >` keyset and never OFFSET;
// (2) on a 57-paper fixture (mixed verdicts, rowid gaps, owner papers, today's snapshots already present, quarantined papers to restore) the paged
// run writes exactly what a reference unpaged run (the pre-1.37.1 jobQualityScore, verbatim, below) writes: quality_scores, papers.release_gate_*,
// publication_gate_audit, the restores, the returned counts and the event text, on the first run and on the second; no paper is withdrawn;
// (3) a failed write or read costs only its own page: the other pages' snapshots and verdicts are written, the run reports error, and the next run heals.
// Run: node qnfo-cloud-ops/quality-score-paging.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { jobQualityScore as __job, pubGateScore as __score, pubGateVerdict as __verdict, PUB_GATE_VERSION as __gateVersion, PUB_GATE_CHUNK as __chunk, QUALITY_SCORE_PAGE_ROWS as __pageRows, VERSION as __version };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 1400) : "")); } };
const PAGE = mod.__pageRows;

// ---- the reference: jobQualityScore as it was before 1.37.1 (one SELECT of every published paper, every body kept in `judged`), unchanged except
// ---- its name and the three helpers it calls, which are the worker's own scorer and verdict plus a recordEvent that notes the text it would write.
const pubGateScore = mod.__score, pubGateVerdict = mod.__verdict, PUB_GATE_VERSION = mod.__gateVersion, PUB_GATE_CHUNK = 100;
const refEvents = [];
async function recordEvent(env, kind, id, text) { refEvents.push(text); }
async function pubGateMode(env) {
  const r = await env.AUDIT.prepare("SELECT value FROM ops_config WHERE key = 'publication_gate_mode'").first();
  return String(r && r.value || "").trim().toLowerCase() === "shadow" ? "shadow" : "enforce";
}
async function referenceUnpagedSweep(env) {
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS quality_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, slug TEXT, status TEXT, body_len INTEGER, refs INTEGER, lit INTEGER, verif INTEGER, score INTEGER, flag TEXT)").run();
    const rows = await env.LIVING.prepare("SELECT identifier, slug, status, body_md, release_gate_pass, release_gate_reason FROM papers WHERE status='published'").all();
    const list = rows && rows.results || [];
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const mode = await pubGateMode(env);
    const runId = "pg-" + day + "-" + Date.now().toString(36);
    const existingScores = await env.AUDIT.prepare("SELECT slug FROM quality_scores WHERE ts = ?1").bind(day).all();
    const scoredToday = new Set((existingScores && existingScores.results || []).map((r) => r.slug));
    const scoreStmts = [];
    const judged = [];
    let flagged = 0;
    for (const p of list) {
      const q = pubGateScore(p.body_md);
      if (q.flag === "quarantine-candidate") flagged++;
      if (!scoredToday.has(p.slug)) {
        scoreStmts.push(env.AUDIT.prepare("INSERT INTO quality_scores (ts, slug, status, body_len, refs, lit, verif, score, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(day, p.slug, p.status, q.len, q.refs, q.lit, q.verif, q.score, q.flag));
        scoredToday.add(p.slug);
      }
      judged.push({ p, q, v: pubGateVerdict(q, p) });
    }
    let wrote = 0;
    for (let i = 0; i < scoreStmts.length; i += PUB_GATE_CHUNK) {
      const chunk = scoreStmts.slice(i, i + PUB_GATE_CHUNK);
      await env.AUDIT.batch(chunk);
      wrote += chunk.length;
    }
    // PUB-GATE-NO-WITHDRAW-1: only changed verdicts are written; no paper is quarantined by this sweep.
    const gateStmts = [];
    let changed = 0;
    const pending = judged.filter((j) => Number(j.p.release_gate_pass) !== j.v.pass || String(j.p.release_gate_reason || "") !== j.v.reason);
    for (const j of pending) {
      changed++;
      gateStmts.push(env.LIVING.prepare("UPDATE papers SET release_gate_pass = ?1, release_gate_at = ?2, release_gate_reason = ?3 WHERE slug = ?4 AND status = 'published'").bind(j.v.pass, now, j.v.reason, j.p.slug));
      gateStmts.push(env.LIVING.prepare("INSERT INTO publication_gate_audit (run_id, slug, status, mode, decision, reason, score, quality_flag, body_len, has_abstract, refs, gate_version) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, ?11)").bind(runId, j.p.slug, j.p.status, mode, j.v.decision, j.v.reason, Math.round(j.q.score), j.q.flag || "ok", j.q.len, j.q.refs, PUB_GATE_VERSION));
    }
    // Every paper an earlier gate version quarantined (reason "quality:...") goes back to published, whatever its verdict.
    // PUB-GATE-RESTORE-2 (1.36.1): each restore is its own batch. The living-paper floor trigger refused 11 short papers, and one
    // refusal in a shared chunk rolled back the other restores in it and threw out of the run.
    let restored = 0, restoreRefused = 0;
    const restoreSets = [];
    const qrows = await env.LIVING.prepare("SELECT identifier, slug, status, body_md, release_gate_reason FROM papers WHERE status = 'quarantined' AND release_gate_reason LIKE 'quality:%'").all();
    for (const p of qrows && qrows.results || []) {
      const q = pubGateScore(p.body_md);
      const v = pubGateVerdict(q, p);
      const set = [];
      restoreSets.push({ p, v, q, set });
      set.push(env.LIVING.prepare("UPDATE papers SET status = 'published', release_gate_pass = ?1, release_gate_at = ?2, release_gate_reason = ?3, updated_at = datetime('now'), change_actor = ?5, change_reason = ?6 WHERE slug = ?4 AND status = 'quarantined'").bind(v.pass, now, v.reason, p.slug, "qnfo-cloud-ops:" + runId, "publication gate " + PUB_GATE_VERSION + " restore of a quality quarantine: " + String(p.release_gate_reason || "").slice(0, 120)));
      set.push(env.LIVING.prepare("INSERT INTO publication_gate_audit (run_id, slug, status, mode, decision, reason, score, quality_flag, body_len, has_abstract, refs, gate_version) VALUES (?1, ?2, 'published', ?3, 'restore', ?4, ?5, ?6, ?7, NULL, ?8, ?9)").bind(runId, p.slug, mode, v.reason + " (was " + String(p.release_gate_reason || "").slice(0, 120) + ")", Math.round(q.score), q.flag || "ok", q.len, q.refs, PUB_GATE_VERSION));
    }
    for (let i = 0; i < gateStmts.length; i += PUB_GATE_CHUNK) await env.LIVING.batch(gateStmts.slice(i, i + PUB_GATE_CHUNK));
    for (const r of restoreSets) {
      try {
        await env.LIVING.batch(r.set);
        restored++;
      } catch (e) {
        restoreRefused++;
        try {
          await env.LIVING.prepare("INSERT INTO publication_gate_audit (run_id, slug, status, mode, decision, reason, score, quality_flag, body_len, has_abstract, refs, gate_version) VALUES (?1, ?2, 'quarantined', ?3, 'restore-refused', ?4, ?5, ?6, ?7, NULL, ?8, ?9)").bind(runId, r.p.slug, mode, String(e && e.message || e).slice(0, 300), Math.round(r.q.score), r.q.flag || "ok", r.q.len, r.q.refs, PUB_GATE_VERSION).run();
        } catch (e2) {
          console.error(JSON.stringify({ event: "pub-gate-restore-refused-log", slug: r.p.slug, error: String(e2 && e2.message || e2).slice(0, 200) }));
        }
      }
    }
    const passN = judged.filter((j) => j.v.pass === 1).length;
    const scoredN = judged.length;
    const reviseN = judged.filter((j) => j.v.decision === "revise").length;
    const notes = { scanned: list.length, scored: scoredN, score_snapshots_written: wrote, pass: passN, revise: reviseN, quarantined: 0, restored, restore_refused: restoreRefused, verdicts_changed: changed, mode, gate_version: PUB_GATE_VERSION };
    let status = "ok", reason = "";
    if (scoredN < list.length) {
      status = "degraded";
      reason = "scored " + scoredN + " of " + list.length + " published papers";
    }
    await recordEvent(env, "quality-score", "qs-" + Date.now().toString(36), "quality sweep: scanned=" + list.length + " snapshots=" + wrote + " quarantine_candidates=" + flagged + " gate=" + mode + " gate_version=" + PUB_GATE_VERSION + " pass=" + passN + " revise=" + reviseN + " restored=" + restored + " changed=" + changed, { job: "quality-score", run_id: runId });
    return { status, reason, notes, scanned: list.length, rows: scoredN, quarantine_candidates: flagged };
  } catch (e) {
    return { status: "error", reason: String(e).slice(0, 200), error: String(e).slice(0, 200) };
  }
}
// ---- end of the reference

// A D1 stand-in over node:sqlite. `hooks.onAll(sql, args, results)` sees every read, `hooks.failBatch(stmts)` returns an error message to refuse a batch
// (the whole batch rolls back, as D1 does), `hooks.failAll(sql, args)` returns an error message to refuse a read.
function stmtOn(dbx, sql, hooks) {
  let args = [];
  const self = {
    sql,
    get args() { return args; },
    bind(...a) { args = a; return self; },
    exec() { return dbx.prepare(sql).run(...args); },
    async all() {
      const refuse = hooks.failAll && hooks.failAll(sql, args);
      if (refuse) throw new Error(refuse);
      const results = dbx.prepare(sql).all(...args);
      if (hooks.onAll) hooks.onAll(sql, args, results);
      return { results };
    },
    async first() { return dbx.prepare(sql).get(...args) || null; },
    async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
function d1(dbx, hooks, counter) {
  return {
    prepare: (sql) => stmtOn(dbx, sql, hooks),
    async batch(stmts) {
      counter.batches++; counter.maxBatch = Math.max(counter.maxBatch, stmts.length);
      const refuse = hooks.failBatch && hooks.failBatch(stmts);
      if (refuse) throw new Error(refuse);
      dbx.exec("BEGIN");
      try { for (const s of stmts) s.exec(); dbx.exec("COMMIT"); } catch (e) { dbx.exec("ROLLBACK"); throw e; }
      return stmts.map(() => ({ success: true }));
    }
  };
}

const good = (n) => "# T" + n + "\n\n## Related work\n\n" + "x".repeat(4000 + n * 37) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const thin = (n) => "# T" + n + "\n\n" + "y".repeat(4400 + n);
const junk = (n) => "# T" + n + "\n\n" + "z".repeat(900 + n);
const malformed = (n) => "# T" + n + "\n\n" + ["## 1. Introduction", "## 2. Background and Related Work", "## 3. Methods", "## 4. Analysis", "## 5. Results", "## Appendix C. Extended derivations", "## 7. Discussion", "## 7. Practical Implications", "## 9. Conclusion"].join("\n\n") + "\n\n" + "x".repeat(5000 + n) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const residue = (n) => "# T" + n + "\n\nUse everyday words. We must restate ONE research paper. Hard rules: every specific number must already appear below.\n\n" + "x".repeat(5000 + n) + "\n\n## Related work\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi\n";
const artifact = (n) => "# T" + n + "\n\n## Divergence Report\n\n" + "x".repeat(5000 + n) + "\n\n## Related work\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi\n";
const h1soft = (n) => "# T" + n + "\n\n# 1. Introduction\n\n## 1.1 Scope\n\n# 2. Methods\n\n## 2.1 Setup\n\n## Related work\n\n" + "x".repeat(5000 + n) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const kinds = [good, thin, junk, malformed, residue, artifact, h1soft];

// The fixture: 57 published papers (7 body kinds, a few owner papers, four starting verdict states, some with today's snapshot already written),
// 13 quarantined for quality (restored by the sweep) and 2 quarantined for another reason (left alone), 3 drafts, and rowid gaps from deleted rows.
const DAY = new Date().toISOString().slice(0, 10);
function fixture(nPublished = 57, nQuarantined = 13) {
  const rows = [];
  for (let i = 0; i < nPublished; i++) {
    const body = kinds[i % kinds.length](i);
    const ident = i % 11 === 0 ? "qnfo-2025-" + i : "p" + i;
    const v = mod.__verdict(mod.__score(body), { identifier: ident });
    const state = i % 4;
    const gate = state === 0 ? { pass: v.pass, reason: v.reason } : state === 1 ? { pass: 1 - v.pass, reason: v.reason } : state === 2 ? { pass: 0, reason: null } : { pass: v.pass, reason: "stale: " + v.reason };
    rows.push({ slug: "p" + i, status: "published", body, ident, gate, snapshot: i % 5 === 0 });
    if (i % 9 === 4) rows.push({ slug: "gap" + i, status: "published", body: good(i), ident: "gap" + i, gate: { pass: 0, reason: null }, deleted: true });
    if (i % 19 === 7) rows.push({ slug: "draft" + i, status: "draft", body: junk(i), ident: "draft" + i, gate: { pass: 0, reason: null } });
  }
  for (let i = 0; i < nQuarantined; i++) rows.push({ slug: "q" + i, status: "quarantined", body: kinds[(i + 2) % kinds.length](100 + i), ident: i % 5 === 0 ? "qnfo-2025-q" + i : "q" + i, gate: { pass: 0, reason: "quality:structure subsection-without-section-1" } });
  rows.push({ slug: "hold-a", status: "quarantined", body: junk(1), ident: "hold-a", gate: { pass: 0, reason: "manual hold" } });
  rows.push({ slug: "hold-b", status: "quarantined", body: good(2), ident: "hold-b", gate: { pass: 0, reason: null } });
  return rows;
}

function freshEnv(rows, { mode, hooksAudit = {}, hooksLiving = {} } = {}) {
  const audit = new DatabaseSync(":memory:");
  audit.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);");
  audit.exec("CREATE TABLE quality_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, slug TEXT, status TEXT, body_len INTEGER, refs INTEGER, lit INTEGER, verif INTEGER, score INTEGER, flag TEXT)");
  if (mode) audit.prepare("INSERT INTO ops_config VALUES ('publication_gate_mode', ?)").run(mode);
  const living = new DatabaseSync(":memory:");
  living.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, title TEXT DEFAULT '', slug TEXT, status TEXT, body_md TEXT, updated_at TEXT, release_gate_pass INTEGER DEFAULT 0, release_gate_at TEXT, release_gate_reason TEXT, change_actor TEXT, change_reason TEXT);
    CREATE TABLE publication_gate_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, run_at TEXT DEFAULT (datetime('now')), slug TEXT, status TEXT, mode TEXT, decision TEXT, reason TEXT, score INTEGER, quality_flag TEXT, body_len INTEGER, has_abstract INTEGER, refs INTEGER, gate_version TEXT);`);
  const ins = living.prepare("INSERT INTO papers (identifier, slug, status, body_md, release_gate_pass, release_gate_reason) VALUES (?, ?, ?, ?, ?, ?)");
  const snap = audit.prepare("INSERT INTO quality_scores (ts, slug, status, body_len, refs, lit, verif, score, flag) VALUES (?, ?, 'published', 1, 0, 0, 0, 1, '')");
  for (const r of rows) {
    ins.run(r.ident, r.slug, r.status, r.body, r.gate.pass, r.gate.reason);
    if (r.snapshot) snap.run(DAY, r.slug);
  }
  for (const r of rows) if (r.deleted) living.prepare("DELETE FROM papers WHERE slug = ?").run(r.slug);
  const counter = { batches: 0, maxBatch: 0 };
  const env = { AUDIT: d1(audit, hooksAudit, counter), LIVING: d1(living, hooksLiving, counter) };
  return { env, audit, living, counter };
}

// Everything a sweep writes, normalised for the two things that legitimately differ between two runs: the run id and the wall-clock stamp.
function dump({ audit, living }, sorted = false) {
  const norm = (v) => typeof v === "string" ? v.replace(/pg-\d{4}-\d{2}-\d{2}-[0-9a-z]+/g, "pg-RUN") : v;
  const rows = (db, sql) => db.prepare(sql).all().map((r) => JSON.parse(JSON.stringify(r, (k, v) => norm(v))));
  // sorted: the order rows were inserted in differs after a failed page is healed by a later run, the rows themselves must not
  return {
    papers: rows(living, "SELECT slug, status, release_gate_pass, release_gate_at IS NOT NULL AS gated, release_gate_reason, change_actor, change_reason, length(body_md) AS n FROM papers ORDER BY rowid"),
    audit: rows(living, "SELECT slug, status, mode, decision, reason, score, quality_flag, body_len, has_abstract, refs, gate_version FROM publication_gate_audit ORDER BY " + (sorted ? "slug, decision, id" : "id")),
    scores: rows(audit, "SELECT ts, slug, status, body_len, refs, lit, verif, score, flag FROM quality_scores ORDER BY " + (sorted ? "slug, id" : "id"))
  };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const firstDiff = (a, b) => { for (const k of Object.keys(a)) { if (!same(a[k], b[k])) { const i = a[k].findIndex((x, j) => !same(x, b[k][j])); return { table: k, i, paged: a[k][i], reference: b[k][i], nPaged: a[k].length, nReference: b[k].length }; } } return null; };
const publishedN = (rows) => rows.filter((r) => r.status === "published" && !r.deleted).length;
const bodyReads = (log) => log.filter((x) => /FROM papers/.test(x.sql) && /body_md/.test(x.sql));

// ---- (1) + (2): the paged run reads at most one page of bodies at a time and writes exactly what the unpaged reference writes.
const rows = fixture();
const nPub = publishedN(rows);
ok(nPub >= 25 && nPub === 57, "the fixture has " + nPub + " published papers (at least 25)", nPub);
ok(PAGE >= 1 && PAGE <= 10 && Number.isInteger(PAGE), "the page size is a named constant of at most 10 rows", PAGE);
{
  const readsRef = [], readsNew = [];
  const ref = freshEnv(rows, { hooksLiving: { onAll: (sql, args, results) => readsRef.push({ sql, n: results.length, chars: results.reduce((s, r) => s + String(r.body_md || "").length, 0) }) } });
  const neu = freshEnv(rows, { hooksLiving: { onAll: (sql, args, results) => readsNew.push({ sql, args, n: results.length, chars: results.reduce((s, r) => s + String(r.body_md || "").length, 0), slugs: results.map((r) => r.slug) }) } });

  const rRef = await referenceUnpagedSweep(ref.env);
  const rNew = await mod.__job(neu.env);
  const bRef = bodyReads(readsRef), bNew = bodyReads(readsNew);
  ok(Math.max(...bRef.map((x) => x.n)) === nPub, "negative control: the unpaged reference reads all " + nPub + " published bodies in one read, and this harness sees it", bRef.map((x) => x.n));

  // (1) bounded reads
  const maxRows = Math.max(...bNew.map((x) => x.n));
  ok(maxRows <= PAGE, "no single papers read returns more than " + PAGE + " rows (max " + maxRows + ")", bNew.map((x) => x.n));
  const published = bNew.filter((x) => /status='published'/.test(x.sql)), quarantined = bNew.filter((x) => /status = 'quarantined'/.test(x.sql));
  ok(published.length === Math.ceil(nPub / PAGE) + (nPub % PAGE === 0 ? 1 : 0), "the published papers take ceil(" + nPub + "/" + PAGE + ") page reads", published.map((x) => x.n));
  ok(published.slice(0, -1).every((x) => x.n === PAGE) && published.at(-1).n === nPub % PAGE, "every page is full except the last", published.map((x) => x.n));
  const seen = published.flatMap((x) => x.slugs);
  ok(seen.length === nPub && new Set(seen).size === nPub, "every published paper is read exactly once", { seen: seen.length, distinct: new Set(seen).size });
  const maxChars = Math.max(...bNew.map((x) => x.chars)), totalChars = bNew.reduce((s, x) => s + x.chars, 0), refChars = Math.max(...bRef.map((x) => x.chars));
  ok(maxChars * 3 < refChars && maxChars < totalChars / 3, "the most body text held by one read is a fraction of the unpaged read (" + maxChars + " vs " + refChars + " chars)", { maxChars, refChars, totalChars });
  ok(bNew.every((x) => /ORDER BY rowid LIMIT \?\d/.test(x.sql)) && !bNew.some((x) => /OFFSET/i.test(x.sql)), "every body read is a LIMITed rowid-ordered page, never OFFSET");
  ok(bNew.slice(1).filter((x) => /status='published'/.test(x.sql)).every((x) => /AND rowid > \?1/.test(x.sql)) && /rowid >/.test(published[1].sql) && !/rowid >/.test(published[0].sql), "the first page has no cursor and the later ones continue after the last rowid");
  ok(published.every((x, i) => i === 0 || x.args[0] > 0) && quarantined.length >= 2 && quarantined.every((x) => x.n <= PAGE), "the quarantined papers to restore are paged too (" + quarantined.length + " reads, max " + Math.max(...quarantined.map((x) => x.n)) + " rows)", quarantined.map((x) => x.n));
  const qSeen = quarantined.flatMap((x) => x.slugs);
  ok(qSeen.length === 13 && new Set(qSeen).size === 13 && qSeen.every((s) => /^q\d+$/.test(s)), "all 13 quality quarantines are read once and the two held for another reason are not", qSeen);
  ok(neu.counter.maxBatch <= mod.__chunk, "no write batch is larger than the 100-statement chunk", neu.counter);

  // (2) identical output
  const dNew = dump(neu), dRef = dump(ref);
  ok(same(dNew, dRef), "first run: quality_scores, papers.release_gate_*, publication_gate_audit and the restores are identical to the unpaged reference", firstDiff(dNew, dRef));
  const strip = (r) => { const o = JSON.parse(JSON.stringify(r)); delete o.notes.pages; delete o.notes.page_rows; delete o.notes.failed_pages; return o; };
  ok(same(strip(rNew), strip(rRef)), "first run: status, reason, scanned, rows, quarantine_candidates and every note count are identical", { paged: rNew, reference: rRef });
  const ev = neu.audit.prepare("SELECT text FROM cloud_ops_events WHERE job = 'quality-score' ORDER BY ts DESC LIMIT 1").get();
  ok(ev && ev.text === refEvents.at(-1), "the quality-score event text is unchanged", { paged: ev && ev.text, reference: refEvents.at(-1) });
  ok(rNew.status === "ok" && rNew.notes.scanned === nPub && rNew.notes.scored === nPub && rNew.notes.pages === published.length && rNew.notes.failed_pages === 0 && rNew.notes.restored === 13 && rNew.notes.restore_refused === 0, "the paged run reports ok with its page count", rNew.notes);
  ok(dNew.papers.filter((p) => p.status === "quarantined").length === 2 && dNew.papers.every((p) => p.status !== "withdrawn" && p.status !== "quarantined" || /^hold-/.test(p.slug)), "no paper is withdrawn or quarantined; only the two held for another reason stay quarantined", dNew.papers.filter((p) => p.status !== "published").map((p) => p.slug + ":" + p.status));
  ok(dNew.scores.length === nPub && new Set(dNew.scores.map((s) => s.slug)).size === nPub && dNew.scores.every((s) => s.ts === DAY), "one snapshot per paper for the UTC day, including the 12 that were already there", dNew.scores.length);
  ok(dNew.audit.filter((a) => a.decision === "restore").length === 13 && dNew.audit.every((a) => a.decision === "restore" || a.status === "published"), "13 restore audit rows, and every other audit row is for a published paper", dNew.audit.length);
  const decisions = new Set(dNew.audit.map((a) => a.decision));
  ok(["pass", "revise", "restore"].every((d) => decisions.has(d)), "the fixture exercises pass, revise and restore verdicts", [...decisions]);

  // second run: nothing left to change, no duplicate snapshots, still identical to the reference's second run
  refEvents.length = 0;
  const rRef2 = await referenceUnpagedSweep(ref.env), rNew2 = await mod.__job(neu.env);
  ok(rNew2.notes.verdicts_changed === 0 && rNew2.notes.score_snapshots_written === 13 && rNew2.notes.restored === 0 && rNew2.notes.scanned === nPub + 13, "second run: no verdict rewritten, nothing to restore, and one snapshot for each of the 13 restored papers (now published) and for no one else", rNew2.notes);
  ok(same(dump(neu), dump(ref)) && same(strip(rNew2), strip(rRef2)), "second run: still identical to the unpaged reference", firstDiff(dump(neu), dump(ref)));
  // a body edit flips one verdict: both implementations write the same change
  for (const e of [ref, neu]) e.living.prepare("UPDATE papers SET body_md = ? WHERE slug = 'p1'").run(good(1));
  const rRef3 = await referenceUnpagedSweep(ref.env), rNew3 = await mod.__job(neu.env);
  ok(rNew3.notes.verdicts_changed === 1 && same(strip(rNew3), strip(rRef3)) && same(dump(neu), dump(ref)), "third run after one body edit: one verdict flips, identical to the reference", { n: rNew3.notes, diff: firstDiff(dump(neu), dump(ref)) });
}

// shadow mode and an exact multiple of the page size (the last read is an empty page) and an empty table
for (const [label, n, mode] of [["exact multiple of the page", PAGE * 3, "shadow"], ["one paper", 1, undefined], ["no published papers", 0, undefined], ["one page", PAGE, undefined]]) {
  const set = fixture(n, n ? 3 : 0).filter((r) => n || r.status !== "published");
  const readsNew = [];
  const ref = freshEnv(set, { mode }), neu = freshEnv(set, { mode, hooksLiving: { onAll: (sql, args, results) => readsNew.push({ sql, n: results.length }) } });
  const rRef = await referenceUnpagedSweep(ref.env), rNew = await mod.__job(neu.env);
  const pubReads = bodyReads(readsNew).filter((x) => /status='published'/.test(x.sql));
  ok(same(dump(neu), dump(ref)) && rNew.status === rRef.status && rNew.scanned === rRef.scanned && rNew.rows === rRef.rows && rNew.notes.verdicts_changed === rRef.notes.verdicts_changed && rNew.notes.mode === rRef.notes.mode, label + ": output identical to the reference", { diff: firstDiff(dump(neu), dump(ref)), paged: rNew, ref: rRef });
  ok(pubReads.length === Math.floor(n / PAGE) + 1 && pubReads.every((x) => x.n <= PAGE), label + ": " + pubReads.length + " page reads, none over " + PAGE + " rows", pubReads.map((x) => x.n));
}

// ---- (3) one failed page costs only that page. Page 3 of the published sweep is rows 21..30 in rowid order.
const pageSlugs = (e, page) => e.living.prepare("SELECT slug FROM papers WHERE status = 'published' ORDER BY rowid").all().map((r) => r.slug).slice((page - 1) * PAGE, page * PAGE);
const touches = (stmts, slugs) => stmts.some((s) => (s.args || []).some((a) => slugs.includes(a)));
{
  const probe = freshEnv(rows);          // the same fixture before any sweep: gives the page contents and the "before" state
  const page3 = pageSlugs(probe, 3), page2 = pageSlugs(probe, 2), before = dump(probe);
  const reference = freshEnv(rows);
  await referenceUnpagedSweep(reference.env);
  const want = dump(reference);
  await referenceUnpagedSweep(reference.env);       // the second reference run adds the snapshots of the restored papers: where a healing second run must end
  const wantSorted = dump(reference, true);
  const byOrder = (x, y) => (x.slug + x.decision) < (y.slug + y.decision) ? -1 : 1;

  // (3a) a refused verdict write on page 3: every other page's verdicts and every page's snapshots are written
  const hl = { failBatch: (stmts) => /UPDATE papers SET release_gate_pass/.test(stmts[0].sql) && touches(stmts, page3) ? "UPDATE refused: living-paper trigger" : null };
  const a = freshEnv(rows, { hooksLiving: hl });
  const ra = await mod.__job(a.env);
  const da = dump(a);
  ok(ra.status === "error" && ra.notes.failed_pages === 1 && /verdicts, page 3/.test(ra.reason) && ra.error === ra.reason, "a refused verdict write on page 3 is reported as an error naming the page", { status: ra.status, reason: ra.reason, notes: ra.notes });
  ok(same(da.papers.filter((p) => !page3.includes(p.slug)), want.papers.filter((p) => !page3.includes(p.slug))), "every paper outside page 3 has exactly the verdict the unpaged run gives it (restores included)");
  ok(same(da.papers.filter((p) => page3.includes(p.slug)), before.papers.filter((p) => page3.includes(p.slug))), "page 3 keeps its previous verdicts (the page's batch rolled back as one)");
  ok(same(da.scores, want.scores), "all snapshots are written, page 3's included: its verdict failure did not stop its own snapshots or later pages", { got: da.scores.length, want: want.scores.length });
  ok(same(da.audit.filter((x) => !page3.includes(x.slug)).sort(byOrder), want.audit.filter((x) => !page3.includes(x.slug)).sort(byOrder)), "the audit rows of the other pages are all there, and none for page 3");
  ok(ra.notes.pages === 6 && ra.scanned === nPub && ra.rows === nPub, "the sweep still scanned and scored all pages", ra.notes);
  hl.failBatch = null;
  const heal = await mod.__job(a.env);
  ok(heal.status === "ok" && same(dump(a, true), wantSorted), "the next run, with the refusal gone, writes page 3 and ends identical to the unpaged run", { status: heal.status, diff: firstDiff(dump(a, true), wantSorted) });

  // (3b) a refused snapshot write on page 2: its verdicts and every other page's snapshots are written, the next run adds the missing ones only
  const ha = { failBatch: (stmts) => /INSERT INTO quality_scores/.test(stmts[0].sql) && touches(stmts, page2) ? "D1 overloaded" : null };
  const b = freshEnv(rows, { hooksAudit: ha });
  const rb = await mod.__job(b.env);
  const db = dump(b);
  const missing = page2.filter((s) => !rows.find((r) => r.slug === s).snapshot);
  ok(rb.status === "error" && rb.notes.failed_pages === 1 && /snapshots, page 2/.test(rb.reason), "a refused snapshot write on page 2 is reported as an error naming the page", { status: rb.status, reason: rb.reason });
  ok(same(db.papers, want.papers) && same(db.audit, want.audit), "page 2's verdicts and everything else in living-paper are still exactly the unpaged run's");
  ok(missing.length > 0 && db.scores.length === want.scores.length - missing.length && missing.every((s) => !db.scores.some((x) => x.slug === s)), "only page 2's snapshots are missing (" + missing.length + " of " + want.scores.length + ")", { got: db.scores.length, want: want.scores.length, missing });
  ha.failBatch = null;
  const healB = await mod.__job(b.env);
  ok(healB.status === "ok" && healB.notes.score_snapshots_written === missing.length + 13 && same(dump(b, true), wantSorted), "the next run writes exactly the missing snapshots (plus the 13 restored papers' first ones) and no duplicate", { notes: healB.notes, diff: firstDiff(dump(b, true), wantSorted) });

  // (3c) a read that fails on the third page: pages 1 and 2 stay written, the run reports it and does not claim ok
  let reads = 0;
  const c = freshEnv(rows, { hooksLiving: { failAll: (sql) => /FROM papers/.test(sql) && /body_md/.test(sql) && ++reads === 3 ? "D1 read timeout" : null } });
  const rc = await mod.__job(c.env);
  const dc = dump(c);
  const first2 = new Set(pageSlugs(c, 1).concat(pageSlugs(c, 2)));
  const seeded = rows.filter((r) => r.snapshot).length, newSnaps = [...first2].filter((s) => !rows.find((r) => r.slug === s).snapshot).length;
  ok(rc.status === "error" && /read page 3/.test(rc.reason) && rc.scanned === PAGE * 2 && rc.notes.pages === 2, "a failed page read stops the sweep with an error that names the page, after 2 pages", { status: rc.status, reason: rc.reason, scanned: rc.scanned });
  ok(same(dc.papers.filter((p) => first2.has(p.slug)), want.papers.filter((p) => first2.has(p.slug))) && dc.scores.length === seeded + newSnaps, "the first two pages' verdicts and snapshots stay written, nothing after them is", { scores: dc.scores.length, expected: seeded + newSnaps });
  ok(dc.papers.filter((p) => !first2.has(p.slug) && before.papers.find((x) => x.slug === p.slug).status === "published").every((p) => before.papers.find((x) => x.slug === p.slug).release_gate_reason === p.release_gate_reason), "the pages after the failed read are untouched");

  // (3d) a restore refused for one paper: the other restores and the pages are unaffected, the refusal is audited
  const failRestore = (stmts) => stmts.length === 2 && /SET status = 'published'/.test(stmts[0].sql) && touches(stmts, ["q3"]) ? "publish floor: under 20,000 chars" : null;
  const d = freshEnv(rows, { hooksLiving: { failBatch: failRestore } });
  const rd = await mod.__job(d.env);
  const dd = dump(d);
  ok(rd.status === "ok" && rd.notes.restored === 12 && rd.notes.restore_refused === 1, "a restore the living-paper floor refuses is counted and the other 12 restores go through", rd.notes);
  ok(dd.papers.find((p) => p.slug === "q3").status === "quarantined" && dd.audit.some((x) => x.slug === "q3" && x.decision === "restore-refused" && /publish floor/.test(x.reason)), "the refused paper stays quarantined with a restore-refused audit row");
  ok(dd.papers.filter((p) => /^q\d+$/.test(p.slug) && p.slug !== "q3").every((p) => p.status === "published"), "the quarantines after it in rowid order are restored (the page cursor moves past a refusal)");
}

// ---- source guards: the unbounded read must not come back
{
  const a = src.indexOf("async function jobQualityScore"), z = src.indexOf('__name(jobQualityScore, "jobQualityScore")');
  const body = src.slice(a, z);
  ok(a > 0 && z > a, "found jobQualityScore in the worker source");
  ok(/QUALITY-SCORE-MEMORY-1/.test(body) && /QUALITY-SCORE-MEMORY-1/.test(src.slice(src.indexOf("async function pubGateReadPage"), a)), "QUALITY-SCORE-MEMORY-1 is written next to the paging code (the code-probe reads it)");
  ok(!/FROM papers WHERE status\s*=\s*'published'"\)\.all\(\)/.test(src) && !/FROM papers WHERE status = 'quarantined' AND release_gate_reason LIKE 'quality:%'"\)\.all\(\)/.test(src), "no unbounded read of papers with body_md is left in the worker");
  ok(!/\bjudged\b|\blist\.length\b|restoreSets|\bqrows\b/.test(body), "jobQualityScore keeps no list of papers: no `judged`, `list` or `restoreSets`");
  ok(!/FROM papers/.test(body.replace(/UPDATE papers[^"]*/g, "")), "the only papers reads in the sweep go through pubGateReadPage");
}
{
  const [maj, min, pat] = String(mod.__version).split(/[.-]/).map(Number);
  ok(maj > 1 || (maj === 1 && (min > 37 || (min === 37 && pat >= 1))), "VERSION is at least 1.37.1 (patch: QUALITY-SCORE-MEMORY-1)", mod.__version);
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

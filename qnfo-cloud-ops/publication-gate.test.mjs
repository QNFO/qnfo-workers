// PUB-GATE-LOOP-1 (1.23.0, agent_issues 2105) offline suite for qnfo-cloud-ops.
// Proves the failure modes found live on 2026-10-07: the quality sweep wrote only the first 200 of 466 published papers
// (stmts.slice(0, 200)) and still reported ok, and nothing ever wrote papers.release_gate_* or a second
// publication_gate_audit run. Now: every paper is scored, every paper gets a gate verdict, a changed verdict is audited,
// an unchanged one is not rewritten. Since PUB-GATE-NO-WITHDRAW-1 (1.36.0) the sweep never withdraws a published paper: a failing
// verdict is revise, and every paper an earlier version quarantined for quality is restored.
// Run: node qnfo-cloud-ops/publication-gate.test.mjs   -> prints "N passed, 0 failed" (Node 22: node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { jobQualityScore as __job, pubGateScore as __score, pubGateVerdict as __verdict, pubGateSectionStructure as __structure, CRON_COMPANIONS as __comp, JOBS as __jobs, AMS_SCHEDULE as __sched, PUB_GATE_VERSION as __gateVersion, VERSION as __version };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 1400) : "")); } };

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
const orderedSections = "# T\n\n" + [
  "## 1. Introduction",
  "## 2. Background and Related Work",
  "## 3. Methods",
  "## 4. Analysis",
  "## 5. Results",
  "## 6. Discussion",
  "## 7. Practical Implications",
  "## 8. Conclusion",
  "## Appendix A. Derivation"
].join("\n\n") + "\n\n" + "x".repeat(5000) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const misorderedSemanticSections = "# T\n\n" + [
  "## 1. Introduction",
  "## 2. Results",
  "## 3. Methods",
  "## 4. Discussion",
  "## 5. Related Work",
  "## 6. Analysis",
  "## 7. Practical Implications",
  "## 8. Conclusion"
].join("\n\n") + "\n\n" + "x".repeat(5000) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const malformedSections = "# T\n\n" + [
  "## 1. Introduction",
  "## 2. Background and Related Work",
  "## 3. Methods",
  "## 4. Analysis",
  "## 4.1. First derivation",
  "## 5. Results",
  "## Appendix C. Extended derivations",
  "## 7. Discussion",
  "## 7. Practical Implications",
  "## 9. Conclusion"
].join("\n\n") + "\n\n" + "x".repeat(5000) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
const promptResidue = "# T\n\n## In plain language\n\nUse everyday words and active voice. We must restate ONE research paper. Hard rules: every specific number must already appear below.\n\n" + "x".repeat(5000) + "\n\n## Related work\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi\n";

function freshEnv({ papers, mode, ledger }) {
  const audit = new DatabaseSync(":memory:");
  audit.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);");
  if (mode) audit.prepare("INSERT INTO ops_config VALUES ('publication_gate_mode', ?)").run(mode);
  const living = new DatabaseSync(":memory:");
  // PAPER-LEDGER-1 (1.37.0): the gate sets papers.change_actor and papers.change_reason on every write. Plain mode adds the two columns the migration would add;
  // ledger mode loads the real migration (columns, immutable ledger tables, writer triggers, withdrawal guard) over a production-shaped papers table.
  living.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, title TEXT DEFAULT '', authors TEXT DEFAULT '[]', abstract TEXT, doi TEXT, version TEXT DEFAULT '1.0.0', subtitle TEXT, license TEXT, keywords TEXT, journal TEXT, paper_type TEXT, zenodo_doi TEXT, categories TEXT, "references" TEXT,
      slug TEXT, status TEXT, body_md TEXT, updated_at TEXT, release_gate_pass INTEGER DEFAULT 0, release_gate_at TEXT, release_gate_reason TEXT);
    CREATE TABLE paper_body_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, status TEXT, title TEXT, body_md TEXT NOT NULL, captured_at TEXT NOT NULL, reason TEXT);
    CREATE TABLE publication_gate_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, run_at TEXT DEFAULT (datetime('now')), slug TEXT, status TEXT, mode TEXT, decision TEXT, reason TEXT, score INTEGER, quality_flag TEXT, body_len INTEGER, has_abstract INTEGER, refs INTEGER, gate_version TEXT);`);
  if (ledger) living.exec(readFileSync(new URL("../migrations/living-paper/2026-10-26-paper-change-ledger.sql", import.meta.url), "utf8"));
  else living.exec("ALTER TABLE papers ADD COLUMN change_actor TEXT; ALTER TABLE papers ADD COLUMN change_reason TEXT;");
  const ins = living.prepare("INSERT INTO papers (identifier, slug, status, body_md) VALUES (?, ?, ?, ?)");
  for (const [slug, status, body, ident] of papers) ins.run(ident || slug, slug, status, body);
  const counter = { batches: 0, maxBatch: 0 };
  const env = { AUDIT: d1(audit, counter), LIVING: d1(living, counter) };
  return { env, audit, living, counter };
}

// 1. Scorer and verdicts.
ok(mod.__score(good).score >= 50 && mod.__verdict(mod.__score(good)).decision === "pass", "a referenced paper with a table passes", mod.__score(good));
ok(mod.__structure(orderedSections).ok, "ordered numbered sections and an appendix after the main body pass", mod.__structure(orderedSections));
ok(!mod.__structure(misorderedSemanticSections).ok && mod.__structure(misorderedSemanticSections).issues.includes("section-title-order"), "semantically misordered sections fail even when numbering is sequential", mod.__structure(misorderedSemanticSections));
const malformed = mod.__score(malformedSections);
ok(malformed.score >= 50 && malformed.flag === "structure" && !malformed.structure.ok, "a high-scoring paper with skipped and duplicate section numbers and an appendix in the middle fails structure", malformed);
ok(mod.__verdict(malformed).decision === "revise" && / quality:structure/.test(mod.__verdict(malformed).reason), "a structural failure is revise with its reason", mod.__verdict(malformed));
const residue = mod.__score(promptResidue);
ok(residue.score >= 50 && residue.flag === "prompt-residue" && mod.__verdict(residue).decision === "revise" && mod.__verdict(residue).pass === 0, "generation instructions in the body fail independently of length and references", residue);
const tq = mod.__score(thin);
ok(tq.flag === "thin" && mod.__verdict(tq).decision === "revise" && mod.__verdict(tq).pass === 0, "a thin paper is revise, not pass", tq);
ok(/missing=refs<3,no-prior-work-section,no-table-or-code/.test(mod.__verdict(tq).reason), "the revise reason names what is missing", mod.__verdict(tq));
ok(mod.__verdict(mod.__score(junk)).decision === "revise" && mod.__verdict(mod.__score(junk)).pass === 0, "a score under 25 is revise, never a withdrawal");

// 2. The 2026-10-07 defect: 466 published papers, the sweep scored 200. Every paper is scored and gated now.
{
  const papers = [];
  for (let i = 0; i < 466; i++) papers.push(["p" + i, "published", i % 3 ? good : thin]);
  papers.push(["draft-1", "draft", junk]);
  const { env, audit, living, counter } = freshEnv({ papers });
  const r = await mod.__job(env);
  const scored = audit.prepare("SELECT COUNT(*) n, COUNT(DISTINCT slug) d FROM quality_scores").get();
  ok(r.rows === 466 && scored.n === 466 && scored.d === 466, "all 466 published papers scored (was 200)", { r, scored });
  ok(counter.maxBatch <= 100, "no batch over 100 statements", counter);
  const gated = living.prepare("SELECT COUNT(*) n FROM papers WHERE release_gate_at IS NOT NULL").get().n;
  ok(r.status === "ok" && gated === 466, "the first run gives every published paper a verdict", { gated, notes: r.notes });
  ok(living.prepare("SELECT release_gate_at FROM papers WHERE slug='draft-1'").get().release_gate_at === null, "a draft is not gated or touched");
  // Following hourly runs drain the backlog without duplicating that day's score snapshots.
  const all = living.prepare("SELECT SUM(release_gate_pass) p, COUNT(*) n, SUM(release_gate_at IS NOT NULL) g FROM papers WHERE status='published'").get();
  ok(all.g === 466 && all.p === papers.filter((p) => p[1] === "published" && p[2] === good).length, "every published paper has a verdict; release_gate_pass = 1 exactly on passing papers", all);
  const auditN = living.prepare("SELECT COUNT(*) n FROM publication_gate_audit").get().n;
  const r3 = await mod.__job(env);
  ok(r3.notes.verdicts_changed === 0 && living.prepare("SELECT COUNT(*) n FROM publication_gate_audit").get().n === auditN, "an unchanged verdict is not rewritten or re-audited", r3.notes);
  ok(r3.status === "ok" && r3.rows === 466 && r3.notes.score_snapshots_written === 0 && audit.prepare("SELECT COUNT(*) n FROM quality_scores").get().n === 466, "an hourly sweep still scores all papers without duplicate same-day snapshots", { r3, snapshots: audit.prepare("SELECT COUNT(*) n FROM quality_scores").get().n });
  living.prepare("INSERT INTO papers (identifier, slug, status, body_md) VALUES (?, ?, ?, ?)").run("new-today", "new-today", "published", good);
  const rNew = await mod.__job(env);
  ok(rNew.rows === 467 && rNew.notes.score_snapshots_written === 1 && audit.prepare("SELECT COUNT(*) n FROM quality_scores WHERE slug='new-today'").get().n === 1, "an hourly sweep snapshots a newly published paper once", { rNew: rNew.notes });
  ok(auditN === 466 && living.prepare("SELECT COUNT(DISTINCT run_id) n FROM publication_gate_audit").get().n >= 2, "one audit row per verdict, each run with its own run_id");
  // A paper revised to pass flips its verdict and gets an audit row.
  living.prepare("UPDATE papers SET body_md = ? WHERE slug = 'p0'").run(good);
  const r4 = await mod.__job(env);
  const p0 = living.prepare("SELECT release_gate_pass, release_gate_reason FROM papers WHERE slug='p0'").get();
  ok(r4.notes.verdicts_changed === 1 && p0.release_gate_pass === 1 && /^ok score=/.test(p0.release_gate_reason), "a revised paper flips to pass with an audit row", { notes: r4.notes, p0 });
}

// 3. PUB-GATE-NO-WITHDRAW-1: no verdict withdraws a published paper, in any mode.
{
  const { env, living } = freshEnv({ papers: [["a", "published", good], ["b", "published", junk], ["bad-structure", "published", malformedSections], ["res", "published", promptResidue], ["own", "published", malformedSections, "qnfo-2025-00-own"]] });
  const r = await mod.__job(env);
  const rows = living.prepare("SELECT slug, status, release_gate_pass, release_gate_reason FROM papers ORDER BY slug").all();
  ok(rows.every((x) => x.status === "published") && r.notes.quarantined === 0, "every paper stays published", { rows, notes: r.notes });
  const b = rows.find((x) => x.slug === "b"), bs = rows.find((x) => x.slug === "bad-structure"), own = rows.find((x) => x.slug === "own");
  ok(b.release_gate_pass === 0 && /^kept published, revise: quality:quarantine-candidate/.test(b.release_gate_reason), "a low score is marked for revision with its reason", b);
  ok(bs.release_gate_pass === 0 && /quality:structure/.test(bs.release_gate_reason), "a structure failure is marked for revision with its reason", bs);
  ok(/^owner-paper kept published: /.test(own.release_gate_reason), "an owner paper is named as kept published", own);
  const ab = living.prepare("SELECT decision, status, gate_version FROM publication_gate_audit WHERE slug='b'").get();
  ok(ab && ab.decision === "revise" && ab.status === "published" && ab.gate_version === mod.__gateVersion, "the verdict is audited as revise", ab);
}
{
  const papers = [];
  for (let i = 0; i < 40; i++) papers.push(["j" + i, "published", junk]);
  const { env, living } = freshEnv({ papers });
  const r = await mod.__job(env);
  ok(r.status === "ok" && living.prepare("SELECT COUNT(*) n FROM papers WHERE status='published'").get().n === papers.length, "a mass of low scores withdraws nothing", r);
}

// 4. Every paper an earlier gate version quarantined for quality is restored in one run, whatever its verdict or mode.
const h1Sections = "# T\n\n# 1. Introduction\n\n## 1.1 Scope\n\n# 2. Methods\n\n## 2.1 Setup\n\n## Related work\n\n" + "x".repeat(5000) + "\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n10.1000/abc 10.1000/def 10.1000/ghi arXiv:2401.12345\n";
{
  const st = mod.__structure(h1Sections);
  ok(st.ok && st.soft.includes("subsection-without-section-1"), "a subsection under an H1 section is a soft issue, not a structure failure", st);
  ok(mod.__verdict(mod.__score(h1Sections)).decision === "pass", "that paper passes", mod.__verdict(mod.__score(h1Sections)));
  ok(mod.__verdict(residue, { identifier: "qnfo-2025-00-z" }).decision === "revise", "prompt residue in an owner paper is revise");
  ok(mod.__verdict(malformed, { identifier: "qnf-2026-1" }).decision === "revise", "a pipeline paper with hard structure issues is revise");
}
for (const mode of ["enforce", "shadow"]) {
  const papers = [["h1", "quarantined", h1Sections], ["own", "quarantined", malformedSections, "qnfo-2025-00-own"], ["bad", "quarantined", malformedSections], ["res", "quarantined", promptResidue], ["other", "quarantined", h1Sections]];
  for (let i = 0; i < 150; i++) papers.push(["q" + i, "quarantined", junk]);
  const { env, living } = freshEnv({ papers, mode });
  living.exec("UPDATE papers SET release_gate_reason = 'quality:structure subsection-without-section-1' WHERE slug != 'other'; UPDATE papers SET release_gate_reason = NULL WHERE slug = 'other'");
  const r = await mod.__job(env);
  const st = (slug) => living.prepare("SELECT status FROM papers WHERE slug = ?").get(slug).status;
  ok(["h1", "own", "bad", "res", "q0", "q149"].every((x) => st(x) === "published"), mode + ": every quality quarantine is restored in one run", r.notes);
  ok(st("other") === "quarantined", mode + ": a paper quarantined by something else (no quality: reason) is not touched");
  ok(r.notes.restored === 154 && living.prepare("SELECT COUNT(*) n FROM publication_gate_audit WHERE decision = 'restore'").get().n === 154, mode + ": each restore is counted and audited", r.notes);
  const r2 = await mod.__job(env);
  ok(st("bad") === "published" && r2.notes.restored === 0, mode + ": the next run keeps them published", r2.notes);
}

// 4b. PAPER-LEDGER-1 (1.37.0): the one gate write the ledger records, a restore from quarantine, arrives attributed to the run; verdict-only writes are not ledger events.
{
  const papers = [["lg-good", "published", good], ["lg-thin", "published", thin], ["lg-q", "quarantined", thin]];
  const { env, living } = freshEnv({ papers, ledger: true });
  living.exec("UPDATE papers SET release_gate_reason = 'quality:internal-artifact' WHERE slug = 'lg-q'");
  const before = living.prepare("SELECT COUNT(*) n FROM paper_change_ledger").get().n;
  const r = await mod.__job(env);
  const rows = living.prepare("SELECT slug, kind, fields_changed, actor, reason, status_before, status_after, withdrawal FROM paper_change_ledger WHERE seq > ? ORDER BY seq").all(before);
  ok(r.status === "ok" && r.notes.verdicts_changed === 2 && r.notes.restored === 1 && rows.length === 1 && rows[0].slug === "lg-q", "a sweep that flips two verdicts and restores one paper writes one ledger row, the restore", { notes: r.notes, rows: JSON.stringify(rows) });
  ok(r.notes.ledger_archive && r.notes.ledger_archive.limit_bytes > 0 && r.notes.ledger_archive.archived === 0 && r.status === "ok", "the sweep also measures the ledger bodies (PAPER-LEDGER-ARCHIVE-1) and archives none under the limit", r.notes.ledger_archive);
  const restore = rows[0] || {};
  ok(/^qnfo-cloud-ops:pg-\d{4}-\d{2}-\d{2}-/.test(restore.actor), "the restore names the qnfo-cloud-ops run that wrote it, it is not unattributed", restore);
  ok(restore.status_before === "quarantined" && restore.status_after === "published" && restore.withdrawal === 0 && /restore of a quality quarantine: quality:internal-artifact/.test(restore.reason), "the restore says which quarantine it undoes and is not a withdrawal", restore);
  const r2 = await mod.__job(env);
  ok(r2.notes.verdicts_changed === 0 && living.prepare("SELECT COUNT(*) n FROM paper_change_ledger").get().n === before + 1, "an unchanged second run adds no ledger rows", r2.notes);
  // a later verdict flip (revised body, written by another writer) is the body edit's row alone: the gate adds no second row for the flip
  living.prepare("UPDATE papers SET body_md = ?, change_actor = 'qnfo-research-exec:test', change_reason = 'revised for the test' WHERE slug = 'lg-thin'").run(good);
  const r3 = await mod.__job(env);
  const rev = living.prepare("SELECT actor, fields_changed FROM paper_change_ledger WHERE slug = 'lg-thin' AND kind = 'update' ORDER BY seq").all();
  ok(r3.notes.verdicts_changed === 1 && rev.length === 1 && rev[0].actor === "qnfo-research-exec:test" && rev[0].fields_changed === "body_md", "a verdict flip after a revision leaves the revision's own attributed row as the only entry", { n: r3.notes, rev });
  const w = living.prepare("SELECT COUNT(*) n FROM paper_change_ledger WHERE withdrawal = 1").get().n;
  ok(w === 0, "no sweep produced a withdrawal row", w);
}
// 4c. "1.0 Introduction" is section 1 written with a decimal, not a subsection of a section that was never opened.
{
  const dec = ["# T", "## 1.0 Introduction", "## 2.0 Methods", "## 3.0 Results", "## 4.0 Conclusion"].join("\n\n") + "\n";
  const st = mod.__structure(dec);
  ok(st.ok && !st.soft.length, "decimal-zero section headings are sections in sequence", st);
  const skip = mod.__structure(["# T", "## 1.0 Introduction", "## 3.0 Results"].join("\n\n"));
  ok(!skip.ok && skip.issues.includes("section-sequence-2-to-3"), "a skipped decimal-zero section still fails the sequence check", skip);
  const sub = mod.__structure(["# T", "## 1.0 Introduction", "## 1.1 Scope", "## 2. Methods"].join("\n\n"));
  ok(sub.ok && !sub.soft.length, "1.1 under 1.0 is an ordinary subsection", sub);
}

// 5. Wiring: hourly quality enforcement, daily topic metric, no new Worker cron trigger.
ok(mod.__jobs["quality-score"] === mod.__job, "quality-score dispatches to the gated sweep");
ok(mod.__sched["quality-score"] && mod.__sched["quality-score"].days === "*" && mod.__sched["quality-score"].times.length === 24 && mod.__sched["quality-score"].times.every((t, i) => t === String(i).padStart(2, "0") + ":20"), "publication gate runs every hour");
ok(mod.__sched["idea-topic-metric"] && mod.__sched["idea-topic-metric"].times.join() === "06:25" && !(mod.__comp["quality-score"] || []).includes("idea-topic-metric"), "idea-topic metric retains its daily cadence outside the hourly companion slot");
const [maj, min] = String(mod.__version).split(/[.-]/).map(Number);
ok(maj > 1 || (maj === 1 && min >= 37), "VERSION is at least 1.37 (minor bump: the gate attributes its writes in the paper revision ledger)", mod.__version);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

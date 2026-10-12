// NOZ-SCRUB-LOOP-1 offline suite (qnfo-lifecycle 1.11.0, agent_issues 2273 and 2278). Drives the real default export of
// qnfo-lifecycle/worker.js: the line scrubber on lines taken from living-paper.papers on 2026-10-12 (a DOI link, "deposited
// on Zenodo", reference-list entries, a "Companion to DOI 10.5281/zenodo.X" line, YAML front matter, table rows), the row
// scrubber (title placeholder, DOI columns, body_html), and the hourly tick against an in-memory SQLite living-paper:
// backup first (one papers_bak_nozdoi row per changed field, old value kept), bounded batch, idempotent second run,
// rollback from the backup restores the original bytes, no row keeps the registrar, and prose around it survives.
// Run: node qnfo-lifecycle/noz-scrub.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";

const W = (await import("./worker.js")).default;
const N = W.__noz;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const Z = /zenodo/i;

ok(N && typeof N.line === "function" && typeof N.tick === "function", "the scrubber is exposed on the default export (__noz)");
ok(typeof W.scheduled === "function" && typeof W.fetch === "function", "fetch and scheduled survive the wrapper");
ok(W.__foldMember && W.__foldMember.name === "calendar-api", "the fold member survives the wrapper");

// Line cases: [input, expected output (null = the line goes)].
const cases = [
  ["**DOI:** [10.5281/zenodo.19483603](http://doi.org/10.5281/zenodo.19483603)", null],
  ["doi: \"10.5281/zenodo.22034455\"", null],
  ["concept_doi: \"10.5281/zenodo.22031551\"", null],
  ["https://doi.org/10.5281/zenodo.18543167", null],
  ["| **DOI** | 10.5281/zenodo.21515744 |", null],
  ["The paper is deposited on Zenodo and mirrored on GitHub.", "The paper is mirrored on GitHub."],
  ["Companion to DOI 10.5281/zenodo.21254143, this note extends the argument to post-particle computation.", "Companion to an earlier paper, this note extends the argument to post-particle computation."],
  ["Companion paper to \"The Qubit Delusion\" (v1.1, 10.5281/zenodo.21254143). If the qubit model is an epistemic failure, then what?", "Companion paper to \"The Qubit Delusion\" (v1.1). If the qubit model is an epistemic failure, then what?"],
  ["[1] QNFO, \"The Qubit Delusion: How Particle Ontology Sabotaged Quantum Computing,\" Zenodo, 2026. DOI: 10.5281/zenodo.21254143.", "[1] QNFO, \"The Qubit Delusion: How Particle Ontology Sabotaged Quantum Computing.\""],
  ["[9] DOI 10.5281/zenodo.18441401. QNFO: Structural vs Driven Quantum Coherence.", "[9] QNFO: Structural vs Driven Quantum Coherence."],
  ["7. QNFO. *Unifying Photosynthetic Energy Transduction*. Zenodo, 2026. DOI 10.5281/zenodo.18330366.", "7. QNFO. *Unifying Photosynthetic Energy Transduction*."],
  ["5. Quni-Gudzinas, R. B. (2025). *Thermodynamic Constraints.* Zenodo. DOI: 10.5281/zenodo.17938113. `[PROP]`", "5. Quni-Gudzinas, R. B. (2025). *Thermodynamic Constraints.* `[PROP]`"],
  ["Memory. *Zenodo*. https://doi.org/10.5281/zenodo.18195888", "Memory."],
  ["In the companion paper \"Zitterbewegung as a p-Adic Observable\" (P1, DOI: 10.5281/zenodo.21211007), we demonstrated it.", "In the companion paper \"Zitterbewegung as a p-Adic Observable\" (P1), we demonstrated it."],
  ["**Contact:** a@b.org **ORCID:** 0009-0002-4317-5604 **DOI:** 10.5281/zenodo.18619077 **Date:**", "**Contact:** a@b.org **ORCID:** 0009-0002-4317-5604 **Date:**"],
  ["The literature search across 8 sources (OpenAlex, Crossref, Zenodo, Europe PMC, arXiv) found none.", "The literature search across 8 sources (OpenAlex, Crossref, Europe PMC, arXiv) found none."],
  ["| **Preprint servers** | arXiv, Zenodo | Variable | Open-access by design. |", "| **Preprint servers** | arXiv | Variable | Open-access by design. |"],
  ["A Zenodo document (DOI 10.5281/zenodo.19605445) proposes a \"Meta-Pattern of Reification in Physics\".", "A document proposes a \"Meta-Pattern of Reification in Physics\"."],
  ["(DOI 10.5281/zenodo.21938971). It separates three things that are often conflated in", "It separates three things that are often conflated in"],
  ["    10.5281/zenodo.21120286 (2026).", "    (2026)."],
  ["**Status:** Published v0.3 (2026-08-17 — DOI 10.5281/zenodo.21974194; concept 10.5281/zenodo.21931224)", "**Status:** Published v0.3 (2026-08-17)"],
  ["| Gauge-Invariant Field Theory [10] (10.5281/zenodo.18466522) | **Logical Cloning Prohibition** |", "| Gauge-Invariant Field Theory [10] | **Logical Cloning Prohibition** |"],
  // Lines that do not name the registrar are returned byte-identical, third-party DOIs included.
  ["See Maity et al. (doi:10.1103/PhysRevLett.130.010201) and arXiv:2608.03944.", "See Maity et al. (doi:10.1103/PhysRevLett.130.010201) and arXiv:2608.03944."],
  ["    $$ \\frac{a}{b}  =  c $$   ", "    $$ \\frac{a}{b}  =  c $$   "],
];
for (const [inp, want] of cases) {
  const got = N.line(inp);
  ok(got === want, "line: " + inp.slice(0, 70), { got, want });
}

// A whole body: only lines that name the registrar change (a changed line also loses doubled spaces); the rest is
// byte-identical, code blocks included.
const body = [
  "---", "title: \"A paper\"", "doi: \"10.5281/zenodo.22133122\"", "status: \"published\"", "---", "",
  "# A Paper on Ultrametric Codes", "",
  "**Author:** R. B. Quni-Gudzinas", "**DOI:** 10.5281/zenodo.17686442 **Publication Date:** 2025-11-23 **Version:** 1.0", "",
  "The result extends the companion audit (10.5281/zenodo.21964674) to tree codes.  Two spaces stay here.", "",
  "```python", "x = fetch('https://example.org/api')  # untouched", "```", "",
  "## References", "",
  "1. Maity, A. et al. (2026). A no-go theorem. arXiv:2608.03944.",
  "2. Quni-Gudzinas, R. B. (2026). *Bruhat-Tits Quantum Processor.* Zenodo. DOI: 10.5281/zenodo.20109835. `[PROP]`",
  "3. QNFO. The paper is open access on Zenodo.", ""
].join("\n");
const out = N.text(body);
ok(!Z.test(out) && !/10\.5281\//.test(out), "body: no registrar text or DOI remains", out);
for (const keep of ["# A Paper on Ultrametric Codes", "**Author:** R. B. Quni-Gudzinas", "The result extends the companion audit to tree codes. Two spaces stay here.", "x = fetch('https://example.org/api')  # untouched", "1. Maity, A. et al. (2026). A no-go theorem. arXiv:2608.03944.", "2. Quni-Gudzinas, R. B. (2026). *Bruhat-Tits Quantum Processor.* `[PROP]`", "3. QNFO. The paper is open access.", "status: \"published\"", "**Publication Date:** 2025-11-23 **Version:** 1.0"]) {
  ok(out.split("\n").includes(keep), "body keeps: " + keep.slice(0, 60), out);
}
ok(out.split("\n").length === body.split("\n").length - 1, "body: exactly the front-matter DOI line goes", out.split("\n").length);
ok(N.text(body) === N.text(N.text(body)), "body: scrubbing is idempotent");
ok(N.text("no mention here\r\nline two") === "no mention here\r\nline two", "text without the registrar is returned unchanged");

// Row scrubber: placeholder titles, DOI columns, body_html.
const r1 = N.row({ title: "[Zenodo] 10.5281/zenodo.21017184", abstract: null, body_md: null, doi: "10.5281/zenodo.21017184", zenodo_doi: "10.5281/zenodo.21017184", zenodo_url: "https://zenodo.org/records/21017184", pdf_url: null, html_url: null, body_html: null, references: null });
ok(r1.changes.title === "Untitled record" && r1.changes.doi === null && r1.changes.zenodo_doi === null && r1.changes.zenodo_url === null && r1.residual.length === 0, "placeholder row: title neutral, DOI columns NULL", r1);
const r2 = N.row({ title: "[Zenodo] 10.5281/zenodo.1", body_md: "# Real Heading Here\n\nText.", doi: "10.1103/x.y", zenodo_doi: "", body_html: "<p>see <a href=\"https://zenodo.org/records/1\">x</a></p>", pdf_url: "https://zenodo.org/records/1/files/a.pdf", html_url: "https://papers.qnfo.org/a" });
ok(r2.changes.title === "Real Heading Here" && !("doi" in r2.changes) && r2.changes.body_html === null && r2.changes.pdf_url === null && !("html_url" in r2.changes) && !("body_md" in r2.changes), "row: title from the body heading, third-party DOI kept, body_html and registrar URL cleared", r2);
const r3 = N.row({ title: "Infomatics", abstract: "Falsifiable prediction: small-integer p-adic expansion of 1/alpha. DOI: 10.5281/zenodo.21436808.", body_md: "plain" });
ok(r3.changes.abstract === "Falsifiable prediction: small-integer p-adic expansion of 1/alpha." && !("title" in r3.changes) && !("body_md" in r3.changes), "row: abstract cleaned, untouched fields absent from changes", r3);

// The tick against an in-memory living-paper.
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '[]', abstract TEXT, doi TEXT, zenodo_doi TEXT, zenodo_url TEXT, pdf_url TEXT, html_url TEXT, body_md TEXT, body_html TEXT, "references" TEXT, status TEXT DEFAULT 'published', slug TEXT, updated_at TEXT);`);
const ins = db.prepare("INSERT INTO papers (identifier, title, abstract, doi, zenodo_doi, zenodo_url, body_md, body_html, status, slug) VALUES (?,?,?,?,?,?,?,?,?,?)");
const originals = {};
for (let i = 0; i < 7; i++) {
  const row = ["id-" + i, i === 0 ? "[Zenodo] 10.5281/zenodo.2101718" + i : "Paper " + i, i === 1 ? "An abstract. Deposited on Zenodo." : "Plain abstract.", i % 2 ? "10.5281/zenodo.2200000" + i : "10.9999/third." + i, i % 3 ? "10.5281/zenodo.2200000" + i : null, i === 4 ? "https://zenodo.org/records/4" : null, body.replace("A Paper", "Paper " + i), i === 5 ? "<p>Zenodo</p>" : null, i === 6 ? "duplicate" : "published", "paper-" + i];
  ins.run(...row);
  originals["id-" + i] = row;
}
ins.run("id-clean", "Clean paper", "Nothing to see.", "10.9999/clean", null, null, "# Clean\n\nNo registrar here.", null, "published", "clean");
function d1(dbx) {
  const stmt = (sql) => {
    let args = [];
    const self = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
      async all() { return { results: dbx.prepare(sql).all(...args) }; },
      async first() { return dbx.prepare(sql).get(...args) || null; },
      async run() { const r = dbx.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      _exec() { return dbx.prepare(sql).run(...args); }
    };
    return self;
  };
  return { prepare: stmt, async batch(list) { dbx.exec("BEGIN"); try { const r = list.map((s) => s._exec()); dbx.exec("COMMIT"); return r; } catch (e) { dbx.exec("ROLLBACK"); throw e; } } };
}
const env = { LIVING_PAPER: d1(db) };
const remaining = () => db.prepare("SELECT COUNT(*) AS n FROM papers WHERE " + N.matchSql).get().n;
ok(remaining() === 7, "fixture: seven rows match before the tick", remaining());
const t1 = await N.tick(env, { batch: 4 });
ok(t1.selected === 4 && t1.updated === 4 && t1.errors.length === 0, "tick 1 takes a bounded batch of four", t1);
ok(remaining() === 3, "three rows left after tick 1", remaining());
const t2 = await N.tick(env, { batch: 4 });
ok(t2.updated === 3 && remaining() === 0 && t2.residual === 0, "tick 2 finishes; nothing matches", [t2, remaining()]);
const t3 = await N.tick(env, { batch: 4 });
ok(t3.selected === 0 && t3.updated === 0, "tick 3 is a no-op (idempotent)", t3);
const all = db.prepare("SELECT * FROM papers").all();
ok(all.every((r) => !Z.test([r.title, r.abstract, r.body_md, r.body_html, r.zenodo_url].join(" ")) && !/10\.5281\//.test(String(r.doi || "") + String(r.zenodo_doi || ""))), "no row names the registrar or carries its DOI after the loop");
ok(all.find((r) => r.identifier === "id-0").title === "Paper 0 on Ultrametric Codes", "placeholder title takes the body heading", all.find((r) => r.identifier === "id-0").title);
ok(all.find((r) => r.identifier === "id-2").doi === "10.9999/third.2", "a third-party DOI is kept");
ok(all.find((r) => r.identifier === "id-clean").body_md === "# Clean\n\nNo registrar here." && all.find((r) => r.identifier === "id-clean").updated_at === null, "a clean row is never touched");
ok(all.find((r) => r.identifier === "id-1").abstract === "An abstract.", "abstract prose survives", all.find((r) => r.identifier === "id-1").abstract);
const bak = db.prepare("SELECT src_rowid, identifier, field, old_value FROM papers_bak_nozdoi").all();
ok(bak.length > 0 && bak.every((b) => b.field !== "__residual"), "backup rows written, none residual", bak.length);
const b0 = bak.find((b) => b.identifier === "id-0" && b.field === "body_md");
ok(b0 && b0.old_value === originals["id-0"][6], "backup keeps the original body bytes");
// Rollback from the backup restores every changed field exactly (the migration-style rollback in the block header).
for (const f of ["title", "abstract", "body_md", "body_html", "doi", "zenodo_doi", "zenodo_url"]) {
  const col = f === "references" ? "\"references\"" : f;
  db.exec(`UPDATE papers SET ${col} = (SELECT old_value FROM papers_bak_nozdoi b WHERE b.src_rowid = papers.rowid AND b.field = '${f}') WHERE rowid IN (SELECT src_rowid FROM papers_bak_nozdoi WHERE field = '${f}')`);
}
const back = db.prepare("SELECT identifier, title, abstract, doi, zenodo_doi, zenodo_url, body_md, body_html FROM papers WHERE identifier LIKE 'id-%' AND identifier <> 'id-clean' ORDER BY identifier").all();
ok(back.every((r) => { const o = originals[r.identifier]; return r.title === o[1] && r.abstract === o[2] && r.doi === o[3] && r.zenodo_doi === o[4] && r.zenodo_url === o[5] && r.body_md === o[6] && r.body_html === o[7]; }), "rollback from papers_bak_nozdoi restores the original rows");
// A second loop after the rollback keeps the first backup (INSERT OR IGNORE): the original bytes are never overwritten.
await N.tick(env, { batch: 10 });
ok(db.prepare("SELECT old_value FROM papers_bak_nozdoi WHERE identifier = 'id-0' AND field = 'body_md'").get().old_value === originals["id-0"][6], "a re-run keeps the first backup copy");
ok(remaining() === 0, "the re-run cleans the rows again", remaining());

// The status route answers JSON with what is left.
const sr = await W.fetch(new Request("https://qnfo-lifecycle.q08.workers.dev/noz-scrub/status"), env, { waitUntil() {} });
const sj = await sr.json();
ok(sr.status === 200 && sj.marker === "NOZ-SCRUB-LOOP-1" && sj.remaining === 0 && sj.rows_scrubbed === 7, "GET /noz-scrub/status reports remaining 0 and 7 rows scrubbed", sj);

// The scheduled handler runs the tick after the host's own jobs, even when the host throws.
const db2 = new DatabaseSync(":memory:");
db2.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, title TEXT NOT NULL, abstract TEXT, doi TEXT, zenodo_doi TEXT, zenodo_url TEXT, pdf_url TEXT, html_url TEXT, body_md TEXT, body_html TEXT, "references" TEXT, status TEXT, slug TEXT, updated_at TEXT);`);
db2.prepare("INSERT INTO papers (identifier, title, body_md, status, slug) VALUES ('a', 'A', 'Text. Deposited on Zenodo.', 'published', 'a')").run();
let threw = null;
try { await W.scheduled({ cron: "0 3 1 1 *", scheduledTime: Date.UTC(2026, 9, 12, 3, 0) }, { LIVING_PAPER: d1(db2) }, { waitUntil() {} }); } catch (e) { threw = e; }
ok(db2.prepare("SELECT body_md FROM papers").get().body_md === "Text.", "the scheduled handler ran the scrub tick", [db2.prepare("SELECT body_md FROM papers").get(), String(threw)]);

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);

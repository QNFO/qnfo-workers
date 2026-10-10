// REVISER-GROUND-1 offline suite (qnfo-paper-reviser 1.3.0, owner directive 2026-10-10: nothing is written into a paper that the
// paper itself does not support). Drives the real scheduled() handler against in-memory SQLite D1s and a stub AI and proves:
// the audit prompt no longer calls a terminology bridge "low" or names example domains; a "low" edit that inserts a bridge
// sentence, a new name, year or figure is treated as high (flagged, never queued, never applied); a plain spelling fix is
// still applied; the same guard text is in the qnfo-research-exec member.
// Run: node qnfo-paper-reviser/ground.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const self = {
        bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
      };
      return self;
    }
  };
}
function freshDbs() {
  const audit = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, doi TEXT, title TEXT, version_from TEXT, version_to TEXT, audit_summary TEXT, findings_json TEXT, status TEXT DEFAULT 'queued', changelog TEXT, new_doi TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE version_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, paper_doi TEXT, slug TEXT, title TEXT, version_from TEXT, version_to TEXT, corrected_md TEXT, status TEXT, references_bib TEXT, citation_audit TEXT, due_diligence TEXT, project_plan TEXT, readme_md TEXT, verify_script TEXT, verify_output TEXT, license_md TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE internal_errata (id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_ref TEXT NOT NULL, detected_at TEXT NOT NULL, detected_by TEXT, severity TEXT DEFAULT 'high', claim_text TEXT, falsification TEXT, evidence TEXT, remediation TEXT, status TEXT DEFAULT 'open', owner TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER UNIQUE, source TEXT NOT NULL DEFAULT 'inbound-email', sender TEXT, subject TEXT, paper_doi TEXT, claim TEXT, confidence REAL, status TEXT DEFAULT 'detected', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));`);
  const papers = new DatabaseSync(":memory:");
  papers.exec("CREATE TABLE papers (slug TEXT PRIMARY KEY, doi TEXT, zenodo_doi TEXT, title TEXT, version TEXT, body_md TEXT, paper_type TEXT, status TEXT, created_at TEXT)");
  return { audit, papers };
}

const BODY = "# A Paper\n\n## Abstract\n\nThe entropy term is defined in Section 2. The lattice term is used in Section 3 without a definition.\n\nThis sentense has a typo.\n\n" + "Body text with a claim. ".repeat(500);
function seedPaper(papers, slug, recid) {
  papers.prepare("INSERT INTO papers (slug, doi, zenodo_doi, title, version, body_md, paper_type, status, created_at) VALUES (?, ?, ?, ?, '1.0.0', ?, 'paper', 'published', datetime('now'))")
    .run(slug, "10.5281/zenodo." + recid, "10.5281/zenodo." + recid, "Paper " + slug, BODY);
}
let auditReply = "", lastPrompt = "";
const ai = { async run(model, input) { lastPrompt = JSON.stringify(input); return { response: auditReply }; } };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/versions")) return new Response(JSON.stringify({ hits: { hits: [{ doi: "x" }] } }), { status: 200, headers: { "content-type": "application/json" } });
  if (u.startsWith("https://zenodo.org/api/records/")) return new Response(JSON.stringify({ conceptrecid: "1", doi: "x", files: [] }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("not found", { status: 404 });
};
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const ctx = { waitUntil() {} };
let passed = 0, failed = 0;
const check = (n, c, d) => { if (c) passed++; else { failed++; console.log("FAIL " + n + (d ? " :: " + String(d).slice(0, 300) : "")); } };

async function runWith(issues, slug, recid) {
  const { audit, papers } = freshDbs();
  seedPaper(papers, slug, recid);
  auditReply = JSON.stringify({ issues });
  await worker.scheduled({ cron: "37 */4 * * *" }, { AI: ai, PAPERS_DB: d1(papers), WATCH_DB: d1(audit) }, ctx);
  return { log: audit.prepare("SELECT status, findings_json FROM paper_revision_log").all(), queued: audit.prepare("SELECT corrected_md FROM version_queue").all() };
}

// prompt
{
  await runWith([], "p0", "2000");
  check("the audit prompt no longer calls a terminology bridge low severity", !/terminology-bridge/.test(lastPrompt) && !/cross-domain bridge/.test(lastPrompt), lastPrompt.slice(0, 200));
  check("the audit prompt makes every inserted assertion high and bans memory", /ANY inserted or rewritten sentence that asserts/.test(lastPrompt) && /never add content from memory/.test(lastPrompt));
}
// a bridge sentence labelled low is demoted: flagged, not queued
{
  const r = await runWith([{ severity: "low", category: "terminology-isolation", location: "The lattice term is used in Section 3 without a definition.", fix: "The lattice term is used in Section 3 without a definition. It corresponds to the same structure studied in solid-state physics.", reason: "bridge", confidence: 0.8 }], "p1", "2001");
  check("a low bridge sentence is flagged, not queued", r.log.length === 1 && r.log[0].status === "flagged" && r.queued.length === 0, JSON.stringify(r));
  check("the demotion is recorded in the finding", /REVISER-GROUND-1/.test(r.log[0] && r.log[0].findings_json || ""), r.log[0] && r.log[0].findings_json);
}
// a prose edit that adds a name, a year or a figure is demoted even in a surface category
{
  const r = await runWith([{ severity: "low", category: "prose", location: "This sentense has a typo.", fix: "This sentence follows Smith (1987).", reason: "typo" }], "p2", "2002");
  check("a prose edit that adds a name and a year is flagged", r.log[0] && r.log[0].status === "flagged" && r.queued.length === 0, JSON.stringify(r));
  const r2 = await runWith([{ severity: "low", category: "prose", location: "The lattice term", fix: "The lattice term, which makes the result 40% stronger,", reason: "x" }], "p3", "2003");
  check("a prose edit that adds a figure is flagged", r2.log[0] && r2.log[0].status === "flagged" && r2.queued.length === 0, JSON.stringify(r2));
  const r3 = await runWith([{ severity: "low", category: "prose", location: "The lattice term is used", fix: "The lattice term is used, and it is known to govern every phase boundary and every transport coefficient,", reason: "x" }], "p4", "2004");
  check("a prose edit that adds a claim in new words is flagged", r3.log[0] && r3.log[0].status === "flagged", JSON.stringify(r3));
}
// a plain spelling fix still goes through
{
  const r = await runWith([{ severity: "low", category: "prose", location: "This sentense has a typo.", fix: "This sentence has a typo.", reason: "spelling" }], "p5", "2005");
  check("a spelling fix is still applied and queued", r.log[0] && r.log[0].status === "queued" && r.queued.length === 1 && /This sentence has a typo\./.test(r.queued[0].corrected_md), JSON.stringify(r).slice(0, 300));
}
// the research-exec member carries the same guard
{
  const host = readFileSync(join(here, "..", "qnfo-research-exec", "worker.js"), "utf8");
  check("the folded reviser member has the guard and the new severity rule", host.includes("function guardSeverity(") && host.includes("ANY inserted or rewritten sentence that asserts") && !host.includes("prose/format/terminology-bridge"));
  check("the mirror is identical", readFileSync(join(here, "worker.js"), "utf8") === readFileSync(join(here, "deployed-current.worker.js"), "utf8"));
}
console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);

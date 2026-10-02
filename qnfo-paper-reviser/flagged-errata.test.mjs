// REVISER-FLAGGED-DEADEND-1 offline suite (#1812): drives the real scheduled() handler of qnfo-paper-reviser/worker.js
// against in-memory SQLite D1s, a stub AI and a stub Zenodo, and proves: a paper whose audit returns a HIGH finding is
// logged 'flagged' AND recorded as an internal_errata row (target_kind 'paper', status 'open') with the model confidence,
// the reviser run id and the paper_revision_log id in its evidence, plus one errata_queue row in status 'internal-open'
// (the status errata-hub never auto-answers or publishes); a rescan of the same finding adds no second row; LOW-only
// findings write no erratum; a dry scan writes nothing.
// Run: node qnfo-paper-reviser/flagged-errata.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
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

const BODY = "# A Paper\n\n## Abstract\n\nThe measured value is 42 J per solution.\n\n" + "Body text with a claim. ".repeat(500);
function seedPaper(papers, slug, recid) {
  papers.prepare("INSERT INTO papers (slug, doi, zenodo_doi, title, version, body_md, paper_type, status, created_at) VALUES (?, ?, ?, ?, '1.0.0', ?, 'paper', 'published', datetime('now'))")
    .run(slug, "10.5281/zenodo." + recid, "10.5281/zenodo." + recid, "Paper " + slug, BODY);
}

let auditReply = "";
const ai = { async run() { return { response: auditReply }; } };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/versions")) return new Response(JSON.stringify({ hits: { hits: [{ doi: "x" }] } }), { status: 200, headers: { "content-type": "application/json" } });
  if (u.startsWith("https://zenodo.org/api/records/")) return new Response(JSON.stringify({ conceptrecid: "1", doi: "x", files: [] }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("not found", { status: 404 });
};

const mod = await import(pathToFileURL(join(here, "worker.js")).href);
const worker = mod.default;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log("ok   " + name); }
  else { failed++; console.log("FAIL " + name + (detail ? " :: " + detail : "")); }
}
const ctx = { waitUntil() {} };

// 1. HIGH finding -> flagged log row + internal_errata + errata_queue internal-open, with confidence and run id.
{
  const { audit, papers } = freshDbs();
  seedPaper(papers, "high-paper", "1001");
  auditReply = JSON.stringify({ issues: [
    { severity: "high", category: "quantitative-justification", location: "The measured value is 42 J per solution.", fix: "The estimated value is 42 J per solution.", reason: "The value is stated as measured but no measurement is described.", confidence: 0.72 },
    { severity: "low", category: "prose", location: "Body text", fix: "Body text", reason: "style" }
  ] });
  const env = { AI: ai, PAPERS_DB: d1(papers), WATCH_DB: d1(audit) };
  await worker.scheduled({ cron: "37 */4 * * *" }, env, ctx);
  const log = audit.prepare("SELECT id, status FROM paper_revision_log WHERE slug='high-paper'").all();
  check("paper is logged flagged", log.length === 1 && log[0].status === "flagged", JSON.stringify(log));
  const ie = audit.prepare("SELECT * FROM internal_errata").all();
  check("one internal_errata row for the one HIGH finding", ie.length === 1, JSON.stringify(ie));
  const row = ie[0] || {};
  let ev = {};
  try { ev = JSON.parse(row.evidence || "{}"); } catch (e) {}
  check("erratum targets the paper DOI as kind 'paper', status open, severity high", row.target_kind === "paper" && row.target_ref === "10.5281/zenodo.1001" && row.status === "open" && row.severity === "high", JSON.stringify(row));
  check("erratum carries the model confidence", ev.confidence === 0.72, row.evidence);
  check("erratum carries the reviser run id and the log id", /^rv-[0-9a-z]+$/.test(String(ev.run_id)) && ev.log_id === log[0].id, row.evidence);
  check("erratum says it is unconfirmed until a second model confirms", /second model must confirm/.test(row.remediation || ""), row.remediation);
  check("detected_by names the reviser and its version", /^qnfo-paper-reviser\/1\.2\.5/.test(row.detected_by || ""), row.detected_by);
  const q = audit.prepare("SELECT * FROM errata_queue").all();
  check("one errata_queue row, internal-open, source internal_audit, confidence 0.72", q.length === 1 && q[0].status === "internal-open" && q[0].source === "internal_audit" && Math.abs(q[0].confidence - 0.72) < 1e-9 && q[0].subject === row.id, JSON.stringify(q));
  check("nothing was queued for publication", audit.prepare("SELECT COUNT(*) n FROM version_queue").get().n === 0);

  // 2. Recording the same finding again (a rescan) adds no second row.
  const high = JSON.parse(auditReply).issues.filter((i) => i.severity === "high");
  const again = await mod.recordFlaggedErrata(env, { slug: "high-paper", version: "1.0.0" }, "10.5281/zenodo.1001", high, { runId: "rv-second", logId: 99 });
  check("rescan of the same finding records nothing new", again.recorded === 0 && audit.prepare("SELECT COUNT(*) n FROM internal_errata").get().n === 1 && audit.prepare("SELECT COUNT(*) n FROM errata_queue").get().n === 1, JSON.stringify(again));
}

// 3. LOW-only findings write no erratum.
{
  const { audit, papers } = freshDbs();
  seedPaper(papers, "low-paper", "1002");
  auditReply = JSON.stringify({ issues: [{ severity: "low", category: "prose", location: "Body text", fix: "Body text", reason: "style" }] });
  const env = { AI: ai, PAPERS_DB: d1(papers), WATCH_DB: d1(audit) };
  await worker.scheduled({ cron: "37 */4 * * *" }, env, ctx);
  check("LOW-only audit writes no internal erratum", audit.prepare("SELECT COUNT(*) n FROM internal_errata").get().n === 0 && audit.prepare("SELECT COUNT(*) n FROM errata_queue").get().n === 0);
}

// 4. A dry scan writes nothing, even with a HIGH finding.
{
  const { audit, papers } = freshDbs();
  seedPaper(papers, "dry-paper", "1003");
  auditReply = JSON.stringify({ issues: [{ severity: "high", category: "citation/attribution", location: "The measured value", fix: "", reason: "miscited", confidence: 90 }] });
  const env = { AI: ai, PAPERS_DB: d1(papers), WATCH_DB: d1(audit), REVISER_TOKEN: "t" };
  const res = await worker.fetch(new Request("https://reviser.test/run/scan?mode=dry", { headers: { "X-Reviser-Token": "t" } }), env, ctx);
  const j = await res.json();
  check("dry scan reports the flag", j.results && j.results[0] && j.results[0].flagged === true, JSON.stringify(j));
  check("dry scan writes no erratum and no log row", audit.prepare("SELECT COUNT(*) n FROM internal_errata").get().n === 0 && audit.prepare("SELECT COUNT(*) n FROM paper_revision_log").get().n === 0);
}

// 5. A percentage confidence (90) is normalised to 0.9; a missing one is null.
{
  const { audit } = freshDbs();
  const env = { WATCH_DB: d1(audit) };
  await mod.recordFlaggedErrata(env, { slug: "p" }, "10.5281/zenodo.7", [{ severity: "high", category: "a", location: "x", reason: "r1", confidence: 90 }, { severity: "high", category: "b", location: "y", reason: "r2" }], { runId: "rv-t", logId: 1 });
  const rows = audit.prepare("SELECT confidence FROM errata_queue ORDER BY id").all();
  check("confidence 90 becomes 0.9 and a missing confidence stays null", rows.length === 2 && Math.abs(rows[0].confidence - 0.9) < 1e-9 && rows[1].confidence === null, JSON.stringify(rows));
}

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);

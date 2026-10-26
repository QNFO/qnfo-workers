// PAPER-LEDGER-ATTRIBUTION-2 (qnfo-research-exec 0.35.1, 2026-10-26, charter pillars research and autonomy) offline suite. Run: node qnfo-research-exec/paper-writer.test.mjs
// living-paper's append-only paper_change_ledger files a change to a paper as "unattributed" unless the same UPDATE or INSERT sets papers.change_actor and papers.change_reason
// (CLAUDE.md, Paper revisions and withdrawals). 252 gate restores and every research-exec body edit were recorded that way. This suite fails on a writer that changes a column the
// ledger tracks without attributing it: it scans every papers statement in worker.js and in the errata-hub member the host inlines, then runs two of the real statements against the real
// ledger migration in SQLite and reads the ledger rows back.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const host = read("./worker.js");
const hub = read("../errata-hub/worker.js");
const ledgerSql = read("../migrations/living-paper/2026-10-26-paper-change-ledger.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// the columns paper_change_ledger records a change to (the update trigger's field list)
const TRACKED = new Set(["body_md", "status", "version", "title", "abstract", "slug", "identifier", "authors", "doi", "zenodo_doi", "license", "keywords", "paper_type", "journal", "subtitle", "categories", "references"]);
function splitTop(s) { const out = []; let depth = 0, cur = ""; for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur); return out; }
function statements(src) {
  const out = []; const re = /"((?:UPDATE papers SET|INSERT INTO papers)(?:[^"\\]|\\.)*)"/g; let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}
function columnsOf(sql) {
  if (/^UPDATE papers SET/.test(sql)) {
    const set = sql.slice("UPDATE papers SET".length, sql.search(/\sWHERE\s/));
    return splitTop(set).map((a) => a.split("=")[0].trim().replace(/^"|"$/g, ""));
  }
  const m = /^INSERT INTO papers \(([^)]*)\)/.exec(sql);
  return m ? m[1].split(",").map((c) => c.trim()) : [];
}
for (const [name, src] of [["worker.js", host], ["errata-hub/worker.js", hub]]) {
  const all = statements(src);
  ok(all.length >= (name === "worker.js" ? 14 : 1), name + ": the scan finds the papers statements", all.length);
  const bad = all.filter((s) => columnsOf(s).some((c) => TRACKED.has(c)) && !(/\bchange_actor\b/.test(s) && /\bchange_reason\b/.test(s)));
  ok(bad.length === 0, name + ": every statement that changes a ledger-tracked column sets change_actor and change_reason", bad.map((s) => s.slice(0, 110)));
  const exempt = all.filter((s) => !columnsOf(s).some((c) => TRACKED.has(c)));
  ok(exempt.every((s) => columnsOf(s).every((c) => /^(release_gate_|doi_flagged|updated_at|pdf_path|render_)/.test(c) || c === "updated_at")), name + ": a statement exempt from attribution touches only untracked columns", exempt.map((s) => s.slice(0, 90)));
}

// two of the real statements, run against the real ledger migration
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE papers (identifier TEXT PRIMARY KEY, title TEXT DEFAULT '', authors TEXT DEFAULT '[]', abstract TEXT, doi TEXT, version TEXT DEFAULT '1.0.0', subtitle TEXT, license TEXT, keywords TEXT, journal TEXT, paper_type TEXT, zenodo_doi TEXT, categories TEXT, "references" TEXT,
  slug TEXT, status TEXT, body_md TEXT, updated_at TEXT, release_gate_pass INTEGER DEFAULT 0, release_gate_at TEXT, release_gate_reason TEXT);
  CREATE TABLE paper_body_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, status TEXT, title TEXT, body_md TEXT NOT NULL, captured_at TEXT NOT NULL, reason TEXT);
  CREATE TABLE publication_gate_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, run_at TEXT DEFAULT (datetime('now')), slug TEXT, status TEXT, mode TEXT, decision TEXT, reason TEXT, score INTEGER, quality_flag TEXT, body_len INTEGER, has_abstract INTEGER, refs INTEGER, gate_version TEXT);`);
db.exec(ledgerSql);
db.prepare("INSERT INTO papers (identifier, slug, status, body_md, version) VALUES ('p1', 'one', 'published', 'old text', '1.0.0')").run();
const sqlOf = (src, starts) => { const i = src.indexOf(starts); const j = src.indexOf('"', i); return src.slice(i, j); };
const doiSql = sqlOf(host, "UPDATE papers SET doi = COALESCE(NULLIF(doi,''), ?), change_actor");
const errataSql = sqlOf(host, "UPDATE papers SET body_md=?1, version=?2, doi=NULL, change_actor=?4");
ok(doiSql.length > 40 && errataSql.length > 40, "both statements are found in worker.js");
const ledger = (slug) => db.prepare("SELECT kind, fields_changed, actor, reason FROM paper_change_ledger WHERE slug = ? AND backfilled = 0 ORDER BY seq").all(slug);

db.prepare(doiSql).run("10.5281/zenodo.1", "qnfo-research-exec:doi-reconcile:one:abc", "the deposit record carries a DOI the paper lacked", "one");
let rows = ledger("one").filter((r) => r.kind === "update");
ok(rows.length === 1 && rows[0].fields_changed === "doi" && rows[0].actor === "qnfo-research-exec:doi-reconcile:one:abc" && /DOI the paper lacked/.test(rows[0].reason), "a DOI reconcile is one attributed ledger row", rows);
db.prepare(errataSql).run("corrected text", "1.0.1", "one", "qnfo-research-exec:errata-publish:one:abd", "errata e1 published a corrected text at 1.0.1");
rows = ledger("one").filter((r) => r.kind === "update");
ok(rows.length === 2 && rows[1].actor === "qnfo-research-exec:errata-publish:one:abd" && /body_md/.test(rows[1].fields_changed) && /version/.test(rows[1].fields_changed), "an errata correction is a second attributed row naming body and version", rows);
ok(rows.every((r) => r.actor !== "unattributed"), "no row is unattributed");
// a second edit by the same stage is its own row because the actor carries the clock
db.prepare(errataSql).run("corrected again", "1.0.2", "one", "qnfo-research-exec:errata-publish:one:abe", "errata e2 published a corrected text at 1.0.2");
rows = ledger("one").filter((r) => r.kind === "update");
ok(rows.length === 3 && rows[2].actor.endsWith(":abe"), "a second edit by the same stage is a third attributed row", rows);

// the helper itself
const fn = new Function("WORKER", host.slice(host.indexOf("function paperWriter("), host.indexOf("\n}\n", host.indexOf("function paperWriter(")) + 3) + "\nreturn paperWriter;")("qnfo-research-exec");
const a1 = fn("publish", "some-slug", "why"); await new Promise((r) => setTimeout(r, 3)); const a2 = fn("publish", "some-slug", "why");
ok(a1.actor.startsWith("qnfo-research-exec:publish:some-slug:") && a1.reason === "why" && a1.actor !== a2.actor, "paperWriter names worker, stage and slug, and differs on the next call", [a1, a2]);
ok(fn("s", "x".repeat(300), "y".repeat(900)).actor.length < 150 && fn("s", "x", "y".repeat(900)).reason.length === 300, "paperWriter bounds the actor and the reason");
ok(fn("s", null, null).reason === "s", "paperWriter falls back to the stage as the reason");

// the host and the inlined member carry the same errata statement
ok(host.includes(sqlOf(hub, "UPDATE papers SET body_md=?1, version=?2, doi=NULL, change_actor=?4")), "the errata-hub member and the host inline the same attributed statement");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

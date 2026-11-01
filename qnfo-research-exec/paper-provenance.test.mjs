// PAPER-PROVENANCE-TRACE-1 offline suite. Run: node qnfo-research-exec/paper-provenance.test.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const ledgerSql = readFileSync(new URL("../migrations/living-paper/2026-10-26-paper-change-ledger.sql", import.meta.url), "utf8");
const provenanceSql = readFileSync(new URL("../migrations/2026-11-01-paper-provenance-metadata.sql", import.meta.url), "utf8");
function extract(name) {
  const start = source.indexOf("async function " + name + "(") >= 0
    ? source.indexOf("async function " + name + "(")
    : source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name);
  let depth = 0, end = -1;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  assert.notEqual(end, -1, name);
  return source.slice(start, end);
}
const functions = ["buildPaperProvenance", "paperNoveltyResult", "persistPaperProvenance"].map(extract).join("\n");
const { persistPaperProvenance } = new Function(
  "WORKER", "PIPELINE_VERSION", "WRITER_MODELS",
  functions + "\nreturn { persistPaperProvenance };"
)("qnfo-research-exec", "test-pipeline", ["model-a", "model-b"]);

function d1(db) {
  const prepare = (sql) => {
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; }
    };
    return stmt;
  };
  return { prepare };
}

const living = new DatabaseSync(":memory:");
living.exec(`CREATE TABLE papers (
  identifier TEXT PRIMARY KEY, title TEXT DEFAULT '', authors TEXT DEFAULT '[]', abstract TEXT, doi TEXT,
  version TEXT DEFAULT '1.0.0', subtitle TEXT, license TEXT, keywords TEXT, journal TEXT, paper_type TEXT,
  zenodo_doi TEXT, categories TEXT, "references" TEXT, slug TEXT, status TEXT, body_md TEXT, updated_at TEXT,
  release_gate_pass INTEGER DEFAULT 0, release_gate_at TEXT, release_gate_reason TEXT
)`);
living.exec(`
  CREATE TABLE paper_body_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, status TEXT,
    title TEXT, body_md TEXT NOT NULL, captured_at TEXT NOT NULL, reason TEXT
  );
  CREATE TABLE publication_gate_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, run_at TEXT,
    slug TEXT, status TEXT, mode TEXT, decision TEXT, reason TEXT, score INTEGER,
    quality_flag TEXT, body_len INTEGER, has_abstract INTEGER, refs INTEGER, gate_version TEXT
  );
`);
living.exec(ledgerSql);
const originalTriggers = living.prepare(
  "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('paper_change_bodies_no_update', 'paper_change_body_archive_no_update') ORDER BY name"
).all();
assert.equal(originalTriggers.length, 2);
living.exec(provenanceSql);
assert.deepEqual(
  living.prepare("SELECT name, sql FROM bak_20261101_paper_provenance_triggers ORDER BY name").all(),
  originalTriggers,
  "the migration preserves both original trigger definitions before replacing them"
);
const row = { id: "queue-123", source: "proposal", source_id: "42", attempt: 2, idea: "Do not copy this prompt text" };
const paper = { identifier: "qnf-queue-123", slug: "traceable-paper", status: "draft", body_md: "# Paper", change_actor: "qnfo-research-exec:draft:traceable-paper:abc", change_reason: "draft" };
living.prepare("INSERT INTO papers (identifier, slug, status, body_md, change_actor, change_reason) VALUES (?, ?, ?, ?, ?, ?)").run(
  paper.identifier, paper.slug, paper.status, paper.body_md, paper.change_actor, paper.change_reason
);
const audit = new DatabaseSync(":memory:");
audit.exec("CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, text TEXT, job TEXT); CREATE TABLE idea_proposals (id INTEGER, rationale TEXT);");
audit.prepare("INSERT INTO cloud_ops_events VALUES (?, ?, ?, ?)").run("event-stage-1", "2026-11-01T00:00:00Z", "stage row=queue-123", "qnfo-research-exec");
audit.prepare("INSERT INTO cloud_ops_events VALUES (?, ?, ?, ?)").run("event-other", "2026-11-01T00:00:00Z", "stage row=other", "qnfo-research-exec");
audit.prepare("INSERT INTO idea_proposals VALUES (?, ?)").run(42, "[novelty 2 neighbours none/partial/substantial/duplicate 1/1/0/0; payoff 4; delta stated] scorer detail");

const env = { LIVING_PAPER: d1(living), QNFO_AUDIT: d1(audit) };
const saved = await persistPaperProvenance(env, row, paper);
const ledger = living.prepare("SELECT seq FROM paper_change_ledger WHERE slug = ?").get(paper.slug);
const stored = living.prepare("SELECT slug, body_md, metadata FROM paper_change_bodies WHERE seq = ?").get(ledger.seq);
const record = JSON.parse(stored.metadata);
assert.equal(stored.body_md, paper.body_md);
assert.equal(record.seed.id, row.id);
assert.equal(record.seed.params.pipeline_version, "test-pipeline");
assert.deepEqual(record.seed.params.writer_models, ["model-a", "model-b"]);
assert.equal(record.seed.params.attempt, 2);
assert.deepEqual(record.trace_id, ["event-stage-1"]);
assert.deepEqual(record.novelty.result.overlap_counts, { none: 1, partial: 1, substantial: 0, duplicate: 0 });
assert.equal(record.novelty.result.payoff, 4);
assert.equal(record.novelty.result.outcome, "delta-stated");
assert.ok(!stored.metadata.includes("Do not copy this prompt text"));
assert.deepEqual(saved, record);
assert.deepEqual(await persistPaperProvenance(env, row, paper), record, "retries reuse the immutable record");

const other = await persistPaperProvenance(env, { ...row, source: "direct", id: "queue-456" }, paper).catch((error) => error);
assert.match(String(other), /another seed/, "a different seed cannot overwrite an existing provenance record");
let updateError = "";
try { living.prepare("UPDATE paper_change_bodies SET metadata = ? WHERE seq = ?").run("{}", ledger.seq); } catch (error) { updateError = String(error.message); }
assert.match(updateError, /immutable/, "metadata cannot be rewritten after its one-time assignment");

audit.close();
living.close();
console.log("paper-provenance: ok");

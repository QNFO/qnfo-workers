import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function extract(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "real archive function boundaries must exist");
  return source.slice(from, to);
}
const errors = [];
const context = vm.createContext({
  nowIso: () => "2026-10-25T19:15:00.000Z",
  WORKER: "synthetic-research-exec",
  console: { error: (message) => errors.push(JSON.parse(message)) }
});
vm.runInContext(
  extract("async function rlEnsureHistory(", "async function rlHistoryEntries(") +
  extract("async function paperVersions(", "// ---- REVISION-LOOP-1:END ----"),
  context
);
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE papers(slug TEXT PRIMARY KEY,version TEXT,title TEXT,abstract TEXT,body_md TEXT,updated_at TEXT,status TEXT)");
const binding = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; }
    };
    return statement;
  }
};
const env = { LIVING_PAPER: binding };
const body1 = "# Synthetic archive fixture\n\nFirst version: a reproducible string, not a scientific claim.";
const body2 = "# Synthetic archive fixture\n\nSecond version: an explicitly different reproducible string.";
const body3 = "# Synthetic archive fixture\n\nThird version: another distinct reproducible string.";
try {
  db.prepare("INSERT INTO papers VALUES(?,?,?,?,?,?,?)")
    .run("synthetic-version", "1.0.0", "Synthetic archive fixture", "First abstract", body1, "2026-10-25", "published");
  await context.rlArchiveVersion(env, "synthetic-version", "1.1.0");
  await context.rlArchiveVersion(env, "synthetic-version", "1.1.0");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM paper_version_history").get().n, 1,
    "retrying an unchanged snapshot does not duplicate it");
  db.prepare("UPDATE papers SET version=?,abstract=?,body_md=? WHERE slug=?")
    .run("1.1.0", "Second abstract", body2, "synthetic-version");
  await context.rlArchiveVersion(env, "synthetic-version", "1.2.0");
  db.prepare("UPDATE papers SET body_md=? WHERE slug=?").run(body3, "synthetic-version");
  await context.rlArchiveVersion(env, "synthetic-version", "1.2.0");
  const snapshots = db.prepare("SELECT version,abstract,body_md,superseded_by FROM paper_version_history ORDER BY id").all();
  assert.deepEqual(snapshots.map((row) => row.body_md), [body1, body2, body3],
    "earlier text survives both versioned and same-version edits");
  assert.deepEqual(snapshots.map((row) => row.version), ["1.0.0", "1.1.0", "1.1.0"]);
  assert.deepEqual(snapshots.map((row) => row.abstract), ["First abstract", "Second abstract", "Second abstract"]);
  assert.deepEqual(snapshots.map((row) => row.superseded_by), ["1.1.0", "1.2.0", "1.2.0"]);
  const current = await context.paperVersions(env, "synthetic-version");
  assert.equal(current.current.version, "1.1.0");
  assert.equal(current.earlier.length, 3);
  assert.deepEqual(Array.from(current.earlier, (row) => row.chars), [body3.length, body2.length, body1.length]);
  assert.ok(current.earlier.every((row) => !("body_md" in row)),
    "the existing version-list helper returns metadata, not a historical-text retrieval API");
  const missing = await context.paperVersions(env, "synthetic-missing");
  assert.equal(missing.current, null);
  assert.equal(missing.earlier.length, 0);
  const failedEnv = { LIVING_PAPER: { prepare() { throw new Error("synthetic archive unavailable"); } } };
  await context.rlArchiveVersion(failedEnv, "synthetic-version", "1.2.0");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].where, "revision-archive");
  assert.match(errors[0].error, /synthetic archive unavailable/);
  assert.match((await context.paperVersions(failedEnv, "synthetic-version")).error, /synthetic archive unavailable/);
  console.log("US10 synthetic SQL archive preservation and metadata-list acceptance passed");
} finally {
  db.close();
}

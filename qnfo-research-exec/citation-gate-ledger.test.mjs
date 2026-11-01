// CITE-METADATA-FALSE-POSITIVE-1 and CLAIMS-LEDGER-1 (0.40.10) suite. Offline: node:sqlite stands in for D1, global fetch is stubbed.
// Covers: an author-year reference no longer fails as metadata-mismatch; citationGateStep writes one paper_claims row per checked
// reference under the real column names; a re-run updates instead of duplicating; a ledger failure never changes the gate result;
// publishStageV2 calls the one gate step with the paper slug; the 0.9 (worker) versus 0.5 (citation-gate.mjs) title threshold is pinned.
// Run: node qnfo-research-exec/citation-gate-ledger.test.mjs
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citationGateStep, writeClaimsLedger, CITATION_GATE } from "./worker.js";
import { titleAgrees as mjsTitleAgrees } from "./citation-gate.mjs";

// The real DDL (migrations/2026-10-28-cluster-e-b-doers.sql): the slug column is "slug", not "paper_slug".
const DDL = `CREATE TABLE paper_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, claim_text TEXT NOT NULL, claim_kind TEXT, source_ref TEXT, verification_state TEXT NOT NULL DEFAULT 'unverified', verified_by TEXT, published_at TEXT NOT NULL DEFAULT (datetime('now')), verified_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`;
const CLAIMS_MIGRATION = readFileSync(new URL("../migrations/2026-11-01-paper-claims-unique.sql", import.meta.url), "utf8");

function mkEnv(opts) {
  const o = Object.assign({ batch: true, failLedger: false }, opts);
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  db.exec(CLAIMS_MIGRATION);
  const stmt = (sql) => {
    let args = [];
    const s = {
      bind(...a) { args = a; return s; },
      async run() {
        if (o.failLedger && /paper_claims/.test(sql)) throw new Error("D1_ERROR: no such table: paper_claims");
        const r = db.prepare(sql).run(...args);
        return { meta: { changes: Number(r.changes) } };
      },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
    };
    return s;
  };
  const QNFO_AUDIT = { prepare: stmt };
  if (o.batch) {
    QNFO_AUDIT.batch = async (list) => {
      db.exec("BEGIN");
      try { for (const s of list) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    };
  }
  return { env: { QNFO_AUDIT }, db };
}
const rows = (db, slug) => db.prepare("SELECT * FROM paper_claims WHERE slug = ? ORDER BY source_ref").all(slug);
const count = (db) => db.prepare("SELECT count(*) AS n FROM paper_claims").get().n;
const setMode = (db, mode) => db.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('research_citation_gate', ?)").run(mode);

const res = (s, b) => ({ ok: s >= 200 && s < 300, status: s, text: async () => b, json: async () => JSON.parse(b) });
const atom = (entries) => "<feed>" + entries.map(([id, t]) => "<entry><id>http://arxiv.org/abs/" + id + "v1</id><title>" + t + "</title></entry>").join("") + "</feed>";
let fetchCalls = 0;
// arxiv: id -> title the API knows. pages: url -> HTTP status.
function stubFetch(arxiv, pages) {
  globalThis.fetch = async (url) => {
    fetchCalls++;
    const u = String(url);
    if (u.startsWith("https://export.arxiv.org/api/query")) {
      const ids = decodeURIComponent(u.split("id_list=")[1] || "").split(",").filter(Boolean);
      return res(200, atom(ids.filter((i) => arxiv[i]).map((i) => [i, arxiv[i]])));
    }
    if (pages && pages[u] !== undefined) return res(pages[u], "<html></html>");
    return res(404, "{}");
  };
}
const realFetch = globalThis.fetch;
const row = { id: "row-12345678" };

// 1. CITE-METADATA-FALSE-POSITIVE-1: an author-year list line used to fail as metadata-mismatch (entryText was never set) and hold the paper.
{
  const { env, db } = mkEnv();
  stubFetch({ "1706.03762": "Attention Is All You Need" });
  const body = "## References\n\n1. Vaswani, A. (2017). Attention is all you need. arXiv:1706.03762\n";
  const r = await citationGateStep(env, row, body, { slug: "qnf-author-year" });
  assert.equal(r.proceed, true, "a labelled author-year reference whose title agrees must not be held");
  assert.equal(r.result.refs[0].status, "ok");
  assert.ok(!r.result.refs.some((x) => x.status === "metadata-mismatch"));
  const got = rows(db, "qnf-author-year");
  assert.equal(got.length, 1);
  assert.equal(got[0].verification_state, "verified");
}

// 2. Ledger content: columns, states and the claim text, from one gate run that sees every outcome.
const T = "qnf-ledger-0001";
const L = mkEnv();
const body = [
  "## References",
  "",
  "1. Vaswani, A. (2017). Attention is all you need. arXiv:1706.03762",
  "2. Smith, J. (2020). A wholly invented treatise on nothing. arXiv:2001.99999",
  "3. Recursive distinctioning and the crossing law. arXiv:2002.00002",
  "4. [Handbook of examples](https://example.org/handbook)",
  "",
].join("\n");
const arxivKnown = { "1706.03762": "Attention Is All You Need", "2002.00002": "Generalised Probabilistic Theories" };
stubFetch(arxivKnown, { "https://example.org/handbook": 403 });
let g = await citationGateStep(L.env, row, body, { slug: T });
assert.equal(g.proceed, false, "a dead id and a title mismatch hold the publish (enforce is the default)");
assert.equal(!!g.retry, false);
let got = rows(L.db, T);
assert.equal(got.length, 4, "one ledger row per checked reference");
const by = Object.fromEntries(got.map((x) => [x.source_ref, x]));
assert.deepEqual(Object.keys(by).sort(), ["1706.03762", "2001.99999", "2002.00002", "https://example.org/handbook"]);
assert.equal(by["1706.03762"].verification_state, "verified");
assert.equal(by["2001.99999"].verification_state, "refuted", "not-found is refuted");
assert.equal(by["2002.00002"].verification_state, "refuted", "a title mismatch is refuted");
assert.equal(by["https://example.org/handbook"].verification_state, "unverified", "a 403 proves nothing: unverified");
for (const x of got) {
  assert.equal(x.slug, T);
  assert.equal(x.claim_kind, "reference");
  assert.equal(x.verified_by, "citation-gate");
  assert.match(x.published_at, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/, "datetime('now') text, which scripts/bp26_claims.py compares as a string");
  assert.equal(x.verified_at !== null, x.verification_state === "verified", "verified_at is set only for a verified row");
  assert.ok(x.claim_text.length > 0 && x.claim_text.length <= 300);
}
assert.equal(by["1706.03762"].claim_text, "1. Vaswani, A. (2017). Attention is all you need. arXiv:1706.03762");
assert.equal(by["https://example.org/handbook"].claim_text, "4. [Handbook of examples](https://example.org/handbook)");
// The collector's own query shape finds the rows.
const cov = L.db.prepare("SELECT count(*) AS n, sum(CASE WHEN verification_state = 'verified' THEN 1 ELSE 0 END) AS v FROM paper_claims WHERE published_at >= datetime('now', '-7 days')").get();
assert.equal(cov.n, 4); assert.equal(cov.v, 1);

// 3. Idempotent: a re-run (the retry, a released hold) updates the rows and refreshes published_at; it never adds a second row.
L.db.prepare("UPDATE paper_claims SET published_at = '2020-01-01 00:00:00'").run();
stubFetch(arxivKnown, { "https://example.org/handbook": 200 });
g = await citationGateStep(L.env, row, body, { slug: T });
got = rows(L.db, T);
assert.equal(got.length, 4, "a re-run must not duplicate rows");
assert.equal(count(L.db), 4);
assert.ok(got.every((x) => x.published_at > "2020-01-01 00:00:00"), "published_at is refreshed on a re-run");
const by2 = Object.fromEntries(got.map((x) => [x.source_ref, x]));
assert.equal(by2["https://example.org/handbook"].verification_state, "verified", "the state follows the latest gate run");
assert.notEqual(by2["https://example.org/handbook"].verified_at, null);
assert.equal(by2["2001.99999"].verification_state, "refuted");
// A reference that becomes unverified again loses its verified_at.
stubFetch(arxivKnown, { "https://example.org/handbook": 503 });
await citationGateStep(L.env, row, body, { slug: T });
const again = rows(L.db, T).find((x) => x.source_ref === "https://example.org/handbook");
assert.equal(again.verification_state, "unverified"); assert.equal(again.verified_at, null);
assert.equal(count(L.db), 4);

// 4. Another paper gets its own rows; the first paper's rows are untouched.
await citationGateStep(L.env, row, body, { slug: "qnf-ledger-0002" });
assert.equal(rows(L.db, "qnf-ledger-0002").length, 4);
assert.equal(rows(L.db, T).length, 4);
assert.equal(count(L.db), 8);

// 5. No slug, no rows: the queue row id is never used as a paper key.
for (const opts of [undefined, {}, { slug: "" }, { slug: "   " }]) {
  await citationGateStep(L.env, { id: "row-87654321", slug: "from-the-row" }, body, opts);
}
assert.equal(count(L.db), 8, "no slug means no ledger rows");
assert.equal(rows(L.db, "from-the-row").length, 0);

// 6. Modes: off skips the gate and the ledger; measure runs both and never blocks.
setMode(L.db, "off");
fetchCalls = 0;
g = await citationGateStep(L.env, row, body, { slug: "qnf-mode-off" });
assert.equal(g.proceed, true); assert.equal(fetchCalls, 0, "off makes no lookup"); assert.equal(rows(L.db, "qnf-mode-off").length, 0);
setMode(L.db, "measure");
g = await citationGateStep(L.env, row, body, { slug: "qnf-mode-measure" });
assert.equal(g.proceed, true, "measure never blocks");
assert.equal(rows(L.db, "qnf-mode-measure").length, 4, "measure still records the ledger");

// 7. Bounds: references the gate skipped (over the URL limit) get no row; the ledger is capped.
{
  const { env, db } = mkEnv();
  const urls = Array.from({ length: 45 }, (_, i) => "https://example.org/u/" + (i + 1));
  const pages = Object.fromEntries(urls.map((u) => [u, 200]));
  stubFetch({}, pages);
  const r = await citationGateStep(env, row, urls.map((u) => "- [Page](" + u + ")").join("\n"), { slug: "qnf-skipped" });
  assert.equal(r.proceed, true);
  assert.equal(r.result.refs.filter((x) => x.status === "skipped-over-limit").length, 5);
  assert.equal(rows(db, "qnf-skipped").length, 40, "a skipped-over-limit reference is not a claim the gate checked");

  const ids = Array.from({ length: 100 }, (_, i) => "2601." + String(i + 1).padStart(5, "0"));
  const known = Object.fromEntries(ids.map((id, i) => [id, "Paper number " + (i + 1)]));
  stubFetch(known, {});
  const r2 = await citationGateStep(env, row, ids.map((id) => "- arXiv:" + id).join("\n"), { slug: "qnf-cap" });
  assert.equal(r2.proceed, true);
  assert.equal(r2.result.refs.length, 100);
  assert.equal(rows(db, "qnf-cap").length, 80, "the ledger is capped at CLAIMS_LEDGER_MAX rows per run");
}

// 8. A ledger failure never changes the gate result, with or without D1 batch, and is logged.
for (const batch of [true, false]) {
  const { env, db } = mkEnv({ batch, failLedger: true });
  stubFetch({ "1706.03762": "Attention Is All You Need" }, {});
  const errs = [];
  const realErr = console.error;
  console.error = (...a) => errs.push(a.join(" "));
  let r;
  try {
    r = await citationGateStep(env, row, "- arXiv:1706.03762", { slug: "qnf-ledger-down" });
  } finally { console.error = realErr; }
  assert.equal(r.proceed, true, "a failing paper_claims write must not fail the gate (batch=" + batch + ")");
  assert.equal(count(db), 0);
  assert.ok(errs.some((e) => /"where":"claims-ledger"/.test(e) && /qnf-ledger-down/.test(e)), "the failure is logged (batch=" + batch + ")");
}

// 9. writeClaimsLedger directly: its result, and its tolerance of a missing binding or nothing to write.
{
  const { env, db } = mkEnv({ batch: false });
  const w = await writeClaimsLedger(env, "qnf-direct", "- arXiv:2601.00001", [{ kind: "arxiv", id: "2601.00001", status: "ok" }]);
  assert.deepEqual(w, { written: 1 });
  assert.equal(rows(db, "qnf-direct")[0].claim_text, "- arXiv:2601.00001");
  assert.deepEqual(await writeClaimsLedger(env, "qnf-direct", "", []), { written: 0 });
  assert.deepEqual(await writeClaimsLedger({}, "qnf-direct", "", [{ kind: "arxiv", id: "x", status: "ok" }]), { written: 0 });
  assert.deepEqual(await writeClaimsLedger(env, "", "", [{ kind: "arxiv", id: "x", status: "ok" }]), { written: 0 });
}

// 10. Concurrent retries are safe because uniqueness is enforced by SQLite and the write is one UPSERT.
{
  const { env, db } = mkEnv({ batch: false });
  const ref = [{ kind: "arxiv", id: "2601.00002", status: "ok" }];
  await Promise.all([
    writeClaimsLedger(env, "qnf-concurrent", "- arXiv:2601.00002", ref),
    writeClaimsLedger(env, "qnf-concurrent", "- arXiv:2601.00002", ref),
  ]);
  assert.equal(rows(db, "qnf-concurrent").length, 1, "overlapping retries cannot create duplicate claims");
}

// 11. Static pins on the shipped source.
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.equal((src.match(/\bcitationGateStep\(env, row, paper\.body_md, \{ slug \}\)/g) || []).length, 1, "publishStageV2 calls the one gate step with the paper slug");
assert.ok(!/citationGateStepWithSupportCheck\s*\(/.test(src), "there is one gate step: the second copy that held the dead ledger writer is gone");
assert.equal((src.match(/async function citationGateStep\(/g) || []).length, 1);
assert.ok(!/status:\s*"metadata-mismatch"/.test(src), "the entryText author-and-year check stays removed until a lookup returns the record's authors and year");
assert.ok(!/INTO paper_claims \(paper_slug/.test(src), "paper_claims has a slug column, not paper_slug");
assert.ok(!/INSERT OR REPLACE INTO paper_claims/.test(src), "the ledger uses an update rather than delete-and-reinsert");
assert.ok(/ON CONFLICT\(slug, claim_kind, source_ref\) DO UPDATE/.test(src), "the writer relies on the migration's atomic unique-key upsert");
assert.ok(L.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_paper_claims_source_unique'").get(), "the unique-key migration is applied in the test D1");
assert.ok(/CLAIMS-LEDGER-1/.test(src));

// 12. The title threshold differs on purpose: 0.9 in the worker (hardened by CITE-SUPPORT-1, 0.18.2), 0.5 in citation-gate.mjs.
{
  const label = "quantum entanglement thermodynamics measurement";
  const title = "quantum entanglement thermodynamics protocols";
  const inline = CITATION_GATE.titleAgrees(label, title);
  const ref = mjsTitleAgrees(label, title);
  assert.equal(inline.score, 0.75); assert.equal(ref.score, 0.75);
  assert.equal(inline.judged, true);
  assert.equal(inline.ok, false, "the worker's gate needs 0.9");
  assert.equal(ref.ok, true, "the .mjs reference module passes at 0.5");
  assert.equal(CITATION_GATE.titleAgrees("Attention is all you need transformers", "Attention Is All You Need").ok, true);
}

globalThis.fetch = realFetch;
console.log("citation-gate-ledger tests passed");

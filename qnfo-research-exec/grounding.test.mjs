// Offline test (node:sqlite as D1 shim, fetch mocked) for GROUND-OR-SLOT-1 and GROUND-THIN-FAILFAST-1 (agent_issues 1751).
// Row 196536e3 grounded to 2 bibliography entries on four passes because its OR fallback query was cut by the 6-query cap,
// then ran the whole pipeline four times on a paper that could never pass gate-refcount (floor 5) and parked.
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { groundQueries, stageGround } from "./worker.js";

// No real pauses between arXiv requests in the test.
globalThis.setTimeout = (fn) => { fn(); return 0; };

// 1. groundQueries keeps the OR fallback in the last slot.
const IDEA_574 = "Re-entry from 10.5281/zenodo.22749402: | **Weight sequence classification** | For which $U_n$ is arithmetic polynomial-time?";
const PARENT_574 = "Nonlinear Tree-Based Numeration Systems: A Consolidated Synthesis";
let qs = groundQueries(IDEA_574, PARENT_574);
assert.equal(qs.length, 6);
assert.match(qs[5], /^all:Weight OR all:sequence OR all:arithmetic OR all:polynomial-time OR /, "row 196536e3's OR fallback must survive the cap");
assert.equal(qs.filter((q) => / OR /.test(q)).length, 1);
// One idea phrase + a long parent title: already fit (OR was 6th), unchanged.
qs = groundQueries("Re-entry from 10.5281/zenodo.22739626: (ii) Can this framework classify all possible fusion rules for MZMs in 2D TSCs?", "Braid Group Representations, Modular Data, and the Classification of Majorana Zero Mode Fusion Rules in 2D Topological Superconductors");
assert.equal(qs.length, 6);
assert.match(qs[0], /^all:"fusion rules" AND /);
assert.match(qs[5], / OR /);
// Short query sets are untouched; an idea with no content words yields no OR query and no crash.
assert.equal(groundQueries("Re-entry from 10.5281/zenodo.22758712: Why Vertices, Not Points?", "p-Adic Braid Groups on Bruhat-Tits Buildings").length, 4);
assert.deepEqual(groundQueries("what is the", ""), []);

// 2. stageGround end to end against fake arXiv, router search, living-paper, R2 and qnfo-audit.
const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, status TEXT DEFAULT 'queued', stage TEXT, claimed_at TEXT, attempt INTEGER DEFAULT 0, context TEXT, error TEXT, recover_count INTEGER DEFAULT 0, terminal_rearms INTEGER DEFAULT 0);
CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);`);
const lp = new DatabaseSync(":memory:");
lp.exec(`CREATE TABLE papers (slug TEXT, title TEXT, doi TEXT, abstract TEXT, status TEXT);
INSERT INTO papers VALUES ('nonlinear-tree-based-numeration-systems-a-consolidated-synthesis', '${PARENT_574}', '10.5281/zenodo.22749402', 'parent abstract', 'published'),
  ('corpus-a', 'Corpus paper A', '10.5281/zenodo.1', 'a', 'published'), ('corpus-b', 'Corpus paper B', '10.5281/zenodo.2', 'b', 'published');`);
const d1 = (db) => ({ prepare(sql) {
  let args = [];
  const o = { bind(...a) { args = a; return o; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; } };
  return o;
} });
const r2 = new Map();
const env = {
  QNFO_AUDIT: d1(audit), LIVING_PAPER: d1(lp),
  MIRROR: { async put(k, v) { r2.set(k, v); }, async get(k) { return r2.has(k) ? { text: async () => r2.get(k) } : null; } },
  // qnfo-ai /v1/search: two corpus hits, as the live row got.
  QNFO_AI: { async fetch() { return new Response(JSON.stringify({ results: [{ index: "PAPER_VZ", metadata: { slug: "corpus-a" } }, { index: "PAPER_VZ", metadata: { slug: "corpus-b" } }] })); } }
};
let arxivDown = false;
let arxivCalls = [];
const feed = (n) => "<feed>" + Array.from({ length: n }, (_, i) => `<entry><id>http://arxiv.org/abs/2601.0${1000 + i}v1</id><title>Paper ${i}</title><summary>S${i}</summary></entry>`).join("") + "</feed>";
globalThis.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  if (!u.startsWith("https://export.arxiv.org/")) return new Response("unexpected " + u, { status: 404 });
  arxivCalls.push(u);
  if (arxivDown) return new Response("Rate exceeded.", { status: 503 });
  // Live behaviour measured 2026-10-02: every AND-phrase query for this idea returns 0 entries, the OR query returns 8.
  return new Response(feed(/ OR /.test(u) ? 8 : 0));
};
const row = (id, rc) => {
  audit.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, stage, recover_count) VALUES (?, 'proposal', '574', ?, 'researching', 'ground', ?)").run(id, IDEA_574, rc);
  return audit.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);
};
const get = (id) => audit.prepare("SELECT * FROM research_queue WHERE id = ?").get(id);

// 2a. healthy arXiv: the OR query runs, 8 arXiv + 2 corpus entries, the row advances to ensemble.
let res = await stageGround(env, row("healthy", 0));
assert.equal(res.ok, true);
assert.equal(res.bibCount, 10);
assert.ok(arxivCalls.some((u) => / OR /.test(u)), "the OR fallback must be sent to arXiv");
assert.equal(get("healthy").stage, "ensemble");
assert.equal(JSON.parse(get("healthy").context).bibCount, 10);
assert.match(r2.get("pipeline/healthy/grounding.md"), /\n\[10\] QNFO: Corpus paper B/);

// 2b. arXiv down: each query is retried once, the 2-entry grounding stops at ground (no ensemble), one recover is spent.
arxivDown = true; arxivCalls = [];
res = await stageGround(env, row("thin", 1));
assert.equal(res.ok, false);
assert.equal(res.stage, "ground");
assert.equal(res.bibCount, 2);
assert.equal(res.arxivErrors, 6);
assert.equal(arxivCalls.length, 12, "6 queries, each retried once");
let t = get("thin");
assert.equal(t.status, "queued"); assert.equal(t.stage, "ground"); assert.equal(t.recover_count, 2);
assert.match(t.error, /^ground: bibliography 2 < 5 entries \(gate-refcount cannot pass\)/);
assert.equal(audit.prepare("SELECT count(*) n FROM cloud_ops_events WHERE kind = 'ground-thin'").get().n, 1);
assert.ok(r2.has("pipeline/thin/grounding.md"), "the thin grounding is kept for diagnosis");

// 2c. a thin pass with recover_count exhausted parks the row with the reason and files the terminal issue, as before.
res = await stageGround(env, row("exhausted", 3));
assert.equal(res.ok, false);
t = get("exhausted");
assert.equal(t.status, "wontfix"); assert.equal(t.stage, "parked");
assert.match(t.error, /^PARKED-POISON-1: recover_count exhausted \(3\); last error: ground: bibliography 2 < 5/);
assert.equal(audit.prepare("SELECT count(*) n FROM agent_issues WHERE title LIKE 'RESEARCH-TERMINAL exhauste%'").get().n, 1);

console.log("grounding tests passed");

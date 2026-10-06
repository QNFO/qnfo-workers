// ASK-CORPUS-FEEDER-1 + QGEN-COMPLETE-1 (qnfo-ai-search 2.2.8, agent_issues 2029) offline suite. The worker runs in a vm
// with an in-memory node:sqlite D1, a stubbed gateway (catalog list and detail) and stubbed AI Search / Workers AI.
// Proves: while any ai_spend cap is breached (or fleet_budget is unreadable) the feeder uploads nothing and question
// generation calls no model; with the caps clear it uploads at most CORPUS_SYNC_PER_RUN papers a tick, newest first, as
// <slug>.md with title, abstract and body, and records each in ask_corpus_sync; a later tick uploads only what is new or
// at a new version; a failed upload is recorded and retried only after CORPUS_RETRY_H; a generated question is kept only
// when it is complete (ends with "?", not cut at the token limit), rejections do not buy extra model calls, and the
// retrieval eval scores complete questions only.
// Run: node --no-warnings qnfo-ai-search/corpus-feeder.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/^export \{[^}]*\};?\s*$/m, "").replace(/^import [^;]*;/mg, "");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT);
CREATE TABLE ask_corpus_sync (slug TEXT PRIMARY KEY, ingested_at TEXT NOT NULL, bytes INTEGER, source_version TEXT, status TEXT NOT NULL DEFAULT 'uploaded', error TEXT);
CREATE TABLE ask_golden (slug TEXT PRIMARY KEY, question TEXT NOT NULL, title TEXT, added_at TEXT NOT NULL);
CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model));`);
const d1 = { prepare(sql0) { const order = []; const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(Number(n) - 1); return "?"; }); let a = []; const st = { bind(...x) { x = x.map((v) => (v === undefined ? null : v)); a = order.length ? order.map((i) => x[i]) : x; return st; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) ?? null; }, async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; }, async batch(list) { for (const s of list) await s.run(); return []; } };

const PAPERS = [];
for (let i = 0; i < 9; i++) PAPERS.push({ slug: "paper-" + i, title: "Paper number " + i, abstract: "Abstract of paper " + i + " about ultrametric scaling. " + "It counts the levels a self-similar hierarchy needs across scales. ".repeat(4), doi: "10.5281/zenodo." + i, version: "1.0.0", created_at: "2026-10-0" + (i % 9 + 1) + " 10:00:00", body_md: "---\nfront: matter\n---\n# Section\n\nBody text of paper " + i + "." });
const state = { failUpload: new Set(), uploads: [] };
async function fakeFetch(url) {
  const u = new URL(String(url));
  const resp = (j, st) => ({ ok: (st || 200) < 400, status: st || 200, json: async () => j });
  if (u.hostname === "papers.qnfo.org" && u.pathname === "/papers") {
    const off = Number(u.searchParams.get("offset") || 0), lim = Number(u.searchParams.get("limit") || 50);
    return resp({ papers: PAPERS.slice(off, off + lim).map((p) => ({ slug: p.slug, title: p.title, abstract: p.abstract, doi: p.doi, version: p.version, created_at: p.created_at, status: "published" })), total: PAPERS.length });
  }
  if (u.hostname === "papers.qnfo.org" && u.pathname.startsWith("/papers/")) { const p = PAPERS.find((x) => x.slug === decodeURIComponent(u.pathname.slice(8))); return p ? resp(p) : resp({}, 404); }
  return resp({}, 404);
}
const aiCalls = [];
let qgenReply = { response: "Which hierarchy needs how many levels?" };
const env = {
  QNFO_AUDIT: d1,
  AI_SEARCH: { get: () => ({ items: { async upload(key, text, opts) { const slug = key.replace(/\.md$/, ""); if (state.failUpload.has(slug)) throw new Error("upload refused"); state.uploads.push({ key, text, meta: opts && opts.metadata }); return { key }; } }, async search() { return { chunks: [] }; } }) },
  AI: { async run(model, input) { aiCalls.push(model); return typeof qgenReply === "function" ? qgenReply() : qgenReply; } },
};
const sb = { console: { log() {}, error() {}, warn() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, AbortController, setTimeout, clearTimeout, crypto, fetch: fakeFetch, encodeURIComponent, decodeURIComponent };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { corpusSync, refreshGolden, completeQuestion, retrievalScore, CORPUS_SYNC_PER_RUN, GOLDEN_COMPLETE_SQL };", sb);
const api = sb.__x;
const led = () => db.prepare("SELECT slug, status, source_version, error FROM ask_corpus_sync ORDER BY slug").all();

// 1. Breached caps: nothing uploaded, no model call, and the tick says why.
db.prepare("INSERT INTO fleet_budget (node_class, cap, current) VALUES ('ai_spend:total', 150, 224.55), ('ai_spend:workers-ai', 25, 59.51), ('workers', 30, 38)").run();
let r = await api.corpusSync(env);
ok(/caps breached/.test(r.skipped || "") && state.uploads.length === 0 && led().length === 0, "while an ai_spend cap is breached the feeder uploads nothing", r);
ok(r.caps && r.caps.length === 2 && !r.caps.some((c) => /^workers /.test(c)), "the skip names the breached ai_spend caps only", r.caps);
let g = await api.refreshGolden(env);
ok(aiCalls.length === 0 && /caps breached/.test(g.skipped || ""), "question generation makes no model call while a cap is breached", g);
// 1b. An unreadable budget counts as breached.
db.exec("ALTER TABLE fleet_budget RENAME TO fleet_budget_x");
r = await api.corpusSync(env);
ok(/unreadable/.test((r.caps || []).join(" ")) && state.uploads.length === 0, "an unreadable fleet_budget blocks uploads (fail-safe)", r);
db.exec("ALTER TABLE fleet_budget_x RENAME TO fleet_budget");

// 2. Caps clear: at most CORPUS_SYNC_PER_RUN uploads, newest first, recorded.
db.prepare("UPDATE fleet_budget SET current = 10 WHERE node_class LIKE 'ai_spend:%'").run();
r = await api.corpusSync(env);
ok(r.uploaded === api.CORPUS_SYNC_PER_RUN && state.uploads.length === api.CORPUS_SYNC_PER_RUN && r.remaining === PAPERS.length - api.CORPUS_SYNC_PER_RUN, "one tick uploads CORPUS_SYNC_PER_RUN papers and reports the rest", r);
ok(state.uploads[0].key === "paper-8.md" && state.uploads[1].key === "paper-7.md", "newest papers first", state.uploads.map((u) => u.key));
const first = state.uploads[0];
ok(/^# Paper number 8\n\n## Abstract\n\nAbstract of paper 8/.test(first.text) && /Body text of paper 8/.test(first.text) && !/front: matter/.test(first.text), "the uploaded document carries title, abstract and body without front matter", first.text.slice(0, 120));
ok(first.meta && first.meta.slug === "paper-8" && first.meta.doi === "10.5281/zenodo.8" && first.meta.source === "papers.qnfo.org", "upload metadata names slug, DOI and source", first.meta);
ok(led().length === api.CORPUS_SYNC_PER_RUN && led().every((x) => x.status === "uploaded" && x.source_version === "1.0.0"), "each upload is recorded with its version", led());

// 3. Next tick: only the rest; then nothing is due.
state.failUpload.add("paper-1");
r = await api.corpusSync(env);
ok(r.uploaded === 2 && r.errors === 1, "the next tick uploads the remaining papers; one refused upload is counted", r);
ok(led().find((x) => x.slug === "paper-1").status === "error" && /upload refused/.test(led().find((x) => x.slug === "paper-1").error), "a failed upload is recorded with its error");
state.failUpload.clear();
const n0 = state.uploads.length;
r = await api.corpusSync(env);
ok(r.due === 0 && state.uploads.length === n0, "a failed upload is not retried before CORPUS_RETRY_H, and nothing else is due", r);
db.prepare("UPDATE ask_corpus_sync SET ingested_at = '2026-01-01T00:00:00Z' WHERE slug = 'paper-1'").run();
r = await api.corpusSync(env);
ok(r.uploaded === 1 && led().find((x) => x.slug === "paper-1").status === "uploaded", "after CORPUS_RETRY_H the failed paper is retried and recorded", r);
// 4. A new version is uploaded again (after the catalog's TTL; the cache is cleared here as its expiry would).
PAPERS[3].version = "1.1.0";
vm.runInContext("_catalog = { at: 0, idx: null, loading: null };", sb);
r = await api.corpusSync(env);
ok(r.uploaded === 1 && state.uploads[state.uploads.length - 1].key === "paper-3.md" && led().find((x) => x.slug === "paper-3").source_version === "1.1.0", "a paper at a new version is uploaded again", r);

// 5. QGEN-COMPLETE-1.
ok(api.completeQuestion("How many levels does the hierarchy need?", "stop") && !api.completeQuestion("How can networks of", "stop") && !api.completeQuestion("What is the minimum energy per bit when logic drives qubits near 10 mK,", null) && !api.completeQuestion("Is this a complete question?", "length"), "only complete questions are kept (a trailing ?, not cut at the token limit)");
aiCalls.length = 0;
qgenReply = { response: "How can networks of" };
g = await api.refreshGolden(env);
ok(aiCalls.length === 5 && g.added.length === 0 && g.rejected === 5, "fragments are rejected and a run stops at QGEN_MAX_CALLS model calls", { calls: aiCalls.length, g });
aiCalls.length = 0;
qgenReply = { response: "Which hierarchy needs how many levels to span the gap?" };
g = await api.refreshGolden(env);
ok(g.added.length === 5 && aiCalls.length === 5 && db.prepare("SELECT COUNT(*) n FROM ask_golden WHERE " + api.GOLDEN_COMPLETE_SQL).get().n === 5, "complete questions are added", g);
db.prepare("INSERT INTO ask_golden (slug, question, title, added_at) VALUES ('frag', 'How can networks of', 't', '2026-10-01T00:00:00Z')").run();
ok(db.prepare("SELECT COUNT(*) n FROM ask_golden WHERE " + api.GOLDEN_COMPLETE_SQL).get().n === 5, "the eval's GOLDEN_COMPLETE_SQL leaves fragments out");
ok(src.includes('"SELECT slug, question FROM ask_golden WHERE " + GOLDEN_COMPLETE_SQL'), "tuneRetrieval reads its golden questions through GOLDEN_COMPLETE_SQL");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

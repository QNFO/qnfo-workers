// IDEAS-INTAKE-OWNER-1 (1.10.12) offline suite. Runs the worker's own triageProposals and intake in a vm against in-memory SQLite.
// Proves: with research_queue full (RESEARCH-ADMISSION-CAP-1), an owner-authored idea is still queued while a machine-generated
// accept is held by the cap; POST /api/intake answers 401 without the owner token and files an idea, with its row id, with it.
// Run: node idea-hub/owner-admission-bypass.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const src = stripWorkerDefaultExport(readFileSync(join(here, "worker.js"), "utf8")).replace(/export default\s*\{/, "var __default = {");
const sb = { console: { log() {}, error() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { intake, ownerOk, ownerPipelineDois, triageProposals, runOwnerCorpus, runReentry, runConsume, thinkSeed, proposalKind, realQuestion, ownerPaper, aiRunAttr, promptCacheOpts, OWNER_CORPUS_SCORE_MIN, OWNER_CORPUS_RQ_CAP, OWNER_CORPUS_BATCH, REASONING_MAX_TOKENS, OWNER_CORPUS_FLEET_ERA };", sb);
const api = sb.__x;
const mk = () => new DatabaseSync(":memory:");
const shim = (db) => ({ prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) ?? null; }, async run() { const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } });
const db = mk();
db.exec(`CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, created_at TEXT, UNIQUE(source, source_id));
CREATE TABLE signals (id TEXT PRIMARY KEY, ts TEXT, source TEXT, source_ref TEXT, content TEXT, open_questions TEXT, evidential_weight REAL, domain TEXT, status TEXT, decision TEXT, created_at TEXT);
CREATE TABLE signal_worker_boundary (worker TEXT, source TEXT, permitted INTEGER);
CREATE TABLE notes_intake (path TEXT PRIMARY KEY, type TEXT, title TEXT, status TEXT, sig TEXT);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE ai_cache_counters (day TEXT, worker TEXT, model TEXT, calls INTEGER DEFAULT 0, cached_calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, cached_tok INTEGER DEFAULT 0, PRIMARY KEY (day, worker, model));`);
// Scripted model: a scorecard whose merit depends on a marker in the idea; an extraction reply for notebook prompts.
const card = (m) => JSON.stringify({ novelty: m, technical_merit: m, impact_potential: m, exposure_potential: m, feasibility: 0.9, risk: 0.1, rationale: "r" + m, hook: "h" });
const calls = [];
const seenMax = [], seenAff = [];
const AI = { async run(model, input, opts) {
  const p = String(input.messages[0].content);
  seenMax.push(input.max_tokens); seenAff.push(opts && opts.extraHeaders && opts.extraHeaders["x-session-affinity"] || null);
  calls.push(p.startsWith("You read one note") ? "corpus" : "score");
  if (p.startsWith("You read one note")) {
    if (/NO-IDEA-HERE/.test(p)) return { response: '{"none":"shopping list"}' };
    return { response: '{"title":"Distinction lattices bound measurement records","idea":"The author argues that a distinction lattice over measurement outcomes gives an ultrametric on records, and that its depth bounds the information an observer can extract. A formal analysis can derive the bound and test it on finite lattices by computation."}' };
  }
  const m = /MERIT_LOW/.test(p) ? 0.3 : /MERIT_MID/.test(p) ? 0.6 : /MERIT_BORDERLINE/.test(p) ? 0.75 : /MERIT_AT_BAR/.test(p) ? 0.8 : 0.9;
  return { response: card(m) };
} };
const vault = new Map();
const VAULT = { async get(k) { return vault.has(k) ? { async text() { return vault.get(k); } } : null; } };
const env = { QNFO_AUDIT: shim(db), AI, VAULT };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const add = (name, idea, contact = "") => Number(db.prepare("INSERT INTO idea_proposals (name, idea, contact, status, created_at) VALUES (?, ?, ?, 'new', datetime('now'))").run(name, idea, contact).lastInsertRowid);
const row = (id) => db.prepare("SELECT * FROM idea_proposals WHERE id = ?").get(id);
const queued = (id) => !!db.prepare("SELECT 1 FROM research_queue WHERE source_id = ?").get(String(id));

// 1. Fill the research queue well past RESEARCH_ADMISSION_CAP so the cap is active.
const fill = db.prepare("INSERT INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at) VALUES (?, 'seed', ?, 'x', '', 0.5, 'ACCEPT', 'queued', datetime('now'))");
for (let i = 0; i < 300; i++) fill.run("seed-" + i, "seed-" + i);

const own = add("owner-chat", "MERIT_LOW An owner-authored idea filed while the research queue is full.", "owner");
const gen = add("auto-scan", "MERIT_HIGH A machine-generated proposal that the model scores highly.", "");
const borderline = add("auto-scan", "MERIT_BORDERLINE A generated proposal below the raised acceptance bar.", "");
const atBar = add("auto-scan", "MERIT_AT_BAR A generated proposal exactly at the acceptance bar.", "");
await api.triageProposals(env);

ok(row(own).status === "triaged_accepted" && queued(own), "an owner-authored idea is queued even though the research queue is over the admission cap", row(own));
ok(!/research admission cap/.test(String(row(own).rationale || "")), "the owner idea carries no admission-cap rationale", row(own).rationale);
ok(row(gen).status === "triaged_hold" && /research admission cap/.test(String(row(gen).rationale || "")) && !queued(gen), "a machine-generated accept is still held by the cap (backpressure unchanged)", row(gen));
ok(row(borderline).decision === "HOLD" && row(borderline).status === "triaged_hold" && !/research admission cap/.test(String(row(borderline).rationale || "")) && !queued(borderline), "generated scores below 0.8 do not enter the research queue", row(borderline));
ok(row(atBar).decision === "ACCEPT" && row(atBar).status === "triaged_hold" && /research admission cap/.test(String(row(atBar).rationale || "")) && !queued(atBar), "a generated score of exactly 0.8 passes acceptance and reaches the existing queue cap", row(atBar));

// 2. POST /api/intake: owner token required; an idea is filed and its id returned.
const secret = "t".repeat(32);
const ienv = { QNFO_AUDIT: shim(db), OWNER_TOKEN: secret };
const mkReq = (headers, body) => new Request("https://ideas.qnfo.org/api/intake", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(body || { kind: "idea", title: "T", body: "A light-triggered threshold analogy." }) });
ok(api.ownerOk(mkReq({}), ienv) === false, "no Authorization header is refused");
ok(api.ownerOk(mkReq({ Authorization: "Bearer " + "x".repeat(32) }), ienv) === false, "a router-style key that is not the owner token is refused");
ok(api.ownerOk(mkReq({ Authorization: "Bearer " + secret }), ienv) === true, "the owner token is accepted");
const before = Number(db.prepare("SELECT COUNT(*) n FROM idea_proposals").get().n);
const resp = await api.intake(mkReq({ Authorization: "Bearer " + secret }), ienv);
const j = await resp.json();
const after = Number(db.prepare("SELECT COUNT(*) n FROM idea_proposals").get().n);
ok(resp.status === 200 && j.ok === true && j.kind === "idea" && after === before + 1, "intake files one idea", j);
ok(Number.isInteger(j.id) && j.id > 0 && row(j.id) && row(j.id).name === "owner-chat" && row(j.id).contact === "owner", "the reply carries the new row id and it matches the stored owner-chat row", j);
ok(Number.isInteger(j.id) && api.proposalKind(row(j.id)) === "direct", "the filed row is classified as a direct owner idea");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

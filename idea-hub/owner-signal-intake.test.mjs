// OWNER-SIGNAL-INTAKE-1 (1.7.0, #1947 #2103 #2104) offline suite. Runs the worker's own triageProposals, runOwnerCorpus,
// runReentry and thinkSeed in a vm against in-memory SQLite D1s, a scripted Workers AI stub and an in-memory R2 vault.
// Proves: an owner-authored idea is ACCEPTed and queued even when the model says HOLD; an owner's short chat question is
// still held; an ask-gap question is scored instead of filtered; a notebook idea passes at OWNER_CORPUS_SCORE_MIN and
// fails below it; the corpus feeder turns a research note into one owner-corpus proposal, records short, missing and
// no-idea notes, never reads a note twice, and pauses when research_queue is full; re-entry reads only the owner's own
// papers; the think loop is seeded from the owner's accepted ideas.
// Run: node idea-hub/owner-signal-intake.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8").replace(/export default\s*\{/, "var __default = {");
const sb = { console: { log() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, crypto, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { triageProposals, runOwnerCorpus, runReentry, thinkSeed, proposalKind, OWNER_CORPUS_SCORE_MIN, OWNER_CORPUS_RQ_CAP, OWNER_CORPUS_BATCH };", sb);
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
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));`);
// Scripted model: a scorecard whose merit depends on a marker in the idea; an extraction reply for notebook prompts.
const card = (m) => JSON.stringify({ novelty: m, technical_merit: m, impact_potential: m, exposure_potential: m, feasibility: 0.9, risk: 0.1, rationale: "r" + m, hook: "h" });
const calls = [];
const AI = { async run(model, input) {
  const p = String(input.messages[0].content);
  calls.push(p.startsWith("You read one note") ? "corpus" : "score");
  if (p.startsWith("You read one note")) {
    if (/NO-IDEA-HERE/.test(p)) return { response: '{"none":"shopping list"}' };
    return { response: '{"title":"Distinction lattices bound measurement records","idea":"The author argues that a distinction lattice over measurement outcomes gives an ultrametric on records, and that its depth bounds the information an observer can extract. A formal analysis can derive the bound and test it on finite lattices by computation."}' };
  }
  const m = /MERIT_LOW/.test(p) ? 0.3 : /MERIT_MID/.test(p) ? 0.6 : 0.9;
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

// 1. Kinds.
ok(api.proposalKind({ name: "owner-chat", contact: "owner" }) === "direct" && api.proposalKind({ name: "chat-session", contact: "rowan-chat-2026-10-01" }) === "direct" && api.proposalKind({ name: "rowan-chat", contact: "chat" }) === "direct", "owner-chat, chat-session and rowan-* rows are owner-direct");
ok(api.proposalKind({ name: "owner-corpus", contact: "owner" }) === "corpus" && api.proposalKind({ name: "intake:arxiv-complexity", contact: "owner" }) === "generated" && api.proposalKind({ name: "auto-scan" }) === "generated", "owner-corpus is corpus; radar intake and arXiv scan are generated");

// 2. Triage routing.
const own = add("owner-chat", "MERIT_LOW Revision target: the two-index anyon condensation framework undercounts D_C^2 in Ising x Ising-bar; correct and extend with module categories.", "owner");
const chatQ = add("chat-session", "What is a qubit?", "rowan-chat-2026-10-01");
const gap = add("ask-gap", "What are implications for consciousness and distinction/partition calculus/theory?");
const corpHi = add("owner-corpus", "MERIT_MID Distinction lattices bound measurement records. Source: owner notebook notes/v1/x.md", "owner");
const corpLo = add("owner-corpus", "MERIT_LOW A vague thought about everything. Source: owner notebook notes/v1/y.md", "owner");
let out = await api.triageProposals(env);
ok(row(own).status === "triaged_accepted" && row(own).decision === "ACCEPT" && queued(own), "an owner idea the model scores low is still ACCEPTed and queued for research", row(own));
ok(/owner-authored/.test(row(own).rationale) && row(own).score !== null, "the owner row keeps its score and says why it was accepted");
ok(row(chatQ).status === "triaged_hold" && row(chatQ).rationale === "noise/question filter", "an owner's short chat question is still held by the question filter");
ok(row(gap).rationale !== "noise/question filter" && row(gap).score !== null, "an Ask QWAV gap is scored, not dropped by the question filter", row(gap));
ok(row(corpHi).status === "triaged_accepted" && queued(corpHi), "a notebook idea at the corpus bar (" + api.OWNER_CORPUS_SCORE_MIN + ") is ACCEPTed and queued", row(corpHi));
ok(row(corpLo).status === "triaged_hold" && !queued(corpLo), "a notebook idea below the corpus bar is held");
ok(out.owner_accepted === 2, "the run counts owner accepts", out);

// 3. Corpus feeder.
db.exec("DELETE FROM research_queue");
const longNote = "Some reflections.\n\n" + "A distinction lattice over measurement outcomes induces an ultrametric on the record space. ".repeat(12);
db.prepare("INSERT INTO notes_intake (path, type, title, status, sig) VALUES (?,?,?,?,?)").run("notes/v1/2025/10/28/a.md", "note", "a", "active", "s1");
db.prepare("INSERT INTO notes_intake (path, type, title, status, sig) VALUES (?,?,?,?,?)").run("notes/v1/2025/10/27/b.md", "note", "b", "active", "s2");
db.prepare("INSERT INTO notes_intake (path, type, title, status, sig) VALUES (?,?,?,?,?)").run("notes/v1/2025/10/26/c.md", "note", "c", "active", "s3");
db.prepare("INSERT INTO notes_intake (path, type, title, status, sig) VALUES (?,?,?,?,?)").run("notes/v1/2025/10/25/d.md", "note", "d", "active", "s4");
db.prepare("INSERT INTO notes_intake (path, type, title, status, sig) VALUES (?,?,?,?,?)").run("notes/v1/2025/10/29/daily.md", "daily", "daily", "active", "s5");
vault.set("notes/v1/2025/10/28/a.md", "---\ntags: x\n---\n" + longNote);
vault.set("notes/v1/2025/10/27/b.md", "too short");
vault.set("notes/v1/2025/10/26/c.md", "NO-IDEA-HERE " + "milk eggs bread ".repeat(60));
const before = db.prepare("SELECT COUNT(*) n FROM idea_proposals").get().n;
calls.length = 0;
let c1 = await api.runOwnerCorpus(env);
ok(c1.picked === api.OWNER_CORPUS_BATCH && api.OWNER_CORPUS_BATCH === 2, "one run reads at most OWNER_CORPUS_BATCH notes, newest path first", c1);
ok(c1.proposed === 1 && c1.short === 1, "the research note becomes a proposal; the short note is recorded as short", c1);
const p = db.prepare("SELECT * FROM idea_proposals WHERE name = 'owner-corpus' AND idea LIKE '%notes/v1/2025/10/28/a.md%'").get();
ok(p && p.contact === "owner" && p.status === "new" && /^corpus:[0-9a-f]{16}$/.test(p.ip_hash) && /^Distinction lattices bound measurement records\. /.test(p.idea), "the proposal is owner-corpus, contact owner, status new, tagged by path hash, titled", p);
ok(db.prepare("SELECT COUNT(*) n FROM idea_proposals").get().n === before + 1, "exactly one proposal was written");
let c2 = await api.runOwnerCorpus(env);
ok(c2.none === 1 && c2.missing === 1 && c2.proposed === 0, "the next run takes the next two notes: no idea in one, missing body in the other", c2);
const seen = Object.fromEntries(db.prepare("SELECT path, outcome FROM owner_corpus_seen").all().map((r) => [r.path, r.outcome]));
ok(seen["notes/v1/2025/10/28/a.md"] === "proposed" && seen["notes/v1/2025/10/27/b.md"] === "short" && seen["notes/v1/2025/10/26/c.md"] === "none" && seen["notes/v1/2025/10/25/d.md"] === "missing" && !("notes/v1/2025/10/29/daily.md" in seen), "every eligible note gets one outcome row; daily notes are not corpus", seen);
let c3 = await api.runOwnerCorpus(env);
ok(c3.picked === 0, "a third run finds nothing left: no note is read twice", c3);
ok(calls.filter((x) => x === "corpus").length === 2, "only notes with a long enough body reach the model (2 calls)", calls);
db.prepare("INSERT INTO notes_intake (path, type, title, status, sig) VALUES (?,?,?,?,?)").run("notes/v1/2025/11/01/e.md", "note", "e", "active", "s6");
for (let i = 0; i < api.OWNER_CORPUS_RQ_CAP; i++) db.prepare("INSERT INTO research_queue (id, source, source_id, status) VALUES (?, 'proposal', ?, 'queued')").run("rq" + i, "x" + i);
let c4 = await api.runOwnerCorpus(env);
ok(c4.picked === 0 && /research_queue/.test(String(c4.paused)), "the feeder pauses while research_queue already holds OWNER_CORPUS_RQ_CAP waiting rows", c4);
let c5 = await api.runOwnerCorpus({ QNFO_AUDIT: shim(db), AI });
ok(c5.ok === false && /VAULT/.test(c5.why), "without the VAULT binding the feeder reports it and does nothing", c5);

// 4. Re-entry reads only the owner's own papers.
const lp = mk();
lp.exec("CREATE TABLE papers (doi TEXT, title TEXT, body_md TEXT, created_at TEXT, status TEXT, identifier_type TEXT)");
const body = "## Open Questions\n- Does the ultrametric bound extend to infinite products of records?\n";
lp.prepare("INSERT INTO papers VALUES (?,?,?,?,?,?)").run("10.5281/zenodo.1", "Own", body, "2026-10-01", "published", "zenodo");
lp.prepare("INSERT INTO papers VALUES (?,?,?,?,?,?)").run("10.48550/arXiv.2610.1", "ArXiv QEC", body, "2026-10-06", "published", "arxiv");
lp.prepare("INSERT INTO papers VALUES (?,?,?,?,?,?)").run("10.5281/zenodo.2", "Pipeline", body, "2026-10-06", "published", "qnfo");
db.prepare("INSERT INTO signal_worker_boundary (worker, source, permitted) VALUES ('idea-hub', 'artifact_reentry', 0), ('idea-hub', 'artifact_reentry_owner', 1)").run();
const r = await api.runReentry({ QNFO_AUDIT: shim(db), LIVING_PAPER: shim(lp) });
const refs = db.prepare("SELECT source_ref FROM signals WHERE source = 'artifact_reentry'").all().map((x) => x.source_ref);
ok(r.scanned === 1 && refs.length === 1 && refs[0] === "10.5281/zenodo.1", "re-entry scans only owner-authored papers (zenodo), not arxiv or pipeline rows", { r, refs });

// 5. Think loop seed.
const seed = await api.thinkSeed(env);
ok(/The author's own lines of work/.test(seed) && /Distinction lattices|anyon condensation/.test(seed) && !/quantum foundations, information thermodynamics/.test(seed), "the think loop is seeded from the owner's accepted ideas, not fixed quantum themes", seed.slice(0, 200));
const empty = mk(); empty.exec("CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, idea TEXT, contact TEXT, decision TEXT)");
ok(/Avoid quantum error correction/.test(await api.thinkSeed({ QNFO_AUDIT: shim(empty) })), "with no owner ideas on file the seed falls back without fixed quantum themes");

const ih = readFileSync(join(here, "worker.js"), "utf8");
ok(/r\.corpus = await runOwnerCorpus\(env\)/.test(ih), "the hourly ideation cycle runs the corpus feeder");
ok(/binding = "VAULT"[\s\S]*bucket_name = "obsidian-vault"/.test(readFileSync(join(here, "wrangler.toml"), "utf8")), "wrangler.toml binds the obsidian-vault bucket as VAULT");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

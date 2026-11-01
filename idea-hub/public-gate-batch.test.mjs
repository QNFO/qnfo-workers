// IDEAS-HUB-SLOW-RSS-1 part 2 offline suite (idea-hub 1.14.6, agent_issues 1000460): all() reads the public-gate flags of every thread in one query.
// The previous all() called blocked() once per thread (a D1 query that pulled up to 200 message bodies, about 150 round trips, 3 to 4.5 s). This suite runs the real worker against a real SQLite
// behind a D1-shaped shim and proves (1) the visible set is the one blocked() would give, case by case: a clean thread is public; a system turn in the first 200 hides it, one at position 201
// does not; an internal term beyond the first 1000 characters of the first user turn (past publicTitle, inside blocked's 4000) hides it; a quarantined thread, a thread named by an open errata
// row and a thread with no user turn are hidden; a closed errata row does not hide; (2) the number of D1 statements that read the chat table no longer grows with the number of threads;
// (3) archive sessions with no chat rows are skipped without a query and one with chat rows still goes through blocked(); (4) an unreadable flags query falls back to blocked() per thread.
// Run: node --no-warnings idea-hub/public-gate-batch.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE chat (id INTEGER PRIMARY KEY AUTOINCREMENT, thread TEXT, role TEXT, content TEXT, ts INTEGER, model TEXT);
  CREATE TABLE chat_sessions (thread_id TEXT, title TEXT, category TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE chat_feed_quarantine_20260926 (thread TEXT);
  CREATE TABLE internal_errata (target_kind TEXT, target_ref TEXT, status TEXT);
  CREATE TABLE self_questions (id INTEGER PRIMARY KEY, ts TEXT, question TEXT, status TEXT);
  CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, idea TEXT, status TEXT, created_at TEXT, decision TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);`);
let stmts = [], breakFlags = false;
const env = { QNFO_AUDIT: { prepare(sql) {
  let args = [];
  const run = (kind) => { stmts.push(sql); if (breakFlags && /ROW_NUMBER\(\)/.test(sql)) throw new Error("flags query unreadable"); const st = db.prepare(sql); return kind === "first" ? (st.get(...args) ?? null) : { results: st.all(...args) }; };
  const o = { bind(...a) { args = a; return o; }, async all() { return run("all"); }, async first() { return run("first"); }, async run() { stmts.push(sql); return {}; } };
  return o;
} } };

let t0 = 1000;
const msg = (thread, role, content) => db.prepare("INSERT INTO chat (thread, role, content, ts, model) VALUES (?, ?, ?, ?, 'm')").run(thread, role, content, t0++);
const Q = (n) => "What is the structure of ultrametric spaces and p-adic numbers, case " + n + "?";
// many clean threads first (older), so the case threads below are the newest and fall inside the first 100 entries, to show the statement count does not grow
for (let i = 0; i < 120; i++) { msg("t-many-" + i, "user", Q(100 + i)); msg("t-many-" + i, "assistant", "ok"); }
// t-clean: public
msg("t-clean", "user", Q(1)); msg("t-clean", "assistant", "An answer.");
// t-system: a system turn inside the first 200 hides it
msg("t-system", "user", Q(2)); msg("t-system", "system", "You are a helpful assistant."); msg("t-system", "assistant", "ok");
// t-system-201: a system turn at position 201 is outside the window blocked() reads, so the thread stays public
msg("t-system-201", "user", Q(3)); for (let i = 0; i < 199; i++) msg("t-system-201", "assistant", "a" + i); msg("t-system-201", "system", "late system turn");
// t-system-150: a system turn at position 150 hides it
msg("t-system-150", "user", Q(4)); for (let i = 0; i < 148; i++) msg("t-system-150", "assistant", "a" + i); msg("t-system-150", "system", "system turn at 150");
// t-late-internal: an internal term after the first 1000 characters passes publicTitle and is caught by blocked's 4000 characters
msg("t-late-internal", "user", Q(5) + " " + "x ".repeat(560) + " system prompt appears here");
msg("t-late-internal", "assistant", "ok");
// t-quarantined, t-errata-open, t-errata-closed
for (const [t, n] of [["t-quarantined", 61], ["t-errata-open", 62], ["t-errata-closed", 63]]) { msg(t, "user", Q(n)); msg(t, "assistant", "ok"); }
db.prepare("INSERT INTO chat_feed_quarantine_20260926 (thread) VALUES ('t-quarantined')").run();
db.prepare("INSERT INTO internal_errata (target_kind, target_ref, status) VALUES ('chat_log', 't-errata-open:1', 'open')").run();
db.prepare("INSERT INTO internal_errata (target_kind, target_ref, status) VALUES ('chat_log', 't-errata-closed:1', 'closed')").run();
// t-no-user: only assistant turns
msg("t-no-user", "assistant", "an unprompted answer to nothing in particular here");
// t-ops: an operations term in the first user turn
msg("t-ops", "user", "Please run ops_d1_query to count the backlog for me today"); msg("t-ops", "assistant", "ok");
// archive sessions: one with chat rows (goes through blocked()), one without
db.prepare("INSERT INTO chat_sessions (thread_id, title, category, created_at, updated_at) VALUES ('t-clean', ?, 'research', '2026-10-01 00:00:00', '2026-10-01 00:00:00')").run(Q(1) + " archive copy of a clean thread");
db.prepare("INSERT INTO chat_sessions (thread_id, title, category, created_at, updated_at) VALUES ('a-norows', ?, 'research', '2026-10-02 00:00:00', '2026-10-02 00:00:00')").run("An archive session with no chat rows at all, about ultrametric geometry");

const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.caches = undefined; // no stored copy: every read builds
const ctx = { waitUntil() {} };
const get = async (path) => { const r = await w.fetch(new Request("https://ideas.qnfo.org" + path), env, ctx); return r.status === 200 ? JSON.parse(await r.text()) : null; };

stmts = [];
const body = await get("/api/sessions?limit=100");
const buildStmts = stmts.slice();
const ids = new Set((body?.sessions || []).map((x) => x.id));
// a smaller database that holds only the case threads lists every one of them, so the cases that sort after the first entries are checked too
const small = new DatabaseSync(":memory:");
small.exec(db.prepare("SELECT group_concat(sql, ';') AS s FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().s + ";");
const copy = (t, where, ...a) => { const rows = db.prepare("SELECT * FROM " + t + " WHERE " + where).all(...a); for (const r of rows) { const cols = Object.keys(r); small.prepare("INSERT INTO " + t + " (" + cols.join(",") + ") VALUES (" + cols.map(() => "?").join(",") + ")").run(...cols.map((c) => r[c])); } };
for (const t of ["t-clean", "t-system", "t-system-201", "t-system-150", "t-late-internal", "t-quarantined", "t-errata-open", "t-errata-closed", "t-no-user", "t-ops"]) copy("chat", "thread = ?", t);
copy("chat_feed_quarantine_20260926", "1 = 1"); copy("internal_errata", "1 = 1"); copy("chat_sessions", "1 = 1");
const env2 = { QNFO_AUDIT: { prepare(sql) { let args = []; const o = { bind(...a) { args = a; return o; }, async all() { return { results: small.prepare(sql).all(...args) }; }, async first() { return small.prepare(sql).get(...args) ?? null; }, async run() { return {}; } }; return o; } } };
const get2 = async (path) => JSON.parse(await (await w.fetch(new Request("https://ideas.qnfo.org" + path), env2, ctx)).text());
const vis = new Map((await get2("/api/sessions?limit=100")).sessions.map((x) => [x.id, x]));
ok(vis.has("t-clean") && vis.get("t-clean").kind === "thread", "small db: the clean thread is public as a live thread");
ok(vis.has("t-system-201"), "a system turn at position 201 is outside the window blocked() reads: the thread stays public");
ok(vis.has("t-errata-closed"), "a closed errata row does not hide the thread");
ok(!vis.has("t-system") && !vis.has("t-system-150") && !vis.has("t-late-internal") && !vis.has("t-quarantined") && !vis.has("t-errata-open") && !vis.has("t-no-user") && !vis.has("t-ops"), "every hidden case stays hidden");
ok(!vis.has("a-norows"), "an archive session with no chat rows is not listed (blocked() treated it as blocked too)");
ok([...vis.values()].filter((x) => x.id === "t-clean").length === 1, "the archive copy of t-clean is de-duplicated by title, as before");
ok(vis.size === 3, "exactly the three public threads are listed", [...vis.keys()]);

// statement count: reads of the chat table do not grow with the number of threads
const chatReads = buildStmts.filter((s) => /\bFROM chat\b/i.test(s) && !/chat_sessions|chat_feed_quarantine/i.test(s));
ok(chatReads.length <= 4, "chat reads for 130 threads: at most 4 statements (thread list, flags, plus the archive fallback), not one per thread", chatReads.length);
ok(buildStmts.filter((s) => /SELECT role,content FROM chat WHERE thread=\?/.test(s)).length <= 1, "no per-thread message-body query for the live threads (at most the one archive fallback)", buildStmts.filter((s) => /SELECT role,content FROM chat WHERE thread=\?/.test(s)).length);
ok(buildStmts.some((s) => /ROW_NUMBER\(\) OVER \(PARTITION BY thread/.test(s)) && !buildStmts.some((s) => /SELECT[^;]*content[^;]*ROW_NUMBER/.test(s)), "the flags query reads thread and role only, no message content");

// an unreadable flags query falls back to blocked() per thread with the same visible set
breakFlags = true; stmts = [];
const vis2 = new Map((await get("/api/sessions?limit=100")).sessions.map((x) => [x.id, x]));
ok(vis2.has("t-clean") && !vis2.has("t-system") && !vis2.has("t-quarantined"), "flags unreadable: the per-thread blocked() fallback gives the same answer");
ok(stmts.filter((s) => /SELECT role,content FROM chat WHERE thread=\?/.test(s)).length > 50, "flags unreadable: the fallback does query per thread", stmts.filter((s) => /SELECT role,content FROM chat WHERE thread=\?/.test(s)).length);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

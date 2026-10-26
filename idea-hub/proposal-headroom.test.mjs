// PROPOSAL-HEADROOM-1 (idea-hub 1.8.6, agent_issues 2489, pillar research). The batch producers fill the triage queue only up to
// PROPOSAL_FILL_TO (under the integration chain's limit of 30), counting what the same cycle already added; nothing is dropped.
// Runs the worker's own runAskGap and proposalRoom against an in-memory SQLite D1; source checks cover runConsume and runOwnerCorpus.
// Run: node idea-hub/proposal-headroom.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { stripWorkerDefaultExport } from "../scripts/worker-source-test.mjs";
const here = dirname(fileURLToPath(import.meta.url));
const raw = stripWorkerDefaultExport(readFileSync(join(here, "worker.js"), "utf8"));
const src = raw.replace(/export default\s*\{/, "var __default = {");
const sb = { console: { log() {}, error() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response: class {}, Request: class {}, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { runAskGap, proposalRoom, runConsume, runOwnerCorpus, thinkLoop, PROPOSAL_PENDING_WHERE, PROPOSAL_FILL_TO, PROPOSAL_BACKPRESSURE, ASK_GAP_BATCH };", sb);
const { runAskGap, proposalRoom, runConsume, runOwnerCorpus, thinkLoop, PROPOSAL_PENDING_WHERE, PROPOSAL_FILL_TO, PROPOSAL_BACKPRESSURE, ASK_GAP_BATCH } = sb.__x;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE ask_events (id TEXT PRIMARY KEY, ts TEXT, qhash TEXT, query TEXT, cached INTEGER DEFAULT 0, uncovered INTEGER, error TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);`);
const d1 = { prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db.prepare(q).all(...a) }; }, async first() { return db.prepare(q).get(...a) || null; }, async run() { const r = db.prepare(q).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } };
// The function body, brace-matched, for source assertions that must not depend on how many lines a stage grows to.
// The fixed 900-char slice this replaced stopped covering triageProposals once CRON-BUDGET-1 (2026-10-17) added the
// wall-clock budget to ideationCycle, so the ordering assertion read indexOf(...) === -1 and failed on a correct cycle.
// A nested block that closes on its own line would break indexOf("\n}\n") the same way, so count braces instead.
function fnBody(src, name) {
  const start = src.indexOf("async function " + name + "(");
  if (start < 0) return "";
  let depth = 0;
  for (let j = src.indexOf("{", start); j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  return src.slice(start);
}
const env = { QNFO_AUDIT: d1 };
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
ok(PROPOSAL_FILL_TO === 25 && PROPOSAL_FILL_TO < 30 && PROPOSAL_FILL_TO <= PROPOSAL_BACKPRESSURE, "producers fill to 25, under the chain limit of 30 and the pause threshold", { PROPOSAL_FILL_TO, PROPOSAL_BACKPRESSURE });
const fillNew = (k) => { for (let i = 0; i < k; i++) db.prepare("INSERT INTO idea_proposals (name, idea, status) VALUES ('x', ?, 'new')").run("p" + Math.random()); };
ok(await proposalRoom(env) === PROPOSAL_FILL_TO, "an empty queue has PROPOSAL_FILL_TO of room");
fillNew(PROPOSAL_FILL_TO - 2);
ok(await proposalRoom(env) === 2, "room is PROPOSAL_FILL_TO minus the new and deferred_budget proposals");
const broken = { QNFO_AUDIT: { prepare() { return { first() { return Promise.reject(new Error("D1 down")); } }; } } };
ok(await proposalRoom(broken) === null, "an unreadable count gives null, so producers keep their old behaviour");
let n = 0;
const ask = (q) => db.prepare("INSERT INTO ask_events (id, ts, qhash, query, cached, uncovered, error) VALUES (?, datetime('now', '-1 hours'), ?, ?, 0, 1, NULL)").run("e" + n++, "h" + n, q);
for (let i = 0; i < 6; i++) ask("What is the measured energy per solution for quantum annealing benchmark variant " + i + " on number partitioning?");
let r = await runAskGap(env);
ok(r.inserted === 2 && ASK_GAP_BATCH > 2, "with room for 2, ask gaps add 2, not a whole batch", r);
ok(db.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status = 'new'").get().n === PROPOSAL_FILL_TO, "the queue stops at PROPOSAL_FILL_TO");
r = await runAskGap(env);
ok(r.paused === true && r.inserted === 0 && r.room === 0, "a full queue pauses the producer and says why", r);
db.prepare("UPDATE idea_proposals SET status = 'triaged_hold' WHERE id IN (SELECT id FROM idea_proposals WHERE status = 'new' ORDER BY id LIMIT 5)").run();
r = await runAskGap(env);
ok(r.inserted === Math.min(5, ASK_GAP_BATCH, 4), "after triage frees 5, the gaps left out before are added (nothing was dropped)", r);
const cons = raw.slice(raw.indexOf("async function runConsume(env) {"), raw.indexOf("// OWNER-SIGNAL-INTAKE-1 (1.7.0): the think loop"));
ok(/var room = pending \? PROPOSAL_FILL_TO - Number\(pending\.n\) : null;/.test(cons) && /if \(room !== null && room <= 0\) \{ out\.paused = true; out\.room = room; return out; \}/.test(cons), "re-entry pauses when the queue is at PROPOSAL_FILL_TO");
ok(/if \(room !== null && qs\.length > room - out\.proposals\) \{ out\.room_left = room - out\.proposals; break; \}/.test(cons) && cons.indexOf("qs.length > room - out.proposals") < cons.indexOf("INSERT INTO idea_proposals"), "a re-entry signal is consumed whole or left new, checked before any insert");
const corp = raw.slice(raw.indexOf("async function runOwnerCorpus(env, deadline) {"), raw.indexOf("async function runOwnerCorpus(env, deadline) {") + 3000);
ok(/var room = await proposalRoom\(env\);/.test(corp) && /if \(room < batch\) \{ batch = room; out\.capped = "room " \+ room; \}/.test(corp) && corp.indexOf("var room = await proposalRoom(env);") < corp.indexOf("FROM notes_intake"), "the notebook batch is capped by the room before notes are read");
const cyc = fnBody(raw, "ideationCycle");
ok(cyc.length > 400 && cyc.indexOf("runAskGap(env)") > 0 && cyc.indexOf("runOwnerCorpus(env, WALL_DEADLINE)") > 0 && cyc.indexOf("triageProposals(env, WALL_DEADLINE)") > 0, "the cycle body was read whole (every stage inside ideationCycle)", { len: cyc.length });
ok(cyc.indexOf("runConsume(env)") < cyc.indexOf("runOwnerCorpus(env, WALL_DEADLINE)") && cyc.indexOf("runOwnerCorpus(env, WALL_DEADLINE)") < cyc.indexOf("triageProposals(env, WALL_DEADLINE)"), "the notebook reads the room after re-entry and ask gaps, before triage");
// PROPOSAL-COOLING-1 (1.14.3, agent_issues 1000244): a row IDEA-SCORING-POISON-1 could not score ("[scoring-error N ISO]" in rationale) stays in 'new'
// for days waiting for a model, not for triage capacity. It is not counted against PROPOSAL_BACKPRESSURE or the fill-to room by any of the five
// producers' counts. Live on 2026-10-26: 33 'new' rows, 24 of them marked, so the count (33) sat over 30 and runConsume was paused with 9 really waiting.
{
  const mk = (db3) => ({ prepare(sql) { let a = []; const q = sql.replace(/\?(\d+)/g, "?"); const st = { bind(...x) { a = x; return st; }, async all() { return { results: db3.prepare(q).all(...a) }; }, async first() { return db3.prepare(q).get(...a) || null; }, async run() { const r = db3.prepare(q).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; return st; } });
  const fresh = () => {
    const x = new DatabaseSync(":memory:");
    x.exec(`CREATE TABLE ask_events (id TEXT PRIMARY KEY, ts TEXT, qhash TEXT, query TEXT, cached INTEGER DEFAULT 0, uncovered INTEGER, error TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT, decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE signals (id TEXT PRIMARY KEY, ts TEXT, source TEXT, source_ref TEXT, content TEXT, open_questions TEXT, evidential_weight REAL, domain TEXT, status TEXT DEFAULT 'new', decision TEXT, score REAL, created_at TEXT);
CREATE TABLE signal_worker_boundary (worker TEXT NOT NULL, source TEXT NOT NULL, permitted INTEGER DEFAULT 1, domain TEXT, note TEXT, PRIMARY KEY (worker, source));`);
    x.prepare("INSERT INTO signal_worker_boundary (worker, source, permitted) VALUES ('idea-hub', 'artifact_reentry_owner', 1)").run();
    return x;
  };
  const MARK = "[scoring-error 1 2026-10-25T00:00:00.000Z] lean scoring failed: no JSON";
  const put = (x, n, status, rationale, name = "owner-corpus") => { for (let i = 0; i < n; i++) x.prepare("INSERT INTO idea_proposals (name, idea, status, rationale, created_at) VALUES (?, ?, ?, ?, '2026-10-25T00:00:00Z')").run(name, "idea " + Math.random(), status, rationale); };
  const x1 = fresh();
  put(x1, 24, "new", MARK);                       // the marked rows, as live
  put(x1, 8, "new", null, "auto-scan");           // clean rows, NULL rationale
  put(x1, 1, "deferred_budget", "scored earlier"); // a clean deferred_budget row still counts
  const e1 = { QNFO_AUDIT: mk(x1) };
  ok(PROPOSAL_PENDING_WHERE === "status IN ('new', 'deferred_budget') AND COALESCE(rationale, '') NOT LIKE '%[scoring-error%'", "the shared pending clause counts new and deferred_budget rows without the scoring-error marker", PROPOSAL_PENDING_WHERE);
  ok(x1.prepare("SELECT COUNT(*) n FROM idea_proposals WHERE status IN ('new', 'deferred_budget')").get().n === 33, "fixture: 33 rows would count without the exclusion (over PROPOSAL_BACKPRESSURE)");
  ok(await proposalRoom(e1) === PROPOSAL_FILL_TO - 9, "proposalRoom counts the 9 unmarked rows only: room 16, not -8", await proposalRoom(e1));
  put(x1, 1, "new", "noise/question filter [scoring-error 3 2026-10-25T00:00:00.000Z]"); // a marker that is not at the start of rationale is still a marker
  ok(await proposalRoom(e1) === PROPOSAL_FILL_TO - 9, "a marker later in the text is excluded too (the clause is %[scoring-error%)");
  // runConsume: with the marked rows in 'new' it used to read 33 > 30 and pause; now it consumes
  const SIGNAL_Q = ["Does the measured bound survive at finite temperature and strong coupling in the cryogenic stage?"];
  x1.prepare("INSERT INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES ('artifact_reentry:p1', '2026-10-25T00:00:00Z', 'artifact_reentry', '10.9999/p1', 't', ?, 0.9, 'research', 'new', '2026-10-25T00:00:00Z')").run(JSON.stringify(SIGNAL_Q));
  const c1 = await runConsume(e1);
  ok(c1.paused === false && c1.consumed === 1 && c1.proposals === 1, "runConsume is not paused by the marked rows: it consumes the signal and proposes its question", c1);
  ok(x1.prepare("SELECT status FROM signals WHERE id = 'artifact_reentry:p1'").get().status === "consumed", "the signal is consumed");
  // the real backpressure still works: 31 unmarked rows pause it
  const x2 = fresh();
  put(x2, 31, "new", null, "auto-scan");
  put(x2, 24, "new", MARK);
  x2.prepare("INSERT INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at) VALUES ('artifact_reentry:p2', '2026-10-25T00:00:00Z', 'artifact_reentry', '10.9999/p2', 't', ?, 0.9, 'research', 'new', '2026-10-25T00:00:00Z')").run(JSON.stringify(SIGNAL_Q));
  const c2 = await runConsume({ QNFO_AUDIT: mk(x2) });
  ok(c2.paused === true && c2.consumed === 0, "31 unmarked rows still pause runConsume (the exclusion removes the marked rows only)", c2);
  // the other producers read the same count: ask gaps run, the notebook and think loop get past their backpressure check
  const x3 = fresh();
  put(x3, 24, "new", MARK);
  put(x3, 8, "new", null, "auto-scan");
  const e3 = { QNFO_AUDIT: mk(x3) };
  x3.prepare("INSERT INTO ask_events (id, ts, qhash, query, cached, uncovered, error) VALUES ('e1', datetime('now', '-1 hours'), 'h1', 'What is the measured energy per solution for quantum annealing benchmark variant 1 on number partitioning?', 0, 1, NULL)").run();
  const g3 = await runAskGap(e3);
  ok(g3.paused === undefined && g3.inserted === 1, "runAskGap is not paused by the marked rows", g3);
  let oc3 = null;
  try { oc3 = await runOwnerCorpus({ ...e3, VAULT: {} }, Date.now() + 60000); } catch (e) { oc3 = { threw_after_check: String(e && e.message || e) }; } // past the check it needs tables this fixture lacks: a throw is past it
  ok(oc3 && oc3.paused !== "proposal backpressure", "runOwnerCorpus is not paused by the marked rows", oc3);
  let tl3 = null;
  try { tl3 = await thinkLoop(e3); } catch (e) { tl3 = { threw_after_check: String(e && e.message || e) }; }
  ok(tl3 && tl3.skipped !== "backpressure", "thinkLoop is not skipped by the marked rows", tl3);
  const x4 = fresh();
  put(x4, 31, "new", null, "auto-scan");
  put(x4, 24, "new", MARK);
  let oc4 = null, tl4 = null;
  try { oc4 = await runOwnerCorpus({ QNFO_AUDIT: mk(x4), VAULT: {} }, Date.now() + 60000); } catch (e) { oc4 = { threw: String(e && e.message || e) }; }
  try { tl4 = await thinkLoop({ QNFO_AUDIT: mk(x4) }); } catch (e) { tl4 = { threw: String(e && e.message || e) }; }
  ok(oc4.paused === "proposal backpressure" && tl4.skipped === "backpressure", "31 unmarked rows still pause the notebook and the think loop", { oc4, tl4 });
  // all five counts go through the one clause: no count of idea_proposals by status is left in the worker
  ok((raw.match(/FROM idea_proposals WHERE " \+ PROPOSAL_PENDING_WHERE/g) || []).length === 5, "five counts use PROPOSAL_PENDING_WHERE (proposalRoom, runConsume, runOwnerCorpus, thinkLoop, runAskGap)", (raw.match(/FROM idea_proposals WHERE " \+ PROPOSAL_PENDING_WHERE/g) || []).length);
  ok(!/COUNT\(\*\)[^"]*FROM idea_proposals WHERE status IN \('new'/.test(raw), "no count of the pending proposals bypasses the clause");
  ok(/WHERE status='new' ORDER BY \(CASE WHEN rationale LIKE '\[scoring-error %' THEN 1 ELSE 0 END\) ASC/.test(raw), "triage's own selection of the marked rows is unchanged (they are still scored on their schedule)");
}
const vm2 = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(raw);
ok(vm2 && (+vm2[1] > 1 || (+vm2[1] === 1 && (+vm2[2] > 8 || (+vm2[2] === 8 && +vm2[3] >= 6)))), "VERSION is at least 1.8.6", vm2 && vm2[0]);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

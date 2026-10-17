// PROPOSAL-HEADROOM-1 (idea-hub 1.8.6, agent_issues 2489, pillar research). The batch producers fill the triage queue only up to
// PROPOSAL_FILL_TO (under the integration chain's limit of 30), counting what the same cycle already added; nothing is dropped.
// Runs the worker's own runAskGap and proposalRoom against an in-memory SQLite D1; source checks cover runConsume and runOwnerCorpus.
// Run: node idea-hub/proposal-headroom.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, "worker.js"), "utf8");
const src = raw.replace(/export default\s*\{/, "var __default = {");
const sb = { console: { log() {}, error() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response: class {}, Request: class {}, fetch: async () => { throw new Error("no network"); } };
vm.createContext(sb);
vm.runInContext(src + "\n__x = { runAskGap, proposalRoom, PROPOSAL_FILL_TO, PROPOSAL_BACKPRESSURE, ASK_GAP_BATCH };", sb);
const { runAskGap, proposalRoom, PROPOSAL_FILL_TO, PROPOSAL_BACKPRESSURE, ASK_GAP_BATCH } = sb.__x;
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
const corp = raw.slice(raw.indexOf("async function runOwnerCorpus(env) {"), raw.indexOf("async function runOwnerCorpus(env) {") + 3000);
ok(/var room = await proposalRoom\(env\);/.test(corp) && /if \(room < batch\) \{ batch = room; out\.capped = "room " \+ room; \}/.test(corp) && corp.indexOf("var room = await proposalRoom(env);") < corp.indexOf("FROM notes_intake"), "the notebook batch is capped by the room before notes are read");
const cyc = fnBody(raw, "ideationCycle");
ok(cyc.length > 400 && cyc.indexOf("runAskGap(env)") > 0 && cyc.indexOf("runOwnerCorpus(env)") > 0 && cyc.indexOf("triageProposals(env)") > 0, "the cycle body was read whole (every stage inside ideationCycle)", { len: cyc.length });
ok(cyc.indexOf("runConsume(env)") < cyc.indexOf("runOwnerCorpus(env)") && cyc.indexOf("runOwnerCorpus(env)") < cyc.indexOf("triageProposals(env)"), "the notebook reads the room after re-entry and ask gaps, before triage");
const vm2 = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(raw);
ok(vm2 && (+vm2[1] > 1 || (+vm2[1] === 1 && (+vm2[2] > 8 || (+vm2[2] === 8 && +vm2[3] >= 6)))), "VERSION is at least 1.8.6", vm2 && vm2[0]);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

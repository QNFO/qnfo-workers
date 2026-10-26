// PROBE-AUTHOR-BINDING-1 offline suite (qnfo-fleet-control, 2026-10-26, charter pillar autonomy). rtAuthorLivePathProbe (PROBE-AUTHOR-LIVEPATH-1) was written to author the probe of an
// orphan issue with one cheap Workers AI call, and it never ran: remediation.probe-authored has 0 events ever against 77 PROBE-NEEDED-1 filings in 7 days. Three independent defects, none
// reachable by an earlier test (no suite referenced the function):
//   1. it read the model from env["qnfo-ai"] || env.qnfo_ai, a binding this worker has never had (wrangler.toml declares [ai] binding AI), and returned false silently;
//   2. it read the reply only as body.response or body.result, while a chat model answers choices[0].message.content;
//   3. its decision_log insert used the columns (ts, decision, reason), which the table does not have (it requires ts, actor, assumption, action, evidence, outcome, blast_radius, rollback_path).
// Slices rtFlagOff, the reply reader, aiRunAttr and the probe-author block out of worker.js and runs them against an in-memory SQLite D1 and a fake env.AI.
// Output MUST contain "0 failed" on success.   node qnfo-fleet-control/probe-author.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const cut = (from, to, start = 0) => { const a = src.indexOf(from, start), b = src.indexOf(to, a + from.length); if (a < 0 || b < a) throw new Error("block not found in worker.js: " + from); return src.slice(a, b); };
const live = (name) => { const m = new RegExp("var " + name + " = ([^;]+);").exec(src); if (!m) throw new Error(name + " not found"); return m[0]; };
const code = [
  cut("async function rtFlagOff(db, key) {", "async function rtCloseEventSince"),
  live("RT_LIVEPATH_MAX_PER_DAY"),
  cut("var CM_REVIEW_EFFORT =", "// A removed long line directly followed by its replacement"),
  cut("async function aiRunAttr(", "// PROMPT-CACHE-COUNT-4: one ai_cache_counters increment") + cut("function aiCacheRow(", "\n}\n", src.indexOf("function aiCacheRow(")) + "\n}\n",
  cut("var RT_PROBE_AUTHOR_MAX_PER_TICK = 3;", "var rtLivePathRetryAt = 0;"),
].join("\n");
const cx = vm.createContext({ Date, Number, String, parseInt, Math, JSON, Object, Array, RegExp, isFinite, console: { error() {}, log() {} }, __name: (f) => f });
vm.runInContext(code + "\nthis.api = { rtAuthorLivePathProbe, setTick(k) { rtProbeAuthorTickKey = k; } };", cx);
const { rtAuthorLivePathProbe, setTick } = cx.api;

function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, status TEXT DEFAULT 'open', priority TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL DEFAULT '', verify_transport TEXT NOT NULL DEFAULT '', max_attempts INTEGER DEFAULT 3, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', last_verdict TEXT, attempts INTEGER DEFAULT 0, next_due_at TEXT, module TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE widgets (id INTEGER PRIMARY KEY, done INTEGER);
INSERT INTO widgets VALUES (1, 0), (2, 0), (3, 1);`);
  const stmt = (sql) => { let args = []; const self = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return self; };
  return { db, h: { prepare: stmt } };
}
const goodProbe = "SELECT 0 AS expected, COUNT(*) AS observed FROM widgets WHERE done = 0";           // 0 expected, 2 observed: not vacuous
const chat = (text) => ({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const orphan = (db, id = 4242) => { db.prepare("INSERT INTO agent_issues (id, title, status, priority) VALUES (?, 'ORPHAN-1: widgets are not done', 'open', 'medium')").run(id); return { id, title: "ORPHAN-1: widgets are not done" }; };
const events = (db, kind) => db.prepare("SELECT * FROM cloud_ops_events WHERE kind = ?").all(kind);

{ // the reply in the chat shape, through the binding this worker really has: the probe is authored, recorded and logged
  const { db, h } = mk(); const o = orphan(db); setTick(1);
  const calls = [];
  const env = { AI: { run: async (model, input) => { calls.push({ model, input }); return chat(goodProbe); } }, AUDIT: h };
  const done = await rtAuthorLivePathProbe(h, env, o);
  ok(done === true, "a probe is authored through env.AI with a chat-shaped reply", done);
  ok(calls.length === 1 && /glm/.test(calls[0].model), "the cheap model is asked once", calls.map((c) => c.model));
  const c = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-4242'").get();
  ok(c && c.status === "active" && c.module === "probe-author-1" && c.verify_probe === goodProbe, "the contract holds the authored probe, active, module probe-author-1", c);
  ok(events(db, "remediation.probe-authored").length === 1, "a remediation.probe-authored event is written");
  const d = db.prepare("SELECT * FROM decision_log").all();
  ok(d.length === 1 && /4242/.test(d[0].action) && /superseded/.test(d[0].rollback_path) && d[0].actor && d[0].evidence && d[0].outcome && d[0].blast_radius, "a decision_log row is written with the table's real columns", d);
}
{ // the reply in the legacy shape
  const { db, h } = mk(); const o = orphan(db); setTick(2);
  const env = { AI: { run: async () => ({ response: "```sql\n" + goodProbe + "\n```" }) }, AUDIT: h };
  ok((await rtAuthorLivePathProbe(h, env, o)) === true, "a legacy {response} reply is read too, fences stripped");
}
{ // the platform refuses reasoning_effort for the model: one plain retry
  const { db, h } = mk(); const o = orphan(db); setTick(3);
  const seen = [];
  const env = { AI: { run: async (m, input) => { seen.push(Object.keys(input)); if ("reasoning_effort" in input) throw new Error("unsupported parameter reasoning_effort"); return chat(goodProbe); } }, AUDIT: h };
  ok((await rtAuthorLivePathProbe(h, env, o)) === true && seen.length === 2 && !seen[1].includes("reasoning_effort"), "a refused reasoning_effort is retried plain", seen);
}
{ // the old assumption: a binding called qnfo-ai is not what this worker has, and is not consulted
  const { db, h } = mk(); const o = orphan(db); setTick(4);
  const env = { "qnfo-ai": { run: async () => chat(goodProbe) }, AUDIT: h };
  ok((await rtAuthorLivePathProbe(h, env, o)) === false, "a binding named qnfo-ai is not used");
  const ev = events(db, "remediation.probe-author-reject");
  ok(ev.length === 1 && /no-ai-binding/.test(ev[0].text), "a missing AI binding is recorded as an event, not silent", ev);
}
{ // rejections are recorded, once per issue per hour
  const { db, h } = mk(); const o = orphan(db); setTick(5);
  const vac = { AI: { run: async () => chat("SELECT 1 AS expected, 1 AS observed") }, AUDIT: h };
  ok((await rtAuthorLivePathProbe(h, vac, o)) === false, "a vacuous probe is rejected");
  setTick(6); await rtAuthorLivePathProbe(h, vac, o);
  const ev = events(db, "remediation.probe-author-reject");
  ok(ev.length === 1 && /vacuous/.test(ev[0].text), "the vacuous reject is one event for the hour", ev);
  const w = { AI: { run: async () => chat("WITH t AS (SELECT 1) DELETE FROM widgets") }, AUDIT: h };
  setTick(7); ok((await rtAuthorLivePathProbe(h, w, orphan(db, 4243))) === false, "a write statement is rejected");
  ok(events(db, "remediation.probe-author-reject").some((e) => /write keyword/.test(e.text)), "the static reject names its reason");
  const cl = db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n;
  ok(cl === 0, "no contract is written for a rejected probe", cl);
}
{ // an empty reply and a thrown error are recorded and leave the issue as it was
  const { db, h } = mk(); const o = orphan(db); setTick(8);
  ok((await rtAuthorLivePathProbe(h, { AI: { run: async () => chat("") }, AUDIT: h }, o)) === false, "an empty reply returns false");
  ok(events(db, "remediation.probe-author-reject").some((e) => /empty/.test(e.text)), "the empty reply is recorded");
  setTick(9); const o2 = orphan(db, 4244);
  ok((await rtAuthorLivePathProbe(h, { AI: { run: async () => { throw new Error("capacity"); } }, AUDIT: h }, o2)) === false, "a model error returns false");
  ok(events(db, "remediation.probe-author-reject").some((e) => /model-error/.test(e.text)), "the model error is recorded");
}
{ // the per-tick bound and the ops_config switch still hold
  const { db, h } = mk(); setTick(10);
  const env = { AI: { run: async () => chat(goodProbe) }, AUDIT: h };
  const r = []; for (const id of [5001, 5002, 5003, 5004]) r.push(await rtAuthorLivePathProbe(h, env, orphan(db, id)));
  ok(JSON.stringify(r) === "[true,true,true,false]", "three probes a tick, then the bound", r);
  setTick(11); db.prepare("INSERT INTO ops_config (key, value) VALUES ('rt_probe_author', 'off')").run();
  ok((await rtAuthorLivePathProbe(h, env, orphan(db, 5005))) === false, "ops_config rt_probe_author = off stops it");
}
ok(mirror === src, "the deployed-current mirror is identical to worker.js");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

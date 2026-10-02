// IPATENT-USAGE-1 offline suite (dashboard side): the ipatent command and patent questions read iPatent's counts.
// Run: node qnfo-fleet-dashboard/ipatent-usage.test.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });

const STATE = { schema_version: "fleet-state/v1", generated_at: new Date().toISOString(), version: "t", verdict: "HEALTHY", window: {}, fleet: { workers: 44 }, totals: {}, scheduled: [], audits: [], probes: [], integration: {}, report_card: {}, chains: [], device: {}, issues: [], issue_counts: { err: 0, warn: 0, total: 0 }, queues: [], coverage: {}, unattributed_errors: 0, recovered_workers: [], error_workers: [], loop: {}, meta: {}, refresh_ms: 1 };
const SECRET_DOC = "PRIVATE-IDENTITY-BODY-9d3f";
const LOOP = "loop-secret-123";

function mk(extra = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER);
  CREATE TABLE fleet_loop_meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
  CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, source TEXT, device TEXT, type TEXT, domain TEXT, priority TEXT, summary TEXT, due TEXT, status TEXT, wbs_code TEXT, created_at TEXT, processed_at TEXT, triage_decision TEXT);
  CREATE TABLE task_dod_register (id INTEGER PRIMARY KEY, title TEXT, dod TEXT, due TEXT, updated_at TEXT, owner TEXT, status TEXT);
  CREATE VIEW v_waiting_on_human AS SELECT id, title, dod, due, updated_at FROM task_dod_register WHERE owner IN ('user','mixed') AND status='open';
  CREATE TABLE gtd_register (id INTEGER PRIMARY KEY, line TEXT, dod TEXT, section TEXT, updated_at TEXT, owner TEXT, done INTEGER);
  CREATE TABLE fleet_issue_dispatch (fingerprint TEXT, category TEXT, owner TEXT, action TEXT, payload TEXT, gh_number INTEGER, exec_result TEXT, created_at TEXT, state TEXT, exec_state TEXT);
  CREATE TABLE code_tasks (id TEXT, goal TEXT, repo TEXT, last_error TEXT, pr_url TEXT, updated_at TEXT, status TEXT);
  CREATE TABLE shutdown_manifest (id INTEGER, phase INTEGER, component TEXT, condition TEXT, due_date TEXT, state TEXT);
  CREATE TABLE goals (id INTEGER PRIMARY KEY, goal_type TEXT, status TEXT, created_at TEXT, statement TEXT, alignment TEXT, updated_at TEXT);
  CREATE TABLE emails (id INTEGER, sender TEXT, subject TEXT, received_at TEXT, status TEXT);
  CREATE VIEW v_email_human_pending_v2 AS SELECT sender, subject, received_at FROM emails;
  CREATE TABLE invest_facts (key TEXT PRIMARY KEY, value TEXT, evidence TEXT, updated_at TEXT);
  CREATE TABLE owner_docs (key TEXT PRIMARY KEY, title TEXT NOT NULL, body_md TEXT NOT NULL, source TEXT, visibility TEXT NOT NULL DEFAULT 'private', updated_at TEXT);
  CREATE TABLE portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT, kind TEXT, session TEXT, summary TEXT, scorecard_json TEXT, actions_json TEXT, needs_owner TEXT, created_at TEXT);
  CREATE TABLE sai_config (k TEXT PRIMARY KEY, v REAL, source TEXT, updated_at TEXT);
  CREATE TABLE objectives (id INTEGER PRIMARY KEY AUTOINCREMENT, objective_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, source TEXT, ratified_by TEXT, ratified_on TEXT, version INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE');
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);`);
  db.prepare("INSERT INTO fleet_dashboard_state VALUES (1,?,?,1)").run(new Date().toISOString(), JSON.stringify(STATE));
  db.prepare("INSERT INTO human_actions (slug,title,why,action,due,source) VALUES ('orcid-link-works','Add the selected works to ORCID','why','act','','owner-only:x')").run();
  db.prepare("INSERT INTO goals (id,goal_type,status,created_at,statement,alignment) VALUES (7,'objective-revision','proposed','2026-09-20T02:00:00Z','Increase the weight of external_impact from 0.10 to 0.15','rationale')").run();
  db.prepare("INSERT INTO owner_docs (key,title,body_md,visibility,updated_at) VALUES ('identity','Identity',?, 'private','2026-10-01 10:00:00')").run(SECRET_DOC);
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const calls = [];
  const svc = extra.svc || (async (u, o) => { calls.push(JSON.parse(o.body)); return new Response(JSON.stringify({ choices: [{ message: { content: "Spend is within the data on this page." } }] }), { status: 200 }); });
  const env = Object.assign({ AUDIT: { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } }, LOOP_TOKEN: LOOP, SVC_QNFO_AI: { fetch: svc } }, extra.env || {});
  return { env, db, calls };
}
const ctx = { waitUntil(p) { if (p && p.catch) p.catch(() => {}); }, passThroughOnException() {} };
const O = "https://fleet.qnfo.org";
const call = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctx);
const post = (env, path, body, headers) => call(env, path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "x-fleet-ui": "1" }, headers || {}), body: JSON.stringify(body) });
const ask = (env, text, ip) => post(env, "/api/owner/prompt", { text, mode: "ask" }, ip ? { "CF-Connecting-IP": ip } : {});

// waitUntil work is collected so a test can await the background answer.
const pending = [];
const ctxW = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
const callW = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctxW);
const postW = (env, path, body, headers) => callW(env, path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "x-fleet-ui": "1" }, headers || {}), body: JSON.stringify(body) });
const cmd = (env, text, headers, from) => postW(env, "/api/cmd", { text, from: from || "" }, headers);
const flush = async () => { while (pending.length) await pending.shift(); };
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const METRICS = { ok: true, worker: "qnfo-ipatent", version: "3.8.1-usage-topics", windows: { "7d": { views_human: 22, views_search: 5, views_qnfo: 9, views_referral: 3, views_direct: 5, views_crawler: 40, drafts: 4, drafts_saved: 1, drafters: 3, usage: { searches: 6, drafts: 4, searches_by_topic: { "Quantum Computing & Information": 4, Other: 2 }, drafts_by_topic: { Other: 3, "Topological Computation": 1 } } }, "30d": { views_human: 80, views_search: 20, views_qnfo: 30, views_referral: 10, views_direct: 20, views_crawler: 150, drafts: 12, drafts_saved: 2, drafters: 9, usage: { searches: 6, drafts: 4, searches_by_topic: {}, drafts_by_topic: {} } } } };
const ipCalls = [];
const IP = { fetch: async (req) => { ipCalls.push(req.url); return new Response(JSON.stringify(METRICS), { status: 200 }); } };
// I1: the ipatent command answers from iPatent's counts, instantly, without a model
{
  const { env, calls } = mk({ env: { SVC_QNFO_IPATENT: IP } });
  const j = await (await cmd(env, "ipatent queries?")).json();
  ok(j.ok && /searches 6 by topic: Quantum Computing & Information 4, Other 2/.test(j.text) && /keeps no search or draft text/.test(j.text) && /drafts 4 \(1 saved/.test(j.text), "I1 'ipatent queries' answers with counts by topic and says no text is kept", j.text);
  ok(calls.length === 0 && ipCalls[0] === "https://ipatent.qnfo.org/api/metrics", "I2 no model call; read over the service binding", { calls: calls.length, ipCalls });
  const h = await (await cmd(env, "help")).json();
  ok(/ipatent\s+iPatent views, searches and drafts/.test(h.text), "I3 help lists the command");
}
// I4: the plain-English question "What are recent ipatent web queries?" now answers with the live counts
{
  const { env, calls } = mk({ env: { SVC_QNFO_IPATENT: IP } });
  const r = await (await cmd(env, "What are recent ipatent web queries?", { "CF-Connecting-IP": "203.0.113.20" })).json();
  await flush();
  ok(r.ok && /counts each search and each draft per day by broad topic only/.test(r.text) && /searches 6 by topic: Quantum Computing & Information 4/.test(r.text) && !/task count ipatent/.test(r.text), "I4 the ipatent queries question answers with live topic counts and no stale 'not recorded' advice", r.text);
  ok(calls.length === 0, "I5 answered without a model call", calls.length);
}
// I6: iPatent unreachable -> an honest sentence, never a crash
{
  const { env } = mk({ env: { SVC_QNFO_IPATENT: { fetch: async () => new Response("x", { status: 503 }) } } });
  const j = await (await cmd(env, "ipatent")).json();
  ok(j.ok && /could not be read just now \(iPatent metrics HTTP 503\)/.test(j.text), "I6 an unreachable iPatent is reported plainly", j.text);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

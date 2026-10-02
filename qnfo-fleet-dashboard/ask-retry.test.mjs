// ASK-RETRY-1 offline suite: asks abandoned by a stopped worker are answered again by the cron (bounded), the fastest
// model is asked first, and the owner's history includes command-line asks.
// Run: node qnfo-fleet-dashboard/ask-retry.test.mjs
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const tmpd = mkdtempSync(join(tmpdir(), "askretry-"));
writeFileSync(join(tmpd, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8") + "\nexport { askRetry as __askRetry, cmdSweep as __cmdSweep, ownerPromptsView as __view, ASK_MODELS as __models };\n");
const W = await import(pathToFileURL(join(tmpd, "w.mjs")).href);
const worker = W.default;
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

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const ANS = '{"answer":"Here is the answer.","actions":[{"op":"refresh"}]}';
function seed(db) {
  db.exec("CREATE TABLE IF NOT EXISTS owner_prompts (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), mode TEXT, prompt TEXT, status TEXT, response TEXT, model TEXT, intent_id TEXT, error TEXT, visitor TEXT, issue_id INTEGER)");
  const ab = "abandoned: the worker stopped before answering";
  const ins = db.prepare("INSERT INTO owner_prompts (id, ts, mode, prompt, status, error) VALUES (?, ?, 'ask', ?, ?, ?)");
  ins.run("op-a", "2026-10-02 05:25:44", "Fix all the issues automatically", "failed", ab);
  ins.run("op-b", "2026-10-02 02:48:07", "What are recent ipatent web queries?", "failed", ab);
  ins.run("op-c", "2026-10-02 02:47:52", "What are recent ipatent web queries?", "failed", ab);
  ins.run("op-d", "2026-10-02 01:00:00", "older abandoned", "failed", ab);
  ins.run("op-e", "2026-10-02 01:00:00", "a different failure", "failed", "The assistant could not answer just now");
  ins.run("op-f", "2026-10-02 07:00:00", "answered one", "answered", null);
}
// R1-R3: abandoned asks are answered again, newest first, 3 per run, never the non-abandoned failures
{
  const { env, db, calls } = mk({ svc: async (u, o) => { calls.push(JSON.parse(o.body)); return new Response(JSON.stringify({ choices: [{ message: { content: ANS } }] }), { status: 200 }); } });
  seed(db);
  const r = await W.__askRetry(env);
  const row = (id) => db.prepare("SELECT status, response, model, error, retries FROM owner_prompts WHERE id = ?").get(id);
  ok(r.retried.length === 3 && ["op-a", "op-b", "op-c"].every((id) => row(id).status === "answered"), "R1 the three abandoned asks are answered again, newest first", r);
  ok(row("op-a").response.indexOf("Here is the answer.") === 0 && /Proposed actions .*Refresh fleet state/.test(row("op-a").response) && row("op-a").model === "glm-5.2 (retried)" && row("op-a").error === null, "R2 the row shows the answer, the proposed actions and the retried model", row("op-a"));
  ok(row("op-d").status === "failed" && row("op-e").status === "failed" && row("op-f").status === "answered", "R3 at most 3 per run; a non-abandoned failure and an answered row are left alone", [row("op-d"), row("op-e")]);
  ok(calls[0].model === "glm-5.2", "R4 the fastest model is asked first", calls[0].model);
  await W.__askRetry(env);
  ok(row("op-d").status === "answered", "R5 the next run takes the rest");
}
// R6: retries are capped; a model outage leaves an honest fallback, never another 'abandoned'
{
  const { env, db } = mk({ svc: async () => new Response(JSON.stringify({ error: "down" }), { status: 503 }) });
  seed(db);
  db.exec("UPDATE owner_prompts SET status='answered' WHERE id IN ('op-b','op-c','op-d')");
  await W.__askRetry(env);
  const a = db.prepare("SELECT status, error, retries FROM owner_prompts WHERE id='op-a'").get();
  ok(a.status === "fallback" && /^retried:/.test(a.error) && a.retries === 1, "R6 a failed retry ends as an honest fallback, not abandoned", a);
  db.exec("UPDATE owner_prompts SET status='failed', error='abandoned: x', retries=2 WHERE id='op-a'");
  const r = await W.__askRetry(env);
  ok(r.retried.length === 0, "R7 a row is retried at most twice", r);
}
// R8: command-line asks: a stale 'running' row is swept and then answered; R9 the owner's history shows them
{
  const { env, db } = mk({ svc: async () => new Response(JSON.stringify({ choices: [{ message: { content: ANS } }] }), { status: 200 }) });
  seed(db);
  db.exec("UPDATE owner_prompts SET status='answered' WHERE status='failed'");
  await W.__cmdSweep(env);
  db.prepare("INSERT INTO cmd_log (id, ts, text, kind, status, owner) VALUES ('cmd-aaaaaaaaaaaaaaaaaaaa', datetime('now','-10 minutes'), 'is anything on fire?', 'ai', 'running', 1)").run();
  await W.__cmdSweep(env);
  ok(db.prepare("SELECT status FROM cmd_log WHERE id='cmd-aaaaaaaaaaaaaaaaaaaa'").get().status === "failed", "R8a the stale ask is swept as abandoned");
  await W.__askRetry(env);
  const c = db.prepare("SELECT status, answer, actions_json, model FROM cmd_log WHERE id='cmd-aaaaaaaaaaaaaaaaaaaa'").get();
  ok(c.status === "answered" && c.answer === "Here is the answer." && JSON.parse(c.actions_json)[0].op === "refresh" && /\(retried\)/.test(c.model), "R8b then answered again with its proposed actions", c);
  const v = await W.__view(env);
  ok(v.some((x) => x.prompt === "is anything on fire?" && x.status === "answered") && v.length <= 8, "R9 the owner's history includes command-line asks", v.map((x) => x.prompt));
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

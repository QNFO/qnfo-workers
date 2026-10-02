// OPEN-ACCESS-1 offline suite (owner directive 2026-10-01: favor free, open access; no owner token).
// Drives the real worker's fetch handler against in-memory SQLite D1. Proves: the page and every JSON read are open to
// everyone with no token and no login (also when an owner key happens to be configured); no card asks anyone for a
// token; "Ask now" is open to everyone and capped per anonymous visitor and globally; the controls that change the fleet
// (done/snooze/notes, Queue as task, ratify/reject) are refused for the public and write nothing; a LOOP_TOKEN holder can
// still use them; private owner documents stay private; a visitor's question is never shown to other visitors.
// Run: node qnfo-fleet-dashboard/open-access.test.mjs   -> prints "N passed, 0 failed"
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

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// A. open page and JSON, no owner key configured
{
  const { env } = mk();
  let r = await call(env, "/"); let h = await r.text();
  ok(r.status === 200, "A1 page opens with no token");
  ok(h.includes("Add the selected works to ORCID"), "A2 the queue is shown to everyone");
  ok(!/OWNER_TOKEN|owner key|Sign in|sign out/i.test(h), "A3 nothing asks anyone for a token or a sign-in");
  ok(!h.includes('data-act="done"') && !h.includes("Queue as task") && !h.includes('data-act="ratify"'), "A4 no fleet-changing controls on the public page");
  ok(h.includes('id="ctext"') && h.includes("Ask or tell the fleet") && h.includes("open to everyone"), "A5 the command line is on the page for everyone");
  r = await call(env, "/?frag=1"); ok(r.status === 200, "A6 the live fragment opens too");
  let j = await (await call(env, "/api/human")).json();
  ok(Array.isArray(j.items) && j.items.length > 0 && !j.locked && !j.responses, "A7 /api/human is full and open (owner's own responses stay with token holders)");
  j = await (await call(env, "/api/decision")).json();
  ok(j.verdict && Array.isArray(j.reasons) && j.headline && !j.locked, "A8 /api/decision is full and open");
}
// B. an owner key configured elsewhere must not close the page
{
  const { env } = mk({ env: { OWNER_TOKEN: "k".repeat(32) } });
  const r = await call(env, "/"); const h = await r.text();
  ok(r.status === 200 && h.includes("Add the selected works to ORCID") && !/Owner key|locked/i.test(h), "B1 the page stays open even if an owner key is configured");
  const j = await (await call(env, "/api/human")).json();
  ok(Array.isArray(j.items) && !j.locked, "B2 /api/human stays open");
  const j2 = await (await call(env, "/api/decision")).json();
  ok(j2.verdict && Array.isArray(j2.reasons) && j2.headline && !j2.locked, "B3 /api/decision stays open");
}
// C. the public cannot change the fleet
{
  const { env, db } = mk();
  let r = await post(env, "/api/owner/respond", { key: "ha:orcid-link-works", kind: "done" });
  ok(r.status === 403, "C1 done is refused for the public (" + r.status + ")");
  ok(db.prepare("SELECT status FROM human_actions WHERE slug='orcid-link-works'").get().status === "open", "C2 the queue item is untouched");
  r = await post(env, "/api/owner/respond", { key: "ha:orcid-link-works", kind: "note", note: "do something" });
  ok(r.status === 403 && !(db.prepare("SELECT name FROM sqlite_master WHERE name='agent_issues'").get() && db.prepare("SELECT COUNT(*) n FROM agent_issues").get().n), "C3 a public note files no fleet work");
  r = await post(env, "/api/owner/objective", { id: 7, decision: "ratify" });
  ok(r.status === 403 && db.prepare("SELECT status FROM goals WHERE id=7").get().status === "proposed", "C4 a public ratify changes nothing");
  r = await post(env, "/api/owner/prompt", { text: "code-task: repo=QNFO/qnfo-workers path=CLAUDE.md", mode: "task" });
  ok(r.status === 403 && db.prepare("SELECT COUNT(*) n FROM intents").get().n === 0, "C5 a public Queue as task writes no intent");
  r = await call(env, "/api/owner/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "hello there", mode: "ask" }) });
  ok(r.status === 400, "C6 a write without the x-fleet-ui header is refused");
  r = await call(env, "/api/owner/prompts"); ok(r.status === 403, "C7 the prompt log is not public");
  r = await post(env, "/api/owner/login", { token: "x" }); ok(r.status === 404, "C8 there is no login endpoint while no owner key is configured");
  r = await post(env, "/api/owner/respond", { key: "ha:orcid-link-works", kind: "done" }, { "x-loop-token": "wrong" });
  ok(r.status === 403, "C9 a wrong token is refused");
  const owned = await (await call(env, "/owner/doc/identity")).text();
  ok(!owned.includes(SECRET_DOC), "C10 private owner documents stay private");
}
// D. Ask now is open, grounded, capped
{
  const { env, db, calls } = mk();
  let r = await ask(env, "How much did we spend against the cap?", "203.0.113.9");
  let j = await r.json();
  ok(r.status === 200 && j.ok && j.status === "answered" && j.answer === "Spend is within the data on this page.", "D1 an anonymous question is answered");
  ok(calls.length === 1 && /CONTEXT/.test(calls[0].messages[0].content) && !calls[0].messages[0].content.includes(LOOP) && calls[0].max_tokens <= 700, "D2 it is grounded in page data, bounded, and carries no secret");
  const row = db.prepare("SELECT visitor, prompt, mode FROM owner_prompts").get();
  ok(row && /^[0-9a-f]{16}$/.test(row.visitor) && !JSON.stringify(row).includes("203.0.113.9") && row.mode === "ask", "D3 only an anonymous hash is kept, never the IP");
  let h = await (await call(env, "/")).text();
  ok(!h.includes("How much did we spend"), "D4 a visitor's question is not shown to other visitors");
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await ask(env, "question number " + i, "203.0.113.9")).status);
  ok(codes.slice(0, 4).every((c) => c === 200) && codes[4] === 429, "D5 one visitor gets " + 5 + " questions a day (" + codes.join(",") + ")");
  r = await ask(env, "a different visitor asks", "198.51.100.7");
  ok(r.status === 200, "D6 another visitor is not affected");
  r = await ask(env, "hi", "198.51.100.8"); ok(r.status === 400, "D7 too-short text is refused");
}
{
  const { env } = mk({ env: { OWNER_PROMPTS_DAILY_CAP: "3" } });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await ask(env, "global cap question " + i, "192.0.2." + i)).status);
  ok(codes.slice(0, 3).every((c) => c === 200) && codes[3] === 429, "D8 a global daily cap protects the budget (" + codes.join(",") + ")");
}
{
  const { env, db } = mk({ svc: async () => new Response(JSON.stringify({ error: "model exploded: internal detail" }), { status: 500 }) });
  const r = await ask(env, "does this fail safely?", "203.0.113.50"); const j = await r.json();
  ok(!j.ok && j.status === "failed" && !JSON.stringify(j).includes("exploded") && db.prepare("SELECT status FROM owner_prompts").get().status === "failed", "D9 a model failure is reported plainly without internals");
}
// E. a LOOP_TOKEN holder (the fleet's own sessions and scripts) can still change the fleet
{
  const { env, db } = mk();
  const T = { "x-loop-token": LOOP };
  let r = await post(env, "/api/owner/respond", { key: "ha:orcid-link-works", kind: "done" }, T);
  ok(r.status === 200 && db.prepare("SELECT status FROM human_actions WHERE slug='orcid-link-works'").get().status === "resolved", "E1 a token holder can mark a queue item done");
  r = await post(env, "/api/owner/prompt", { text: "Draft the funder shortlist", mode: "task" }, T);
  ok(r.status === 200 && db.prepare("SELECT COUNT(*) n FROM intents").get().n === 1, "E2 a token holder can queue a task");
  const j = await (await call(env, "/api/human", { headers: T })).json();
  ok(Array.isArray(j.responses) && j.responses.length === 1, "E3 a token holder also sees the owner's own responses");
  r = await call(env, "/api/owner/prompts", { headers: T }); ok(r.status === 200, "E4 a token holder can read the prompt log");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

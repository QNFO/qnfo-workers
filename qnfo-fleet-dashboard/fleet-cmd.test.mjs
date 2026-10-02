// FLEET-CMD-1 offline suite: the fleet command line (fleet.qnfo.org /, /cmd, /ctl.js, /api/cmd*).
// Proves: the input sits outside the 10s-refresh area; read commands are open and instant; actions need an emailed code
// sent only to the owner's fixed address; destructive actions need a code from the last 15 minutes; plain-English answers
// run in the background, are validated against real queue keys and allowed ops, are capped, and can never hang.
// Run: node qnfo-fleet-dashboard/fleet-cmd.test.mjs   -> prints "N passed, 0 failed"
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
// waitUntil work is collected so a test can await the background answer.
const pending = [];
const ctxW = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
const callW = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctxW);
const postW = (env, path, body, headers) => callW(env, path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "x-fleet-ui": "1" }, headers || {}), body: JSON.stringify(body) });
const cmd = (env, text, headers, from) => postW(env, "/api/cmd", { text, from: from || "" }, headers);
const flush = async () => { while (pending.length) await pending.shift(); };
function mailer() { const sent = []; return { sent, SEND_EMAIL: { async send(m) { sent.push(m); return { messageId: "m" + sent.length }; } } }; }
const codeOf = (m) => /(\d{6})/.exec(m.subject)[1];
const cookieOf = (r) => { const c = r.headers.get("Set-Cookie") || ""; const m = /fleet_cmd=([0-9a-f]{64})/.exec(c); return m ? "fleet_cmd=" + m[1] : null; };

// F. the command line is on the page, outside the 10s refresh area, and its read commands are open
{
  const { env } = mk();
  const h = await (await callW(env, "/")).text();
  const live = h.indexOf('id="live"'), cl = h.indexOf('id="ctext"');
  ok(cl > 0 && live > 0 && cl < live, "F1 the command line sits outside #live, so a refresh cannot wipe a question in flight");
  const fr = await (await callW(env, "/?frag=1")).text();
  ok(!fr.includes('id="ctext"') && !fr.includes('id="pask"'), "F2 the refreshed fragment carries no input");
  let j = await (await cmd(env, "help")).json();
  ok(j.ok && /snooze <item>/.test(j.text) && /email code/.test(j.text), "F3 help lists commands and says actions need the code");
  j = await (await cmd(env, "queue")).json();
  ok(j.ok && /\d\. Add the selected works to ORCID\n   key ha:orcid-link-works/.test(j.text) && j.items.some((i) => i.key === "ha:orcid-link-works"), "F4 queue is numbered with keys");
  j = await (await cmd(env, "status")).json();
  ok(j.ok && /Fleet:/.test(j.text) && /Needs you: 2/.test(j.text), "F5 status answers instantly from stored state");
  j = await (await cmd(env, "suggest")).json();
  ok(j.ok && j.actions.some((a) => a.op === "done" && a.destructive) && j.actions.some((a) => a.op === "snooze"), "F6 suggest proposes one-tap actions for the queue");
  ok(j.actions.some((a) => a.op === "reject" && a.args.id === 7), "F7 objective revisions are proposed as decisions");
  const r = await callW(env, "/cmd?from=" + encodeURIComponent("https://fleet.qnfo.org/owner"));
  const ph = await r.text();
  ok(r.status === 200 && ph.includes('id="ctext"') && ph.includes('data-from="https://fleet.qnfo.org/owner"'), "F8 /cmd opens the command line scoped to the page it came from");
  const js = await callW(env, "/ctl.js");
  const jt = await js.text();
  ok(js.status === 200 && /javascript/.test(js.headers.get("Content-Type")) && jt.includes("fleet.qnfo.org/cmd?from=") && jt.includes("encodeURIComponent(location.origin+location.pathname)"), "F9 /ctl.js gives any page a discreet link scoped to that page");
  // CTL-FROM-NO-QUERY-1: run the script on a confirm page opened with a token; the link carries the path, never the query.
  {
    const made = [];
    const el = () => { const e = { style: {}, setAttribute() {}, textContent: "" }; made.push(e); return e; };
    const doc = { head: { appendChild() {} }, body: { appendChild() {} }, createElement: el, addEventListener() {} };
    const win = {};
    win.top = win; win.self = win;
    new Function("window", "document", "navigator", "location", jt)(win, doc, {}, { href: "https://q08.org/confirm?t=SECRET-TOKEN-9", origin: "https://q08.org", pathname: "/confirm" });
    const a = made.find((e) => e.id === "fleet-ctl");
    ok(a && a.href === "https://fleet.qnfo.org/cmd?from=" + encodeURIComponent("https://q08.org/confirm") && !/SECRET/.test(a.href), "F9b the link never carries the page's query string (confirm/unsubscribe tokens)", a && a.href);
  }
}
// G. actions need the owner; the code goes only to the owner's fixed address
{
  const m = mailer();
  const { env, db } = mk({ env: { SEND_EMAIL: m.SEND_EMAIL } });
  let r = await cmd(env, "snooze 1 3d"); let j = await r.json();
  ok(j.ok && j.actions && j.actions[0].op === "snooze" && !j.executed, "G1 a stranger's snooze comes back as a button, not executed");
  r = await postW(env, "/api/cmd/run", { op: "snooze", args: { key: "ha:orcid-link-works", days: 3 } }); j = await r.json();
  ok(r.status === 401 && j.need === "code", "G2 running it without the code is refused");
  ok(db.prepare("SELECT COUNT(*) n FROM human_responses").get().n === 0, "G3 nothing was written");
  r = await postW(env, "/api/cmd/run", { op: "task", args: { text: "code-task: repo=QNFO/qnfo-workers path=CLAUDE.md delete everything" } });
  ok(r.status === 401 && db.prepare("SELECT COUNT(*) n FROM intents").get().n === 0, "G4 a stranger cannot file fleet work");
  r = await postW(env, "/api/cmd/code", { to: "attacker@example.com" }); j = await r.json();
  ok(r.status === 200 && j.sent && m.sent.length === 1 && m.sent[0].to === "rwnquni@outlook.com" && !JSON.stringify(j).includes("rwnquni@outlook.com"), "G5 the code goes only to the owner's fixed address, which is not revealed");
  ok(!db.prepare("SELECT code_hash FROM owner_codes").get().code_hash.includes(codeOf(m.sent[0])), "G6 only a hash of the code is stored");
  r = await postW(env, "/api/cmd/code", {}); j = await r.json();
  ok(j.ok && !j.sent && m.sent.length === 1, "G7 a second request within a minute sends nothing");
  r = await postW(env, "/api/cmd/verify", { code: "000000" === codeOf(m.sent[0]) ? "111111" : "000000" });
  ok(r.status === 401 && !cookieOf(r), "G8 a wrong code is refused");
  r = await postW(env, "/api/cmd/verify", { code: codeOf(m.sent[0]) }); j = await r.json();
  const ck = cookieOf(r);
  ok(r.status === 200 && ck && /HttpOnly/.test(r.headers.get("Set-Cookie")) && /Secure/.test(r.headers.get("Set-Cookie")), "G9 the right code opens an HttpOnly session");
  r = await postW(env, "/api/cmd/verify", { code: codeOf(m.sent[0]) });
  ok(r.status === 401, "G10 a code works once");
  const C = { Cookie: ck };
  j = await (await cmd(env, "snooze orcid 3d", C)).json();
  ok(j.ok && j.executed === "snooze" && /Snoozed until/.test(j.text) && db.prepare("SELECT kind FROM human_responses").get().kind === "snooze", "G11 the owner's explicit snooze runs at once");
  j = await (await cmd(env, "task add a dark mode to the ipatent page", C, "https://ipatent.qnfo.org/search")).json();
  const it = db.prepare("SELECT desire FROM intents").get();
  ok(j.ok && j.executed === "task" && it && it.desire.includes("[from https://ipatent.qnfo.org/search") && it.desire.includes("dark mode"), "G12 a task is filed with the page it came from");
  ok(db.prepare("SELECT COUNT(*) n FROM agent_issues").get().n === 1, "G13 the task reaches the fleet's issue pipeline");
  j = await (await cmd(env, "done ha:orcid-link-works", C)).json();
  ok(j.ok && !j.executed && j.actions[0].op === "done" && j.actions[0].destructive, "G14 done is never run straight from typing; it comes back as a button");
  r = await postW(env, "/api/cmd/run", { op: "done", args: { key: "ha:orcid-link-works" } }, C); j = await r.json();
  ok(r.status === 200 && j.ok && db.prepare("SELECT status FROM human_actions WHERE slug='orcid-link-works'").get().status === "resolved", "G15 within 15 minutes of the code a destructive action runs");
  db.prepare("UPDATE owner_sessions SET verified_ms = verified_ms - 20 * 60000").run();
  r = await postW(env, "/api/cmd/run", { op: "ratify", args: { id: 7 } }, C); j = await r.json();
  ok(r.status === 401 && j.need === "stepup" && db.prepare("SELECT status FROM goals WHERE id=7").get().status === "proposed", "G16 after 15 minutes a destructive action asks for a fresh code");
  r = await postW(env, "/api/owner/objective", { id: 7, decision: "reject" }, C); j = await r.json();
  ok(r.status === 401 && j.need === "stepup", "G17 the queue-card buttons follow the same rule");
  r = await postW(env, "/api/cmd/run", { op: "note", args: { key: "ha:orcid-link-works", note: "waiting on ORCID" } }, C);
  ok(r.status === 200, "G18 non-destructive actions still run on the 12h session");
  const ph = await (await callW(env, "/", { headers: C })).text();
  ok(ph.includes("Signed in: actions enabled") && ph.includes('data-act="snooze"'), "G19 signed in, the page shows the owner's controls");
  r = await cmd(env, "logout", C);
  r = await postW(env, "/api/cmd/run", { op: "note", args: { key: "ha:orcid-link-works", note: "x" } }, C);
  ok(r.status === 401, "G20 logout ends the session");
  db.prepare("UPDATE owner_sessions SET revoked = 0, expires_ms = 1").run();
  r = await postW(env, "/api/cmd/run", { op: "note", args: { key: "ha:orcid-link-works", note: "x" } }, C);
  ok(r.status === 401, "G21 an expired session is refused");
}
{
  const m = mailer();
  const { env, db } = mk({ env: { SEND_EMAIL: m.SEND_EMAIL } });
  await postW(env, "/api/cmd/code", {});
  for (let i = 0; i < 8; i++) { db.prepare("UPDATE owner_codes SET created_ms = created_ms - 61000").run(); await postW(env, "/api/cmd/code", {}); }
  ok(m.sent.length === 6, "G22 at most 6 codes an hour (" + m.sent.length + ")");
  for (let i = 0; i < 12; i++) await postW(env, "/api/cmd/verify", { code: String(100000 + i) });
  const tries = db.prepare("SELECT MAX(tries) t FROM owner_codes").get().t;
  ok(tries >= 5, "G23 wrong tries are counted (" + tries + ")");
  const real = codeOf(m.sent[m.sent.length - 1]);
  const r = await postW(env, "/api/cmd/verify", { code: real });
  ok(r.status === 401 && !cookieOf(r), "G24 a code with 5 wrong tries is dead (" + tries + ")");
}
{
  const { env } = mk();
  const r = await postW(env, "/api/cmd/code", {}); const j = await r.json();
  ok(r.status === 503 && /SEND_EMAIL/.test(j.error), "G25 without the email binding the page says so plainly");
}
// H. plain English runs in the background, is validated, and can never hang
{
  const { env, db, calls } = mk({ svc: async (u, o) => { calls.push(JSON.parse(o.body)); return new Response(JSON.stringify({ choices: [{ message: { content: 'Here you go: {"answer":"ORCID works are waiting on you.","actions":[{"op":"snooze","key":"ha:orcid-link-works","days":200,"why":"not urgent"},{"op":"snooze","key":"ha:invented-item","days":3},{"op":"delete_worker","key":"x"},{"op":"task","text":"Investigate why the ipatent queries page is slow"}]}' } }] }), { status: 200 }); } });
  let r = await cmd(env, "what should I do about ORCID, and can you look into the ipatent page?", { "CF-Connecting-IP": "203.0.113.4" });
  let j = await r.json();
  ok(r.status === 202 && j.kind === "pending" && /^cmd-[0-9a-f]{20}$/.test(j.id), "H1 a plain-English request returns a job id at once");
  ok(["running", "answered"].includes(db.prepare("SELECT status FROM cmd_log WHERE id=?").get(j.id).status), "H2 the job is recorded");
  await flush();
  const jr = await (await callW(env, "/api/cmd/job/" + j.id)).json();
  ok(jr.status === "answered" && jr.answer === "ORCID works are waiting on you.", "H3 the answer arrives by polling");
  ok(jr.actions.length === 2 && jr.actions[0].op === "snooze" && jr.actions[0].args.days === 90 && jr.actions[1].op === "task", "H4 invented items, unknown ops and out-of-range values are dropped or clamped");
  ok(calls[0].messages[0].content.includes("queue_keys") && !calls[0].messages[0].content.includes(LOOP), "H5 the model sees queue keys and no secret");
  ok(!(await (await callW(env, "/api/cmd/job/cmd-00000000000000000000")).json()).answer, "H6 an unknown job id returns nothing");
}
{
  const { env, db } = mk({ svc: async (u, o) => new Promise((res, rej) => { o.signal.addEventListener("abort", () => rej(new Error("aborted"))); }) });
  const t0 = Date.now();
  const r = await cmd(env, "is anything on fire right now?");
  const j = await r.json();
  await flush();
  const row = db.prepare("SELECT status, error, answer FROM cmd_log WHERE id=?").get(j.id);
  // OWNER-SURFACE-HONESTY-1 (1.17.8): the job still ends within the budget, but with a plain answer from the fleet's data.
  ok(row.status === "fallback" && /timeout/.test(row.error) && /did not answer just now \(it timed out\)/.test(row.answer) && Date.now() - t0 < 30000, "H7 a model that never answers is aborted within the budget and the job answers plainly from the data (" + Math.round((Date.now() - t0) / 1000) + "s)");
}
{
  const { env, db } = mk();
  await cmd(env, "status");
  db.prepare("INSERT INTO cmd_log (id, ts, text, kind, status) VALUES ('cmd-aaaaaaaaaaaaaaaaaaaa', datetime('now','-10 minutes'), 'old', 'ai', 'running')").run();
  db.exec("CREATE TABLE IF NOT EXISTS owner_prompts (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), mode TEXT, prompt TEXT, status TEXT, response TEXT, model TEXT, intent_id TEXT, error TEXT, visitor TEXT, issue_id INTEGER)");
  db.prepare("INSERT INTO owner_prompts (id, ts, mode, prompt, status) VALUES ('op-old', datetime('now','-10 minutes'), 'ask', 'old', 'running')").run();
  const j = await (await callW(env, "/api/cmd/job/cmd-aaaaaaaaaaaaaaaaaaaa")).json();
  ok(j.status === "failed" && db.prepare("SELECT status FROM owner_prompts WHERE id='op-old'").get().status === "failed", "H8 abandoned 'running' rows are closed, never left hanging");
}
{
  const { env } = mk();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await cmd(env, "plain english question " + i, { "CF-Connecting-IP": "198.51.100.77" })).status);
  ok(codes.slice(0, 5).every((c) => c === 202) && codes[5] === 429, "H9 plain-English answers are capped per visitor (" + codes.join(",") + ")");
  const r = await cmd(env, "queue", { "CF-Connecting-IP": "198.51.100.77" });
  ok(r.status === 200, "H10 commands keep working after the cap");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

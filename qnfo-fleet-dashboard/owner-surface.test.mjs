// OWNER-SURFACE-HONESTY-1 + OBJECTIVE-AUTHORITY-TRUTH-1 (1.17.8) offline suite: drives the real worker against an
// in-memory SQLite D1 shaped like qnfo-audit. Proves:
//   M. the inbox card is honest: a funder's automated receipt (a replica of emails 903) gets no card and is listed as
//      handled, list mail gets none, a person gets a card that says why (sender domain, subject, authentication on the
//      public page; display name and address only for the signed-in owner); INBOUND-SLA-1's category wins when it exists;
//      the rules are the orchestrator's (parity with qnfo-email-orchestrator/worker.js);
//   F. "fix all the issues" and search-query questions are answered from the fleet's data with no model and change nothing;
//      a model failure answers plainly from the data; the legacy Ask works inside waitUntil; a request left unanswered
//      reads as a plain sentence;
//   C. a question naming a mail carries its stored facts into the model's CONTEXT: domain, subject, received time,
//      authentication verdict and classification for everyone, name, address and at most 300 body characters only for the
//      owner;
//   O. the ratify route records the credential that acted and the apply step stamps it: owner session, loop token, or
//      'unknown credential' when nothing was recorded (never the owner); the objective card shows the full text.
// Run: node qnfo-fleet-dashboard/owner-surface.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "" });

const LOOP = "loop-secret-xyz";
const STATE = { schema_version: "fleet-state/v1", generated_at: new Date().toISOString(), version: "t", verdict: "HEALTHY", window: {}, fleet: { workers: 30 }, totals: {}, scheduled: [], audits: [], probes: [], integration: {}, report_card: {}, chains: [], device: {}, issues: [], issue_counts: { err: 0, warn: 0, total: 0 }, queues: [], coverage: {}, unattributed_errors: 0, recovered_workers: [], error_workers: [], loop: {}, meta: {}, refresh_ms: 1 };
const W = { w_autonomy: 0.2, w_thinking: 0.15, w_decision: 0.15, w_self_improv: 0.15, w_reliability: 0.1, w_integration: 0.1, w_external_impact: 0.1, w_governance: 0.05 };
const OBJ = "Maximize SAI = 0.20*autonomy + 0.15*thinking + 0.15*decision + 0.15*self_improv + 0.10*reliability + 0.10*integration + 0.10*external_impact + 0.05*governance, subject to the autonomy-ladder cap.";
const LONG_STATEMENT = "Revise terminal objective return-on-spend v3: " + "each graded term must be decidable and observable from a stored measurement; ".repeat(5) + "END-OF-STATEMENT-MARK";
const LONG_ALIGNMENT = "Rationale: " + "five of the ten graded terms cannot be decided from any table the fleet writes, so the score drifts with no lever; ".repeat(4) + "END-OF-ALIGNMENT-MARK";

// emails 903 as stored (headers trimmed to the ones that decide; values verbatim from qnfo-audit).
const H903 = {
  "authentication-results": "mx.cloudflare.net; dkim=pass header.d=foresight.org header.s=google header.b=R3rkuWNm; dmarc=pass header.from=foresight.org policy.dmarc=none; spf=none (mx.cloudflare.net: no SPF records found for postmaster@mail-ej2-x0d.google.com) smtp.helo=mail-ej2-x0d.google.com; spf=pass (mx.cloudflare.net: domain of grants@foresight.org designates 2a00:1450:4864:34::d as permitted sender) smtp.mailfrom=grants@foresight.org; arc=pass smtp.remote-ip=\"2a00:1450:4864:34::d\"",
  cc: "grants@foresight.org",
  from: "\"Foresight Institute\" <grants@foresight.org>",
  "message-id": "<CAAUHGQrkQrFu0BQvQuOF1xTpFVOw-q83xTgKD+O-v+73J7DrYQ@mail.gmail.com>",
  received: "from mail-ej2-x0d.google.com (2a00:1450:4864:34::d) by cloudflare-email.net (cloudflare) id miiooMQdHfDr for <rowan.quni@qnfo.org>; Thu, 01 Oct 2026 22:02:05 +0000, by mail-ej2-x0d.google.com with SMTP id a640c23a62f3a-c2e01f5c0aeso355086266b.1 for <rowan.quni@qnfo.org>; Thu, 01 Oct 2026 15:02:05 -0700 (PDT), from 445429363121 named unknown by gmailapi.google.com with HTTPREST; Thu, 1 Oct 2026 15:02:04 -0700",
  "reply-to": "grants@foresight.org",
  subject: "Foresight AI Nodes RFP: Thank you for your Submission!",
  to: "rowan.quni@qnfo.org"
};
const BODY903 = "Dear Rowan Brad Quni-Gudzinas,\r\n\r\nThank you for applying to Foresight Institute's RFP within the AI for\r\nScience and Safety Nodes Program.\r\n\r\nWe will evaluate your proposal when the application deadline has passed\r\n(31st Oct).\r\n\r\nPlease monitor this email as we will be in contact with you should we\r\nrequire additional information.\r\n\r\nThank you for taking the time to submit, and we look forward to reviewing it. " + "x".repeat(200) + " TAIL-BEYOND-300-CHARS";
const authOk = (d, a) => "mx.cloudflare.net; dkim=pass header.d=" + d + " header.s=s1 header.b=abc; dmarc=pass header.from=" + d + " policy.dmarc=reject; spf=pass (mx.cloudflare.net: domain of " + a + " designates 192.0.2.1 as permitted sender) smtp.mailfrom=" + a;
const hdr = (from, a, d, extra) => JSON.stringify(Object.assign({ from, "authentication-results": authOk(d, a), received: "from mail.example (192.0.2.1) by cloudflare-email.net (cloudflare) for <rowan.quni@qnfo.org>; Thu, 01 Oct 2026 10:00:00 +0000" }, extra || {}));
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();

function mk(extra = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER);
  CREATE TABLE fleet_loop_meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
  CREATE TABLE human_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, until TEXT, ts TEXT DEFAULT (datetime('now')), issue_id INTEGER);
  CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, source TEXT, device TEXT, type TEXT, domain TEXT, priority TEXT, summary TEXT, due TEXT, status TEXT, wbs_code TEXT, created_at TEXT, processed_at TEXT, triage_decision TEXT, triage_rationale TEXT, triaged_at TEXT);
  CREATE TABLE task_dod_register (id INTEGER PRIMARY KEY, title TEXT, dod TEXT, due TEXT, updated_at TEXT, owner TEXT, status TEXT);
  CREATE VIEW v_waiting_on_human AS SELECT id, title, dod, due, updated_at FROM task_dod_register WHERE owner IN ('user','mixed') AND status='open';
  CREATE TABLE gtd_register (id INTEGER PRIMARY KEY, line TEXT, dod TEXT, section TEXT, updated_at TEXT, owner TEXT, done INTEGER);
  CREATE TABLE fleet_issue_dispatch (fingerprint TEXT, category TEXT, owner TEXT, action TEXT, payload TEXT, gh_number INTEGER, exec_result TEXT, created_at TEXT, state TEXT, exec_state TEXT);
  CREATE TABLE code_tasks (id TEXT, goal TEXT, repo TEXT, last_error TEXT, pr_url TEXT, updated_at TEXT, status TEXT);
  CREATE TABLE shutdown_manifest (id INTEGER, phase INTEGER, component TEXT, condition TEXT, due_date TEXT, state TEXT);
  CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, goal_type TEXT NOT NULL DEFAULT 'instrumental', parent_objective TEXT, alignment TEXT, source TEXT, score REAL, priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'proposed', dod TEXT, owner TEXT, adopted_at TEXT, completed_at TEXT, retired_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), program_code TEXT);
  CREATE TABLE sai_config (k TEXT PRIMARY KEY, v REAL, source TEXT, updated_at TEXT);
  CREATE TABLE objectives (id INTEGER PRIMARY KEY AUTOINCREMENT, objective_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, source TEXT, ratified_by TEXT, ratified_on TEXT, version INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE');
  CREATE TABLE emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT UNIQUE NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, body_text TEXT, body_html TEXT, headers_json TEXT, classification TEXT DEFAULT 'general', status TEXT DEFAULT 'received', processing_ms INTEGER, received_at TEXT DEFAULT (datetime('now')), processed_at TEXT, in_reply_to TEXT, references_hdr TEXT);
  CREATE VIEW v_email_human_pending_v2 AS SELECT e.id, e.sender, e.recipient, e.subject, e.received_at, e.status FROM emails e WHERE e.status IN ('processed','received') AND lower(e.sender) NOT LIKE '%noreply%' AND lower(e.sender) NOT LIKE '%no-reply%' AND e.sender NOT LIKE '%@qnfo.org' ORDER BY e.received_at DESC;
  CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER NOT NULL, sender TEXT NOT NULL, subject TEXT, received_at TEXT, decision TEXT NOT NULL DEFAULT 'pending', skip_reason TEXT, sent_at TEXT);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT DEFAULT 'active', last_verdict TEXT, attempts INTEGER DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, next_due_at TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
  CREATE TABLE ask_events (id TEXT PRIMARY KEY, ts TEXT NOT NULL, query TEXT);
  CREATE TABLE ask_queries_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL, created_at TEXT);
  CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
  CREATE TABLE owner_sessions (token_hash TEXT PRIMARY KEY, created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, verified_ms INTEGER NOT NULL, revoked INTEGER DEFAULT 0, visitor TEXT);
  CREATE TABLE owner_prompts (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), mode TEXT, prompt TEXT, status TEXT, response TEXT, model TEXT, intent_id TEXT, error TEXT, issue_id INTEGER, visitor TEXT);`);
  db.prepare("INSERT INTO fleet_dashboard_state VALUES (1,?,?,1)").run(new Date().toISOString(), JSON.stringify(STATE));
  for (const k of Object.keys(W)) db.prepare("INSERT INTO sai_config (k, v, source) VALUES (?, ?, 'seed')").run(k, W[k]);
  db.prepare("INSERT INTO objectives (objective_key, statement, version, status, ratified_by) VALUES ('objective-function', ?, 2, 'ACTIVE', 'seed')").run(OBJ);
  const goal = (id, st, al) => db.prepare("INSERT INTO goals (id, goal_key, statement, goal_type, alignment, status, created_at) VALUES (?, ?, ?, 'objective-revision', ?, 'proposed', '2026-10-01 10:00:00')").run(id, "rev-" + id, st, al || "rationale: synthetic");
  goal(58, "Decrease the weight of autonomy from 0.20 to 0.15 and increase the weight of self_improv from 0.15 to 0.20");
  goal(57, "Add a constraint to limit the UNMANAGED direct-provider spend to 50% of the total fleet cost");
  goal(61, "Decrease the weight of governance from 0.05 to 0.03 and increase the weight of reliability from 0.10 to 0.12");
  goal(59, LONG_STATEMENT, LONG_ALIGNMENT);
  // inbox: 903 (funder receipt), a person, list mail, and two the orchestrator has already decided
  const em = db.prepare("INSERT INTO emails (id, message_id, sender, recipient, subject, body_text, headers_json, status, received_at) VALUES (?, ?, ?, 'rowan.quni@qnfo.org', ?, ?, ?, 'processed', ?)");
  em.run(903, "<m903>", "grants@foresight.org", H903.subject, BODY903, JSON.stringify(H903), "2026-10-01T22:02:05.891Z");
  em.run(950, "<m950>", "jane.doe@example-univ.edu", "Question about your resonance preprint", "Hi Rowan, I read your preprint and have a question about section 3. Could we talk next month? Jane PRIVATE-BODY-JANE", hdr("\"Jane Doe\" <jane.doe@example-univ.edu>", "jane.doe@example-univ.edu", "example-univ.edu"), ago(30));
  em.run(951, "<m951>", "updates@vendor-mail.example", "Product updates for October", "Our October release notes.", hdr("Vendor <updates@vendor-mail.example>", "updates@vendor-mail.example", "vendor-mail.example", { "list-unsubscribe": "<mailto:u@vendor-mail.example>" }), ago(20));
  em.run(952, "<m952>", "pat@think-tank.example", "Collaboration", "Hello, would you write for our journal?", hdr("Pat Lee <pat@think-tank.example>", "pat@think-tank.example", "think-tank.example"), ago(10));
  em.run(953, "<m953>", "lee@lab.example", "Your model of resonance", "Dear Dr Quni, a question about your model.", hdr("Dr Lee Kim <lee@lab.example>", "lee@lab.example", "lab.example"), ago(5));
  db.prepare("INSERT INTO email_reply_queue (id, email_id, sender, decision) VALUES (7, 952, 'pat@think-tank.example', 'skip'), (8, 953, 'lee@lab.example', 'held')").run();
  db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, meta, status) VALUES ('inbound-sla-q-7', ?, 'inbound-sla-decision', ?, 'skipped'), ('inbound-sla-q-8', ?, 'inbound-sla-decision', ?, 'held')").run(ago(1), JSON.stringify({ queue_id: 7, email_id: 952, category: "solicitation" }), ago(1), JSON.stringify({ queue_id: 8, email_id: 953, category: "unknown_human" }));
  // open issues: one closing itself, two blocked (budget spent; probe cannot run), one with no contract; a closed one
  const iss = db.prepare("INSERT INTO agent_issues (id, title, priority, status, category) VALUES (?, ?, ?, ?, ?)");
  iss.run(1712, "POST-ID-UTM-1: every post stores its platform id", "high", "open", "dissemination");
  iss.run(1726, "CODE-LOOP-ON-CLAUDE-1: defect repair still runs as sessions", "high", "open", "governance");
  iss.run(1283, "mixed-type-timestamp: timestamps stored as text and numbers", "medium", "open", "reliability");
  iss.run(1732, "ZENODO-METADATA-EDITS-1 backfill: one creator identity", "medium", "open", "reliability");
  iss.run(1764, "IMPACT-FAILCLOSED-1: SECRET-WEAKNESS-TITLE", "high", "open", "security");
  iss.run(1700, "an issue that is already closed", "high", "closed", "reliability");
  const rc = db.prepare("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict, attempts, max_attempts, escalate_to, next_due_at) VALUES (?, ?, 'active', ?, ?, ?, ?, ?)");
  rc.run("issue-1712", 1712, "fail", 2, 3, "qnfo-ops", "2026-10-02 15:00:57");
  rc.run("issue-1726", 1726, "fail", 3, 3, "qnfo-ops", "2026-10-02 09:00:57");
  rc.run("mixed-type-timestamp", 1283, "probe-not-machine-executable", 1, 3, "owner", "2026-10-02 07:25:22");
  rc.run("issue-1700", 1700, "fail", 1, 3, "qnfo-ops", null);
  // what the fleet knows about searches
  for (const [m, v] of [["ipatent_human_views_7d", "0"], ["ipatent_search_visits_7d", "0"], ["ipatent_crawler_hits_7d", "1"], ["ipatent_drafters_7d", "0"], ["other_metric", "9"]]) db.prepare("INSERT INTO metric_registry VALUES (?, ?, ?)").run(m, v, ago(1));
  db.prepare("INSERT INTO ask_events (id, ts, query) VALUES ('a1', ?, 'PRIVATE-ASK-QUERY-TEXT')").run(ago(3));
  db.prepare("INSERT INTO ask_queries_v2 (query, created_at) VALUES ('old question', '2026-06-22 15:53:38')").run();
  const day = new Date().toISOString().slice(0, 10);
  for (const [e, n] of [["www.google.com", 4], ["bing.com", 2], ["q08.org", 14], ["(direct)", 130]]) db.prepare("INSERT INTO reach_signals VALUES (?, 'cf-rum', 'web', 'referrer', ?, 'pageviews', ?)").run(day, e, n);
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const calls = [];
  const svc = extra.svc || (async (u, o) => { calls.push(JSON.parse(o.body)); return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"model answer","actions":[]}' } }] }), { status: 200 }); });
  const AUDIT = { prepare: prep, async batch(list) { db.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
  const env = Object.assign({ AUDIT, LOOP_TOKEN: LOOP, SVC_QNFO_AI: { fetch: svc } }, extra.env || {});
  return { env, db, calls, AUDIT };
}
const pending = [];
const ctx = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
const flush = async () => { while (pending.length) await pending.shift(); };
const O = "https://fleet.qnfo.org";
const call = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctx);
const post = (env, path, body, headers) => call(env, path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "x-fleet-ui": "1" }, headers || {}), body: JSON.stringify(body) });
const cmd = (env, text, headers) => post(env, "/api/cmd", { text, from: "" }, headers);
const ask = (env, text, headers) => post(env, "/api/owner/prompt", { text, mode: "ask" }, headers);
// An owner session as the emailed-code flow leaves it (verified now, so destructive steps pass).
function session(db) {
  const token = "ab".repeat(32);
  const now = Date.now();
  db.prepare("INSERT INTO owner_sessions (token_hash, created_ms, expires_ms, verified_ms) VALUES (?, ?, ?, ?)").run(createHash("sha256").update(token).digest("hex"), now, now + 36e5, now);
  return { Cookie: "fleet_cmd=" + token };
}
const T = { "x-loop-token": LOOP };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// M. the inbox card
{
  const { env, db } = mk();
  const j = await (await call(env, "/api/human")).json();
  const raw = JSON.stringify(j);
  const keys = j.items.map((i) => i.key);
  ok(!keys.includes("mail:foresight.org"), "M1 the funder's automated receipt (emails 903) is not an owner card");
  const h903 = j.mail_handled.find((m) => m.domain === "foresight.org");
  ok(h903 && h903.category === "funder_receipt" && /funding\/APPLICATIONS\.md/.test(h903.why) && /GRANT-FOLLOWUP-1/.test(h903.why), "M2 it is listed as handled: a funder receipt recorded in funding/APPLICATIONS.md and watched by GRANT-FOLLOWUP-1");
  ok(!/real person/i.test(raw), "M3 nothing on the queue claims 'a real person'");
  ok(!keys.includes("mail:vendor-mail.example") && j.mail_handled.some((m) => m.domain === "vendor-mail.example" && m.category === "automated"), "M4 list mail (List-Unsubscribe) gets no card");
  const jane = j.items.find((i) => i.key === "mail:example-univ.edu");
  ok(jane && jane.title === "Reply to mail from example-univ.edu" && !JSON.stringify(jane).includes("Question about your resonance preprint"), "M5 a person gets a card naming the sender's domain, never the subject, on the public page (" + (jane && jane.title) + ")");
  ok(jane && /looks like a person wrote it/.test(jane.why) && /dkim=pass \(header\.d=example-univ\.edu\)/.test(jane.why) && /dmarc=pass/.test(jane.why) && /To rowan\.quni@qnfo\.org/.test(jane.why), "M6 the card says why it looks like a person and what the authentication said");
  ok(!raw.includes("jane.doe@") && !raw.includes("Jane Doe") && !raw.includes("PRIVATE-BODY-JANE") && !raw.includes("grants@foresight.org") && !raw.includes("Dear Rowan"), "M7 the public JSON carries no sender address, display name or body");
  ok(!keys.includes("mail:think-tank.example") && j.mail_handled.some((m) => m.domain === "think-tank.example" && m.category === "solicitation"), "M8 INBOUND-SLA-1's category wins: a message it classed as a solicitation gets no card");
  const lee = j.items.find((i) => i.key === "mail:lab.example");
  ok(lee && /INBOUND-SLA-1 held it for you: a named person outside the research-outreach campaign/.test(lee.why), "M9 a message INBOUND-SLA-1 held for the owner keeps its card and says so");
  let h = await (await call(env, "/")).text();
  ok(h.includes("someone at example-univ.edu") && !h.includes("Question about your resonance preprint") && !h.includes("Foresight AI Nodes RFP") && !h.includes("jane.doe@") && !/real person/i.test(h), "M10 the public page names the domain, never the subject or the address");
  ok(/Inbox: \d+ messages owe you no reply: [^<]*foresight\.org \(a funder&#39;s automated submission receipt|Inbox: \d+ messages owe you no reply: [^<]*foresight\.org \(a funder's automated submission receipt/.test(h), "M11 the page explains why foresight.org has no card");
  const S = session(db);
  h = await (await call(env, "/", { headers: S })).text();
  ok(h.includes("Reply to Jane Doe &lt;jane.doe@example-univ.edu&gt;: Question about your resonance preprint") && h.includes("Dr Lee Kim &lt;lee@lab.example&gt;"), "M12 the signed-in owner sees the sender's display name and address");
  const jo = await (await call(env, "/api/human", { headers: T })).json();
  const jj = jo.items.find((i) => i.key === "mail:example-univ.edu");
  ok(jj && jj.mail[0].from_address === "jane.doe@example-univ.edu" && jj.mail[0].from_name === "Jane Doe" && jj.mail[0].subject === "Question about your resonance preprint" && jj.title.includes("Jane Doe <jane.doe@example-univ.edu>"), "M13 a loop-token holder gets the sender and the subject in /api/human");
  ok(!JSON.stringify(jo).includes("PRIVATE-BODY-JANE"), "M14 no message body is on any card, even for the owner");
}
// M15. the rules are the orchestrator's
{
  const dash = readFileSync(join(here, "worker.js"), "utf8");
  const orch = readFileSync(join(here, "..", "qnfo-email-orchestrator", "worker.js"), "utf8");
  const rx = (src, name) => { const m = new RegExp("var " + name + " = (/.*/[a-z]*);\\n").exec(src); return m ? m[1] : null; };
  for (const [a, b] of [["MAIL_INTERNAL_RX", "SLA_INTERNAL_RX"], ["MAIL_MACHINE_RX", "SLA_MACHINE_RX"], ["MAIL_RECEIPT_RX", "SLA_RECEIPT_RX"], ["MAIL_SOLICIT_RX", "SLA_SOLICIT_RX"]]) ok(rx(dash, a) && rx(dash, a) === rx(orch, b), "M15 " + a + " is the orchestrator's " + b);
  const arr = (src, name) => { const i = src.indexOf("var " + name + " = ["); const j = src.indexOf("];", i); return i < 0 ? null : vm.runInNewContext("(" + src.slice(i + ("var " + name + " = ").length, j + 1) + ")"); };
  ok(JSON.stringify(arr(dash, "MAIL_FUNDERS")) === JSON.stringify(arr(orch, "SLA_FUNDERS")) && JSON.stringify(arr(dash, "MAIL_FUNDERS")).includes("foresight.org"), "M16 the funder list is the orchestrator's SLA_FUNDERS");
}
// F. questions the fleet's data answers, failures that still answer
{
  const { env, db, calls } = mk();
  const n0 = db.prepare("SELECT (SELECT COUNT(*) FROM agent_issues) a, (SELECT COUNT(*) FROM intents) i, (SELECT COUNT(*) FROM human_responses) r").get();
  let r = await cmd(env, "Fix all the issues automatically");
  let j = await r.json();
  ok(r.status === 200 && j.kind === "answer" && calls.length === 0, "F1 'fix all the issues' is answered at once, with no model call");
  ok(/^Nothing was changed\./.test(j.text) && /email code/.test(j.text) && (!j.actions || j.actions.length === 0), "F2 it changes nothing and proposes no bulk action; actions still need the emailed code");
  ok(/5 open fleet issues \(agent_issues\): 3 high, 2 medium\./.test(j.text), "F3 it summarises the open issues (" + (j.text || "").split("\n")[2] + ")");
  ok(/Close themselves \(1\)[^]*#1712 \(dissemination\) - issue-1712: last probe fail, attempt 2 of 3, next 2026-10-02 15:00 UTC/.test(j.text), "F4 an issue with a live contract closes itself, with its next probe");
  ok(/Blocked \(2\)[^]*#1726 \(governance\) - issue-1726: its probe is still failing past its attempt budget \(3 attempts, budget 3\); escalated to qnfo-ops/.test(j.text) && /#1283 \(reliability\) - mixed-type-timestamp: its contract escalates to you/.test(j.text), "F5 blocked issues say what blocks them");
  ok(/No self-closing probe \(2\)[^]*#1764 \(security\)[^]*#1732 \(reliability\)/.test(j.text) && !/#1700/.test(j.text), "F6 issues with no contract are listed; closed ones are not");
  ok(!/POST-ID-UTM|CODE-LOOP|ZENODO|SECRET-WEAKNESS-TITLE/.test(j.text) && /Titles are shown to the signed-in owner/.test(j.text), "F6b the public reads issues by number and category only (owner notes and security titles stay private)");
  const jh = await (await cmd(env, "fix all the issues", T)).json();
  ok(jh.text.includes("#1712 POST-ID-UTM-1: every post stores its platform id - issue-1712") && jh.text.includes("#1764 IMPACT-FAILCLOSED-1: SECRET-WEAKNESS-TITLE") && !/Titles are shown/.test(jh.text), "F6c the owner reads the titles");
  const n1 = db.prepare("SELECT (SELECT COUNT(*) FROM agent_issues) a, (SELECT COUNT(*) FROM intents) i, (SELECT COUNT(*) FROM human_responses) r").get();
  ok(JSON.stringify(n0) === JSON.stringify(n1), "F7 nothing was filed or changed");
  ok(db.prepare("SELECT kind, status, model FROM cmd_log ORDER BY ts DESC LIMIT 1").get().model === "fleet-data:issues-digest", "F8 the answer is logged as fleet data, not an AI question");
  r = await cmd(env, "What are recent ipatent web queries?");
  j = await r.json();
  ok(r.status === 200 && calls.length === 0 && /^This dashboard cannot read ipatent-db, where ipatent\.qnfo\.org keeps its own records: it is not bound here/.test(j.text), "F9 the web-query question says plainly that this dashboard cannot read ipatent-db, instead of failing");
  ok(/logged in ipatent-db's analytics table until 2026-07-12[^]*does not record a query today/.test(j.text) && /Where the answer lives: qnfo-ops' public read mode \(dataset ipatent_activity, OPS-PUBLIC-READ-1/.test(j.text) && j.text.includes("https://ipatent.qnfo.org/api/metrics"), "F10 it says where the answer lives (qnfo-ops ipatent_activity aggregates, ipatent /api/metrics)");
  ok(/What this dashboard can read \(metric_registry[^]*ipatent_human_views_7d 0, ipatent_search_visits_7d 0/.test(j.text) && !/other_metric/.test(j.text), "F10b it gives the ipatent aggregates it can read");
  ok(/ask_events\): 1 question, the latest/.test(j.text) && /ask_queries_v2: 1 question, the latest 2026-06-22 15:53 UTC/.test(j.text) && !j.text.includes("PRIVATE-ASK-QUERY-TEXT"), "F11 it names the query logs that exist, without their text");
  ok(/Search engines sent 6 visits[^]*www\.google\.com 4, bing\.com 2/.test(j.text) && /do not pass the search terms/.test(j.text), "F12 it reports search-engine referrals and that their terms are unknown");
  ok(!/@/.test(j.text), "F12a aggregates only: no address in the answer");
  r = await cmd(env, "How much did we spend against the cap, and should I fix the ORCID card?", { "CF-Connecting-IP": "203.0.113.19" });
  ok(r.status === 202 && (await r.json()).kind === "pending", "F12b an ordinary question still goes to the model");
  await flush();
  calls.length = 0;
  r = await ask(env, "Fix all the issues automatically", { "CF-Connecting-IP": "203.0.113.20" });
  j = await r.json();
  const row = db.prepare("SELECT status, model, response FROM owner_prompts ORDER BY ts DESC LIMIT 1").get();
  ok(j.ok && j.status === "answered" && /^Nothing was changed\./.test(j.answer) && row.model === "fleet-data:issues-digest" && calls.length === 0, "F13 the legacy Ask path answers the same way, recorded");
  const before = pending.length;
  r = await ask(env, "How is spend against the cap?", { "CF-Connecting-IP": "203.0.113.21" });
  j = await r.json();
  ok(pending.length > before && j.status === "answered" && db.prepare("SELECT COUNT(*) n FROM owner_prompts WHERE status = 'running'").get().n === 0, "F14 the legacy Ask works inside waitUntil, so a browser that leaves cannot strand it 'running'");
  await flush();
}
{
  const { env, db } = mk({ svc: async () => new Response(JSON.stringify({ error: "internal model detail" }), { status: 500 }) });
  let r = await cmd(env, "is anything on fire right now?", { "CF-Connecting-IP": "203.0.113.30" });
  let j = await r.json();
  await flush();
  const jr = await (await call(env, "/api/cmd/job/" + j.id)).json();
  ok(jr.ok && jr.status === "fallback" && /did not answer just now \(the model service answered HTTP 500\)/.test(jr.answer) && /Fleet: HEALTHY/.test(jr.answer) && /Instant commands/.test(jr.answer) && !JSON.stringify(jr).includes("internal model detail"), "F15 a model failure still answers plainly from the fleet's data");
  db.prepare("INSERT INTO owner_prompts (id, ts, mode, prompt, status, error) VALUES ('op-muqis3j0ba09', '2026-10-02 05:25:44', 'ask', 'Fix all the issues automatically', 'failed', 'abandoned: the worker stopped before answering')").run();
  const h = await (await call(env, "/", { headers: session(db) })).text();
  ok(h.includes("Not answered: this request was cut off before the fleet saved an answer. Nothing was changed.") && !h.includes("abandoned: the worker stopped"), "F16 a request left unanswered reads as a plain sentence, not a bare error");
  db.prepare("INSERT INTO cmd_log (id, ts, text, kind, status) VALUES ('cmd-bbbbbbbbbbbbbbbbbbbb', datetime('now','-10 minutes'), 'old', 'ai', 'running')").run();
  const js = await (await call(env, "/api/cmd/job/cmd-bbbbbbbbbbbbbbbbbbbb")).json();
  ok(js.status === "failed" && /^Not answered: this request was cut off/.test(js.error), "F17 a lost job says plainly what happened");
}
// C. the Ask context for a question about a mail
{
  const { env, calls } = mk();
  await cmd(env, "Is the message from foresight.org really a \"real person\"?", { "CF-Connecting-IP": "203.0.113.40" });
  await flush();
  const sys = calls[0] && calls[0].messages[0].content;
  ok(sys && /CONTEXT\.mail, when present/.test(sys), "C1 the model is told what CONTEXT.mail holds");
  const ctxJson = sys ? sys.slice(sys.indexOf("CONTEXT: ") + 9) : "";
  ok(/"from_domain":"foresight\.org"/.test(ctxJson) && !ctxJson.includes("Foresight AI Nodes RFP: Thank you for your Submission!") && ctxJson.includes("2026-10-01T22:02:05.891Z"), "C2 public context: sender domain and received time, never the subject");
  ok(ctxJson.includes("dkim=pass (header.d=foresight.org), dmarc=pass (header.from=foresight.org), spf=pass") && ctxJson.includes("automated, not a person (funder_receipt)") && ctxJson.includes("Gmail API (HTTPREST)"), "C3 public context: authentication verdict, classification and the signals behind it");
  ok(!ctxJson.includes("grants@foresight.org") && !ctxJson.includes("Foresight Institute") && !ctxJson.includes("Dear Rowan"), "C4 public context: no sender address, display name or body (OPEN-ACCESS-1)");
  ok(ctxJson.indexOf('"mail"') >= 0 && ctxJson.indexOf('"mail"') < ctxJson.indexOf('"queue"'), "C5 the mail facts come first, so a long queue cannot cut them off");
}
{
  const { env, calls } = mk();
  await cmd(env, "Is the message from foresight.org really a real person? If so, who?", T);
  await flush();
  const sys = calls[0].messages[0].content;
  ok(sys.includes('"from_address":"grants@foresight.org"') && sys.includes('"from_name":"Foresight Institute"') && /"body_first_300":"Dear Rowan Brad Quni-Gudzinas, Thank you for applying/.test(sys), "C6 the owner's context adds the sender's name, address and the first characters of the body");
  const b = /"body_first_300":"([^"]*)"/.exec(sys);
  ok(b && b[1].length <= 300 && !sys.includes("TAIL-BEYOND-300-CHARS"), "C7 never more than 300 body characters (" + (b && b[1].length) + ")");
}
{
  const { env, calls } = mk();
  await ask(env, "Who sent mail:example-univ.edu, and is it a person?", { "CF-Connecting-IP": "203.0.113.41" });
  const sys = calls[0].messages[0].content;
  ok(/"from_domain":"example-univ\.edu"/.test(sys) && sys.includes("looks like a person (person)") && !sys.includes("jane.doe@") && !sys.includes("PRIVATE-BODY-JANE"), "C8 the legacy Ask names the card's message too, with public fields only");
}
{
  const { env } = mk({ svc: async (u, o) => new Promise((res, rej) => { o.signal.addEventListener("abort", () => rej(new Error("aborted"))); }) });
  const r = await ask(env, "Is the message from foresight.org really a real person?", { "CF-Connecting-IP": "203.0.113.42" });
  const j = await r.json();
  ok(j.ok && j.status === "fallback" && /The message from foresight\.org, received [^]*automated, not a person \(funder_receipt\)/.test(j.answer) && !j.answer.includes("Foresight AI Nodes RFP") && /Authentication: dkim=pass/.test(j.answer) && !j.answer.includes("grants@foresight.org"), "C9 with the model down, the mail question is still answered from the stored headers");
}
// O. who ratified
{
  const { env, db } = mk();
  const S = session(db);
  let r = await post(env, "/api/owner/objective", { id: 58, decision: "ratify" }, S);
  let j = await r.json();
  const o = db.prepare("SELECT ratified_by, source FROM objectives WHERE objective_key = 'objective-function'").get();
  const a = db.prepare("SELECT via, outcome FROM objective_revision_applies WHERE goal_id = 58").get();
  ok(r.status === 200 && j.outcome === "applied" && o.ratified_by === "owner (fleet.qnfo.org, emailed code)" && a.via === "route:owner-session", "O1 an owner-session ratification is stamped as the owner's (" + o.ratified_by + ", " + (a && a.via) + ")");
  ok(db.prepare("SELECT credential FROM human_responses WHERE key = 'goals:objective-revision:58'").get().credential === "owner-session" && /by owner \(fleet\.qnfo\.org, emailed code\)/.test(o.source), "O2 the decision row records the credential and the source text names it");
  r = await post(env, "/api/owner/objective", { id: 61, decision: "ratify" }, T);
  j = await r.json();
  const o2 = db.prepare("SELECT ratified_by FROM objectives WHERE objective_key = 'objective-function'").get();
  ok(r.status === 200 && j.outcome === "applied" && o2.ratified_by === "delegated (loop token, OWNER-QUEUE-DELEGATION-1)" && db.prepare("SELECT via FROM objective_revision_applies WHERE goal_id = 61").get().via === "route:loop-token", "O3 a loop-token ratification is stamped as delegated, not the owner's");
  r = await post(env, "/api/owner/objective", { id: 57, decision: "ratify" }, Object.assign({}, T, S));
  j = await r.json();
  const w = db.prepare("SELECT description FROM agent_issues WHERE title LIKE 'OBJECTIVE-REVISION-57:%'").get();
  ok(j.outcome === "filed-as-work" && /was ratified on fleet\.qnfo\.org by delegated \(loop token, OWNER-QUEUE-DELEGATION-1\) \(applied [0-9-]+\)/.test(w.description) && !/The owner ratified/.test(w.description), "O4 with the loop token present the work item says delegated, never 'the owner'");
  ok(j.decided_by === "delegated (loop token, OWNER-QUEUE-DELEGATION-1)", "O5 the route reports who it recorded");
}
{
  // A revision ratified with no record (a direct D1 write): the cron sweep, replayed from the worker source.
  const { db, AUDIT } = mk();
  const src = readFileSync(join(here, "worker.js"), "utf8");
  const a = src.indexOf("var OBJREV_WEIGHT_RE"), b = src.indexOf("// NO-CLAUDE-RUNTIME-DEPENDENCY-1: the owner's data and workflow live on Cloudflare.");
  const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, RegExp });
  vm.runInContext("async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" + src.slice(a, b) + "\n;this.__api = { objectiveRevisionSweep };", cx);
  db.prepare("UPDATE goals SET status = 'ratified' WHERE id = 61").run();
  const sw = await cx.__api.objectiveRevisionSweep({ AUDIT });
  const o = db.prepare("SELECT ratified_by, source FROM objectives WHERE objective_key = 'objective-function'").get();
  ok(/^goals\.id=61 ratified with no recorded decision \(unknown credential\)/.test(o.source) && !/fleet\.qnfo\.org by/.test(o.source), "O6a with no record the source text does not even claim the dashboard (" + o.source.slice(0, 80) + ")");
  ok(sw.length === 1 && sw[0].outcome === "applied" && o.ratified_by === "unknown credential" && db.prepare("SELECT via FROM objective_revision_applies WHERE goal_id = 61").get().via === "cron:unknown", "O6 a ratification with no recorded credential is stamped 'unknown credential', never the owner");
}
{
  const { env } = mk();
  const h = await (await call(env, "/")).text();
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  ok(h.includes(esc(LONG_STATEMENT)) && h.includes(esc(LONG_ALIGNMENT)), "O7 the objective card shows the full statement and rationale");
  const j = await (await call(env, "/api/human")).json();
  const card = j.items.find((i) => i.key === "goals:objective-revision");
  const d = card && card.detail.find((x) => x.id === 59);
  ok(d && d.statement === LONG_STATEMENT && d.why === LONG_ALIGNMENT, "O8 /api/human carries the full text too");
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

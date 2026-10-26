// DASH-OWNER-ACTIONS-1 offline suite (qnfo-fleet-dashboard 1.65.0, agent_issues 100360). Owner report 2026-10-20: "Fleet command line
// not executing. Need easier way to approve owner items and diagnose/resolve issues and problems from fleet dashboard." The approvals
// the owner typed (11:20, 11:21 and 11:34Z) went to the AI path and, when three router legs timed out, nothing executed.
// Proves: approve, decline, diagnose, retry and resolve are parsed in code and never call a model (T1, T12); a bare approve lists the
// candidates and never guesses (T2); a bare six-digit issue id is not read as a sign-in code unless one is waiting, and reject/ratify of a
// non-objective id is decline/approve (T3, T4); an approval is the owner session's own, destructive (fresh code) and writes the card,
// human_responses, the OWNER-DECISION stamp and ONE hand-off task that names the items, the doer and the closing probe, without
// claiming anything was applied (T5-T8); a numbered card is decided item by item and closes when every item is decided (T9); when the
// model does not answer, the matched intent comes back as tappable buttons that are stored (T10); resolve closes only on a passing
// probe (T11); diagnose is an open read that hides titles from a stranger (T12); cmdFallback keeps working alone in a vm (T13); the
// card buttons are the owner's only, 44 px, wrapped for a 360 px phone and delegated so the 15 s refresh keeps them (T14); retry (T15).
// Run: node qnfo-fleet-dashboard/cmd-decide.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
globalThis.fetch = async () => new Response("{}", { status: 503 });

const STATE = { schema_version: "fleet-state/v1", generated_at: new Date().toISOString(), version: "t", verdict: "HEALTHY", window: {}, fleet: { workers: 44 }, totals: {}, scheduled: [], audits: [], probes: [], integration: {}, report_card: {}, chains: [], device: {}, issues: [], issue_counts: { err: 0, warn: 0, total: 0 }, queues: [], coverage: {}, unattributed_errors: 0, recovered_workers: [], error_workers: [], loop: {}, meta: {}, refresh_ms: 1 };
const LOOP = "loop-secret-123";
const SLUG = "uia-source-fidelity-100140";
const DESC = [
  "Found 2026-10-19 while red-teaming the poster. Each item names the defect and the fix; done = each paper body corrected and republished as a new version.",
  "",
  "1) ai4metascience-ignorance-audit section 2 names the wrong analysed paper. Fix: point 2026b to papers.qnfo.org/papers/qwave-qudit-advantage.",
  "2) ignorance-ai-pipeline-synthesis section 2 contradicts itself on who contributed what. Fix: one consistent account.",
  "3) universal-ignorance-audit references: Whitcomb et al. is cited as 91(1) 95-120; correct is 94(3), 509-539.",
  "4) universal-ignorance-audit method paper: the meta-audit sibling list omits willful ignorance. Clarify which of the final 15 came from it.",
  "5) The forensic analyses are called independent, but the author contributions say the author wrote them.",
  "6) The poster source repository carries the old figure numbers.",
  "7) The registry entry needs a new version number.",
  "TRIAGE: owner qnfo-ops; doer is the revision and errata path (REVISION-LOOP-1, qnfo-research-exec)."
].join("\n");

function mk(extra = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER);
  CREATE TABLE fleet_loop_meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
  CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END;
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER DEFAULT 3, escalate_to TEXT, status TEXT DEFAULT 'active', last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0);
  CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
  CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, intent TEXT, holder TEXT, issue_id INTEGER, pr INTEGER, claimed_at TEXT, expires_at TEXT, released_at TEXT, outcome TEXT);
  CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT, outcome TEXT, detail TEXT, task_id TEXT, path TEXT, model TEXT, attempts INTEGER);
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, step TEXT, attempts INTEGER, branch TEXT, pr_url TEXT, last_error TEXT, merge_state TEXT, merge_note TEXT, updated_at TEXT);
  CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, source TEXT, device TEXT, type TEXT, domain TEXT, priority TEXT, summary TEXT, due TEXT, status TEXT, wbs_code TEXT, created_at TEXT, processed_at TEXT, triage_decision TEXT);
  CREATE TABLE goals (id INTEGER PRIMARY KEY, goal_type TEXT, status TEXT, created_at TEXT, statement TEXT, alignment TEXT, updated_at TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE breach_selfheal_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), check_class TEXT, subject TEXT NOT NULL, action TEXT, revert TEXT, evidence TEXT);
  CREATE TABLE v_issue_age_ladder (id INTEGER, title TEXT, priority TEXT, source TEXT, age_h REAL, doer TEXT, plan_outcome TEXT, planned_at TEXT, plan_reason TEXT, rung TEXT, breach INTEGER);
  CREATE VIEW v_issue_queue AS SELECT ROW_NUMBER() OVER (ORDER BY q.prank, q.id) AS pos, q.* FROM (SELECT a.id, CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END AS prank, a.priority, a.title, a.category, a.source, t.owner, t.triage_state, CASE WHEN COALESCE(a.description,'') LIKE '%code-task:%' THEN 1 ELSE 0 END AS has_code_task, CASE WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'active') THEN 1 ELSE 0 END AS has_contract, a.linked_session, a.created_at, a.updated_at FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = 'open') q;`);
  db.prepare("INSERT INTO fleet_dashboard_state VALUES (1,?,?,1)").run(new Date().toISOString(), JSON.stringify(STATE));
  if (!extra.noCard) db.prepare("INSERT INTO human_actions (slug,title,why,default_in_effect,action,source) VALUES (?,?,?,?,?,?)").run(SLUG, "UIA-SOURCE-FIDELITY-1: approve or decline the seven fixes to the Ignorance Audit papers", "IDENTITY-BOUND: edits to the author's own paper bodies (authorship attribution and wording); loops never rewrite owner-authored papers.", "The papers stay as published.", "Approve or decline each of the seven fixes in agent_issues 100140. On approval the fleet applies them through the owner-document edit path and the issue closes on its own probe.", "claude-session");
  if (extra.second) db.prepare("INSERT INTO human_actions (slug,title,why,default_in_effect,action,source) VALUES ('pick-pricing-model','Pick one pricing model for the API','The owner chooses; no loop can.','The current model stays.','Approve: model A (flat) or model B (metered).','claude-session')").run();
  if (extra.plain) db.prepare("INSERT INTO human_actions (slug,title,why,action,source) VALUES ('orcid-link-works','Add the selected works to ORCID','issue 1001 found the gap','act','owner-only:x')").run();
  db.prepare("INSERT INTO agent_issues (id,title,description,category,priority,created_at,updated_at) VALUES (100140,'UIA-SOURCE-FIDELITY-1: fix factual inconsistencies in the Ignorance Audit papers found while red-teaming the poster',?,'pipeline','medium',1791217360000,1791217360000)").run(DESC);
  db.prepare("INSERT INTO agent_issues (id,title,description,category,priority,created_at,updated_at) VALUES (1001,'METRIC-TRIGGER-7: pageviews low','The lever is X.','analytics','medium',1791217360000,1791217360000)").run();
  db.prepare("INSERT INTO agent_issues (id,title,description,category,priority,created_at,updated_at) VALUES (1002,'CRIT thing','nothing','reliability','critical',1791217360000,1791217360000)").run();
  db.prepare("INSERT INTO issue_triage (issue_id,rc,owner,sla_due_at) VALUES (100140,'AUTOTRIAGE-2','qnfo-ops',datetime('now'))").run();
  db.prepare("INSERT INTO issue_triage (issue_id,rc,owner,sla_due_at) VALUES (1001,'AUTOTRIAGE-2','qnfo-ops',datetime('now'))").run();
  db.prepare("INSERT INTO remediation_contracts (class,issue_id,verify_probe,verify_transport,last_verdict,attempts,max_attempts,escalate_to,next_due_at) VALUES ('issue-100140',100140,'SELECT 1','d1-query','fail',230,3,'qnfo-fleet-control','2026-10-26 06:04:30')").run();
  db.prepare("INSERT INTO remediation_contracts (class,issue_id,verify_probe,verify_transport,last_verdict,attempts,max_attempts,escalate_to) VALUES ('METRIC-7',1001,'SELECT 1','d1-query','fail',1,3,'qnfo-ops')").run();
  db.prepare("INSERT INTO v_issue_age_ladder (id,title,priority,age_h,doer,plan_outcome,plan_reason,rung) VALUES (100140,'t','medium',163.1,NULL,'not-code','content correction of owner papers','24h')").run();
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const aiCalls = [], svcCalls = [];
  const ai = extra.ai || (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "model answer", actions: [] }) } }] }), { status: 200 }));
  const m = mailer();
  const env = Object.assign({ AUDIT: { prepare: prep, async batch(list) { const out = []; db.exec("BEGIN"); try { for (const s of list) out.push(await s.run()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return out; } }, LOOP_TOKEN: LOOP, SEND_EMAIL: m.SEND_EMAIL, SVC_QNFO_AI: { fetch: async (u, o) => { aiCalls.push(o); return ai(u, o); } }, SVC_QNFO_OPS: { fetch: async (u, o) => { svcCalls.push({ u, o }); return new Response("ops ok", { status: 200 }); } } }, extra.env || {});
  return { env, db, aiCalls, svcCalls, m };
}
const pending = [];
const ctx = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
const O = "https://fleet.qnfo.org";
const call = (env, path, init) => worker.fetch(new Request(O + path, init), env, ctx);
const post = (env, path, body, headers) => call(env, path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "x-fleet-ui": "1" }, headers || {}), body: JSON.stringify(body) });
const cmd = (env, text, headers) => post(env, "/api/cmd", { text, from: "" }, headers);
const run = (env, op, args, headers) => post(env, "/api/cmd/run", { op, args }, headers);
const flush = async () => { while (pending.length) await pending.shift(); };
function mailer() { const sent = []; return { sent, SEND_EMAIL: { async send(m) { sent.push(m); return { messageId: "m" + sent.length }; } } }; }
async function signIn(env, db, m) {
  try { db.prepare("UPDATE owner_codes SET created_ms = created_ms - 120000").run(); } catch (err) { /* first sign-in: the table is created by the first request */ }
  await post(env, "/api/cmd/code", {});
  const code = /(\d{6})/.exec(m.sent[m.sent.length - 1].subject)[1];
  const r = await post(env, "/api/cmd/verify", { code });
  return { Cookie: /fleet_cmd=[0-9a-f]{64}/.exec(r.headers.get("Set-Cookie"))[0] };
}
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const rows = (db, sql, ...a) => db.prepare(sql).all(...a);
const one = (db, sql, ...a) => db.prepare(sql).get(...a);
const noModel = (e) => e.aiCalls.length === 0 && e.svcCalls.length === 0;

// T1. the five lines the owner typed (and the long sentence) are commands: no model call, one approve button, destructive
{
  const e = mk();
  const lines = ["Approve UIA-SOURCE-FIDELITY-1", "Approve each of the seven fixes in agent_issues 100140. Items 2, 4 and 5 are authorship wording; 6 and 7 sit in an external repository and a registry.", "Approve", "approve 100140", "approve #100140", "authorize issue 100140", "ratify ha:" + SLUG];
  for (const l of lines) {
    const r = await cmd(e.env, l); const j = await r.json();
    const a = (j.actions || []).find((x) => x.op === "approve");
    ok(r.status === 200 && j.kind === "answer" && a && a.destructive === true && a.args.key === "ha:" + SLUG && a.args.issue === 100140, "T1 '" + l.slice(0, 40) + "' is an approve button for the 100140 card", j);
    ok(a && a.args.items.length === 7 && /all 7 fixes of issue 100140 \(UIA-SOURCE-FIDELITY-1\)/.test(a.label), "T1b '" + l.slice(0, 30) + "' approves all seven and says so", a && a.label);
  }
  const r = await cmd(e.env, "decline 100140"); const j = await r.json();
  const d = (j.actions || []).find((x) => x.op === "decline");
  ok(d && d.destructive === false && d.args.items.length === 7, "T1c decline is a button that is not destructive", j);
  await flush();
  ok(noModel(e) && rows(e.db, "SELECT id FROM cmd_log WHERE kind = 'ai'").length === 0, "T1d none of them reached the AI path (no model call, no ai row in cmd_log)", { ai: e.aiCalls.length, svc: e.svcCalls.length });
  ok(rows(e.db, "SELECT * FROM human_responses").length === 0 && one(e.db, "SELECT status FROM human_actions WHERE slug = ?", SLUG).status === "open", "T1e typing never decides anything");
}
// T2. a bare approve: the one decision card; with a second one, buttons and no op
{
  const e = mk();
  let j = await (await cmd(e.env, "approve")).json();
  ok(j.actions && j.actions.some((a) => a.op === "approve" && a.args.key === "ha:" + SLUG), "T2 a bare approve resolves to the one owner-gated card", j);
  const e2 = mk({ second: true, plain: true });
  j = await (await cmd(e2.env, "approve")).json();
  ok(!(j.actions || []).some((a) => a.op) && (j.actions || []).filter((a) => /^approve /.test(a.cmd || "")).length === 2 && /Pick one/.test(j.text), "T2b with two decision cards a bare approve returns two choices and no op (the plain card is not offered)", j);
  ok((j.actions || []).some((a) => a.cmd === "approve ha:pick-pricing-model"), "T2c each choice is a typed command with the exact key");
  const e3 = mk({ noCard: true });
  j = await (await cmd(e3.env, "approve")).json();
  ok(/Nothing is waiting on a decision/.test(j.text) && !(j.actions || []).some((a) => a.op), "T2d with nothing waiting it says so", j);
  j = await (await cmd(e2.env, "approve 100140 7")).json();
  ok((j.actions || []).some((a) => a.op === "approve" && a.args.items.join() === "7"), "T2e a number after the id is an item, not a queue number", j);
  j = await (await cmd(e2.env, "approve zzzqq")).json();
  ok(/Nothing matches/.test(j.text) && !(j.actions || []).some((a) => a.op), "T2f an unknown target is said plainly, never guessed", j);
}
// T3. a bare six-digit line is an issue id unless a sign-in code is waiting
{
  const e = mk();
  let j = await (await cmd(e.env, "100140")).json();
  ok(/#100140 \[medium\] open/.test(j.text || "") && !/code/i.test(j.error || ""), "T3 100140 with no code waiting is 'issue 100140'", j);
  await post(e.env, "/api/cmd/code", {});
  ok(rows(e.db, "SELECT id FROM owner_codes WHERE used_ms IS NULL").length === 1, "T3a a code is now waiting");
  const r = await cmd(e.env, "100140"); j = await r.json();
  ok(r.status === 401 && /not right/.test(j.error || ""), "T3b with a code waiting a bare six digits is still a code attempt", j);
  ok(one(e.db, "SELECT tries FROM owner_codes").tries === 1, "T3c and it counted as a try");
}
// T4. reject/ratify of an id that is not an objective revision
{
  const e = mk();
  e.db.prepare("INSERT INTO goals (id, goal_type, status, statement) VALUES (12, 'objective-revision', 'proposed', 'Weight cost 0.2')").run();
  let j = await (await cmd(e.env, "reject 100140")).json();
  ok((j.actions || []).some((a) => a.op === "decline" && a.args.key === "ha:" + SLUG) && !(j.actions || []).some((a) => a.op === "reject"), "T4 'reject 100140' is a decline of the card, not an objective op", j);
  j = await (await cmd(e.env, "ratify 100140")).json();
  ok((j.actions || []).some((a) => a.op === "approve"), "T4b 'ratify 100140' is an approve", j);
  j = await (await cmd(e.env, "reject 12")).json();
  ok((j.actions || []).some((a) => a.op === "reject" && a.args.id === 12), "T4c 'reject 12' is still the objective revision", j);
  j = await (await cmd(e.env, "ratify objective #12")).json();
  ok((j.actions || []).some((a) => a.op === "ratify" && a.args.id === 12), "T4d 'ratify objective #12' is unchanged", j);
}
// T5. a stranger gets the button, then the code prompt, and nothing is written
{
  const e = mk();
  const j = await (await cmd(e.env, "approve 100140")).json();
  const a = j.actions.find((x) => x.op === "approve");
  const r = await run(e.env, a.op, a.args); const jr = await r.json();
  ok(r.status === 401 && jr.need === "code", "T5 running it without the owner's code is refused (need: code)", jr);
  const d = await run(e.env, "decline", a.args);
  ok(d.status === 401 && (await d.json()).need === "code", "T5b so is a decline");
  ok(rows(e.db, "SELECT * FROM human_responses").length === 0 && one(e.db, "SELECT status FROM human_actions WHERE slug = ?", SLUG).status === "open" && rows(e.db, "SELECT * FROM owner_prompts").length === 0, "T5c no row was written");
  ok(!/Whitcomb|forensic/.test(j.text), "T5d a stranger's preview does not show the text of the items", j.text);
}
// T6. the loop token holds no identity-bound decision
{
  const e = mk();
  const H = { "x-loop-token": LOOP };
  const j = await (await cmd(e.env, "approve 100140", H)).json();
  const a = j.actions.find((x) => x.op === "approve");
  for (const op of ["approve", "decline"]) {
    const r = await run(e.env, op, a.args, H); const jr = await r.json();
    ok(r.status === 400 && jr.ok === false && /own decision|email-code session/.test(jr.error), "T6 the loop token cannot " + op + " (" + (jr.error || "").slice(0, 50) + ")", jr);
  }
  ok(rows(e.db, "SELECT * FROM human_responses").length === 0 && one(e.db, "SELECT status FROM human_actions WHERE slug = ?", SLUG).status === "open", "T6b nothing changed");
}
// T7. approve needs a code from the last 15 minutes; decline does not
{
  const e = mk();
  const C = await signIn(e.env, e.db, e.m);
  const j = await (await cmd(e.env, "approve 100140", C)).json();
  const a = j.actions.find((x) => x.op === "approve");
  ok(!j.executed && a.destructive, "T7 a signed-in owner still gets a confirm button, never an auto-run approval", j);
  e.db.prepare("UPDATE owner_sessions SET verified_ms = verified_ms - 20 * 60000").run();
  let r = await run(e.env, "approve", a.args, C), jr = await r.json();
  ok(r.status === 401 && jr.need === "stepup" && rows(e.db, "SELECT * FROM human_responses").length === 0 && one(e.db, "SELECT status FROM human_actions WHERE slug = ?", SLUG).status === "open", "T7a after 20 minutes approve asks for a fresh code and writes nothing", jr);
  const dj = await (await cmd(e.env, "decline 100140 3 why the wording is the author's own", C)).json();
  const da = dj.actions.find((x) => x.op === "decline");
  r = await run(e.env, "decline", da.args, C); jr = await r.json();
  ok(r.status === 200 && jr.ok && one(e.db, "SELECT kind, credential FROM human_responses").kind === "decline", "T7b a decline runs on the 12 h session without a fresh code", jr);
  const C2 = await signIn(e.env, e.db, e.m);
  r = await run(e.env, "approve", a.args, C2); jr = await r.json();
  ok(r.status === 200 && jr.ok, "T7c with a fresh code the same approve succeeds", jr);
}
// T8. an approval: card, human_responses, issue stamp, ONE hand-off task; nothing claimed as applied
{
  const e = mk();
  const C = await signIn(e.env, e.db, e.m);
  const j = await (await cmd(e.env, "Approve each of the seven fixes in agent_issues 100140.", C)).json();
  const a = j.actions.find((x) => x.op === "approve");
  ok(/Whitcomb|91\(1\)/.test(j.text) && /1\) /.test(j.text) && /7\) /.test(j.text), "T8 the owner's preview lists the seven items", j.text);
  const r = await run(e.env, "approve", a.args, C); const jr = await r.json();
  ok(r.status === 200 && jr.ok, "T8a the approval runs", jr);
  const card = one(e.db, "SELECT status, resolution FROM human_actions WHERE slug = ?", SLUG);
  ok(card.status === "resolved" && /^approve via dashboard by owner \(fleet\.qnfo\.org, emailed code\): approved 1-7/.test(card.resolution), "T8b the card is resolved and says what was approved", card);
  const hr = rows(e.db, "SELECT key, kind, note, credential FROM human_responses");
  ok(hr.length === 1 && hr[0].key === "ha:" + SLUG && hr[0].kind === "approve" && hr[0].credential === "owner-session" && hr[0].note === "items 1-7; issue 100140;", "T8c one human_responses row, credential owner-session, a readable note with the items and the issue", hr);
  const d = one(e.db, "SELECT description FROM agent_issues WHERE id = 100140").description;
  ok(/OWNER-DECISION approve items 1-7 on card ha:uia-source-fidelity-100140/.test(d) && /not applied by this line/.test(d), "T8d the issue carries an OWNER-DECISION line that does not claim the papers changed", d.slice(-300));
  const tasks = rows(e.db, "SELECT prompt, mode FROM owner_prompts WHERE mode = 'task'");
  ok(tasks.length === 1 && /OWNER-DECISION from fleet\.qnfo\.org/.test(tasks[0].prompt), "T8e exactly ONE hand-off task is filed through the task route", tasks.length);
  const p = tasks[0].prompt;
  ok(/APPROVED items 1-7 of 7/.test(p) && /1\) .*qwave-qudit-advantage/.test(p) && /7\) The registry entry/.test(p), "T8f it names every approved item", p);
  ok(/revision and errata path of qnfo-research-exec/.test(p) && /remediation contract issue-100140/.test(p) && /Close issue 100140 only with that evidence/.test(p), "T8g it names the doer (the revision and errata path) and the issue's closing probe", p);
  ok(rows(e.db, "SELECT id FROM agent_issues WHERE title LIKE 'OWNER-TASK-%'").length === 1 && jr.text.indexOf("issue ") >= 0, "T8h the task became an issue the issue loop reads", jr.text);
  ok(/Nothing has been applied yet/.test(jr.text) && !/papers (were|are|have been) (changed|corrected|updated|applied)|were applied|fixes (are|were) applied/.test(jr.text), "T8i the reply never claims the papers changed", jr.text);
  const again = await run(e.env, "approve", a.args, C); const ja = await again.json();
  ok(ja.ok && /already resolved/.test(ja.text) && rows(e.db, "SELECT * FROM human_responses").length === 1 && rows(e.db, "SELECT * FROM owner_prompts WHERE mode = 'task'").length === 1, "T8j a second tap changes nothing and files no second task", ja);
}
// T9. item by item: 1-5 approved, 6 and 7 declined with a reason; the card closes only when all seven are decided
{
  const e = mk();
  const C = await signIn(e.env, e.db, e.m);
  const typed = async (text, op) => { const j = await (await cmd(e.env, text, C)).json(); const a = (j.actions || []).find((x) => x.op === op); return a ? await (await run(e.env, op, a.args, C)).json() : { ok: false, preview: j }; };
  let jr = await typed("approve 100140 1-5", "approve");
  ok(jr.ok && one(e.db, "SELECT status FROM human_actions WHERE slug = ?", SLUG).status === "open" && /6-7 left/.test(jr.text), "T9 approving 1-5 leaves the card open with 6-7 left", jr);
  const t1 = rows(e.db, "SELECT prompt FROM owner_prompts WHERE mode = 'task'");
  ok(t1.length === 1 && /APPROVED items 1-5 of 7/.test(t1[0].prompt) && !/6\) The poster/.test(t1[0].prompt) && /Not approved here \(declined or still undecided\): 6-7/.test(t1[0].prompt), "T9a the hand-off names 1-5 only and leaves 6-7 alone", t1[0] && t1[0].prompt);
  jr = await typed("decline 100140 6,7 why the repository and registry are not mine", "decline");
  ok(jr.ok && one(e.db, "SELECT status FROM human_actions WHERE slug = ?", SLUG).status === "resolved", "T9b declining 6,7 closes the card (some approved: resolved)", jr);
  ok(rows(e.db, "SELECT * FROM owner_prompts WHERE mode = 'task'").length === 1, "T9c a decline files no task");
  const resolution = one(e.db, "SELECT resolution FROM human_actions WHERE slug = ?", SLUG).resolution;
  ok(/approved 1-5, declined 6-7/.test(resolution) && /the repository and registry are not mine/.test(resolution), "T9d the resolution says both, with the reason", resolution);
  const iss = one(e.db, "SELECT description FROM agent_issues WHERE id = 100140").description;
  ok(/OWNER-DECISION approve items 1-5/.test(iss) && /OWNER-DECISION decline items 6-7/.test(iss), "T9e the issue carries both decisions", iss.slice(-500));
  const e2 = mk();
  const C2 = await signIn(e2.env, e2.db, e2.m);
  const j2 = await (await cmd(e2.env, "approve all 100140 except 6", C2)).json();
  ok(j2.actions.find((x) => x.op === "approve").args.items.join() === "1,2,3,4,5,7", "T9f 'except 6' leaves item 6 out", j2.actions);
  const j3 = await (await cmd(e2.env, "approve 100140 9", C2)).json();
  ok(/no item 9/.test(j3.text) && !(j3.actions || []).some((x) => x.op), "T9g an item that is not on the card is refused", j3);
  const j4 = await (await cmd(e2.env, "decline 100140 all", C2)).json();
  const r4 = await run(e2.env, "decline", j4.actions.find((x) => x.op === "decline").args, C2);
  ok((await r4.json()).ok && one(e2.db, "SELECT status FROM human_actions WHERE slug = ?", SLUG).status === "dismissed" && rows(e2.db, "SELECT * FROM owner_prompts").length === 0, "T9h declining everything dismisses the card and files nothing");
}
// T10. the model is down (504): the matched intent comes back as buttons, stored; the quick buttons show while it thinks
{
  const e = mk({ ai: async () => new Response("{}", { status: 504 }) });
  const r = await cmd(e.env, "Could you please approve each of the seven fixes in agent_issues 100140 for me?"); const j = await r.json();
  ok(r.status === 202 && j.kind === "pending" && j.quick && j.quick.actions.some((a) => a.cmd === "approve ha:" + SLUG), "T10 the 202 carries quick buttons for what the line asks", j);
  await flush();
  const jb = await (await call(e.env, "/api/cmd/job/" + j.id)).json();
  ok(jb.status === "fallback" && jb.actions.some((a) => a.cmd === "approve ha:" + SLUG) && jb.actions.some((a) => a.cmd === "decline ha:" + SLUG) && jb.actions.some((a) => /^diagnose /.test(a.cmd)), "T10a the fallback answer has Approve, Decline and Diagnose buttons", jb);
  ok(!/Nothing was changed/.test(jb.answer) && /did not answer just now \(it timed out|the model service answered HTTP 504|unavailable|timed out/.test(jb.answer) && /UIA-SOURCE-FIDELITY-1/.test(jb.answer) && /none has run yet/.test(jb.answer), "T10b the answer is the match, not the generic stored-data block", jb.answer);
  const row = one(e.db, "SELECT actions_json, status FROM cmd_log WHERE id = ?", j.id);
  ok(row.status === "fallback" && JSON.parse(row.actions_json).length >= 3, "T10c actions_json is stored on the fallback row", row);
  const e2 = mk({ ai: async () => new Response("{}", { status: 504 }) });
  const j2 = await (await cmd(e2.env, "how is the weather in the data center")).json();
  await flush();
  const b2 = await (await call(e2.env, "/api/cmd/job/" + j2.id)).json();
  ok(j2.quick === undefined && /does not cover this question/.test(b2.answer) && b2.actions.map((a) => a.cmd).join() === "queue,suggest,issues", "T10d a line with no match keeps the stored-data answer and adds queue, suggest and issues buttons", b2);
  const e3 = mk();
  const j3 = await (await cmd(e3.env, "tell me about the fleet's papers")).json();
  ok(j3.kind === "pending" && j3.quick === undefined, "T10e an ordinary question has no quick block", j3);
  const j4 = await (await cmd(e3.env, "how many pageviews did the Ignorance Audit papers get in 2026, about 123456?")).json();
  ok(j4.kind === "pending" && j4.quick === undefined, "T10f a number and words that happen to match a card do not make buttons without a decision word", j4);
}
// T11. resolve closes only on evidence
{
  const e = mk();
  const C = await signIn(e.env, e.db, e.m);
  let j = await (await cmd(e.env, "resolve 100140", C)).json();
  ok(/cannot be resolved from its probe/.test(j.text) && /no verification/.test(j.text) && !(j.actions || []).some((a) => a.op), "T11 with no verification resolve refuses and offers diagnose", j);
  e.db.prepare("INSERT INTO remediation_verifications (issue_id, class, observed, pass, verified_at, verifier) VALUES (100140, 'issue-100140', '0 rows', 0, '2026-10-26 05:00:00', 'remediation-tick')").run();
  j = await (await cmd(e.env, "resolve 100140", C)).json();
  ok(/newest check FAILED/.test(j.text) && !(j.actions || []).some((a) => a.op), "T11a a failing newest check refuses", j);
  e.db.prepare("INSERT INTO remediation_verifications (issue_id, class, observed, expected, pass, verified_at, verifier) VALUES (100140, 'issue-100140', 'papers carry 94(3), 509-539', '1', 1, '2026-10-26 06:00:00', 'remediation-tick')").run();
  j = await (await cmd(e.env, "resolve 100140", C)).json();
  const a = (j.actions || []).find((x) => x.op === "iclose");
  ok(a && a.destructive && a.args.id === 100140 && /passed at 2026-10-26 06:00:00 \(remediation-tick\): observed papers carry 94\(3\), 509-539/.test(a.args.evidence), "T11b a passing newest check proposes the destructive iclose with that evidence", j);
  const r = await run(e.env, "iclose", a.args, C);
  ok((await r.json()).ok && one(e.db, "SELECT status FROM agent_issues WHERE id = 100140").status === "closed" && /passed at/.test(one(e.db, "SELECT close_evidence FROM issue_triage WHERE issue_id = 100140").close_evidence), "T11c the close runs behind the fresh code and stores the evidence");
  j = await (await cmd(e.env, "resolve 1001 the pageview probe reads 5000 views in the last hour", C)).json();
  ok((j.actions || []).some((x) => x.op === "iclose" && x.args.evidence.indexOf("5000 views") >= 0), "T11d typed evidence is used when given", j);
  j = await (await cmd(e.env, "resolve all the issues", C)).json();
  await flush();
  ok(/Nothing was changed\. "Fix all the issues"/.test(j.text || "") || j.kind === "pending" || /open fleet issues/.test(j.text || ""), "T11e 'resolve all the issues' still reaches the fix-all digest, not the resolver", j);
  const e2 = mk({ plain: true });
  const C2 = await signIn(e2.env, e2.db, e2.m);
  const jc = await (await cmd(e2.env, "resolve orcid-link-works", C2)).json();
  ok((jc.actions || []).some((x) => x.op === "done" && x.args.key === "ha:orcid-link-works"), "T11f resolving a card is done", jc);
}
// T12. diagnose is an open read; titles only for the owner
{
  const e = mk();
  e.db.prepare("INSERT INTO breach_selfheal_actions (check_class, subject, action) VALUES ('post-deploy-errors', 'qnfo-ops', 'reverted the deploy of qnfo-ops 2.1.0')").run();
  e.db.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, first_seen, issue_id) VALUES ('uia-source', 'owner papers drift from their sources', 'rc', 'rem', 'd', '2026-10-19', 100140)").run();
  e.db.prepare("INSERT INTO work_claims (path, intent, holder, issue_id, claimed_at, expires_at) VALUES ('issue:1001', 'fixing the lever', 'session_Z', 1001, ?, ?)").run(new Date().toISOString(), new Date(Date.now() + 36e5).toISOString());
  e.db.prepare("INSERT INTO issue_plans (issue_id, planned_at, outcome, task_id, path) VALUES (1001, '2026-10-26', 'planned', 'ct-1', 'qnfo-ops/worker.js')").run();
  e.db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, pr_url, merge_state, updated_at) VALUES ('ct-1', 'qnfo-workers', 'qnfo-ops/worker.js', 'g', 'pr', 'merge', 1, 'https://github.com/QNFO/qnfo-workers/pull/42', 'pending', '2026-10-26')").run();
  let j = await (await cmd(e.env, "diagnose")).json();
  ok(j.ok !== false && /blocked/.test(j.text) && /#100140/.test(j.text) && !/factual inconsistencies/.test(j.text) && (j.actions || []).some((a) => a.cmd === "diagnose 100140"), "T12 bare diagnose lists the blocked issues as buttons, without titles for a stranger", j);
  j = await (await cmd(e.env, "diagnose 100140")).json();
  ok(j.ok !== false && /Diagnosis of #100140 \[medium\] open \(pipeline; titles are shown to the signed-in owner\)/.test(j.text) && !/Ignorance Audit/.test(j.text), "T12a diagnose <id> is open to a stranger and hides the title", j.text);
  ok(/Closing probe issue-100140: active, last verdict fail/.test(j.text) && /attempt 230 of 3/.test(j.text) && /next check 2026-10-26 06:04/.test(j.text), "T12b it names the contract verdict, attempts and the next probe time", j.text);
  ok(/Doer: none assigned, planner verdict not-code, age rung 24h/.test(j.text) && /Failure mode uia-source/.test(j.text), "T12c the doer and plan come from v_issue_age_ladder; the failure mode is shown", j.text);
  ok(/What this means: It is waiting on your decision/.test(j.text) && !(j.actions || []).some((a) => /^approve/.test(a.cmd || "")), "T12d it says in plain words that the owner card is what it waits on (a stranger gets no approve button)", j.text);
  ok(noModel(e), "T12e no model was called");
  j = await (await cmd(e.env, "diagnose 1001")).json();
  ok(/Live work claim: session_Z until/.test(j.text) && /Code task ct-1: pr\/merge/.test(j.text) && /pull\/42/.test(j.text) && /Self-heal \(breach_selfheal_actions, qnfo-ops/.test(j.text) && /What this means: session_Z is working on it/.test(j.text), "T12f a live claim, the code task with its PR, and the self-heal rows for the issue's owner are shown", j.text);
  const C = await signIn(e.env, e.db, e.m);
  j = await (await cmd(e.env, "diagnose UIA-SOURCE-FIDELITY-1", C)).json();
  ok(/Ignorance Audit papers/.test(j.text) && (j.actions || []).some((a) => a.cmd === "approve ha:" + SLUG) && (j.actions || []).some((a) => a.cmd === "decline ha:" + SLUG) && (j.actions || []).some((a) => a.cmd === "retry 100140"), "T12g the owner sees the title, Approve, Decline and Retry buttons", j);
  j = await (await cmd(e.env, "why 100140", C)).json();
  ok(/Diagnosis of #100140/.test(j.text), "T12h 'why <id>' is a diagnosis", j);
  j = await (await cmd(e.env, "why is the sky blue")).json();
  ok(j.kind === "pending", "T12i a 'why' question about nothing the fleet holds still goes to the model", j);
  j = await (await cmd(e.env, "why is open_agent_issues 254 against < 0, and what is the smallest fix?")).json();
  ok(j.kind === "pending", "T12i2 the metric Diagnose control's question stays with the model", j);
  j = await (await cmd(e.env, "why is issue 100140 stuck?")).json();
  ok(/Diagnosis of #100140/.test(j.text), "T12i3 'why is issue <id> stuck' is a diagnosis", j);
  j = await (await cmd(e.env, "what is wrong with 100140")).json();
  ok(/Diagnosis of #100140/.test(j.text), "T12j 'what is wrong with <id>' is a diagnosis", j);
  e.db.prepare("INSERT INTO remediation_verifications (issue_id, class, observed, pass, verified_at) VALUES (1001, 'METRIC-7', 'ok', 1, '2026-10-26 07:00:00')").run();
  j = await (await cmd(e.env, "diagnose 1001", C)).json();
  ok((j.actions || []).some((a) => a.cmd === "resolve 1001") && /Closing probe METRIC-7/.test(j.text), "T12k a passing probe offers Resolve", j);
  j = await (await cmd(e.env, "diagnose 424242")).json();
  ok(/Nothing matches|No issue/.test(j.text || j.error || ""), "T12l an unknown id is said plainly", j);
}
// T13. cmdFallback alone in a vm (the offline suites cut it out of the worker): the 2-argument form is unchanged, the 3-argument form returns the match
{
  const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
  const fb = cut("function cmdModelReason(err) {", "// What the owner reads for a request that has no answer at all");
  const sb = { String, JSON, Math, Date, Array, Object }; vm.createContext(sb);
  vm.runInContext(fb + "\n__f = { cmdFallback };", sb);
  const f = sb.__f;
  const plain = f.cmdFallback({ v: null }, "glm: timeout 13s");
  ok(/does not cover this question/.test(plain) && /Nothing was changed/.test(plain), "T13 the 2-argument fallback is the stored-data answer, unchanged", plain);
  const withLocal = f.cmdFallback({ v: null }, "glm: timeout 13s", { matched: true, text: "Matched: X.", actions: [{ cmd: "approve ha:x", label: "Approve" }] });
  ok(/These are the actions I can take without it/.test(withLocal) && /Matched: X\./.test(withLocal) && !/Nothing was changed/.test(withLocal) && !/does not cover/.test(withLocal), "T13a with a match it is the match and says nothing has run", withLocal);
  const unmatched = f.cmdFallback({ v: null }, "glm: timeout 13s", { matched: false, text: "", actions: [{ cmd: "queue", label: "Queue" }] });
  ok(/does not cover this question/.test(unmatched), "T13b an unmatched local result keeps the stored-data answer", unmatched);
}
// T14. the cards: buttons for the signed-in owner only, per item on a numbered card, 44 px, wrapped on a phone, kept by the refresh
{
  const e = mk({ plain: true });
  const stranger = await (await call(e.env, "/")).text();
  ok(!/data-fleet-cmd="approve /.test(stranger) && !/class="dec"/.test(stranger) && !/Approve 1</.test(stranger), "T14 a signed-out visitor sees no decision buttons", stranger.length);
  ok(/data-fleet-cmd="info ha:uia-source-fidelity-100140"/.test(stranger), "T14a (the public Details button is still there)");
  const C = await signIn(e.env, e.db, e.m);
  const owner = await (await call(e.env, "/", { headers: C })).text();
  ok(/<div class="dec" data-dec="ha:uia-source-fidelity-100140">/.test(owner), "T14b the signed-in owner sees the decision block on the owner-gated card", owner.slice(0, 200));
  for (let n = 1; n <= 7; n++) ok(owner.includes('data-fleet-cmd="approve ha:' + SLUG + " " + n + '">Approve ' + n + "<") && owner.includes('data-fleet-cmd="decline ha:' + SLUG + " " + n + '">Decline ' + n + "<"), "T14c item " + n + " has its own Approve and Decline");
  ok(owner.includes('data-fleet-cmd="approve ha:' + SLUG + '">Approve all 7<') && owner.includes('data-fleet-cmd="diagnose ha:' + SLUG + '">Diagnose<') && /Decide each part: 0 of 7 decided/.test(owner), "T14d Approve all, Decline all and Diagnose are on the card", owner.slice(0, 100));
  ok(!/data-dec="ha:orcid-link-works"/.test(owner), "T14e a plain action card gets no decision block");
  ok(/\.dec button\{min-height:44px;min-width:44px/.test(owner) && /\.dec-i\{display:flex;flex-wrap:wrap/.test(owner) && /\.dec-t\{flex:1 1 240px;min-width:0/.test(owner) && /@media \(max-width:420px\)\{\.dec-b,\.dec-all\{width:100%\}/.test(owner), "T14f 44 px targets, wrapping rows and a 360 px rule are in the page CSS");
  ok(!/\.dec[^{]*:hover/.test(owner), "T14g nothing depends on hover");
  ok(/document\.addEventListener\('click',function\(e\)\{var t=e\.target&&e\.target\.closest&&e\.target\.closest\('\[data-fleet-cmd\]'\)/.test(owner), "T14h the click handler is delegated on document, so the refreshed #live fragment keeps working buttons");
  const frag = await (await call(e.env, "/?frag=1", { headers: C })).text();
  ok(frag.includes('data-fleet-cmd="approve ha:' + SLUG + ' 3"'), "T14i the 15 s fragment carries the same buttons", frag.length);
  const cs = /<script>(\(function\(\)\{var f=document\.getElementById\('cform'\)[\s\S]*?)<\/script>/.exec(owner);
  let parsed = true; try { new Function(cs[1]); } catch (err) { parsed = String(err); }
  ok(cs && parsed === true && /function acts\(p,list,c\)/.test(cs[1]) && /if\(j\.quick\)quick\(c,j\.quick\)/.test(cs[1]), "T14j the command-line script still parses and shows j.quick while the model thinks", parsed);
  await run(e.env, "decline", { key: "ha:" + SLUG, issue: 100140, items: [2], note: "" }, C);
  const after = await (await call(e.env, "/", { headers: C })).text();
  ok(/Decide each part: 1 of 7 decided/.test(after) && /&#10007; declined/.test(after) && after.includes('data-fleet-cmd="approve ha:' + SLUG + ' 1, 3-7">Approve the 6 left<'), "T14k a decided item shows its state and the card offers the undecided rest", after.slice(after.indexOf('class="dec"'), after.indexOf('class="dec"') + 1800));
  const left = await (await cmd(e.env, "approve ha:" + SLUG + " 1, 3-7", C)).json();
  ok(left.actions.find((x) => x.op === "approve").args.items.join() === "1,3,4,5,6,7" && /Already decided: 2 decline/.test(left.text), "T14k2 the button's own command parses to the six undecided items", left);
  const single = mk({ noCard: true, second: true });
  const C3 = await signIn(single.env, single.db, single.m);
  const sp = await (await call(single.env, "/", { headers: C3 })).text();
  ok(sp.includes('data-fleet-cmd="approve ha:pick-pricing-model">Approve<') && sp.includes('data-fleet-cmd="decline ha:pick-pricing-model">Decline<'), "T14l a card with no numbered parts gets plain Approve, Decline and Diagnose", sp.slice(0, 80));
}
// T15. retry
{
  const e = mk({ ai: async () => new Response("{}", { status: 504 }) });
  const C = await signIn(e.env, e.db, e.m);
  let j = await (await cmd(e.env, "retry 100140", C)).json();
  ok(j.ok && j.executed === "iretry" && /due now/.test(j.text) && /has not run yet/.test(j.text), "T15 retry <issue> marks the closing probe due now and says it has not run", j);
  const k = one(e.db, "SELECT next_due_at, attempts FROM remediation_contracts WHERE class = 'issue-100140'");
  ok(k.attempts === 230 && Math.abs(Date.parse(k.next_due_at.replace(" ", "T") + "Z") - Date.now()) < 120000, "T15a next_due_at is now and attempts are untouched", k);
  ok(/retry: closing probe issue-100140 marked due now/.test(one(e.db, "SELECT description FROM agent_issues WHERE id = 100140").description), "T15b the issue carries the stamp");
  j = await (await cmd(e.env, "retry 1002", C)).json();
  ok(j.ok === false && /no active remediation contract/.test(j.error), "T15c an issue with no contract says so", j);
  const s = await (await cmd(e.env, "retry 100140")).json();
  ok(!s.executed && s.actions[0].op === "iretry", "T15d a stranger gets a button, not a run", s);
  const q = await (await cmd(e.env, "what is the state of the cloud", C)).json();
  await flush();
  const r1 = await (await cmd(e.env, "retry", C)).json();
  ok(r1.kind === "pending", "T15e a bare retry asks the last unanswered question again (through the model path)", r1);
  await flush();
  const row = one(e.db, "SELECT text FROM cmd_log WHERE id = ?", r1.id);
  ok(row.text === "what is the state of the cloud", "T15f with the text of that question", row);
  const e2 = mk();
  const j2 = await (await cmd(e2.env, "retry")).json();
  ok(/no unanswered question/.test(j2.text), "T15g with nothing to retry it says so", j2);
  j = await (await cmd(e.env, "retry run 123456789", C)).json();
  ok(j.ok === false || j.executed === "rerun", "T15h 'retry run <id>' maps to the existing rerun", j);
}
// T16. the help and the model's allowed commands
{
  const e = mk();
  const j = await (await cmd(e.env, "help")).json();
  ok(/approve \[<card>\] \[items\]/.test(j.text) && /diagnose \[<issue>\]/.test(j.text) && /resolve <issue> \[evidence\]/.test(j.text) && /snooze <item>/.test(j.text), "T16 help lists the new verbs and keeps the old ones", j.text.slice(-900));
  const rx = /var CON_AI_CMD = (\/.*\/i);/.exec(src);
  const re = new Function("return " + rx[1])();
  ok(re.test("diagnose 100140") && re.test("approve ha:uia-source-fidelity-100140 3") && re.test("decline 100140") && !re.test("approve 100140; drop table x") && !re.test("sql! delete from notes"), "T16a the model may propose typing diagnose, approve and decline, nothing else", rx[1].slice(0, 120));
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

// FLEET-CONSOLE-1 offline suite: the owner console in the fleet command line (fleet.qnfo.org /api/cmd, /api/cmd/run).
// Proves: issue detail, backlog and queue-card detail are readable without leaving the page; SQL, logs and issue edits need
// the owner's emailed-code session; destructive operations (SQL writes, closes, dispatch, deploy, merge, non-GET calls)
// come back as a confirm button and need a fresh code; the loop token cannot run console actions; SQL writes refuse
// DROP/REPLACE/unbounded statements and protected tables and back up the rows they change first; worker calls carry no
// fleet credential; the model may only propose console read commands.
// Run: node qnfo-fleet-dashboard/fleet-console.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const net = [];
globalThis.fetch = async (u, o) => {
  const url = String(u && u.url || u);
  const host = new URL(url).host;
  net.push({ url, method: (o && o.method) || "GET", headers: (o && o.headers) || {}, body: o && o.body });
  if (host === "api.github.com") {
    if (/\/dispatches$/.test(url)) return new Response(null, { status: 204 });
    if (/\/pulls\/42\/merge$/.test(url)) return new Response(JSON.stringify({ merged: true, sha: "abcdef1234567890" }), { status: 200 });
    if (/\/pulls\/42$/.test(url)) return new Response(JSON.stringify({ number: 42, title: "t", state: "open", merged: false, draft: false, mergeable: true, mergeable_state: "clean", changed_files: 1, additions: 2, deletions: 1, head: { ref: "b", sha: "s1" }, base: { ref: "main" }, html_url: "https://github.com/QNFO/qnfo-workers/pull/42", body: "" }), { status: 200 });
    if (/\/check-runs/.test(url)) return new Response(JSON.stringify({ check_runs: [{ name: "deploy-gate", status: "completed", conclusion: "failure", details_url: "https://github.com/QNFO/qnfo-workers/actions/runs/123456789/job/1", output: { title: "boom" } }] }), { status: 200 });
    return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  }
  if (/^[a-z0-9-]+\.q08\.workers\.dev$/.test(host)) return new Response("{\"ok\":true}", { status: 200, headers: { "content-type": "application/json" } });
  return new Response("{}", { status: 503 });
};

const STATE = { schema_version: "fleet-state/v1", generated_at: new Date().toISOString(), version: "t", verdict: "HEALTHY", window: {}, fleet: { workers: 44 }, totals: {}, scheduled: [], audits: [], probes: [], integration: {}, report_card: {}, chains: [], device: {}, issues: [], issue_counts: { err: 0, warn: 0, total: 0 }, queues: [], coverage: {}, unattributed_errors: 0, recovered_workers: [], error_workers: [], loop: {}, meta: {}, refresh_ms: 1 };
const LOOP = "loop-secret-123";

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
  CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, event_hash TEXT, ts_ms INTEGER, ingested_at TEXT, script_name TEXT, event_type TEXT, outcome TEXT, url TEXT, method TEXT, status INTEGER, cpu_ms REAL, wall_ms REAL, logs_json TEXT, exceptions_json TEXT);
  CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap INTEGER, target INTEGER, current INTEGER, unit TEXT, updated_at TEXT);
  CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT, flag INTEGER DEFAULT 0);
  CREATE VIEW v_issue_queue AS SELECT ROW_NUMBER() OVER (ORDER BY q.prank, q.id) AS pos, q.* FROM (SELECT a.id, CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END AS prank, a.priority, a.title, a.category, a.source, t.owner, t.triage_state, CASE WHEN COALESCE(a.description,'') LIKE '%code-task:%' THEN 1 ELSE 0 END AS has_code_task, CASE WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'active') THEN 1 ELSE 0 END AS has_contract, a.linked_session, a.created_at, a.updated_at FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = 'open') q;`);
  db.prepare("INSERT INTO fleet_dashboard_state VALUES (1,?,?,1)").run(new Date().toISOString(), JSON.stringify(STATE));
  db.prepare("INSERT INTO human_actions (slug,title,why,action,source) VALUES ('orcid-link-works','Add the selected works to ORCID','issue 1001 found the gap','act','owner-only:x')").run();
  db.prepare("INSERT INTO agent_issues (id,title,description,priority,created_at,updated_at) VALUES (1001,'METRIC-TRIGGER-7: pageviews low','The lever is X.','medium',1791217360000,1791217360000)").run();
  db.prepare("INSERT INTO agent_issues (id,title,priority,created_at,updated_at) VALUES (1002,'CRIT thing','critical',1791217360000,1791217360000)").run();
  db.prepare("INSERT INTO issue_triage (issue_id,rc,owner,sla_due_at) VALUES (1001,'AUTOTRIAGE-2','qnfo-ops',datetime('now'))").run();
  db.prepare("INSERT INTO remediation_contracts (class,issue_id,verify_probe,verify_transport,last_verdict) VALUES ('METRIC-7',1001,'SELECT 1','d1-query','fail')").run();
  db.prepare("INSERT INTO remediation_verifications (issue_id,transport,observed,pass,verifier) VALUES (1001,'d1-query','0 pageviews',0,'remediation-tick')").run();
  db.prepare("INSERT INTO work_claims (path,intent,holder,issue_id,claimed_at,expires_at) VALUES ('issue:1001','fix pageviews','session_X',1001,'2026-10-05T10:00:00Z','2026-10-05T12:00:00Z')").run();
  db.prepare("INSERT INTO issue_plans (issue_id,planned_at,outcome,task_id,path) VALUES (1001,'2026-10-05','planned','ct-1','qnfo-ops/worker.js')").run();
  db.prepare("INSERT INTO code_tasks (id,repo,path,goal,status,step,attempts,pr_url,updated_at) VALUES ('ct-1','qnfo-workers','qnfo-ops/worker.js','g','pr','merge',1,'https://github.com/QNFO/qnfo-workers/pull/42','2026-10-05')").run();
  db.prepare("INSERT INTO worker_logs (event_hash,ts_ms,ingested_at,script_name,event_type,outcome,url,status,exceptions_json) VALUES ('h',1791217360000,'x','qnfo-ops','fetch','exception','https://x/confirm?t=SECRET9',500,'[\"TypeError: boom\"]')").run();
  db.prepare("INSERT INTO fleet_budget VALUES ('ai_usd',10,5,6,'usd','x')").run();
  db.prepare("INSERT INTO notes (id,body) VALUES (1,'a where b'),(2,'c'),(3,'d')").run();
  const prep = (sql) => { let a = []; const q = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; }, async all() { return { results: db.prepare(sql).all(...a) }; }, async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, async first() { return db.prepare(sql).get(...a) || null; } }; return q; };
  const aiCalls = [], svcCalls = [];
  const ai = extra.ai || (async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }));
  const env = Object.assign({ AUDIT: { prepare: prep, async batch(list) { const out = []; db.exec("BEGIN"); try { for (const s of list) out.push(await s.run()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } return out; } }, LOOP_TOKEN: LOOP, GITHUB_TOKEN: "ghs_test", SVC_QNFO_AI: { fetch: async (u, o) => { aiCalls.push(o); return ai(u, o); } }, SVC_QNFO_OPS: { fetch: async (u, o) => { svcCalls.push({ u, o }); return new Response("ops ok", { status: 200 }); } } }, extra.env || {});
  return { env, db, aiCalls, svcCalls };
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
async function signIn(env, m) {
  await post(env, "/api/cmd/code", {});
  const code = /(\d{6})/.exec(m.sent[m.sent.length - 1].subject)[1];
  const r = await post(env, "/api/cmd/verify", { code });
  return { Cookie: /fleet_cmd=[0-9a-f]{64}/.exec(r.headers.get("Set-Cookie"))[0] };
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

// A. reading: everything about a task without leaving the page (open, like every fleet read)
{
  const { env } = mk();
  let j = await (await cmd(env, "issue 1001")).json();
  ok(j.ok && /#1001 \[medium\] open - queue position 2/.test(j.text) && /The lever is X\./.test(j.text), "A1 issue <id> shows the row, its queue position and description", j);
  ok(/Triage: owner qnfo-ops/.test(j.text) && /METRIC-7 - active, last verdict fail/.test(j.text) && /FAIL .* observed 0 pageviews/.test(j.text) && /session_X/.test(j.text) && /Code task ct-1: pr\/merge/.test(j.text), "A2 triage, contracts, verifications, claims and the code task are in the same answer", j.text);
  ok(j.actions.some((a) => a.cmd === "prio 1001 critical") && j.actions.some((a) => a.cmd === "pr 42") && j.actions.some((a) => a.cmd === "logs qnfo-ops"), "A3 follow-ups are one-tap command buttons", j.actions);
  j = await (await cmd(env, "issue 9")).json();
  ok(/No issue #9/.test(j.text), "A4 an unknown id says so");
  j = await (await cmd(env, "backlog")).json();
  ok(/^1\. #1002 \[critical\]/.test(j.text) && /2\. #1001 \[medium\]/.test(j.text), "A5 backlog is the priority queue, critical first, with ids", j.text);
  j = await (await cmd(env, "info orcid")).json();
  ok(/human_actions #1/.test(j.text) && j.actions.some((a) => a.cmd === "issue 1001"), "A6 info on a queue card shows the card row and links the issue it names", j);
  const h = await (await call(env, "/")).text();
  ok(h.includes('data-fleet-cmd="info ha:orcid-link-works"') && h.includes("[data-fleet-cmd]"), "A7 every queue card has a Details button wired to the pinned command line");
  j = await (await cmd(env, "pr 42")).json();
  ok(/Checks: 1 total, 1 failing/.test(j.text) && j.actions.some((a) => a.op === "rerun" && a.args.run === 123456789) && j.actions.some((a) => a.op === "merge" && a.destructive), "A8 pr <n> shows failing checks with re-run and merge buttons", j);
  j = await (await cmd(env, "help")).json();
  ok(/issue <id>/.test(j.text) && /sql!/.test(j.text) && /Sign in:/.test(j.text), "A9 help lists the console");
}
// B. owner-only reads and actions; a stranger gets the code prompt and nothing changes
{
  const { env, db } = mk();
  let r = await cmd(env, "sql select * from fleet_budget"); let j = await r.json();
  ok(r.status === 401 && j.need === "code" && !j.text, "B1 SQL needs the owner's code", j);
  r = await cmd(env, "logs qnfo-ops"); j = await r.json();
  ok(r.status === 401 && j.need === "code", "B2 worker logs need the owner's code");
  j = await (await cmd(env, "prio 1001 high")).json();
  ok(!j.executed && j.actions[0].op === "iprio", "B3 a stranger's priority change is only a button");
  r = await run(env, "iprio", { id: 1001, priority: "high" }); j = await r.json();
  ok(r.status === 401 && j.need === "code" && db.prepare("SELECT priority FROM agent_issues WHERE id=1001").get().priority === "medium", "B4 running it without the code is refused and nothing changes");
  r = await run(env, "sqlw", { db: "audit", sql: "UPDATE notes SET flag = 1 WHERE id = 2" }, { "x-loop-token": LOOP }); j = await r.json();
  ok(!j.ok && /loop token cannot/.test(j.error) && db.prepare("SELECT flag FROM notes WHERE id=2").get().flag === 0, "B5 the fleet's loop token cannot run console actions", j);
  r = await run(env, "merge", { pr: 42 }, { "x-loop-token": LOOP }); j = await r.json();
  ok(!j.ok && !net.some((n) => /\/merge$/.test(n.url)), "B6 nor merge a PR");
}
// C. the owner: reads, edits, and destructive operations behind a confirm button and a fresh code
{
  const m = mailer();
  const { env, db, svcCalls } = mk({ env: { SEND_EMAIL: m.SEND_EMAIL } });
  const C = await signIn(env, m);
  let j = await (await cmd(env, "sql select node_class, cap from fleet_budget", C)).json();
  ok(j.ok && /node_class\tcap\nai_usd\t10/.test(j.text), "C1 the owner reads any table", j);
  j = await (await cmd(env, "logs qnfo-ops", C)).json();
  ok(/TypeError: boom/.test(j.text) && /t=\*\*\*/.test(j.text) && !/SECRET9/.test(j.text), "C2 logs show the exception, with URL tokens masked", j.text);
  j = await (await cmd(env, "sql select 1; delete from notes", C)).json();
  ok(!j.ok && /One statement/.test(j.error), "C3 one statement at a time");
  j = await (await cmd(env, "sql delete from notes where id = 1", C)).json();
  ok(!j.ok && /sql!/.test(j.error) && db.prepare("SELECT COUNT(*) n FROM notes").get().n === 3, "C4 a write typed as 'sql' is refused and pointed to sql!");
  for (let i = 10; i < 260; i++) db.prepare("INSERT INTO notes (id, body) VALUES (?, 'bulk')").run(i);
  j = await (await cmd(env, "sql select id from notes where body = 'bulk'", C)).json();
  ok(j.ok && /\(200 of 201 rows\)/.test(j.text), "C4b a large read is cut at 200 rows (201 fetched to know there is more)", j.text && j.text.slice(-60));
  db.prepare("DELETE FROM notes WHERE body = 'bulk'").run();
  j = await (await cmd(env, "sql select replace(body, 'a', 'b') as r from notes where id = 1", C)).json();
  ok(j.ok && /b where b/.test(j.text), "C5 replace() as a function is a read", j);
  j = await (await cmd(env, "prio 1001 high", C)).json();
  ok(j.executed === "iprio" && db.prepare("SELECT priority FROM agent_issues WHERE id=1001").get().priority === "high" && /queue position 2/.test(j.text), "C6 the owner's priority change runs at once", j);
  j = await (await cmd(env, "owner 1001 qnfo-fleet-control", C)).json();
  ok(j.executed === "iowner" && db.prepare("SELECT owner FROM issue_triage WHERE issue_id=1001").get().owner === "qnfo-fleet-control", "C7 owner reassignment");
  j = await (await cmd(env, "comment 1001 check the RUM filter first", C)).json();
  ok(j.executed === "icomment" && /fleet console\] check the RUM filter first$/.test(db.prepare("SELECT description FROM agent_issues WHERE id=1001").get().description), "C8 comments append to the issue, stamped");
  j = await (await cmd(env, "codetask 1002 qnfo-ops/worker.js var VERSION = ", C)).json();
  ok(j.executed === "icodetask" && /\ncode-task: repo=qnfo-workers path=qnfo-ops\/worker\.js\ncode-anchor: var VERSION =$/.test(db.prepare("SELECT description FROM agent_issues WHERE id=1002").get().description), "C9 codetask hands the issue to the code loop with the ACT-BRIDGE lines", j);
  ok(db.prepare("SELECT COUNT(*) n FROM cmd_log WHERE kind='action' AND text LIKE 'icodetask%'").get().n === 1, "C10 auto-run owner actions are written to cmd_log");
  j = await (await cmd(env, "close 1001 fixed", C)).json();
  ok(/at least 20 characters/.test(j.text) && !(j.actions && j.actions.length), "C11 a close without real evidence is refused");
  j = await (await cmd(env, "close 1001 pageviews_30d read 412 at 16:00Z (v_metric_trigger_state hit=0)", C)).json();
  ok(!j.executed && j.actions[0].op === "iclose" && j.actions[0].destructive, "C12 close comes back as a confirm button");
  let r = await run(env, "iclose", j.actions[0].args, C); j = await r.json();
  const row = db.prepare("SELECT a.status, a.close_channel, t.close_evidence FROM agent_issues a JOIN issue_triage t ON t.issue_id=a.id WHERE a.id=1001").get();
  ok(j.ok && row.status === "closed" && row.close_channel === "owner:fleet-console" && /hit=0/.test(row.close_evidence), "C13 confirming closes it with the evidence in issue_triage", row);
  j = await (await cmd(env, "reopen 1001", C)).json();
  ok(j.executed === "ireopen" && db.prepare("SELECT status FROM agent_issues WHERE id=1001").get().status === "open" && db.prepare("SELECT reopened_count FROM issue_triage WHERE issue_id=1001").get().reopened_count === 1, "C14 reopen");
  // SQL writes
  const refused = [
    ["sql! delete from notes", /without WHERE/],
    ["sql! update notes set flag = 1", /without WHERE/],
    ["sql! drop table notes", /migration/],
    ["sql! alter table notes add column x", /migration/],
    ["sql! update fleet_budget set cap = 99 where node_class = 'ai_usd'", /read-only/],
    ["sql! delete from remediation_verifications where id = 1", /read-only/],
    ["sql! insert or replace into notes (id, body) values (1, 'x')", /REPLACE/],
    ["sql! create trigger t after insert on notes begin delete from notes; end", /One statement|Triggers/],
    ["sql! update notes set flag = (select 1 where 1) where id = 1", /subquery/],
    ["sql! update issue_triage set sla_due_at = '2027-01-01' where issue_id = 1001", /read-only/],
    ["sql! delete from sqlite_sequence where name = 'notes'", /internal tables/]
  ];
  for (const [q, rx] of refused) {
    j = await (await cmd(env, q, C)).json();
    ok(rx.test(j.text || j.error || "") && !(j.actions && j.actions.length), "C15 refused: " + q, j);
  }
  ok(db.prepare("SELECT cap FROM fleet_budget").get().cap === 10 && db.prepare("SELECT COUNT(*) n FROM notes").get().n === 3, "C16 nothing refused was written");
  j = await (await cmd(env, "sql! update notes set flag = 1, body = 'x where y' where id in (1, 2)", C)).json();
  ok(!j.executed && j.actions[0].op === "sqlw" && j.actions[0].destructive && /rows backed up first/.test(j.text), "C17 a SQL write comes back as a confirm button", j);
  r = await run(env, "sqlw", j.actions[0].args, C); j = await r.json();
  const bk = db.prepare("SELECT table_name, row_count, rows_json FROM console_backups").get();
  ok(j.ok && /2 rows changed/.test(j.text) && bk && bk.table_name === "notes" && bk.row_count === 2 && JSON.parse(bk.rows_json)[0].body === "a where b" && db.prepare("SELECT body FROM notes WHERE id=1").get().body === "x where y", "C18 the rows are backed up before the UPDATE runs", { j, bk });
  r = await run(env, "sqlw", { db: "audit", sql: "DELETE FROM notes WHERE id = 3" }, C); j = await r.json();
  ok(j.ok && db.prepare("SELECT COUNT(*) n FROM console_backups").get().n === 2 && db.prepare("SELECT COUNT(*) n FROM notes").get().n === 2, "C19 DELETE ... WHERE backs up then deletes");
  // GitHub and workers
  net.length = 0;
  j = await (await cmd(env, "deploy qnfo-ops qnfo-ai", C)).json();
  ok(!j.executed && j.actions[0].op === "dispatch" && j.actions[0].args.workflow === "canonical-deploy.yml", "C20 deploy is a confirm button for the canonical path");
  r = await run(env, "dispatch", j.actions[0].args, C); j = await r.json();
  const d = net.find((n) => /\/dispatches$/.test(n.url));
  ok(j.ok && d && /\/repos\/QNFO\/qnfo-workers\/actions\/workflows\/canonical-deploy\.yml\/dispatches$/.test(d.url) && JSON.parse(d.body).ref === "main" && JSON.parse(d.body).inputs.workers === "qnfo-ops qnfo-ai", "C21 deploy dispatches canonical-deploy.yml on main", d);
  j = await (await cmd(env, "dispatch cf-ops-actions.yml action=report target=\"a b\"", C)).json();
  ok(j.actions[0].args.inputs.action === "report" && j.actions[0].args.inputs.target === "a b", "C22 dispatch parses k=v inputs, quoted values too", j.actions[0]);
  {
    // CodeQL js/redos (PR 623): the CodeQL attack shape answers at once instead of backtracking.
    const t0 = Date.now();
    j = await (await cmd(env, "dispatch -.yml" + " _=\"\"".repeat(120) + " !", C)).json();
    ok(Date.now() - t0 < 1000 && /up to 10 k=v pairs/.test(j.text) && !(j.actions && j.actions.length), "C22b crafted dispatch inputs are refused in linear time", { ms: Date.now() - t0, j });
    j = await (await cmd(env, "dispatch cf-ops-actions.yml action=report target=\"unclosed", C)).json();
    ok(/k=v pairs/.test(j.text) && !(j.actions && j.actions.length), "C22c a malformed input list is refused, never half-parsed");
  }
  r = await run(env, "merge", { pr: 42 }, C); j = await r.json();
  const mg = net.find((n) => /\/pulls\/42\/merge$/.test(n.url));
  ok(j.ok && mg && mg.method === "PUT" && JSON.parse(mg.body).merge_method === "squash", "C23 merge squash-merges through the GitHub API");
  j = await (await cmd(env, "call qnfo-ops GET /health", C)).json();
  ok(j.executed === "callr" && svcCalls.length === 1 && /HTTP 200/.test(j.text) && /service binding/.test(j.text), "C24 a GET call runs at once over the service binding", j);
  j = await (await cmd(env, "call radar-hub POST /run {\"x\":1}", C)).json();
  ok(!j.executed && j.actions[0].op === "callw" && j.actions[0].destructive, "C25 a POST call is a confirm button");
  net.length = 0;
  r = await run(env, "callw", j.actions[0].args, C); j = await r.json();
  const cw = net.find((n) => n.url === "https://radar-hub.q08.workers.dev/run");
  ok(j.ok && cw && cw.method === "POST" && cw.body === "{\"x\":1}" && !JSON.stringify(cw.headers).includes(LOOP), "C26 worker calls carry no fleet credential", cw);
  // step-up
  db.prepare("UPDATE owner_sessions SET verified_ms = verified_ms - 20 * 60000").run();
  r = await run(env, "iclose", { id: 1002, evidence: "a long enough piece of evidence here" }, C); j = await r.json();
  ok(r.status === 401 && j.need === "stepup" && db.prepare("SELECT status FROM agent_issues WHERE id=1002").get().status === "open", "C27 after 15 minutes a close needs a fresh code");
  r = await run(env, "sqlw", { db: "audit", sql: "DELETE FROM notes WHERE id = 1" }, C); j = await r.json();
  ok(r.status === 401 && j.need === "stepup" && db.prepare("SELECT COUNT(*) n FROM notes").get().n === 2, "C28 and so does a SQL write");
  j = await (await cmd(env, "prio 1002 low", C)).json();
  ok(j.executed === "iprio", "C29 non-destructive edits keep working in the 12h session");
}
// D. the model may propose console read commands only
{
  const m = mailer();
  const content = JSON.stringify({ answer: "Look at the issue.", actions: [{ op: "cmd", text: "issue 1001" }, { op: "cmd", text: "sql! delete from agent_issues where id = 1001" }, { op: "cmd", text: "merge 42" }] });
  const { env } = mk({ env: { SEND_EMAIL: m.SEND_EMAIL }, ai: async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }) });
  const r = await cmd(env, "what is going on with page views and why is it low");
  const j = await r.json();
  await flush();
  const job = await (await call(env, "/api/cmd/job/" + j.id)).json();
  ok(job.answer === "Look at the issue." && job.actions.length === 1 && job.actions[0].cmd === "issue 1001", "D1 only the read command survives", job);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

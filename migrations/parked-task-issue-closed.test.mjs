// PARKED-TASK-ISSUE-CLOSED-1 offline suite: replays migrations/2026-10-19-parked-task-issue-closed.sql on node:sqlite against the live table and
// trigger texts (migrations/parked-task-issue-closed.fixtures.json, copied from qnfo-audit sqlite_master on 2026-10-19: every trigger on
// agent_issues, code_tasks, decision_log and issue_lifecycle, plus the human_actions and remediation_contracts triggers an UPDATE OF status
// can reach, which are parsed for the depth count and not created) and the seven code_tasks rows that were parked at needs_human when measured.
// Proves: the one-time statement supersedes exactly the parked tasks whose issue is closed with close evidence (ct_im100072, ct_im100073,
// ct_im100075, ct_im100091 by id, ct_plain_language_1 by the explicit pair, a "[issue #N]" goal) and leaves ct_im100142 and ct_agpn0vekiunr2f (their
// issues are open), a closed issue without evidence, a wontfix and every row of another status; last_error keeps its text and gains the reason;
// the trigger does the same in the statement that closes an issue, never on another update, never twice, never aborts, coexists with the five
// triggers already on UPDATE OF status of agent_issues and is a leaf of the trigger graph (no deeper chain than before); a reopened issue leaves its
// task superseded; the detector reads 0 and 1 on a re-parked task; the Rollback line restores; re-applying is harmless; and the suite FAILS on the
// pre-fix state (the defect is reproduced first, and the same checks fail on the file without its trigger and without its one-time statement).
// Run: node migrations/parked-task-issue-closed.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const root = (f) => new URL("../" + f, import.meta.url);
// PARKED_TASK_SQL points the suite at another file (an empty file is the pre-fix state and must make this suite exit 1)
const FILE = process.env.PARKED_TASK_SQL || here("2026-10-19-parked-task-issue-closed.sql");
const sql = readFileSync(FILE, "utf8");
const fx = JSON.parse(readFileSync(here("parked-task-issue-closed.fixtures.json"), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const NOW = Date.now();
const MARK = "(PARKED-TASK-ISSUE-CLOSED-1)";
const reason = (n) => "superseded: issue " + n + " closed with evidence " + MARK;

// ---- the fixture database: live DDL, live triggers --------------------------------------------------------------------------------------
function build() {
  const db = new DatabaseSync(":memory:");
  for (const s of Object.values(fx.tables)) db.exec(s);
  db.exec("CREATE TABLE metric_registry (metric TEXT)"); // read by decision_predictions_parse
  for (const t of Object.values(fx.triggers)) db.exec(t.sql);
  return db;
}

// ---- the live rows: code_tasks status needs_human, measured 2026-10-19 (texts shortened only where they ran past a line) ------------------
const LIVE_TASKS = [
  ["ct_plain_language_1", "Implement plain-language summaries for qnfo-gateway (PLAIN-LANGUAGE-1). Add an \"In plain language\" section to BOTH the quick-read digest and the living-paper page", "model @cf/openai/gpt-oss-120b: noop-proposal: only comments changed; a comment changes no behaviour, the goal needs a change to the code itself [2 no-op proposals in a row: needs a person or a narrower goal]", "2026-10-19T09:07:25.242Z"],
  ["ct_agpn0vekiunr2f", "[issue #100047] IDEAS-CAP-GENERATED-RELEASE-1: generated ACCEPTs held by the research admission cap", "model @cf/openai/gpt-oss-120b: noop-proposal: the edit changes only the words inside string literals or comments (1 line); it builds nothing of the goal. Change the code's behaviour, not message text [2 no-op proposals in a row]", "2026-10-19T08:21:02.871Z"],
  ["ct_im100072", "SCHEMA-INDEX-NO-REFRESH-1: d1_schema_index has no scheduled rebuild; 6 of 8 planes were 19 days stale", "MERGE-SCOPE-AT-READ-1: qnfo-fleet-control is a control-plane or code-loop worker: the merge runner never opens or merges its pull request (CM_DENY, human_actions 21)", "2026-10-19T08:36:46.066Z"],
  ["ct_im100073", "OPS-GH-READ-TOOLS-1: ops endpoint has no direct GitHub issues/Projects read tool; access is indirect", "MERGE-SCOPE-AT-READ-1: qnfo-ops is a control-plane or code-loop worker: the merge runner never opens or merges its pull request (CM_DENY, human_actions 21)", "2026-10-19T08:59:04.176Z"],
  ["ct_im100075", "CODE-LOOP-THROUGHPUT-1: raise plan/lane ceilings now that ticks are proven not to be the constraint", "MERGE-SCOPE-AT-READ-1: qnfo-code-orchestrator is a control-plane or code-loop worker: the merge runner never opens or merges its pull request (CM_DENY, human_actions 21)", "2026-10-19T08:36:46.035Z"],
  ["ct_im100091", "CF-OBS-ISSUE-1: qnfo-fleet-control: {\"completion_tokens\":\"<number>\",\"evt\":\"<string>\"}", "MERGE-SCOPE-AT-READ-1: qnfo-fleet-control is a control-plane or code-loop worker: the merge runner never opens or merges its pull request (CM_DENY, human_actions 21)", "2026-10-19T09:58:41.769Z"],
  ["ct_im100142", "ABOUT-STATUS-FUNDING-1: qnfo.org/about states status, funding, author record and how to check the work -- issue #100142 (RED-DRAIN-1 dispatch)", "model @cf/moonshotai/kimi-k2.7-code: noop-proposal: the edit changes only the words inside string literals or comments (1 line); it builds nothing of the goal. Change the code's behaviour, not message text", "2026-10-19T11:57:21.563Z"],
];
const LIVE_PARKED = LIVE_TASKS.map((t) => t[0]);
const EXPECT_SUPERSEDED = ["ct_goalmap1", "ct_im100072", "ct_im100073", "ct_im100075", "ct_im100091", "ct_plain_language_1"]; // the five live rows and one goal-mapped
const EXPECT_ISSUE = { ct_goalmap1: 100201, ct_im100072: 100072, ct_im100073: 100073, ct_im100075: 100075, ct_im100091: 100091, ct_plain_language_1: 100029 };
// rows that must NOT move: issue open, closed without evidence, wontfix, an id that only shares a prefix, another status
const EXPECT_PARKED = ["ct_agpn0vekiunr2f", "ct_im100142", "ct_im1000", "ct_im100204", "ct_im100205", "ct_im100206"];

function addIssue(db, id, title, status, evidence, extra = {}) {
  if (status === "closed-direct") { // a legacy row closed without close evidence (the BEFORE INSERT guard allows a new row)
    db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, '', 'test', 'optimization', 'medium', 'closed', ?, ?)").run(id, title, NOW, NOW);
    return;
  }
  db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'test', ?, 'medium', 'open', ?, ?)")
    .run(id, title, extra.description || "", extra.category || "optimization", NOW, NOW);
  if (evidence) db.prepare("UPDATE issue_triage SET close_evidence = ? WHERE issue_id = ?").run(evidence, id);
  if (status !== "open") db.prepare("UPDATE agent_issues SET status = ?, updated_at = ? WHERE id = ?").run(status, NOW + 1, id);
}
function addTask(db, id, goal, status, lastError, updatedAt) {
  db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, last_error, ctx, created_at, updated_at) VALUES (?, 'qnfo-workers', 'qnfo-gateway/worker.js', ?, ?, 'propose', 3, ?, '{}', '2026-10-18T20:00:00.000Z', ?)")
    .run(id, goal, status, lastError, updatedAt || "2026-10-19T10:00:00.000Z");
}
const EV = "remediation_verifications pass=1 (test evidence)";
// closeNow = issues that are closed when the migration is merged; late = closed afterwards (the equivalence check closes them through the trigger)
function seed(db, closeNow = true) {
  const st = (s) => (closeNow ? s : "open");
  addIssue(db, 100029, "GATEWAY-UNTRACKED-DEPLOY-1: qnfo-gateway live 3.25.0-plain-language-1 exists in no branch or PR", st("closed"), EV, { description: "code_tasks ct_plain_language_1 (queued, no issue) is the same feature" });
  addIssue(db, 100072, "SCHEMA-INDEX-NO-REFRESH-1: d1_schema_index has no scheduled rebuild", st("closed"), EV);
  addIssue(db, 100073, "OPS-GH-READ-TOOLS-1: ops endpoint has no direct GitHub read tool", st("closed"), EV);
  addIssue(db, 100075, "CODE-LOOP-THROUGHPUT-1: raise plan/lane ceilings", st("closed"), EV);
  addIssue(db, 100091, "CF-OBS-ISSUE-1: qnfo-fleet-control logs an unfilled template", st("closed"), EV);
  addIssue(db, 100047, "IDEAS-CAP-GENERATED-RELEASE-1: generated ACCEPTs held by the research admission cap", "open");
  addIssue(db, 100142, "ABOUT-STATUS-FUNDING-1: qnfo.org/about states status, funding, author record", "open");
  addIssue(db, 100201, "TEST-GOAL-MAPPED-1: closed as resolved", st("resolved"), EV);
  addIssue(db, 1000, "TEST-PREFIX-1: an open issue whose id starts with another id", "open");
  addIssue(db, 100204, "TEST-LEGACY-CLOSE-1: closed before close evidence was required", "closed-direct");
  addIssue(db, 100205, "TEST-WONTFIX-1: declined", st("wontfix"), EV);
  addIssue(db, 100206, "TEST-LIVE-CLOSE-1: closes after the migration", "open");
  for (const [id, goal, err, upd] of LIVE_TASKS) addTask(db, id, goal, "needs_human", err, upd);
  addTask(db, "ct_goalmap1", "[issue #100201] TEST-GOAL-MAPPED-1: a task whose goal names its issue", "needs_human", null, "2026-10-19T10:01:00.000Z");
  addTask(db, "ct_im1000", "[issue #1000] TEST-PREFIX-1", "needs_human", "noop-proposal", "2026-10-19T10:02:00.000Z");
  addTask(db, "ct_im100204", "TEST-LEGACY-CLOSE-1", "needs_human", "legacy parked", "2026-10-19T10:03:00.000Z");
  addTask(db, "ct_im100205", "TEST-WONTFIX-1", "needs_human", "wontfix parked", "2026-10-19T10:04:00.000Z");
  addTask(db, "ct_im100206", "TEST-LIVE-CLOSE-1", "needs_human", "MERGE-SCOPE-AT-READ-1: x", "2026-10-19T10:05:00.000Z");
  // other statuses of tasks whose issue is closed: untouched by the file and by the trigger
  addTask(db, "ct_q100072", "[issue #100072] retry", "queued", null, "2026-10-19T10:06:00.000Z");
  addTask(db, "ct_m100072", "[issue #100072] merged earlier", "merged", null, "2026-10-19T10:07:00.000Z");
  addTask(db, "ct_f100073", "[issue #100073] failed", "failed", "boom", "2026-10-19T10:08:00.000Z");
  addTask(db, "ct_s100075", "[issue #100075] already superseded", "superseded", "superseded: by a session", "2026-10-19T10:09:00.000Z");
}
const closeIssue = (db, id, evidence = EV, status = "closed") => {
  db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'test', 'triaged', 'qnfo-ops', '2026-10-19', ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence").run(id, evidence);
  db.prepare("UPDATE agent_issues SET status = ?, updated_at = ? WHERE id = ?").run(status, NOW + 5, id);
};
const task = (db, id) => db.prepare("SELECT * FROM code_tasks WHERE id = ?").get(id);
const tasks = (db) => Object.fromEntries(db.prepare("SELECT * FROM code_tasks ORDER BY id").all().map((r) => [r.id, r]));
const ids = (rows) => rows.map((r) => r.id).sort();
const statusOf = (db, s) => ids(db.prepare("SELECT id FROM code_tasks WHERE status = ?").all(s));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// an oracle written in JS, independent of the view: a needs_human task whose mapped issue is closed or resolved with close evidence
function oracle(db) {
  const out = [];
  for (const t of db.prepare("SELECT id, goal FROM code_tasks WHERE status = 'needs_human'").all()) {
    const cand = [];
    let m = /^ct_im([1-9]\d*)$/.exec(t.id); if (m) cand.push(Number(m[1]));
    m = /^\[issue #([1-9]\d*)\]/.exec(t.goal); if (m) cand.push(Number(m[1]));
    if (t.id === "ct_plain_language_1") cand.push(100029);
    const hit = cand.find((n) => {
      const a = db.prepare("SELECT status FROM agent_issues WHERE id = ?").get(n);
      const e = db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id = ?").get(n);
      return a && (a.status === "closed" || a.status === "resolved") && e && String(e.close_evidence || "").trim() !== "";
    });
    if (hit) out.push(t.id);
  }
  return out.sort();
}
// the dashboard's own definition of a parked task: collectHumanActions in qnfo-fleet-dashboard/worker.js
const DASH_SQL = "SELECT id, goal, repo, last_error, pr_url, updated_at FROM code_tasks WHERE status='needs_human' ORDER BY updated_at";
ok(readFileSync(root("qnfo-fleet-dashboard/worker.js"), "utf8").includes(DASH_SQL), "the dashboard still defines a parked task as code_tasks.status = needs_human (this suite's query is its literal text)");
const queue = (db) => ids(db.prepare(DASH_SQL).all());

// ---- 0. the fixtures are the live shapes -------------------------------------------------------------------------------------------------
ok(Object.keys(fx.triggers).length === 32 && fx.triggers.issue_lifecycle_au.tbl === "agent_issues" && fx.triggers.code_tasks_repo_slug_upd.tbl === "code_tasks", "32 live triggers captured", Object.keys(fx.triggers).length);
{
  const probe = build();
  ok(probe.prepare("PRAGMA recursive_triggers").get().recursive_triggers === 0, "recursive_triggers is off, as on D1");
}

// ---- 1. PRE-FIX: the defect is reproduced -----------------------------------------------------------------------------------------------
const pre = build();
seed(pre);
const preSnapshot = tasks(pre);
ok(same(statusOf(pre, "needs_human"), [...LIVE_PARKED, "ct_goalmap1", "ct_im1000", "ct_im100204", "ct_im100205", "ct_im100206"].sort()), "pre-fix: the owner queue holds the seven live parked tasks and the synthetic ones", statusOf(pre, "needs_human"));
ok(same(oracle(pre), EXPECT_SUPERSEDED), "pre-fix: the defect is reproduced, six parked tasks belong to issues already closed with evidence", oracle(pre));
ok(queue(pre).length === 12 && queue(pre).includes("ct_im100072"), "pre-fix: the dashboard query lists closed work as parked");

// ---- 2. the file on the pre-fix state ----------------------------------------------------------------------------------------------------
const db = build();
seed(db);
db.exec(sql);
const post = tasks(db);
ok(same(statusOf(db, "superseded").filter((i) => EXPECT_SUPERSEDED.includes(i)), EXPECT_SUPERSEDED), "the one-time statement supersedes exactly the six tasks with a closed issue", statusOf(db, "superseded"));
for (const id of EXPECT_SUPERSEDED) {
  const was = preSnapshot[id], now = post[id];
  const expectErr = (was.last_error ? was.last_error + " | " : "") + reason(EXPECT_ISSUE[id]);
  ok(now.status === "superseded", id + " is superseded");
  ok(now.last_error === expectErr, id + " keeps its last_error and gains the reason", now.last_error);
  ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(now.updated_at) && now.updated_at > was.updated_at, id + " updated_at is a fresh ISO timestamp", now.updated_at);
  const rest = (r) => JSON.stringify({ ...r, status: 0, last_error: 0, updated_at: 0 });
  ok(rest(now) === rest(was), id + " keeps every other column");
}
for (const id of EXPECT_PARKED) ok(JSON.stringify(post[id]) === JSON.stringify(preSnapshot[id]), id + " is untouched (its issue is open, closed without evidence, or declined)");
for (const id of ["ct_q100072", "ct_m100072", "ct_f100073", "ct_s100075"]) ok(JSON.stringify(post[id]) === JSON.stringify(preSnapshot[id]), id + " (another status) is untouched");
ok(post.ct_goalmap1.last_error === reason(100201), "a NULL last_error gives the bare reason, with no leading separator", post.ct_goalmap1.last_error);
ok(same(oracle(db), []), "after the file no parked task has a closed issue");
ok(same(queue(db), ["ct_agpn0vekiunr2f", "ct_im1000", "ct_im100142", "ct_im100204", "ct_im100205", "ct_im100206"].sort()), "the owner queue keeps only work whose issue is still open or never closed with evidence", queue(db));
ok(queue(db).includes("ct_im100142") && queue(db).includes("ct_agpn0vekiunr2f"), "ct_im100142 (issue 100142) and ct_agpn0vekiunr2f (issue 100047) stay parked: both issues are open");
// the dashboard reads the status or a last_error that starts with superseded
ok(db.prepare("SELECT COUNT(*) AS n FROM code_tasks t WHERE t.status <> 'merged' AND (t.status = 'superseded' OR t.last_error LIKE 'superseded%')").get().n >= 6, "the dashboard's superseded outcome reads the six rows");

// backup
const bak = db.prepare("SELECT * FROM bak_20261019_parked_tasks ORDER BY id").all();
ok(bak.length === 12 && bak.every((b) => b.status === "needs_human" && b.saved_at), "the backup holds every task that was parked when the file ran, with its old status", bak.length);
ok(bak.every((b) => b.last_error === preSnapshot[b.id].last_error && b.updated_at === preSnapshot[b.id].updated_at), "the backup holds the old last_error and updated_at");
ok(!("ctx" in bak[0]), "the backup leaves out the 650 KB ctx column the file never changes");

// view and detector
ok(db.prepare("SELECT COUNT(*) AS n FROM v_parked_task_issue_closed").get().n === 0, "the view is empty after the file");
const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-parked-task-outlives-issue'").get();
ok(det && det.verify_transport === "d1-query" && det.status === "active" && det.module === "failure-mode" && det.expected_cadence_h === 1 && det.issue_id === null, "one active d1-query detector, module failure-mode, hourly", det);
const probe = () => db.prepare(det.verify_probe).get();
ok(probe().expected === "0" && probe().observed === "0", "the detector reads expected 0 observed 0 after the file", probe());
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'parked-task-outlives-issue'").get();
ok(fm && fm.probe_class === "fm-parked-task-outlives-issue" && fm.first_seen === "2026-10-19" && [fm.failure_mode, fm.root_cause, fm.remediation, fm.detector, fm.trigger_condition, fm.symptom, fm.blast_radius].every((s) => s && s.length > 30), "the failure mode is complete and names its detector", fm && fm.probe_class);
ok(det.verify_probe.includes("v_parked_task_issue_closed") && !/\b(update|delete|drop|insert)\s/i.test(det.verify_probe), "the probe reads the view and writes nothing");
const dl = db.prepare("SELECT * FROM decision_log WHERE instr(action, 'PARKED-TASK-ISSUE-CLOSED-1:') = 1").all();
ok(dl.length === 1 && dl[0].capability_gain && dl[0].predicted_outcome && dl[0].rollback_path && dl[0].surfaces_tested, "one decision_log row with capability_gain, prediction and surfaces", dl.length);

// the detector bites: re-park a task for a closed issue (the loop re-reading an old row) and it reads 1 and names the task
db.prepare("UPDATE code_tasks SET status = 'needs_human' WHERE id = 'ct_im100072'").run();
ok(probe().observed === "1" && same(oracle(db), ["ct_im100072"]), "the detector reads 1 when a parked task has a closed issue", probe());
ok(db.prepare("SELECT task_id, issue_id FROM v_parked_task_issue_closed").all().map((r) => r.task_id + ":" + r.issue_id).join() === "ct_im100072:100072", "the view names the task and its issue");
ok(task(db, "ct_im100072").status === "needs_human", "an UPDATE of code_tasks never fires the agent_issues trigger (the detector is the second path)");
db.prepare("UPDATE code_tasks SET status = 'superseded' WHERE id = 'ct_im100072'").run(); // back to the post-file state

// ---- 3. the trigger -----------------------------------------------------------------------------------------------------------------------
const lifecycle = (id) => db.prepare("SELECT event, to_status, has_evidence FROM issue_lifecycle WHERE issue_id = ? ORDER BY id").all(id);
const trg = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'agent_issues_parked_task_superseded_upd'").get();
ok(trg && /AFTER UPDATE OF status ON agent_issues/.test(trg.sql), "the trigger is AFTER UPDATE OF status ON agent_issues");
ok(trg && !/RAISE/i.test(trg.sql), "the trigger has no RAISE: it cannot abort the close of an issue");
ok(trg && !/\b(INSERT|DELETE)\b/i.test(trg.sql.replace(/'[^']*'/g, "")) && (trg.sql.match(/\bUPDATE\s+\w+/gi) || []).length === 2, "its body is one UPDATE of code_tasks (the other UPDATE is the event)");
const before = tasks(db);
// on other updates it does nothing
db.prepare("UPDATE agent_issues SET title = title || ' (edited)' WHERE id = 100206").run();
db.prepare("UPDATE agent_issues SET description = 'x', priority = 'high' WHERE id = 100206").run();
db.prepare("UPDATE agent_issues SET status = 'monitoring' WHERE id = 100206").run();
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100206").run();
ok(same(tasks(db), before), "title, description, priority and open or monitoring status changes leave every task alone");
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100072").run(); // closed -> closed: not a close
db.prepare("UPDATE code_tasks SET status = 'needs_human' WHERE id = 'ct_im100072'").run();
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100072").run();
ok(task(db, "ct_im100072").status === "needs_human", "closed -> closed is not a close: a task parked again stays for the detector");
db.prepare("UPDATE agent_issues SET status = 'resolved' WHERE id = 100072").run();
ok(task(db, "ct_im100072").status === "needs_human", "closed -> resolved is not a new close either");
db.prepare("UPDATE code_tasks SET status = 'superseded' WHERE id = 'ct_im100072'").run();
// wontfix is a decision, not a claim of resolution
closeIssue(db, 100206, EV, "wontfix");
ok(task(db, "ct_im100206").status === "needs_human", "a wontfix does not supersede (declining is not a resolution)");
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100206").run();
// a close without evidence is refused by the existing guard; the trigger never sees it and the task stays
let refused = "";
try { db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100204").run(); } catch (e) { refused = String(e.message); }
ok(refused === "" || /close-without-evidence/.test(refused), "closing a legacy issue without evidence is the existing guard's decision", refused);
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100204").run();
// a real close: evidence first, then status
const lcBefore = lifecycle(100206).length;
closeIssue(db, 100206);
const t206 = task(db, "ct_im100206");
ok(t206.status === "superseded" && t206.last_error === "MERGE-SCOPE-AT-READ-1: x | " + reason(100206), "closing an issue supersedes its parked task in the same statement", t206);
ok(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t206.updated_at) && t206.updated_at > "2026-10-19T10:05:00.000Z", "updated_at is set");
ok(lifecycle(100206).length === lcBefore + 1 && lifecycle(100206).slice(-1)[0].event === "dispositioned" && lifecycle(100206).slice(-1)[0].has_evidence === 1, "the issue_lifecycle row of the close is still written (coexistence)", lifecycle(100206));
ok(statusOf(db, "needs_human").join() === ["ct_agpn0vekiunr2f", "ct_im1000", "ct_im100142", "ct_im100204", "ct_im100205"].sort().join(), "no other parked task moved", statusOf(db, "needs_human"));
// idempotent and reopen-stable
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100206").run();
ok(task(db, "ct_im100206").status === "superseded" && task(db, "ct_im100206").last_error === t206.last_error, "a reopened issue leaves its task superseded: the row is finished history and the reopened issue is picked up by the planner or a session");
closeIssue(db, 100206);
ok(task(db, "ct_im100206").last_error === t206.last_error && (task(db, "ct_im100206").last_error.match(/PARKED-TASK-ISSUE-CLOSED-1/g) || []).length === 1, "closing again changes nothing: one reason, not two");
// legacy close: evidence added later, then a real close
db.prepare("UPDATE agent_issues SET status = 'open' WHERE id = 100204").run();
closeIssue(db, 100204);
ok(task(db, "ct_im100204").status === "superseded", "an issue closed with evidence after a legacy close supersedes its task");
// prefix collision: closing issue 100 must not touch ct_im1000, and closing 1000 must supersede it alone
addIssue(db, 100, "TEST-PREFIX-SHORT-1", "open");
closeIssue(db, 100);
ok(task(db, "ct_im1000").status === "needs_human", "closing issue 100 leaves ct_im1000 (and the goal [issue #1000]) alone");
closeIssue(db, 1000);
ok(task(db, "ct_im1000").status === "superseded" && task(db, "ct_im1000").last_error === "noop-proposal | " + reason(1000), "closing issue 1000 supersedes ct_im1000 by id and by goal");
// an issue with no parked task, and an issue whose task is of another status
addIssue(db, 100210, "TEST-NO-TASK-1", "open");
const snap = JSON.stringify(tasks(db));
closeIssue(db, 100210);
ok(JSON.stringify(tasks(db)) === snap, "closing an issue that has no parked task changes no task");
// coexistence: an owner-request issue's close writes its card (BEFORE trigger) and supersedes the task
addIssue(db, 100211, "TEST-OWNER-REQUEST-1", "open", null, { category: "owner-request" });
addTask(db, "ct_im100211", "TEST-OWNER-REQUEST-1", "needs_human", "parked", "2026-10-19T10:10:00.000Z");
closeIssue(db, 100211);
ok(task(db, "ct_im100211").status === "superseded" && db.prepare("SELECT COUNT(*) AS n FROM human_actions WHERE slug = 'issue-100211'").get().n === 1, "owner_request_requires_card and the new trigger both run on one close");
// coexistence: a superseded-by-another-change close also supersedes its contract (agent_issues_superseded_contracts_upd)
addIssue(db, 100212, "TEST-SUPERSEDED-CLOSE-1", "open");
db.prepare("INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES ('issue-100212', 100212, 'p', 'a', 'x', 'd1-query', 'q', 'active')").run();
addTask(db, "ct_im100212", "TEST-SUPERSEDED-CLOSE-1", "needs_human", null, "2026-10-19T10:11:00.000Z");
closeIssue(db, 100212, "superseded by the change that fixed it");
ok(task(db, "ct_im100212").status === "superseded" && db.prepare("SELECT status FROM remediation_contracts WHERE class = 'issue-100212'").get().status === "superseded", "agent_issues_superseded_contracts_upd and the new trigger both run");
// bulk: closing many issues in one statement (the update fires per row)
for (const n of [100220, 100221, 100222]) { addIssue(db, n, "TEST-BULK-" + n, "open"); addTask(db, "ct_im" + n, "TEST-BULK", "needs_human", "p", "2026-10-19T10:12:00.000Z"); db.prepare("UPDATE issue_triage SET close_evidence = 'e' WHERE issue_id = ?").run(n); }
db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id IN (100220, 100221, 100222)").run();
ok(["ct_im100220", "ct_im100221", "ct_im100222"].every((i) => task(db, i).status === "superseded"), "one statement that closes three issues supersedes three tasks");
ok(same(oracle(db), []), "after every close the oracle finds no parked task with a closed issue");
ok(db.prepare(det.verify_probe).get().observed === "0", "the detector still reads 0");

// ---- 4. the file's trigger equals the file's one-time statement: closing the same issues later gives the same set -----------------------
const late = build();
seed(late, false);
late.exec(sql);
ok(same(statusOf(late, "superseded"), ["ct_s100075"]), "late scenario: with every issue open the file supersedes nothing", statusOf(late, "superseded"));
for (const n of [100029, 100072, 100073, 100075, 100091]) closeIssue(late, n);
closeIssue(late, 100201, EV, "resolved");
ok(same(statusOf(late, "superseded").filter((i) => i !== "ct_s100075"), EXPECT_SUPERSEDED), "closing the same issues through the trigger supersedes the same six tasks as the one-time statement", statusOf(late, "superseded"));
for (const id of EXPECT_SUPERSEDED) ok(task(late, id).last_error === post[id].last_error, id + " gets the same last_error from the trigger as from the one-time statement");
ok(JSON.stringify(EXPECT_PARKED.filter((i) => task(late, i).status !== "needs_human")) === "[]", "late scenario: the open-issue tasks are still parked");

// ---- 5. the trigger is a leaf of the trigger graph: no deeper chain than before ----------------------------------------------------------
function parseTrigger(s) {
  const m = /^\s*CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF)?\s*(INSERT|UPDATE|DELETE)(?:\s+OF\s+([\w,\s]+?))?\s+ON\s+(\w+)/i.exec(s);
  if (!m) return null;
  const begin = s.search(/\bBEGIN\b/i);
  return { name: m[1], event: m[2].toUpperCase(), cols: m[3] ? m[3].split(",").map((c) => c.trim().toLowerCase()) : null, table: m[4].toLowerCase(), body: s.slice(begin + 5) };
}
function writesOf(body) { // [{event, table, cols}] of the INSERT, UPDATE and DELETE statements in a trigger body, string literals blanked
  const text = body.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, "");
  const out = [];
  const re = /\b(INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+(\w+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const kind = /^INSERT/i.test(m[1]) ? "INSERT" : /^UPDATE/i.test(m[1]) ? "UPDATE" : "DELETE";
    const w = { event: kind, table: m[2].toLowerCase(), cols: null };
    if (kind === "UPDATE") { // targets of "SET a = ..., b = ..." at parenthesis depth 0
      const set = text.slice(re.lastIndex).search(/\bSET\b/i);
      let i = re.lastIndex + set + 3, depth = 0, start = i; const cols = [];
      for (; i <= text.length; i++) {
        const c = text[i];
        if (c === "(") depth++; else if (c === ")") depth--;
        if ((c === "," && depth === 0) || i === text.length || (depth === 0 && /^\s(WHERE|FROM)\b/i.test(text.slice(i, i + 7))) || (c === ";" && depth === 0)) {
          const t = /^\s*(\w+)\s*=/.exec(text.slice(start, i)); if (t) cols.push(t[1].toLowerCase());
          start = i + 1; if (c !== ",") break;
        }
      }
      w.cols = cols;
    }
    out.push(w);
  }
  return out;
}
function graph(database) { // the triggers the database holds plus the live ones this suite only parses (fx.graph_triggers)
  const sqls = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger'").all().map((r) => r.sql).concat(Object.values(fx.graph_triggers).map((t) => t.sql));
  return sqls.map((s) => parseTrigger(s)).filter(Boolean).map((t) => ({ ...t, writes: writesOf(t.body) }));
}
// deepest nesting of trigger programs a write can start: a trigger that fires counts one level; recursion into a trigger already on the path is off
function depth(trigs, event, table, cols, path = []) {
  let best = 0;
  for (const t of trigs) {
    if (t.table !== table || t.event !== event || path.includes(t.name)) continue;
    if (event === "UPDATE" && t.cols && !(cols || []).some((c) => t.cols.includes(c))) continue;
    best = Math.max(best, 1 + Math.max(0, ...t.writes.map((w) => depth(trigs, w.event, w.table, w.cols, path.concat(t.name)))));
  }
  return best;
}
const base = build();
const gBase = graph(base), gNew = graph(db);
ok(gNew.length === gBase.length + 1, "the file adds exactly one trigger", [gBase.length, gNew.length]);
const mine = gNew.find((t) => t.name === "agent_issues_parked_task_superseded_upd");
ok(mine && mine.writes.length === 1 && mine.writes[0].table === "code_tasks" && mine.writes[0].event === "UPDATE" && same(mine.writes[0].cols, ["status", "last_error", "updated_at"]), "its only write is UPDATE code_tasks SET status, last_error, updated_at", mine && mine.writes);
ok(depth(gNew, "UPDATE", "code_tasks", ["status", "last_error", "updated_at"]) === 0, "no trigger on code_tasks listens to those columns, so nothing runs under the new trigger: it is a leaf");
const dBefore = depth(gBase, "UPDATE", "agent_issues", ["status"]), dAfter = depth(gNew, "UPDATE", "agent_issues", ["status"]);
ok(dAfter === dBefore, "the deepest chain started by an UPDATE of agent_issues.status is unchanged", [dBefore, dAfter]);
ok(dAfter === 3, "and it is 3 levels (superseded_contracts_upd -> cadence_floor_au -> sla_120_guard_contract_upd; owner_request_requires_card -> human_actions_default_approve_ai -> decision_predictions_parse), inside D1's 10", dAfter);
const siblings = gNew.filter((t) => t.table === "agent_issues" && t.event === "UPDATE" && t.cols && t.cols.includes("status")).map((t) => t.name).sort();
ok(siblings.length === 6 && siblings.includes("agent_issues_parked_task_superseded_upd"), "it sits beside the five triggers already on UPDATE OF status", siblings);
const chain = (t) => 1 + Math.max(0, ...t.writes.map((w) => depth(gNew, w.event, w.table, w.cols, [t.name])));
ok(chain(mine) === 1, "its own chain is one level", chain(mine));
console.log("trigger-depth: UPDATE OF status on agent_issues nests " + dAfter + " level(s) before and after; the new trigger nests " + chain(mine) + "; sibling chains " + siblings.map((n) => n.replace("agent_issues_", "") + "=" + chain(gNew.find((t) => t.name === n))).join(", "));

// ---- 6. the Rollback line ------------------------------------------------------------------------------------------------------------------
const rb = /^-- Rollback: (.*)$/m.exec(sql);
ok(rb && !rb[1].includes("\n") && rb[1].length > 100, "the header has a one-line Rollback");
const rdb = build();
seed(rdb);
rdb.exec(sql);
closeIssue(rdb, 100047); // the trigger supersedes ct_agpn0vekiunr2f after the file: it is in the backup, so the Rollback restores it too
ok(task(rdb, "ct_agpn0vekiunr2f").status === "superseded", "rollback scenario: a later close superseded a task that was in the backup");
rdb.exec(rb[1]);
const rrows = tasks(rdb);
for (const id of [...LIVE_PARKED, "ct_goalmap1", "ct_im1000", "ct_im100204", "ct_im100205", "ct_im100206"]) {
  ok(JSON.stringify(rrows[id]) === JSON.stringify(preSnapshot[id]), id + " is back to its pre-fix row", rrows[id] && [rrows[id].status, rrows[id].last_error]);
}
ok(rdb.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('agent_issues_parked_task_superseded_upd', 'v_parked_task_issue_closed')").get().n === 0, "the Rollback drops the trigger and the view");
ok(rdb.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && rdb.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-parked-task-outlives-issue'").get().n === 0, "the Rollback deletes the failure mode and its detector");
ok(rdb.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "the append-only decision_log row stays");
for (const id of ["ct_q100072", "ct_m100072", "ct_f100073", "ct_s100075"]) ok(JSON.stringify(rrows[id]) === JSON.stringify(preSnapshot[id]), id + " is unchanged by the Rollback");
rdb.exec(sql); // and the file applies again after a rollback
ok(same(statusOf(rdb, "superseded").filter((i) => EXPECT_SUPERSEDED.includes(i)), EXPECT_SUPERSEDED), "re-applying after a Rollback supersedes the same six tasks");

// ---- 7. idempotence ------------------------------------------------------------------------------------------------------------------------
const idem = build();
seed(idem);
idem.exec(sql);
const once = JSON.stringify(tasks(idem));
const counts = () => ["failure_modes", "remediation_contracts", "decision_log", "bak_20261019_parked_tasks"].map((t) => idem.prepare("SELECT COUNT(*) AS n FROM " + t).get().n).join();
const c1 = counts(), trg1 = idem.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get().n;
idem.exec(sql);
ok(JSON.stringify(tasks(idem)) === once, "re-applying the file changes no task row");
ok(counts() === c1 && idem.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get().n === trg1, "re-applying adds no failure mode, contract, decision, backup row or trigger", [c1, counts()]);
ok(idem.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class LIKE 'fm-parked%'").get().n === 1, "one detector");
ok(idem.prepare("SELECT COUNT(*) AS n FROM bak_20261019_parked_tasks").get().n === 12, "the backup keeps the first snapshot (12 rows), not the second");

// ---- 8. the suite FAILS on the pre-fix state: the same checks against the file without its parts ------------------------------------------
const noTrigger = sql.replace(/^CREATE TRIGGER[\s\S]*?\nEND;\n/m, "");
const noOneTime = sql.replace(/^UPDATE code_tasks SET[\s\S]*?v_parked_task_issue_closed\);\n/m, "");
ok(noTrigger !== sql && noOneTime !== sql && noTrigger.length < sql.length - 400 && noOneTime.length < sql.length - 300, "both mutations removed something");
function verdict(text) { // true when the file fixes both the existing rows and a later close
  const d = build(); seed(d); d.exec(text);
  const rows = oracle(d).length === 0;
  closeIssue(d, 100206);
  return { oneTime: rows, trigger: d.prepare("SELECT status FROM code_tasks WHERE id = 'ct_im100206'").get().status === "superseded" };
}
ok(JSON.stringify(verdict(sql)) === '{"oneTime":true,"trigger":true}', "the file passes both checks", verdict(sql));
ok(JSON.stringify(verdict(noTrigger)) === '{"oneTime":true,"trigger":false}', "without the trigger the later-close check fails", verdict(noTrigger));
ok(JSON.stringify(verdict(noOneTime)) === '{"oneTime":false,"trigger":true}', "without the one-time statement the existing-rows check fails", verdict(noOneTime));
ok(JSON.stringify(verdict("-- the pre-fix state: nothing\n")) === '{"oneTime":false,"trigger":false}', "on the pre-fix state both checks fail");

// ---- 9. the file itself --------------------------------------------------------------------------------------------------------------------
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");
ok(!/#\d/.test(sql), "no bare issue-number reference of the form hash-digits");
const head = sql.split("\n").filter((l) => l.startsWith("--")).slice(0, 4).join("\n");
ok(/APPLY-BY: ci/.test(head) && /DB: qnfo-audit/.test(head) && /Rollback:/.test(head), "the header opts in to the runner");
ok(!/^(DELETE|DROP)\b/im.test(sql), "no DELETE or DROP statement, so no BACKUP header is owed (MIGRATION-RUNNER-1)");
ok(!/^-- BACKUP:/m.test(sql), "and none is declared");
ok(/LIKE\s+'/i.test(sql) === false, "no LIKE literal (D1 caps patterns at 50 bytes)");

console.log(`parked-task-issue-closed: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);

// MD-P1B-REANCHOR-1 offline suite: replays migrations/2026-10-26-md-p1b-reanchor.sql on node:sqlite over the columns it touches (agent_issues, code_tasks, decision_log).
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); the lever issue MD-P1b keeps its code-task and code-probe lines
// byte for byte and gets exactly one code-anchor line, the new one, which occurs exactly once in qnfo-fleet-control/worker.js (the old one is gone since PR 4649);
// two queued code tasks (ct_im<issue>b for ilTriggerHit, ct_im<issue>c for perfBreaches) carry one single-line anchor each that occurs exactly once; a closed issue and a
// replay change nothing; the Rollback line restores the anchor and supersedes the tasks; and the named functions still hold the shape the probe forbids, as many as the code loop has not yet fixed (or the lever has landed).
// Output MUST contain "0 failed" on success.   node migrations/md-p1b-reanchor.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-md-p1b-reanchor.sql"), "utf8");
const wsrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !header.some((l) => /^-- BACKUP:/.test(l)), "the body deletes and drops nothing, so no BACKUP header is needed");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/\[skip ci\]/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b(secret|credential|password|api[ _-]?key|private key|rotate|revoke|drop table)\b/i.test(body), "no text trips the code orchestrator PLAN_DENY_TEXT words");

const OLD = 'var hit = op === "gt" ? v > thr : op === "lte" ? v <= thr : op === "lt" ? v < thr : op === "eq" ? v === thr : v >= thr;';
const NEW = "function ilTriggerHit(tp, value) {";
const NEW2 = "function perfBreaches(op, thr, v) {";
const PROBE = 'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "absent": ": op === \\"eq\\" ? v === thr : v >= thr;"}';
const TASK_LINE = "code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js";
const DESC = [
  "Charter pillar: autonomy (ACT-BRIDGE-1, BREACH-DOCTOR-1).",
  "Definition of done: no comparison on main ends in op === \"eq\" ? v === thr : v >= thr;",
  TASK_LINE,
  "code-anchor: " + OLD,
  PROBE,
  "",
  "CODE-TASK-MERGE-RUNNER-1: code task ct_im1000430 merged as https://github.com/QNFO/qnfo-workers/pull/4649 by qnfo-fleet-control and verified live as 0.55.1-codeagent; close against this issue's own DoD.",
].join("\n");
const TITLE = "BREACH-DOCTOR-1: MD-P1b qnfo-fleet-control an operator outside gt, gte, lt, lte, eq is unreadable, never read as gte";

function world(o = {}) {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, step TEXT, attempts INTEGER, model TEXT, ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  raw.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (1000430, ?, ?, 'qnfo-fleet-control', 'medium', ?, 1, 1)").run(TITLE, DESC, o.status ?? "open");
  raw.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (1000431, 'BREACH-DOCTOR-1: MD-P1c qnfo-fleet-control other lever', ?, 'qnfo-fleet-control', 'medium', 'open', 1, 1)").run("code-anchor: var TRIGGER_RECOVERY_MIN = 60;");
  raw.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, created_at, updated_at) VALUES ('ct_im1000430', 'qnfo-workers', 'qnfo-fleet-control/worker.js', ?, 'merged', 'done', 0, ?, '2026-10-26T14:50:00.000Z', '2026-10-26T15:05:00.000Z')").run("[issue #1000430] " + TITLE, JSON.stringify({ anchor: OLD }));
  return raw;
}
const q1 = (raw, s, ...p) => raw.prepare(s).get(...p);
const qa = (raw, s, ...p) => raw.prepare(s).all(...p);
const line = (text, pfx) => String(text).split("\n").filter((l) => l.startsWith(pfx)).map((l) => l.slice(pfx.length));
const count = (t) => { let c = 0, i = 0; while ((i = t.length ? wsrc.indexOf(t, i) : -1) >= 0) { c++; i += t.length; } return c; };

// ---- the live worker: the old anchor is gone, the remaining sites keep the shape, the new anchors are single lines that occur once
const shape = ': op === "eq" ? v === thr : v >= thr;';
const landed = count(shape) === 0;
ok(count(OLD) === 0 || landed, "the old anchor occurs 0 times in the worker (PR 4649 rewrote it), or the lever has landed", count(OLD));
// The code loop removes the two remaining sites one task at a time (ct_im1000430c merged first, 2026-10-26 18:00Z), so this suite must hold at 2, 1 and 0 remaining sites.
ok(count(NEW) <= 1 && count(NEW2) <= 1, "neither new anchor is duplicated in qnfo-fleet-control/worker.js", [count(NEW), count(NEW2)]);
if (!landed) {
  const holds = (name) => { const i = wsrc.indexOf(name); return i >= 0 && wsrc.slice(i, i + 900).includes(shape); };
  ok(count(shape) <= 2, "at most the two sites this file named keep the shape the probe forbids", count(shape));
  ok(count(shape) === [NEW, NEW2].filter(holds).length, "and every remaining occurrence sits inside one of the two named functions (no third site appeared)", { remaining: count(shape), ilTriggerHit: holds(NEW), perfBreaches: holds(NEW2) });
  ok(count(NEW) === 1 || count(NEW2) === 1, "while the lever is open at least one anchor is still a single line that occurs exactly once, so the code loop can act", [count(NEW), count(NEW2)]);
}
ok(NEW.length > 15 && NEW2.length > 15 && !NEW.includes("\n") && !NEW2.includes("\n"), "both anchors are real single lines (the intake reads one line of at most 300 characters)");

// ---- apply over the live shape
const w = world();
const before = line(qa(w, "SELECT description FROM agent_issues WHERE id = 1000430")[0].description, "code-probe: ")[0];
w.exec(sql);
const issue = q1(w, "SELECT description, status FROM agent_issues WHERE id = 1000430");
const anchors = line(issue.description, "code-anchor: ");
ok(anchors.length === 1 && anchors[0] === NEW, "the issue carries exactly one code-anchor line, the new one", anchors);
ok(!issue.description.includes("code-anchor: " + OLD), "the old anchor line is gone");
ok(line(issue.description, "code-probe: ")[0] === before && line(issue.description, "code-task: ").join() === "repo=qnfo-workers path=qnfo-fleet-control/worker.js", "the code-probe line (the closing probe) and the code-task line are untouched");
ok(/MD-P1B-REANCHOR-1/.test(issue.description) && /ct_im1000430b/.test(issue.description) && /ct_im1000430c/.test(issue.description), "the issue text names the re-anchor and both tasks");
ok(issue.status === "open", "the issue stays open until its own probe passes");
ok(q1(w, "SELECT description FROM agent_issues WHERE id = 1000431").description === "code-anchor: var TRIGGER_RECOVERY_MIN = 60;", "the other levers are not touched");

const tasks = qa(w, "SELECT * FROM code_tasks WHERE id LIKE 'ct_im1000430%' ORDER BY id");
ok(tasks.map((t) => t.id + ":" + t.status).join() === "ct_im1000430:merged,ct_im1000430b:queued,ct_im1000430c:queued", "the merged task is left alone and two tasks are queued", tasks.map((t) => t.id + ":" + t.status));
for (const [suffix, anchor, fn] of [["b", NEW, "ilTriggerHit"], ["c", NEW2, "perfBreaches"]]) {
  const t = tasks.find((x) => x.id === "ct_im1000430" + suffix) || {};
  ok(t.repo === "qnfo-workers" && t.path === "qnfo-fleet-control/worker.js" && t.step === "read" && t.attempts === 0, fn + ": repo, path, step read, attempts 0");
  ok(JSON.parse(t.ctx || "{}").anchor === anchor && Object.keys(JSON.parse(t.ctx || "{}")).join() === "anchor", fn + ": ctx is the JSON {anchor} the code loop reads");
  ok(String(t.goal).startsWith("[issue #1000430] " + TITLE) && String(t.goal).includes(fn) && String(t.goal).length <= 6000 && !/^code-task: /m.test(t.goal), fn + ": the goal is '[issue #N] <title>' plus the instruction for this one site, within GOAL_MAX, with no code-task line");
}

// ---- the real intake reading: a task in flight for the issue stops a second one (INTAKE-IM-DEDUPE-1 reads goal LIKE '[issue #N]%' or id = ct_im<N>)
{
  const prior = qa(w, "SELECT id, status FROM code_tasks WHERE goal LIKE ? OR id = ? ORDER BY created_at DESC", "[issue #1000430]%", "ct_im1000430");
  ok(prior.some((t) => ["queued", "read", "propose"].includes(t.status)), "the intake query now finds a task in flight for the issue, so it builds no duplicate", prior);
}

// ---- idempotence, a closed issue, rollback
{
  const snap = () => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM code_tasks ORDER BY id"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a second apply changes nothing (issue text, tasks, decision_log)");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'MD-P1B-REANCHOR-1:%'").n === 1, "exactly one decision_log row");
}
{
  const wc = world({ status: "closed" });
  const snapC = () => JSON.stringify([qa(wc, "SELECT * FROM agent_issues ORDER BY id"), qa(wc, "SELECT * FROM code_tasks ORDER BY id")]);
  const s1 = snapC();
  wc.exec(sql);
  ok(snapC() === s1, "a closed MD-P1b issue is left alone: no text change and no task");
}
{
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length);
  const wr = world();
  wr.exec(sql);
  wr.exec(rb);
  const a = line(q1(wr, "SELECT description FROM agent_issues WHERE id = 1000430").description, "code-anchor: ");
  ok(a.includes(OLD) && !a.includes(NEW), "Rollback puts the old anchor back", a);
  ok(qa(wr, "SELECT status FROM code_tasks WHERE id IN ('ct_im1000430b', 'ct_im1000430c')").every((t) => t.status === "superseded"), "Rollback supersedes both queued tasks");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

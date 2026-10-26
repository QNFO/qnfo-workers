// INTAKE-IDLE-BEAT-1 (qnfo-code-orchestrator 0.29.2) offline suite.
// The "pull" step of the hourly tick (trigger tick_driver_roster_tick) counts cloud_ops_events kind LIKE 'code-task.intake%' with job = this worker, and queue_pulls rows, in the
// last 65 minutes. An hour in which no open issue needed a new task left neither (4 of 24 hours on 2026-10-26), so an empty queue read as a missed step and
// tick_sequence_completion_24h fell to 0.833. intakeIssues now records one code-task.intake-idle event when it created nothing and no intake event exists in the last 50 minutes.
// Proves, by running the real intakeIssues against a stub D1: an idle tick writes exactly one event of the right kind, job, status and text; a second idle tick inside 50 minutes
// writes none (so any 65-minute window holds one and the table does not grow by 144 rows a day); an intake event from another path inside 50 minutes also suppresses it; a tick
// that creates a task writes no idle event; an unreadable candidate query (no agent_issues table) writes none; the kind matches the trigger's LIKE; and on real SQLite the
// trigger's own pull-step query reads ok for an hour that holds only the idle event.
// Run: node --no-warnings qnfo-code-orchestrator/intake-idle.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const mirror = fs.readFileSync(path.join(here, "deployed-current.worker.js"), "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "idle-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), src + "\nexport { intakeIssues as __intake, VERSION as __ver };\n");
globalThis.fetch = async (u) => {
  const m = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\/(.+)$/.exec(String(u));
  if (m) return new Response("var VERSION = \"1.0.0\";\nfunction a() {}\n", { status: 200 });
  return new Response("nf", { status: 404 });
};
const { __intake, __ver } = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
const ver = String(__ver).match(/^(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
ok(ver[0] > 0 || ver[1] > 29 || (ver[1] === 29 && ver[2] >= 2), "VERSION is at least 0.29.2", __ver);

// Stub D1: the candidate query answers `issues`; cloud_ops_events is an in-memory list so the dedupe read sees earlier writes.
function mkEnv(issues, o = {}) {
  const events = (o.events || []).map((e) => ({ ...e }));
  const tasks = [];
  const stmt = (q) => {
    let a = [];
    const s = {
      bind(...x) { a = x; return s; },
      async run() {
        if (/^INSERT INTO cloud_ops_events/.test(q)) events.push({ id: a[0], ts: a[1], kind: a[2], text: a[3], meta: a[4], job: a[5], status: a[6] });
        if (/^INSERT INTO code_tasks/.test(q)) tasks.push({ id: a[0] });
        return { success: true, meta: { changes: 1 } };
      },
      async first() {
        if (/FROM cloud_ops_events WHERE job = \?1 AND kind LIKE 'code-task\.intake%' AND ts > \?2/.test(q)) {
          if (o.dedupeThrows) throw new Error("D1_ERROR: boom");
          const hit = events.find((e) => e.job === a[0] && e.kind.startsWith("code-task.intake") && e.ts > a[1]);
          return hit ? { x: 1 } : null;
        }
        if (/COUNT\(\*\) AS n FROM code_tasks/.test(q)) return { n: 0 };
        return null;
      },
      async all() {
        if (/v_issue_queue_v2/.test(q)) { if (o.noTable) throw new Error("no such table"); return { results: issues.slice() }; }
        if (/FROM agent_issues WHERE status='open' AND description LIKE '%code-task:%'/.test(q)) { if (o.noTable) throw new Error("no such table"); return { results: issues.slice() }; }
        if (/FROM service_registry/.test(q)) return { results: [{ service: "qnfo-infra" }] };
        return { results: [] };
      },
    };
    return s;
  };
  return { env: { AUDIT_DB: { prepare: stmt, batch: async (xs) => xs.map(() => ({ results: [] })) } }, events, tasks };
}
const idle = (events) => events.filter((e) => e.kind === "code-task.intake-idle");
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

// 1. an idle tick (no candidate issue at all) writes one event
{
  const { env, events } = mkEnv([]);
  const r = await __intake(env, 8);
  ok(r && r.ok === true && r.created.length === 0, "an empty queue returns ok with no task", r);
  const e = idle(events);
  ok(e.length === 1 && e[0].job === "qnfo-code-orchestrator" && e[0].status === "ok" && /^intake ran: 0 open code-task issue\(s\) read, 0 new tasks/.test(e[0].text) && JSON.parse(e[0].meta).candidates === 0, "exactly one code-task.intake-idle event: job, status ok, text with the candidate count", e);
  ok(/^code-task\.intake/.test(e[0].kind) && e[0].kind.startsWith("code-task.intake"), "its kind satisfies the pull step's LIKE 'code-task.intake%'");
}
// 2. a second idle tick inside 50 minutes writes none; one older than 50 minutes writes another
{
  const { env, events } = mkEnv([]);
  await __intake(env, 8);
  await __intake(env, 8);
  await __intake(env, 8);
  ok(idle(events).length === 1, "three idle ticks inside 50 minutes write one event, not three", idle(events).length);
  const old = mkEnv([], { events: [{ id: "x", ts: minsAgo(55), kind: "code-task.intake-idle", job: "qnfo-code-orchestrator" }] });
  await __intake(old.env, 8);
  ok(idle(old.events).length === 2, "an idle event 55 minutes old does not suppress the next one (any 65-minute window keeps one)", idle(old.events).length);
}
// 3. an intake event from the normal path inside 50 minutes already counts, so no idle event
{
  const { env, events } = mkEnv([], { events: [{ id: "y", ts: minsAgo(20), kind: "code-task.intake", job: "qnfo-code-orchestrator" }] });
  await __intake(env, 8);
  ok(idle(events).length === 0, "an intake event 20 minutes old is already pull evidence: no idle event");
  const other = mkEnv([], { events: [{ id: "z", ts: minsAgo(20), kind: "code-task.intake", job: "some-other-worker" }] });
  await __intake(other.env, 8);
  ok(idle(other.events).length === 1, "an event of another job does not count");
}
// 4. candidates that are all skipped still count as idle, with the number read
{
  const issue = { id: 7001, title: "NOTASK-7001: x", source: "claude-session:t", description: "no marker here, so intake skips it" };
  const { env, events } = mkEnv([issue, { ...issue, id: 7002 }]);
  const r = await __intake(env, 8);
  ok(r.created.length === 0 && idle(events).length === 1 && JSON.parse(idle(events)[0].meta).candidates === 2, "two candidates read, none turned into a task: one idle event that says 2", idle(events));
}
// 5. a tick that creates a task writes no idle event (the intake event it logs is the evidence)
{
  const issue = { id: 7003, title: "QUEUE-7003: x", source: "claude-session:t", description: "Fix.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: function a() {}" };
  const { env, events } = mkEnv([issue]);
  const r = await __intake(env, 8);
  ok(r.created.length === 1, "a trusted candidate with a code-task line becomes a task", r);
  ok(idle(events).length === 0 && events.some((e) => e.kind === "code-task.intake"), "a tick that created a task writes its own code-task.intake event and no idle event", events.map((e) => e.kind));
}
// 6. the candidate query cannot be read: no idle event (nothing proves intake looked)
{
  const { env, events } = mkEnv([], { noTable: true });
  const r = await __intake(env, 8);
  ok(r.note === "no agent_issues table" && idle(events).length === 0, "an unreadable candidate query returns early and writes no idle event", r);
}
// 7. the dedupe read fails: no throw, no event
{
  const { env, events } = mkEnv([], { dedupeThrows: true });
  let threw = false;
  try { await __intake(env, 8); } catch (e) { threw = true; }
  ok(!threw && idle(events).length === 0, "a failing dedupe read is swallowed and writes nothing (intake never breaks the tick)");
}
// 8. real SQLite: the trigger's own pull-step query reads ok for an hour that holds only the idle event, and not without it
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
if (sqlite) {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec("CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT); CREATE TABLE queue_pulls (id INTEGER PRIMARY KEY, ts TEXT)");
  const pull = "SELECT a + b > 0 AS ok FROM (SELECT (SELECT COUNT(*) FROM cloud_ops_events WHERE job = 'qnfo-code-orchestrator' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes') AND kind LIKE 'code-task.intake%') AS a, (SELECT COUNT(*) FROM queue_pulls WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b)";
  ok(db.prepare(pull).get().ok === 0, "SQLite: an hour with no intake event and no queue pull reads as a missed pull step (the defect)");
  db.prepare("INSERT INTO cloud_ops_events VALUES ('i', ?, 'code-task.intake-idle', 't', NULL, 'qnfo-code-orchestrator', 'ok')").run(new Date(Date.now() - 49 * 60000).toISOString().replace(/\.\d+Z$/, "Z"));
  ok(db.prepare(pull).get().ok === 1, "SQLite: one idle event 49 minutes old makes the same query read ok");
} else {
  ok(true, "node:sqlite unavailable; the trigger query was not replayed");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

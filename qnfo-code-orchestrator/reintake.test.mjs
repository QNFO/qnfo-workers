// INTAKE-PROVENANCE-1 and CODE-TASK-REINTAKE-1 (qnfo-code-orchestrator 0.3.20, agent_issues 2021) offline suite. In-memory D1.
// Proves: an issue from a source the merge runner does not trust gets no code task, its code-task line becomes a session-task
// line with the reason; the orchestrator's default trusted list equals qnfo-fleet-control CM_TRUSTED_SOURCES; an issue whose
// last task ended is taken again after the cooldown with "[issue #N] [retry k]" first, and not while in flight, inside the
// cooldown, after a merge, after 3 tasks, or after a review rejection or a no-op refusal. INTAKE-DEPENDS-1 (0.3.23): a
// "depends-on: #N" line of its own holds the task while issue N is open, missing or unreadable, and audits the wait once.
// Run: node --no-warnings qnfo-code-orchestrator/reintake.test.mjs   -> prints "N passed, 0 failed"
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// CODE-TASK-PREFLIGHT-1 (0.4.0): intake now reads the target from main before it creates a task; this suite stays hermetic
// (no network, no dependence on main) by answering every fetch 503, which the preflight treats as unreadable and lets through.
globalThis.fetch = async () => new Response("unavailable", { status: 503 });
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rit-"));
fs.writeFileSync(path.join(tmp, "w.mjs"), fs.readFileSync(path.join(here, "worker.js"), "utf8") + "\nexport { intakeIssues as __intake, intakeTrusted as __trusted, intakeRetryDecision as __decide, INTAKE_TRUSTED_DEFAULT as __default, intakeGoal as __goal, intakePrevFailure as __prevFail };\n");
const { __intake, __trusted, __decide, __default, __goal, __prevFail } = await import(pathToFileURL(path.join(tmp, "w.mjs")).href);
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

const fc = fs.readFileSync(path.join(here, "..", "qnfo-fleet-control", "worker.js"), "utf8");
const cm = /^var CM_TRUSTED_SOURCES = ("[^"]*");$/m.exec(fc);
ok(cm && JSON.parse(cm[1]) === __default, "INTAKE_TRUSTED_DEFAULT equals qnfo-fleet-control CM_TRUSTED_SOURCES", [cm && cm[1], __default]);
ok(__trusted("qnfo-fleet-control", "METRIC-TRIGGER-498-X", __default) && __trusted("claude-session:abc", "anything", __default), "metric triggers and sessions are trusted");
ok(!__trusted("qnfo-ops-deep-sweep-2026-09-30", "EXTERNAL-MENTION-MONITOR-EMPTY-1", __default), "the #1641 source is not trusted");

const H = 3600e3, now = Date.parse("2026-10-06T12:00:00Z"), at = (h) => new Date(now - h * H).toISOString();
ok(__decide([], now).take === true, "no prior task: taken");
ok(__decide([{ id: "a", status: "closed", last_error: "stale base: main moved", updated_at: at(7) }], now).take === true, "closed on a stale base 7 h ago: retried");
ok(__decide([{ id: "a", status: "closed", last_error: "stale base", updated_at: at(1) }], now).why === "cooldown", "inside the 6 h cooldown: not yet");
ok(__decide([{ id: "a", status: "queued", updated_at: at(9) }], now).why === "in flight", "a task in flight: not taken");
ok(/merged/.test(__decide([{ id: "a", status: "merged", updated_at: at(9) }], now).why), "a merged task: not taken again");
ok(__decide([{ id: "c", status: "failed", updated_at: at(9) }, { id: "b", status: "closed", updated_at: at(20) }, { id: "a", status: "closed", updated_at: at(30) }], now).exhausted === true, "three tasks: exhausted");
ok(__decide([{ id: "a", status: "closed", merge_note: "rejected by session_x review: cosmetic", updated_at: at(9) }], now).take === false, "a review rejection is never retried");
ok(__decide([{ id: "a", status: "needs_human", last_error: "model m: noop-proposal: ... [3 no-op proposals in a row: needs a person]", updated_at: at(9) }], now).take === false, "a no-op refusal is never retried");
ok(__decide([{ id: "a", status: "needs_human", last_error: "the JS verifier could not confirm the syntax", updated_at: at(9) }], now).take === true, "a needs_human from a fixed engine wall is retried");

function mkEnv(issues, tasks, opts) {
  opts = opts || {};
  const inserted = [], audits = [];
  const stmt = (q) => {
    let a = [];
    const s = {
      bind(...x) { a = x; return s; },
      async run() {
        if (/^INSERT INTO code_tasks/.test(q)) inserted.push({ id: a[0], path: a[2], goal: a[3] });
        if (/^INSERT INTO audit|INSERT INTO cloud_ops_events|INSERT INTO fleet_audit/i.test(q)) audits.push(a);
        if (/^UPDATE agent_issues SET description = replace/.test(q)) { const i = issues.find((r) => r.id === a[2]); if (i) i.description = i.description.replace(/code-task: repo=/g, "session-task: repo=") + a[0]; }
        return { success: true, meta: {} };
      },
      async first() {
        if (/FROM ops_config/.test(q)) return opts.trusted ? { value: opts.trusted } : null;
        if (/^SELECT status FROM agent_issues WHERE id = \?/.test(q)) { if (opts.depUnreadable) throw new Error("D1_ERROR: unavailable"); const st = (opts.dep || {})[a[0]]; return st ? { status: st } : null; }
        if (/COUNT\(\*\) AS n FROM code_tasks/.test(q)) return { n: 0 };
        return null;
      },
      async all() {
        if (/FROM code_tasks/.test(q) && (opts.tasksUnreadable || (opts.noMergeNote && /merge_note/.test(q)))) throw new Error("D1_ERROR: no such column: merge_note");
        if (/FROM agent_issues WHERE status='open' AND description LIKE '%code-task:%'/.test(q)) return { results: issues.filter((r) => r.description.includes("code-task:")) };
        if (/FROM code_tasks WHERE goal LIKE \?/.test(q)) { const tag = String(a[0]).replace(/%$/, ""); return { results: tasks.filter((t) => t.goal.indexOf(tag) === 0).sort((x, y) => (x.created_at < y.created_at ? 1 : -1)) }; }
        if (/FROM service_registry/.test(q)) return { results: [{ service: "qnfo-infra" }, { service: "qnfo-cloud-ops" }] };
        return { results: [] };
      },
    };
    return s;
  };
  return { env: { AUDIT_DB: { prepare: stmt, batch: async (xs) => xs.map(() => ({ results: [] })) } }, inserted, audits };
}

{
  const issues = [{ id: 1641, title: "EXTERNAL-MENTION-MONITOR-EMPTY-1: x", source: "qnfo-ops-deep-sweep-2026-09-30", description: "Fix it.\ncode-task: repo=qnfo-workers path=qnfo-cloud-ops/worker.js" }];
  const { env, inserted } = mkEnv(issues, []);
  await __intake(env, 2);
  ok(inserted.length === 0, "an untrusted source builds no code task", inserted);
  ok(/session-task: repo=qnfo-workers path=qnfo-cloud-ops\/worker\.js/.test(issues[0].description) && /INTAKE-PROVENANCE-1 .*not a trusted origin/.test(issues[0].description), "its line becomes a session-task line that says why", issues[0].description);
}
{
  const issues = [{ id: 1958, title: "METRIC-TRIGGER-1958-X: watch the changelog", source: "qnfo-fleet-control", description: "Do it.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js" }];
  const tasks = [{ id: "ct_old", goal: "[issue #1958] METRIC-TRIGGER-1958-X", status: "closed", last_error: "no required check (gate, mirror-guard) started within 3h", created_at: "2026-10-04T08:10:00Z", updated_at: "2026-10-04T11:10:00Z" }];
  const { env, inserted } = mkEnv(issues, tasks);
  await __intake(env, 2);
  ok(inserted.length === 1 && /^\[issue #1958\] \[retry 1\] METRIC-TRIGGER-1958-X/.test(inserted[0].goal), "a trusted issue whose task was closed long ago is retried with [issue #N] first and [retry 1]", inserted);
}
{
  const issues = [{ id: 7, title: "OWNER-TASK-7: x", source: "qnfo-fleet-dashboard:owner-request", description: "x\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js" }];
  const { env, inserted } = mkEnv(issues, [], { trusted: "qnfo-fleet-control|METRIC-TRIGGER-" });
  await __intake(env, 2);
  ok(inserted.length === 0, "ops_config code_merge_trusted_sources wins over the default when set", inserted);
}
{
  // a code_tasks table without the merge runner's merge_note column still dedupes (the fallback read), never a task per tick
  const issues = [{ id: 1, title: "Q08-VOTE-CUTOFF-1: x", source: "claude-session:Q08", description: "x\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js" }];
  const tasks = [{ id: "ct_a", goal: "[issue #1] Q08-VOTE-CUTOFF-1: x", status: "failed", last_error: "reply was empty", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
  const { env, inserted } = mkEnv(issues, tasks, { noMergeNote: true });
  await __intake(env, 2);
  ok(inserted.length === 0, "without merge_note the prior task is still read (cooldown holds), so no duplicate task", inserted);
  const u = mkEnv(issues, [], { tasksUnreadable: true });
  await __intake(u.env, 2);
  ok(u.inserted.length === 0, "an unreadable code_tasks history builds no task (fail closed)", u.inserted);
}
{
  // INTAKE-DEPENDS-1 (0.3.23): a "depends-on: #N" line holds the task until issue N is no longer open; unreadable waits too
  const mk = () => [{ id: 1996, title: "METRIC-TRIGGER-1996-X: lower flash share", source: "qnfo-fleet-control", description: "Switch after the A/B.\ndepends-on: #1818\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js" }];
  let w = mkEnv(mk(), [], { dep: { 1818: "open" } });
  await __intake(w.env, 2);
  ok(w.inserted.length === 0, "while #1818 is open, #1996 builds no task", w.inserted);
  ok(w.audits.some((x) => JSON.stringify(x).includes("code-task.intake-waiting") && JSON.stringify(x).includes("#1818")), "the wait is audited as code-task.intake-waiting naming #1818", w.audits);
  const n = w.audits.length;
  await __intake(w.env, 2);
  ok(w.inserted.length === 0 && w.audits.filter((x) => JSON.stringify(x).includes("intake-waiting")).length === 1 && w.audits.length === n, "the wait is audited once per isolate, not every tick", w.audits.length - n);
  w = mkEnv(mk(), [], { depUnreadable: true });
  await __intake(w.env, 2);
  ok(w.inserted.length === 0, "an unreadable dependency holds the task (fail closed)", w.inserted);
  w = mkEnv(mk(), [], {});
  await __intake(w.env, 2);
  ok(w.inserted.length === 0, "a dependency that does not exist holds the task", w.inserted);
  w = mkEnv(mk(), [], { dep: { 1818: "closed" } });
  await __intake(w.env, 2);
  ok(w.inserted.length === 1 && /^\[issue #1996\] METRIC-TRIGGER-1996-X/.test(w.inserted[0].goal), "once #1818 is closed the task is built on the next tick", w.inserted);
  w = mkEnv([{ id: 5, title: "METRIC-TRIGGER-5-X: y", source: "qnfo-fleet-control", description: "See depends-on: #1818 in prose.\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js" }], [], { dep: { 1818: "open" } });
  await __intake(w.env, 2);
  ok(w.inserted.length === 1, "only a line of its own counts, not the words in prose", w.inserted);
}
// CI-FEEDBACK-1 (0.5.0): a retry leads with why the previous task failed, and the goal still fits validTask's 2000 chars.
{
  const failNote = "required check(s) failed on c9d25b5: gate=failure; failing: gate: FAIL q08-signal-engine/quality.test.mjs | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: | 4000 !== 2000 | at q08-signal-engine/quality.test.mjs:190:37 {";
  ok(__prevFail({ id: "ct_a", merge_note: failNote }) === "PREVIOUS ATTEMPT ct_a FAILED: " + failNote + " Keep every behaviour the worker's existing tests pin; change only what the goal needs.", "the previous failure is quoted from the task's merge_note");
  ok(/^PREVIOUS ATTEMPT ct_b FAILED: the JS verifier/.test(__prevFail({ id: "ct_b", last_error: "merge-runner: the JS verifier could not confirm the syntax" })), "last_error is used when there is no merge_note, without its merge-runner: prefix");
  ok(__prevFail({ id: "ct_c" }) === "" && __prevFail(null) === "", "no failure text, no line");
  const g0 = __goal("[issue #9]", 0, "X-1: title", "", "body");
  ok(g0 === "[issue #9] X-1: title\nbody", "a first task's goal is unchanged in shape", g0);
  const long = "y".repeat(1500);
  const g1 = __goal("[issue #9]", 1, "X-1: " + "t".repeat(300), __prevFail({ id: "ct_a", merge_note: "z".repeat(5000) }), long);
  ok(g1.length <= 2000 && /^\[issue #9\] \[retry 1\] X-1: t+\nPREVIOUS ATTEMPT ct_a FAILED: z{700} Keep every behaviour/.test(g1), "the failure comes first, is capped, and the body is cut so the goal stays within 2000 chars", g1.length);
  const issues = [{ id: 2085, title: "METRIC-TRIGGER-806-X: panel", source: "qnfo-fleet-control", description: "Read the ensemble.\n" + "w".repeat(1400) + "\ncode-task: repo=qnfo-workers path=qnfo-infra/worker.js" }];
  const tasks = [{ id: "ct_0jiys30uonkcps", goal: "[issue #2085] METRIC-TRIGGER-806-X", status: "failed", last_error: "merge-runner: " + failNote, merge_note: failNote, created_at: "2026-10-06T23:00:00Z", updated_at: "2026-10-07T00:00:00Z" }];
  const w2 = mkEnv(issues, tasks);
  await __intake(w2.env, 2);
  ok(w2.inserted.length === 1 && w2.inserted[0].goal.length <= 2000 && /^\[issue #2085\] \[retry 1\] METRIC-TRIGGER-806-X: panel\nPREVIOUS ATTEMPT ct_0jiys30uonkcps FAILED: required check\(s\) failed on c9d25b5: gate=failure; failing: gate: FAIL q08-signal-engine\/quality\.test\.mjs/.test(w2.inserted[0].goal) && /4000 !== 2000/.test(w2.inserted[0].goal), "end to end: the retried task's goal carries the failing suite and values ahead of the long issue body", w2.inserted[0] && w2.inserted[0].goal.slice(0, 300));
}
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

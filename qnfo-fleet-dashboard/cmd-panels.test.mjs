// CMD-TASKS-1, CMD-UNDO-1, CMD-SKILLS-1 (qnfo-fleet-dashboard 1.96.0; issues 9673, 9674, 9675): the command line's task list, one-tap undo card and skill search.
// The helpers are cut from the worker source and run against a fake env; the routes are pinned by shape.
// Run: node qnfo-fleet-dashboard/cmd-panels.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const a = src.indexOf("var CMD_UNDO_REPO"), b = src.indexOf("var CMD_PANELS_JS");
ok(a > 0 && b > a, "the panel helpers are in the worker");
const code = src.slice(a, b) + "\nthis.f = { cmdSessionIdOf, cmdLatestTasks, cmdTasksText, cmdUndoCandidates, cmdUndoPr, cmdSkillsText };";
const calls = [];
const sandbox = {
  String, Number, Object, Math, Date, JSON, Promise, Array, encodeURIComponent, console,
  cmdRandHex: () => "abc1234567",
  cmdCodeSessionGet: async (env, path) => { calls.push(path); return env.sessions[path] || { ok: false, error: "no such code session" }; },
  ghCall: async (env, method, path, body) => { calls.push(method + " " + path); return env.gh(method, path, body); }
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const f = sandbox.f;

ok(f.cmdSessionIdOf({ actions_json: '{"session_id":"run_abcdef123456"}' }) === "run_abcdef123456", "the session id is read from actions_json");
ok(f.cmdSessionIdOf({ answer: "session:run_abcdef123456 turn:2" }) === "run_abcdef123456", "an unsettled row still yields its session id from the answer");
ok(f.cmdSessionIdOf({ answer: "done" }) === "", "no session id, no link");

// a fake D1 that answers by SQL text
function fakeEnv(opts) {
  const inserted = [];
  const prep = (sql) => ({
    bind: (...args) => ({
      all: async () => ({ results: opts.rows(sql, args) }),
      first: async () => (opts.rows(sql, args)[0] || null),
      run: async () => { inserted.push({ sql, args }); return {}; }
    }),
    all: async () => ({ results: opts.rows(sql, []) })
  });
  return { AUDIT: { prepare: prep }, inserted, sessions: opts.sessions || {}, gh: opts.gh || (() => ({ ok: false, status: 500, json: null })) };
}

// tasks: the newest session without tasks does not hide an older one that has them; the list is the one a reload shows
const tasksEnv = fakeEnv({
  rows: (sql) => /FROM cmd_log WHERE kind = 'agent-stream'/.test(sql) ? [
    { id: "c2", ts: "2026-11-09 10:00:00", actions_json: '{"session_id":"run_new00000001"}' },
    { id: "c1", ts: "2026-11-09 09:00:00", actions_json: '{"session_id":"run_old00000001"}' }] : [],
  sessions: {
    "/code-sessions/run_new00000001/tasks": { ok: true, plan: null, tasks: [], summary: { total: 0, done: 0, doing: 0 } },
    "/code-sessions/run_old00000001/tasks": { ok: true, plan: "Ship the fix", tasks: [{ id: 1, title: "edit", status: "done" }, { id: 2, title: "verify", status: "doing" }], summary: { total: 2, done: 1, doing: 1 } }
  }
});
const tl = await f.cmdLatestTasks(tasksEnv);
ok(tl.ok && tl.session_id === "run_old00000001" && tl.tasks.length === 2, "the latest session that has tasks supplies the list", tl);
const tt = f.cmdTasksText(tl);
ok(/Ship the fix \(1 of 2 done\)/.test(tt) && /\[x\] 1\. edit/.test(tt) && /\[~\] 2\. verify/.test(tt), "the typed form shows progress and each task state", tt);
ok(/No task list yet/.test(f.cmdTasksText({ ok: true, tasks: [], summary: {} })), "an empty list says so");

// undo candidates: a PR already undone is not offered again
const undoEnv = fakeEnv({
  rows: (sql) => /FROM code_task_pr_links/.test(sql) ? [{ task_id: "t1", pr_number: 11, merged_at: "2026-11-09T08:00:00Z" }, { task_id: "t2", pr_number: 12, merged_at: "2026-11-09T07:00:00Z" }]
    : /kind = 'undo'/.test(sql) ? [{ text: "undo 11" }] : [],
  gh: (m, p) => ({ ok: true, status: 200, json: { title: "Agent change " + p.split("/").pop() } })
});
const uc = await f.cmdUndoCandidates(undoEnv);
ok(uc.ok && uc.prs.length === 1 && uc.prs[0].pr === 12 && /Agent change 12/.test(uc.prs[0].title), "an already undone PR is not offered again", uc);

// undo: refuses a PR that is not an agent merge, an unmerged PR, and opens the revert through revertPullRequest
const none = await f.cmdUndoPr(fakeEnv({ rows: () => [] }), 99);
ok(!none.ok && /not a merged agent pull request/.test(none.error), "a PR the code loop did not merge is refused", none);
ok(!(await f.cmdUndoPr(fakeEnv({ rows: () => [] }), "abc")).ok, "a non-number is refused");
const unmerged = await f.cmdUndoPr(fakeEnv({ rows: (sql) => /code_task_pr_links/.test(sql) ? [{ pr_number: 5 }] : [], gh: () => ({ ok: true, status: 200, json: { node_id: "PR_x", merged: false, title: "t" } }) }), 5);
ok(!unmerged.ok && /not merged/.test(unmerged.error), "an unmerged PR has nothing to revert", unmerged);
const good = fakeEnv({
  rows: (sql) => /code_task_pr_links/.test(sql) ? [{ pr_number: 7 }] : [],
  gh: (m, p, body) => m === "POST" ? { ok: true, status: 200, json: { data: { revertPullRequest: { revertPullRequest: { number: 70, url: "https://github.com/QNFO/qnfo-workers/pull/70" } } } } } : { ok: true, status: 200, json: { node_id: "PR_abc", merged: true, title: "Fix a thing" } }
});
const done = await f.cmdUndoPr(good, 7);
ok(done.ok && done.revert_pr === 70 && /pull\/70/.test(done.url), "undo opens the revert PR", done);
ok(calls.some((c) => c === "POST /graphql"), "the revert goes through GitHub's revertPullRequest mutation");
ok(good.inserted.some((x) => /'undo', 'done'/.test(x.sql) && x.args[1] === "undo 7"), "every undo is a cmd_log row");
const failing = await f.cmdUndoPr(fakeEnv({ rows: (sql) => /code_task_pr_links/.test(sql) ? [{ pr_number: 8 }] : [], gh: (m) => m === "POST" ? { ok: true, status: 200, json: { errors: [{ message: "Resource not accessible" }] } } : { ok: true, status: 200, json: { node_id: "N", merged: true, title: "t" } } }), 8);
ok(!failing.ok && /Resource not accessible/.test(failing.error), "a GitHub refusal is reported with its text", failing);

ok(/No skill matches "zz"/.test(f.cmdSkillsText({ ok: true, skills: [], count: 15 }, "zz")) && /1 skills matching "pr"/.test(f.cmdSkillsText({ ok: true, skills: [{ name: "pull-request", what: "x" }] }, "pr")), "the skills text names a miss and a hit");

// wiring by shape
ok(/undo: \{ destructive: true, label: "Undo agent PR" \}/.test(src), "undo is a destructive op, so it needs a fresh code");
ok(/if \(op === "undo"\) return await cmdUndoPr\(env, args && args\.pr\)/.test(src), "cmdExec runs undo");
ok(/path === "\/api\/cmd\/tasks"/.test(src) && /path === "\/api\/cmd\/undo"/.test(src) && /path === "\/api\/cmd\/skills"/.test(src), "the three panel routes exist");
ok(/\+ cmdPanelHtml\(holder, from, q\) \+ cmdPanelsHtml\(\)/.test(src), "the /cmd page carries the panels");
ok(/actions_json\) VALUES \(\?1, \?2, \?3, 'agent-stream'/.test(src), "the stream row keeps its session id so the task list survives settling");

console.log((fail ? "FAIL" : "PASS") + " cmd-panels " + pass + " ok, " + fail + " failed");
process.exit(fail ? 1 : 0);

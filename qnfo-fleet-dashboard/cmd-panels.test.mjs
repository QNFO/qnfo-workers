// CMD-TASKS-1, CMD-SKILLS-1 (issues 9673, 9675): the command line's persistent code-session plan and skill search (undo is main's CMD-TASKS-UNDO-1).
// The helpers are cut from the worker source and run against a fake env; the routes are pinned by shape.
// Run: node qnfo-fleet-dashboard/cmd-panels.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const a = src.indexOf("function cmdSessionIdOf"), b = src.indexOf("var CMD_PANELS_JS");
ok(a > 0 && b > a, "the panel helpers are in the worker");
const code = src.slice(a, b) + "\nthis.f = { cmdSessionIdOf, cmdLatestTasks, cmdTasksText, cmdSkillsText };";
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


ok(/No skill matches "zz"/.test(f.cmdSkillsText({ ok: true, skills: [], count: 15 }, "zz")) && /1 skills matching "pr"/.test(f.cmdSkillsText({ ok: true, skills: [{ name: "pull-request", what: "x" }] }, "pr")), "the skills text names a miss and a hit");

// wiring by shape
ok(/path === "\/api\/cmd\/session-tasks"/.test(src) && /path === "\/api\/cmd\/skills"/.test(src), "the session-plan and skills routes exist");
ok(/cmdTasksPanelHtml\(\) \+ cmdPanelsHtml\(\)/.test(src), "the /cmd page carries the panels");
ok(/actions_json\) VALUES \(\?1, \?2, \?3, 'agent-stream'/.test(src), "the stream row keeps its session id so the task list survives settling");

console.log((fail ? "FAIL" : "PASS") + " cmd-panels " + pass + " ok, " + fail + " failed");
process.exit(fail ? 1 : 0);

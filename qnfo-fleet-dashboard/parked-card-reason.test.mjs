// PARKED-CARD-REASON-1 offline suite (qnfo-fleet-dashboard 1.51.16, agent_issues 100173). Proves: the owner card of a parked code task (status needs_human) says what blocked it,
// for the last_error shapes the loop really writes: a model verdict is prefixed ("model @cf/<id>: noop-proposal: ..." and "model @cf/<id> proposed no change"), so the cause is
// found anywhere in the text; a merge-scope refusal and an unknown error keep their wording; and the card text never claims a failed verification for a task that never got a proposal.
// Also proves the execOne dispatch path no longer carries a last_error branch (fleet_issue_dispatch has no such column).
// Run: node qnfo-fleet-dashboard/parked-card-reason.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const start = src.indexOf('await read("code-tasks", async function() {');
const end = src.indexOf("// OWNER-SURFACE-HONESTY-1", start);
ok(start > 0 && end > start, "the code-tasks block is found");
const block = src.slice(start, end).trim().replace(/^await read\("code-tasks", /, "").replace(/\);\s*$/, "");

const REAL = {
  "ct_noop": "model @cf/openai/gpt-oss-120b: noop-proposal: the edit changes only the words inside string literals or comments (1 line); it builds nothing of the goal",
  "ct_nochange": "model @cf/zai-org/glm-5.3 proposed no change",
  "ct_scope": "MERGE-SCOPE-AT-READ-1: path migrations/. is outside the merge runner's auto-merge scope (a worker.js with its mirror, docs/**.md)",
  "ct_scope_closed": "MERGE-SCOPE-AT-READ-1: the issue is closed and the rule was lifted",
  "ct_fold": "FOLD-PAIR-TASK-1: FAIL qnfo-research-exec/reviser-fold.test.mjs: FAIL every reviser line is in the host",
  "ct_empty": "",
};
const rows = Object.keys(REAL).map((id) => ({ id, goal: "goal of " + id, repo: "qnfo-workers", last_error: REAL[id], pr_url: null, updated_at: "2026-10-19T10:00:00Z" }));
const cards = [];
const squash = (s) => String(s).replace(/\s+/g, " ").trim();
const sb = { cards, rows, squash, ageDaysOf: () => 1, String, d1all: async () => rows, env: { AUDIT: {} }, add: (c) => cards.push(c), read: async (name, fn) => { await fn(); } };
vm.createContext(sb);
await vm.runInContext("(async () => { await read(\"code-tasks\", " + block + "); })()", sb);
const by = (id) => cards.find((c) => c.key === "code:" + id);
ok(cards.length === rows.length, "one card per parked task", cards.length);
ok(/changes only text, no behaviour/.test(by("ct_noop").why) && !/could not verify/.test(by("ct_noop").why) && /Narrow the goal or give a code-anchor/.test(by("ct_noop").action), "a model-prefixed noop-proposal gets the text-only card", by("ct_noop"));
ok(/proposed no change/.test(by("ct_nochange").why) && !/could not verify/.test(by("ct_nochange").why) && /code-anchor/.test(by("ct_nochange").action), "a model-prefixed no-change verdict gets its own card", by("ct_nochange"));
ok(/^Refused at read: /.test(by("ct_scope").why) && /re-queues it/.test(by("ct_scope").action), "a merge-scope refusal says it was refused at read", by("ct_scope"));
ok(/issue is closed/.test(by("ct_scope_closed").why) && /superseded/.test(by("ct_scope_closed").action), "a merge-scope refusal for a closed issue says the task is superseded", by("ct_scope_closed"));
ok(/^The code loop could not verify this change itself\. FOLD-PAIR-TASK-1/.test(by("ct_fold").why) && by("ct_fold").action === "Review or drop it.", "an error that is a failed check keeps the verification wording and the error", by("ct_fold"));
ok(/could not verify/.test(by("ct_empty").why) && by("ct_empty").fallback === "Nothing is merged or deployed until it is verified.", "an empty error keeps today's wording");
ok(new Set([by("ct_noop").why, by("ct_nochange").why, by("ct_scope").why, by("ct_fold").why]).size === 4, "the card texts differ by cause");

// The dispatch path: PR 3106 added a last_error branch to execOne; fleet_issue_dispatch has no last_error column, so it is gone.
const exec = src.slice(src.indexOf("async function execOne("), src.indexOf("async function execOne(") + 6000);
ok(!/row\.last_error/.test(exec) && !/noteMsg/.test(exec) && /bind\(state2, now, spec && spec\.note \|\| "no safe auto-action", row\.fingerprint\)/.test(exec), "execOne writes the spec note as before");
ok(/^var VERSION = "(\d+)\.(\d+)\.(\d+)/m.exec(src) && (() => { const m = /^var VERSION = "(\d+)\.(\d+)\.(\d+)/m.exec(src); return +m[1] > 1 || +m[2] > 51 || +m[3] >= 16; })(), "VERSION is at least 1.51.16");
console.log("parked-card-reason: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

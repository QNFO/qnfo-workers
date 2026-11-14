// DRAFT-PR-PER-ISSUE-1 offline suite. Run: node qnfo-github-steward/draft-pr.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const w = { __test: await import(pathToFileURL(join(here, "worker.js")).href) };
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT); INSERT INTO metric_registry (metric) VALUES ('issues_without_draft_pr'); CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, pr_url TEXT, merged_at TEXT, updated_at TEXT);");
const prep = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { db.prepare(sql).run(...a); return { meta: { changes: 1 } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; };
const env = { AUDIT: { prepare: prep }, GITHUB_TOKEN: "t" };
const issues = [101, 102, 103, 104, 105, 106].map((n) => ({ number: n, title: "[#" + (9000 + n) + "] thing " + n, labels: [{ name: "fleet-issue" }] }));
let prs = [{ number: 7, title: "fix", body: "Refs #101", head: { ref: "codeagent-x" } }], calls = [], failBranch = false;
const reply = (s, b) => new Response(JSON.stringify(b), { status: s });
globalThis.fetch = async (url, init) => {
  const u = new URL(url), m = (init && init.method) || "GET", body = init && init.body ? JSON.parse(init.body) : null;
  calls.push(m + " " + u.pathname);
  const page = Number(u.searchParams.get("page") || 1);
  if (m === "GET" && u.pathname.endsWith("/issues")) return reply(200, page > 1 ? [] : issues);
  if (m === "GET" && u.pathname.endsWith("/pulls")) return reply(200, page > 1 ? [] : prs);
  if (m === "GET" && u.pathname.endsWith("/git/ref/heads/main")) return reply(200, { object: { sha: "abc" } });
  if (m === "POST" && u.pathname.endsWith("/git/refs")) return failBranch ? reply(403, { message: "no" }) : reply(201, {});
  if (m === "PUT" && u.pathname.includes("/contents/docs/handoff/issue-")) { assert.ok(/status: draft/.test(Buffer.from(body.content, "base64").toString())); return reply(201, {}); }
  if (m === "POST" && u.pathname.endsWith("/pulls")) { assert.equal(body.draft, true); assert.ok(/^Refs #\d+/.test(body.body) && !/closes/i.test(body.body)); prs.push({ number: 500 + prs.length, title: body.title, body: body.body, head: { ref: body.head } }); return reply(201, { number: 500 }); }
  return reply(404, {});
};
const out = { errors: [] };
await w.__test.tsDraftPrs(env, out);
assert.equal(out.errors.length, 0, JSON.stringify(out.errors));
assert.deepEqual(out.draft_prs.created, [102, 103, 104, 105], "#101 already has a PR; 4 per tick, oldest first");
assert.equal(out.draft_prs.without_draft_pr, 5);
assert.equal(db.prepare("SELECT last_value v FROM metric_registry").get().v, "1");
// idempotent: second tick drafts only #106
const out2 = { errors: [] }; await w.__test.tsDraftPrs(env, out2);
assert.deepEqual(out2.draft_prs.created, [106]);
const out3 = { errors: [] }; await w.__test.tsDraftPrs(env, out3);
assert.deepEqual(out3.draft_prs.created, [], "nothing left: no duplicates");
// refusal is reported, not swallowed
prs = []; failBranch = true; const out4 = { errors: [] }; await w.__test.tsDraftPrs(env, out4);
assert.equal(out4.errors[0].status, 403);
// kill switch
db.exec("INSERT INTO ops_config VALUES ('draft_pr_per_issue','off')"); failBranch = false; const out5 = { errors: [] }; await w.__test.tsDraftPrs(env, out5);
assert.equal(out5.draft_prs.off, true);
// DP-SHELL-LIFECYCLE-1: shells close when a doer carries the issue or the issue closed; doer-less shells stay draft; D1 tags are not GitHub numbers.
assert.deepEqual(w.__test.dpIssueRefs({ title: "code-task: [issue #2577] [retry 7] x", body: "", head: { ref: "codeagent-abc" } }), { gh: {}, d1: { 2577: 1 } }, "a code-loop tag names the D1 id, not GitHub #2577");
assert.deepEqual(w.__test.dpIssueRefs({ title: "Draft for #5184: y", body: "Refs #5184 (D1 agent_issues 1000747)", head: { ref: "agent-steward/issue-5184" } }), { gh: { 5184: 1 }, d1: { 1000747: 1 } });
assert.deepEqual(w.__test.dpIssueRefs({ title: "[issue #1003520] q08", body: "", head: { ref: "ops/issue-1003520-q08" } }).gh, {});
db.exec("DELETE FROM ops_config");
const iso = (h) => new Date(Date.now() - h * 36e5).toISOString();
db.exec("INSERT INTO code_tasks VALUES ('ct_a','[issue #5002] fix b','merged','https://github.com/QNFO/qnfo-workers/pull/900','" + iso(1) + "','" + iso(1) + "')," +
  "('ct_b','[issue #5004] fix d','merged','https://github.com/QNFO/qnfo-workers/pull/901','" + iso(100) + "','" + iso(100) + "')," +
  "('ct_im5005','[issue #5005] fix e','queued',NULL,NULL,'" + iso(0.1) + "')," +
  "('ct_c','[issue #5003] old try','failed',NULL,NULL,'" + iso(2) + "')," +
  "('ct_rd','" + "x".repeat(300) + " -- issue #5099 (RED-DRAIN-1 child) " + "y".repeat(300) + "','queued',NULL,NULL,'" + iso(0.2) + "')");
{ const by = await w.__test.dpDoerTasks(env, Date.now()); assert.equal(by["5099"] && by["5099"].id, "ct_rd", "a RED-DRAIN-1 tag deep in a long goal is still read"); assert.ok(by["5005"] && by["5002"] && !by["5004"] && !by["5003"], "live and recently merged only"); assert.ok(by["5099"].goal.length < 100, "goal is trimmed in SQL"); }
const issues2 = [[201, 5001], [202, 5002], [203, 5003], [204, 5004], [205, 5005], [206, 9206]].map(([n, d]) => ({ number: n, title: "[#" + d + "] thing " + n }));
const shell = (n, draft) => ({ number: 600 + n, node_id: "PR_" + n, draft, title: "Draft for #" + n + ": thing", body: "Refs #" + n, head: { ref: "agent-steward/issue-" + n } });
let prs2 = [shell(201, false), shell(202, false), shell(203, false), shell(299, true), shell(204, true),
  { number: 700, title: "code-task: [issue #5001] fix a", body: "", head: { ref: "codeagent-aa" } },
  { number: 701, title: "code-task: [issue #206] other", body: "", head: { ref: "codeagent-bb" } }];
const closedPrs = [], comments = [], redrafts = [], created2 = [];
globalThis.fetch = async (url, init) => {
  const u = new URL(url), m = (init && init.method) || "GET", body = init && init.body ? JSON.parse(init.body) : null;
  const page = Number(u.searchParams.get("page") || 1);
  if (m === "GET" && u.pathname.endsWith("/issues")) return reply(200, page > 1 ? [] : issues2);
  if (m === "GET" && u.pathname.endsWith("/pulls")) return reply(200, page > 1 ? [] : prs2);
  if (m === "POST" && /\/issues\/\d+\/comments$/.test(u.pathname)) { comments.push(body.body); return reply(201, {}); }
  if (m === "PATCH" && /\/pulls\/\d+$/.test(u.pathname)) { assert.equal(body.state, "closed"); closedPrs.push(Number(u.pathname.split("/").pop())); return reply(200, {}); }
  if (m === "POST" && u.pathname === "/graphql") { assert.ok(/convertPullRequestToDraft/.test(body.query)); redrafts.push(body.variables.id); return reply(200, { data: { convertPullRequestToDraft: { pullRequest: { number: 1, isDraft: true } } } }); }
  if (m === "GET" && u.pathname.endsWith("/git/ref/heads/main")) return reply(200, { object: { sha: "abc" } });
  if (m === "POST" && u.pathname.endsWith("/git/refs")) return reply(201, {});
  if (m === "PUT" && u.pathname.includes("/contents/docs/handoff/issue-")) return reply(201, {});
  if (m === "POST" && u.pathname.endsWith("/pulls")) { created2.push(body.head); return reply(201, { number: 800 }); }
  return reply(404, {});
};
const o6 = { errors: [] }; await w.__test.tsDraftPrs(env, o6);
assert.deepEqual(o6.errors, []);
assert.deepEqual(closedPrs, [801, 802, 899], "201: open PR #700 carries D1 5001; 202: merged task 1 h ago; 299: issue closed");
assert.ok(/pull request #700 carries it/.test(comments[0]) && /ct_a \(merged/.test(comments[1]) && /no longer open/.test(comments[2]));
assert.deepEqual(redrafts, ["PR_203"], "203 has no doer (its only task failed): kept and turned back to draft; 204 is already draft");
assert.equal(o6.draft_prs.shells_kept, 2, "203 and 204 (merged 100 h ago, issue still open = doer gap) keep their shells");
assert.deepEqual(created2, ["agent-steward/issue-206"], "205 has a queued doer; 206 is not covered by a D1 tag that happens to read #206");
assert.equal(o6.draft_prs.steward_drafts_open, 2);
assert.equal(o6.draft_prs.doer_covered, 3, "201, 202, 205");
// the sweep is bounded
prs2 = Array.from({ length: 14 }, (_, i) => shell(300 + i, true)); closedPrs.length = 0;
const o7 = { errors: [] }; await w.__test.tsDraftPrs(env, o7);
assert.equal(closedPrs.length, 10, "at most DP_SWEEP_MAX shells closed per tick");
// D1 unreadable: no doer cover, but nothing breaks and the error is reported
const envBad = { AUDIT: { prepare: (sql) => /code_tasks/.test(sql) ? { bind: () => ({ all: async () => { throw new Error("D1 overloaded"); } }) } : prep(sql) }, GITHUB_TOKEN: "t" };
prs2 = [shell(203, true)]; closedPrs.length = 0;
const o8 = { errors: [] }; await w.__test.tsDraftPrs(envBad, o8);
assert.ok(/code_tasks unreadable/.test(o8.errors[0].why)); assert.deepEqual(closedPrs, []);
console.log("draft-pr.test.mjs ok");


// DRAFT-PR-PER-ISSUE-1 offline suite. Run: node qnfo-github-steward/draft-pr.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const w = { __test: await import(pathToFileURL(join(here, "worker.js")).href) };
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT); INSERT INTO metric_registry (metric) VALUES ('issues_without_draft_pr');");
const prep = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { db.prepare(sql).run(...a); return { meta: { changes: 1 } }; }, first: async () => db.prepare(sql).get(...a) || null }; return st; };
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
console.log("draft-pr.test.mjs ok");

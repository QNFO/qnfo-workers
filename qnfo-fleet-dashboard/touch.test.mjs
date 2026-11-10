// TOUCHPOINTS-1 (qnfo-fleet-dashboard 1.107.0) offline suite: fleet.qnfo.org/touch shows the touchpoint metrics, the reply drafts to approve and the day's taps;
// a visitor sees them without buttons; a signed-in Approve or Done records the decision; the GitHub tick never stars or follows by API (GitHub's rules forbid automated
// starring), prunes archived and quantum-only stars, proposes "star and follow the maintainer" taps for scored repositories, and verifies a tap from GitHub itself.
// Run: node qnfo-fleet-dashboard/touch.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const db = new DatabaseSync(":memory:");
const mig = readFileSync(join(here, "../migrations/2026-11-10-touchpoints.sql"), "utf8");
for (const stmt of mig.split(/;\s*\n/)) { const s = stmt.replace(/^--.*$/gm, ""); if (/^\s*CREATE (TABLE|INDEX)/m.test(s)) db.exec(s + ";"); }
db.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT)");
db.exec("INSERT INTO metric_registry VALUES ('touchpoints_7d','12','2026-11-10T10:00:00Z','MEASURED'),('touch_reciprocation_30d','0.2','2026-11-10T10:00:00Z','MEASURED'),('touch_stale_follows','3','2026-11-10T10:00:00Z','MEASURED')");
const wrap = (d) => ({ prepare(sql) { const mk = (args) => ({ bind: (...a) => mk(a), run: async () => { const r = d.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }, first: async () => d.prepare(sql).get(...args) || null, all: async () => ({ results: d.prepare(sql).all(...args) }) }); return mk([]); } });
const LOOP = "loop-secret-touch-test";
const calls = [];
let starred = [
  { full_name: "old/quantum-sim", description: "Quantum circuit simulator for qubits", topics: ["quantum"], archived: false, pushed_at: "2026-10-01T00:00:00Z", html_url: "https://github.com/old/quantum-sim", stargazers_count: 400, owner: { login: "old", type: "User" } },
  { full_name: "gone/archived-tool", description: "agent evals", topics: [], archived: true, pushed_at: "2022-01-01T00:00:00Z", html_url: "https://github.com/gone/archived-tool", stargazers_count: 90, owner: { login: "gone", type: "User" } },
  { full_name: "rwnq8/resume", description: "own", topics: [], archived: false, pushed_at: "2026-11-01T00:00:00Z", html_url: "https://github.com/rwnq8/resume", stargazers_count: 1, owner: { login: "rwnq8", type: "User" } }
];
let nowStarred = {};
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = async (url, init) => {
  const u = String(url), m = (init && init.method) || "GET";
  if (!u.startsWith("https://api.github.com")) return res(503, {});
  const p = u.slice("https://api.github.com".length);
  calls.push(m + " " + p.split("?")[0]);
  if (m === "PUT" || m === "POST") return res(500, { message: "the test forbids writes other than DELETE" });
  if (m === "DELETE") return res(204, null);
  if (p.startsWith("/user/starred?")) return res(200, p.includes("page=1") ? starred : []);
  if (p.startsWith("/user/starred/")) return res(nowStarred[p.slice(14)] ? 204 : 404, null);
  if (p.startsWith("/user/following?")) return res(200, []);
  if (p.startsWith("/user/following/")) return res(404, null);
  if (p.startsWith("/search/repositories")) return res(200, { items: [{ full_name: "acme/agent-evals", description: "Evaluation harness for AI agents and their failure modes", topics: ["ai-agents", "evals"], archived: false, pushed_at: "2026-11-09T00:00:00Z", html_url: "https://github.com/acme/agent-evals", stargazers_count: 1200, open_issues_count: 10, owner: { login: "acme", type: "Organization" } }] });
  if (p.startsWith("/search/issues")) return res(200, { total_count: 30 });
  if (p.startsWith("/repos/acme/agent-evals/contributors")) return res(200, [{ login: "maya", type: "User" }]);
  if (p === "/users/maya") return res(200, { login: "maya", name: "Maya", bio: "AI safety evaluations", html_url: "https://github.com/maya", followers: 900, following: 300 });
  if (p.startsWith("/users/maya/events")) return res(200, [{ type: "IssueCommentEvent", created_at: "2026-11-09T00:00:00Z", repo: { name: "acme/agent-evals" } }, { type: "PushEvent", created_at: "2026-11-08T00:00:00Z", repo: { name: "acme/agent-evals" } }]);
  if (p.startsWith("/users/maya/following/rwnq8")) return res(404, null);
  return res(404, {});
};
const env = { AUDIT: wrap(db), LOOP_TOKEN: LOOP, GITHUB_TOKEN: "test-token" };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const call = (p, o) => worker.fetch(new Request("https://fleet.qnfo.org" + p, o || {}), env, ctx);

// GitHub tick 1: audit and discovery (qnfo-social scores rows later; mark quantum like it would)
let r = await call("/api/touch/github-run", { method: "POST", headers: { "x-loop-token": LOOP } });
let j = await r.json();
ok(r.status === 200 && j.stars === 2, "stars read, own repositories left out", j);
ok(!calls.some((c) => /^(PUT|POST) /.test(c)), "no star or follow is written by API", calls);
ok(db.prepare("SELECT COUNT(*) n FROM touch_targets WHERE platform='github-repo' AND handle='acme/agent-evals' AND state='candidate'").get().n === 1 && db.prepare("SELECT reply_share FROM touch_targets WHERE handle='acme/agent-evals'").get().reply_share === 0.75, "discovered repository with maintainer responsiveness as evidence");
ok(db.prepare("SELECT COUNT(*) n FROM touch_targets WHERE platform='github' AND handle='maya'").get().n === 1, "its maintainer is a candidate too");
ok(calls.includes("DELETE /user/starred/gone/archived-tool"), "archived star pruned in the same run (no push date)", calls.filter((c) => c.startsWith("DELETE")));
// qnfo-social scores: quantum-only flag and the repo score
db.prepare("UPDATE touch_targets SET quantum_only = 1, scored_at = '2026-11-10T11:00:00Z' WHERE handle = 'old/quantum-sim'").run();
db.prepare("UPDATE touch_targets SET score = 80, topics = 'agents,evals', scored_at = '2026-11-10T11:00:00Z' WHERE handle = 'acme/agent-evals'").run();
calls.length = 0;
r = await call("/api/touch/github-run", { method: "POST", headers: { "x-loop-token": LOOP } });
j = await r.json();
ok(calls.includes("DELETE /user/starred/old/quantum-sim") && j.unstarred === 1, "quantum-only star pruned", j);
ok(j.taps === 1 && db.prepare("SELECT COUNT(*) n FROM touch_actions WHERE platform='github' AND mode='tap' AND status='proposed'").get().n === 2, "star tap plus maintainer follow tap proposed", j);
const tap = db.prepare("SELECT * FROM touch_actions WHERE kind='star'").get();
ok(/Then follow maya/.test(tap.note) && tap.url === "https://github.com/acme/agent-evals", "tap names the maintainer and links the repo", tap);
// the owner stars it on GitHub: the next tick sees it without a Done tap
nowStarred["acme/agent-evals"] = 1;
r = await call("/api/touch/github-run", { method: "POST", headers: { "x-loop-token": LOOP } });
j = await r.json();
ok(j.verified === 1 && db.prepare("SELECT status FROM touch_actions WHERE id=?").get(tap.id).status === "done", "star verified on GitHub", j);

// the page
db.prepare("INSERT INTO touch_actions (platform, target, kind, mode, status, text, url, grounding, day) VALUES ('bluesky','alice','reply','approve','proposed','Where does the audit trail live when the agent rewrites its own logs?','https://bsky.app/x','Agents should keep audit trails','2026-11-10')").run();
db.prepare("INSERT INTO touch_actions (platform, target, kind, mode, status, url, note, day) VALUES ('linkedin','jane-doe','tap-follow','tap','proposed','https://www.linkedin.com/in/jane-doe/recent-activity/all/','Jane, score 70 on bluesky','2026-11-10')").run();
r = await call("/touch");
let html = await r.text();
ok(r.status === 200 && /<h1>Touchpoints<\/h1>/.test(html) && /class="ds"/.test(html), "GET /touch answers with the design system");
ok(/Touches, 7 days<\/div><div class="v">12/.test(html) && /20%/.test(html), "metrics shown");
ok(/Reply to alice on Bluesky/.test(html) && /They wrote/.test(html) && /Follow jane-doe on LinkedIn/.test(html), "drafts and taps shown");
ok(!/<form method="post" action="\/touch"/.test(html) && /Sign in/.test(html), "not signed in: no buttons");
ok(!/<script/i.test(html), "no script on the page");
r = await call("/touch", { headers: { "x-loop-token": LOOP } });
html = await r.text();
ok((html.match(/btn btn-primary/g) || []).length === 1, "one primary action on the page");
const draft = db.prepare("SELECT id FROM touch_actions WHERE kind='reply'").get().id;
r = await call("/touch", { method: "POST", headers: { "x-loop-token": LOOP, "content-type": "application/x-www-form-urlencoded" }, body: "id=" + draft + "&act=approve" });
ok(r.status === 303 && db.prepare("SELECT status FROM touch_actions WHERE id=?").get(draft).status === "approved", "Approve records the decision");
r = await call("/touch", { method: "POST", headers: { "x-loop-token": LOOP, "content-type": "application/x-www-form-urlencoded" }, body: "id=" + draft + "&act=approve" });
ok(/already/.test(decodeURIComponent(r.headers.get("location") || "")), "a second tap changes nothing");
r = await call("/touch", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=1&act=skip" });
ok(r.status === 401, "a visitor cannot decide");
r = await call("/api/touch");
j = await r.json();
ok(j.ok && j.metrics.touchpoints_7d.value === "12" && Array.isArray(j.taps), "GET /api/touch is open JSON");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

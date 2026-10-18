// TRACKER-SYNC-1 offline suite: agent_issues are mirrored to GitHub issues and kept in state, code_tasks follow their PRs,
// and the sync refuses to act on a partial or anomalous GitHub read. Run: node qnfo-github-steward/tracker-sync.test.mjs
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const VERSION = /var VERSION = "(\d+)\.(\d+)/.exec(readFileSync(join(here, "worker.js"), "utf8"));
assert.ok(Number(VERSION[1]) > 0 || Number(VERSION[2]) >= 3, "VERSION at or above 0.3 (minimum, not a pin)");

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT)");
db.exec("CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, owner TEXT, sla_due_at TEXT, close_evidence TEXT)");
db.exec("CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, branch TEXT, pr_url TEXT, merged_by TEXT, merged_sha TEXT, merged_at TEXT, merge_note TEXT, created_at TEXT, updated_at TEXT)");
db.exec("CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, category TEXT, sev TEXT, owner TEXT, payload TEXT, gh_number TEXT, state TEXT, exec_state TEXT, exec_ts TEXT)");
db.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT)");
const mig = readFileSync(join(here, "..", "migrations", "2026-10-18-tracker-sync.sql"), "utf8");
for (const stmt of mig.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) {
  if (/^INSERT OR IGNORE INTO analytics_metric_triggers/.test(stmt)) continue;
  if (/^INSERT OR IGNORE INTO metric_registry/.test(stmt)) { for (const m of ["tracker_drift", "tracker_issue_drift", "tracker_code_task_drift"]) db.prepare("INSERT INTO metric_registry (metric, state) VALUES (?, 'PENDING')").run(m); continue; }
  db.exec(stmt);
}
const prep = (sql) => { let a = []; const st = { bind: (...x) => { a = x.map((v) => (v === undefined ? null : v)); return st; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; };
const AUDIT = { prepare: prep, batch: async (l) => { for (const s of l) await s.run(); return []; } };

// Fake GitHub
let gIssues = [], gNext = 5000, gPulls = [], calls = [], listFails = false;
const reply = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
globalThis.fetch = async (url, init) => {
  const u = new URL(url); const m = (init && init.method) || "GET"; const body = init && init.body ? JSON.parse(init.body) : null;
  calls.push(m + " " + u.pathname);
  const page = Number(u.searchParams.get("page") || 1);
  if (m === "GET" && u.pathname === "/repos/QNFO/qnfo-workers/issues") {
    if (listFails) return reply(502, { message: "bad gateway" });
    return reply(200, page > 1 ? [] : gIssues.filter((i) => i.state === "open" && i.labels.includes("fleet-issue")));
  }
  if (m === "POST" && u.pathname === "/repos/QNFO/qnfo-workers/issues") { const i = { number: gNext++, title: body.title, body: body.body, labels: body.labels, state: "open" }; gIssues.push(i); return reply(201, i); }
  let mm = /^\/repos\/QNFO\/qnfo-workers\/issues\/(\d+)$/.exec(u.pathname);
  if (mm && m === "PATCH") { const i = gIssues.find((x) => x.number === Number(mm[1])); i.state = body.state; return reply(200, i); }
  if (/\/comments$/.test(u.pathname)) return reply(201, { id: 1 });
  if (m === "GET" && u.pathname === "/repos/QNFO/qnfo-workers/pulls") return reply(200, page > 1 ? [] : gPulls);
  mm = /^\/repos\/QNFO\/qnfo-workers\/pulls\/(\d+)$/.exec(u.pathname);
  if (mm) { const p = gPulls.find((x) => x.number === Number(mm[1])); return p ? reply(200, p) : reply(404, {}); }
  return reply(404, { message: "unmocked " + m + " " + u.pathname });
};
const env = { AUDIT, GITHUB_TOKEN: "t", STEWARD_KEY: "k" };
const tick = async () => { const r = await w.fetch(new Request("https://s.test/tracker/tick", { method: "POST", headers: { "x-steward-key": "k" } }), env); assert.equal(r.status, 200); return (await r.json()).result; };

const now = Date.now();
const ins = db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at) VALUES (?, ?, ?, ?, ?, 'high', ?, ?)");
ins.run(101, "LEAK-1: token ghp_ABCDEFGHIJKLMNOPQRSTUVWX123 in log", "mail owner@example.com see #12 @someone", "qnfo-ops", "reliability", "open", now - 3600e3);
ins.run(102, "PRIVATE-1: tax", "secret life detail", "personal-api", "personal", "open", now - 3600e3);
ins.run(103, "DONE-1: closed already", "x", "qnfo-ops", "bug", "closed", now - 3600e3);
db.prepare("INSERT INTO code_tasks (id, status, branch, pr_url) VALUES ('ct_a', 'failed', 'codeagent-a', 'https://github.com/QNFO/qnfo-workers/pull/812')").run();
db.prepare("INSERT INTO code_tasks (id, status, branch, pr_url) VALUES ('ct_b', 'merged', 'codeagent-b', 'https://github.com/QNFO/qnfo-workers/pull/813')").run();
db.prepare("INSERT INTO code_tasks (id, status, branch, pr_url) VALUES ('ct_c', 'closed', 'codeagent-c', 'https://github.com/QNFO/qnfo-workers/compare/main...codeagent-c?expand=1')").run();
db.prepare("INSERT INTO code_tasks (id, status, branch, pr_url) VALUES ('ct_d', 'merged', NULL, 'https://github.com/QNFO/qnfo-workers/pull/381')").run();
gPulls = [
  { number: 812, state: "closed", merged_at: "2026-10-08T18:09:05Z", merge_commit_sha: "cced805", merged_by: { login: "rwnq8" }, head: { ref: "codeagent-a", sha: "s1" } },
  { number: 813, state: "closed", merged_at: null, head: { ref: "codeagent-b", sha: "s2" } },
  { number: 381, state: "closed", merged_at: "2026-10-01T21:37:29Z", head: { ref: "codeagent-readme", sha: "s4" } },
  { number: 900, state: "open", merged_at: null, head: { ref: "codeagent-orphan", sha: "s3" }, updated_at: new Date().toISOString() }
];

// Tick 1: mirror open issues, fix the phantom failure, flag the rest.
const r1 = await tick();
assert.equal(r1.mirrored, 2, "the two open issues are mirrored, the closed one is not");
const leak = gIssues.find((i) => i.title.startsWith("[#101]"));
assert.ok(!/ghp_/.test(leak.title + leak.body), "tokens are redacted");
assert.ok(!/owner@example\.com/.test(leak.body), "e-mail addresses are redacted");
assert.ok(leak.body.includes("```text"), "the description is fenced, so mentions and references do not expand");
const priv = gIssues.find((i) => i.title.startsWith("[#102]"));
assert.ok(!/tax|secret life/.test(priv.title + priv.body), "personal issues are mirrored by number only");
assert.equal(db.prepare("SELECT status FROM code_tasks WHERE id='ct_a'").get().status, "merged", "a task whose PR merged is marked merged");
assert.match(db.prepare("SELECT merged_by FROM code_tasks WHERE id='ct_a'").get().merged_by, /^github:rwnq8$/);
const drift = Object.fromEntries(db.prepare("SELECT task_id, drift FROM code_task_pr_links").all().map((x) => [x.task_id, x.drift]));
assert.equal(drift.ct_b, "task-merged-pr-closed", "a task that claims a merge GitHub does not have is drift, not silently rewritten");
assert.equal(drift["pr:900"], "pr-without-task", "a code-loop PR without a task row is drift");
assert.equal(drift["pr:381"], undefined, "a PR matched to a task by number (task has no branch) is not pr-without-task");
assert.equal(drift.ct_d, null, "a merged task whose PR merged is in sync");
assert.equal(drift.ct_c, null, "a compare URL with no PR is recorded as never-opened, not drift");
assert.equal(db.prepare("SELECT pr_state FROM code_task_pr_links WHERE task_id='ct_c'").get().pr_state, "never-opened");
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric='tracker_code_task_drift'").get().last_value, "2");
assert.equal(db.prepare("SELECT last_value FROM metric_registry WHERE metric='tracker_drift'").get().last_value, "2", "graded once every open issue is mirrored");

// Tick 2: idempotent.
calls = [];
const r2 = await tick();
assert.equal(r2.mirrored, 0, "nothing is filed twice");
assert.ok(!calls.some((c) => c.startsWith("POST /repos/QNFO/qnfo-workers/issues") && !c.endsWith("/comments")), "no create on a converged tick");
const synced = db.prepare("SELECT max(synced_at) m FROM code_task_pr_links").get().m;
await tick();
assert.equal(db.prepare("SELECT max(synced_at) m FROM code_task_pr_links").get().m, synced, "unchanged links are not rewritten every tick");

// D1 closes with evidence -> GitHub closes; a hand close on GitHub of a D1-open issue is reopened.
db.prepare("UPDATE agent_issues SET status='resolved', close_channel='evidence' WHERE id=101").run();
db.prepare("INSERT INTO issue_triage (issue_id, close_evidence) VALUES (101, 'probe passed 2026-10-18')").run();
priv.state = "closed";
const r3 = await tick();
assert.equal(r3.closed, 1); assert.equal(r3.reopened, 1);
assert.equal(leak.state, "closed", "closed in D1 -> closed on GitHub");
assert.equal(priv.state, "open", "D1 is authoritative: a hand close is reopened");
assert.equal(db.prepare("SELECT status FROM agent_issues WHERE id=102").get().status, "open", "GitHub never closes a D1 issue");

// A new D1 issue whose "[#id]" title already exists on GitHub is linked, not re-filed.
ins.run(104, "RELINK-1", "x", "qnfo-ops", "bug", "open", now);
gIssues.push({ number: 4999, title: "[#104] RELINK-1", labels: ["fleet-issue"], state: "open" });
const r4 = await tick();
assert.equal(r4.relinked, 1); assert.equal(r4.mirrored, 0);
assert.equal(db.prepare("SELECT gh_number FROM gh_issue_links WHERE issue_id=104").get().gh_number, 4999);

// A failed list is never read as "everything is closed".
listFails = true;
const before = JSON.stringify(gIssues);
const r5 = await tick();
assert.ok(r5.errors.some((e) => e.scope === "tracker-issues"));
assert.equal(JSON.stringify(gIssues), before, "no issue state changes on a failed read");
listFails = false;

// After the backfill only the newest 2 PR pages are read. A repository with more than 200 PRs fills both, and that window
// is valid (live 2026-10-18 10:03Z: every post-backfill tick refused it as a partial list).
const filler = Array.from({ length: 250 }, (_, i) => ({ number: 2000 + i, state: "closed", merged_at: null, head: { ref: "human-" + i, sha: "f" + i }, updated_at: new Date().toISOString() }));
const allPulls = gPulls.concat(filler);
const pullsHandler = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  if (((init && init.method) || "GET") === "GET" && u.pathname === "/repos/QNFO/qnfo-workers/pulls") {
    const page = Number(u.searchParams.get("page") || 1);
    return new Response(JSON.stringify(allPulls.slice((page - 1) * 100, page * 100)), { status: 200 });
  }
  return pullsHandler(url, init);
};
const r6 = await tick();
assert.ok(!r6.errors.some((e) => e.scope === "tracker-prs"), "a full 2-page recent window is not a failed read");
globalThis.fetch = pullsHandler;

// The scheduled handler routes the 10-minute cron to the tracker only.
calls = [];
await w.scheduled({ cron: "3,13,23,33,43,53 * * * *" }, env, { waitUntil() {} });
assert.ok(!calls.some((c) => c.startsWith("GET /orgs/")), "the tracker tick does not run the 6-hourly settings reconcile");
const g = await w.fetch(new Request("https://s.test/tracker"), env);
assert.equal((await g.json()).cron, "3,13,23,33,43,53 * * * *");
console.log("tracker-sync.test.mjs ok");

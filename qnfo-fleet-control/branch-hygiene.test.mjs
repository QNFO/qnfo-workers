/**
 * branch-hygiene.test.mjs -- offline regression lock for BRANCH-HYGIENE-1/2 (qnfo-fleet-control 0.4.110, 0.4.113).
 *
 * Slices the block out of worker.js and drives bhDecide (pure) and branchHygieneTick against an in-memory SQLite D1
 * (node:sqlite, Node 22) and a scripted GitHub API. Proves: merged branches are deleted; an unmerged branch is deleted
 * only after its tip is saved as refs/archive/<branch> (a failed archive stops the delete); an open pull request, a
 * code task in flight, a tip equal to main's, and young branches are kept; a freshly cut empty branch is not taken for
 * a merged one; the dry run changes nothing; the kill switch; the per-tick cap; the repo setting and the metric.
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/branch-hygiene.test.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- BRANCH-HYGIENE-1:BEGIN", END = "// ---- BRANCH-HYGIENE-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < a) { console.error("FAIL branch-hygiene block markers missing"); console.log("1 failed"); process.exit(1); }

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }

const NOW = Date.parse("2026-10-03T10:00:00Z");
const hAgo = (n) => new Date(NOW - n * 3600000).toISOString();

function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE code_tasks (id TEXT, branch TEXT, status TEXT, updated_at TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT); INSERT INTO metric_registry (metric) VALUES ('repo_branches_open');");
  const stmt = (sql, args) => ({
    bind: (...a2) => stmt(sql, a2),
    run: async () => { db.prepare(sql).run(...args); return {}; },
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) })
  });
  return { db, AUDIT: { prepare: (sql) => stmt(sql, []) } };
}

// Scripted GitHub. Each scenario passes branches, pulls and compare answers; calls are recorded in order.
function makeGh(sc) {
  const calls = [];
  const evApi = async (env, method, path, body) => {
    calls.push(method + " " + path);
    const ok = (j, status = 200) => ({ status, ok: status < 300, j });
    if (method === "GET" && path.startsWith("/branches")) return ok(sc.branches);
    if (method === "GET" && path.startsWith("/pulls")) return ok(sc.pulls || []);
    if (method === "GET" && path.startsWith("/compare/main...")) { const sha = decodeURIComponent(path.split("...")[1]); return sc.compare[sha] ? ok(sc.compare[sha]) : ok(null, 404); }
    if (method === "POST" && path === "/git/refs") return sc.archiveFails ? ok({ message: "Validation Failed" }, 422) : ok({}, 201);
    if (method === "DELETE") return ok(null, 204);
    if (method === "GET" && path === "") return ok({ delete_branch_on_merge: sc.setting == null ? false : sc.setting });
    if (method === "PATCH" && path === "") return ok({});
    return ok(null, 404);
  };
  return { evApi, calls };
}

async function run(sc, opts) {
  const d1 = makeD1();
  (sc.liveTasks || []).forEach((br) => d1.db.prepare("INSERT INTO code_tasks (id, branch, status, updated_at) VALUES (?1, ?2, 'branch_pushed', ?3)").run("t-" + br, br, hAgo(1)));
  (sc.needsHuman || []).forEach(([br, ageH]) => d1.db.prepare("INSERT INTO code_tasks (id, branch, status, updated_at) VALUES (?1, ?2, 'needs_human', ?3)").run("nh-" + br, br, hAgo(ageH)));
  (sc.closedTasks || []).forEach((br) => d1.db.prepare("INSERT INTO code_tasks (id, branch, status, updated_at) VALUES (?1, ?2, 'closed', ?3)").run("c-" + br, br, hAgo(1)));
  (sc.config || []).forEach(([k, v]) => d1.db.prepare("INSERT INTO ops_config (key, value) VALUES (?1, ?2)").run(k, v));
  const gh = makeGh(sc);
  const sandbox = { evApi: gh.evApi, EVOLVE_REPO: "QNFO/qnfo-workers", __name: (f) => f, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, encodeURIComponent, Promise, __export: null };
  vm.createContext(sandbox);
  vm.runInContext(src.slice(a, b + END.length) + "\n__export = { bhDecide, branchHygieneTick, BH_MAX_ACTIONS };", sandbox, { filename: "bh-block.js" });
  const env = { GITHUB_TOKEN: "x", AUDIT: d1.AUDIT };
  const out = await sandbox.__export.branchHygieneTick(env, Object.assign({ now: NOW }, opts || {}));
  return { out, calls: gh.calls, d1, W: sandbox.__export };
}

// ---- bhDecide (pure) ----
{
  const { W } = await run({ branches: [], compare: {} });
  const d = (f) => W.bhDecide(Object.assign({ name: "x", protected: false, open_pr: 0, live_task: false, merged_pr: 0, closed_pr: 0, status: "ahead", ahead_by: 1, age_h: 100 }, f));
  eq(d({ name: "main" }).action, "keep", "main is never touched");
  eq(d({ protected: true }).action, "keep", "protected branch kept");
  eq(d({ open_pr: 7 }).why, "open pull request #7", "open PR kept");
  eq(d({ live_task: true }).why, "code task in flight", "code task in flight kept");
  eq(d({ merged_pr: 9, status: null, ahead_by: null, age_h: null }).action, "delete", "head of a merged PR is deleted without a compare");
  eq(d({ open_pr: 7, merged_pr: 9 }).action, "keep", "an open PR wins over an older merged one");
  eq(d({ status: null, ahead_by: null, age_h: null }).why, "not compared yet", "uncompared branch asks for a compare");
  eq(d({ status: "identical", ahead_by: 0 }).action, "keep", "a tip equal to main's is kept");
  eq(d({ status: "behind", ahead_by: 0, age_h: 100 }).action, "delete", "old branch contained in main is deleted");
  eq(d({ status: "behind", ahead_by: 0, age_h: 2 }).action, "keep", "a fresh branch cut from an older main is not taken for merged");
  eq(d({ status: "behind", ahead_by: 0, age_h: null }).action, "keep", "unknown age is never deleted as merged");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 10 }).action, "keep", "unmerged and young (no PR, 48h) is kept");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 50 }).action, "archive-delete", "unmerged orphan past 48h is archived then deleted");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 30, closed_pr: 12 }).action, "archive-delete", "closed-unmerged PR past 24h is archived then deleted");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 30, closed_pr: 12 }).pr, 12, "the closed PR number is logged");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 20, closed_pr: 12 }).action, "keep", "closed-unmerged PR younger than 24h is kept");
}

// ---- full tick ----
const sha = (n) => ("s" + n).padEnd(40, "0");
const br = (name, n, prot) => ({ name, protected: !!prot, commit: { sha: sha(n) } });
const cmpRes = (status, ahead, ageH) => ({ status, ahead_by: ahead, behind_by: 5, commits: ahead ? [{ commit: { committer: { date: hAgo(ageH) } } }] : [], merge_base_commit: { commit: { committer: { date: hAgo(ageH) } } } });
const scenario = () => ({
  branches: [br("main", 0, true), br("claude/merged-pr", 1), br("claude/open", 2), br("codeagent-live", 3), br("fix/ancestor", 4), br("fix/fresh-empty", 5), br("claude/orphan-old", 6), br("claude/closed-old", 7), br("claude/young", 8), br("claude/same-as-main", 9)],
  pulls: [
    { number: 11, state: "closed", merged_at: hAgo(5), head: { ref: "claude/merged-pr", sha: sha(1), repo: { full_name: "QNFO/qnfo-workers" } } },
    { number: 12, state: "open", head: { ref: "claude/open", sha: sha(2), repo: { full_name: "QNFO/qnfo-workers" } } },
    { number: 13, state: "closed", merged_at: null, head: { ref: "claude/closed-old", sha: sha(7), repo: { full_name: "QNFO/qnfo-workers" } } },
    { number: 14, state: "closed", merged_at: hAgo(5), head: { ref: "claude/open", sha: sha(99), repo: { full_name: "someone/fork" } } }
  ],
  liveTasks: ["codeagent-live"],
  compare: {
    [sha(4)]: cmpRes("behind", 0, 200), [sha(5)]: cmpRes("behind", 0, 1), [sha(6)]: cmpRes("diverged", 2, 100),
    [sha(7)]: cmpRes("diverged", 1, 100), [sha(8)]: cmpRes("diverged", 1, 3), [sha(9)]: cmpRes("identical", 0, 100)
  }
});
{
  const { out, calls, d1 } = await run(scenario());
  eq(out.deleted.sort(), ["claude/merged-pr", "fix/ancestor"], "merged branches are deleted");
  eq(out.archived.sort(), ["claude/closed-old", "claude/orphan-old"], "unmerged branches are archived then deleted");
  eq(calls.filter((c) => c.startsWith("DELETE")).sort(), ["DELETE /git/refs/heads/claude/closed-old", "DELETE /git/refs/heads/claude/merged-pr", "DELETE /git/refs/heads/claude/orphan-old", "DELETE /git/refs/heads/fix/ancestor"], "exactly the four expected branches are deleted, slashes kept in the path");
  const ci = calls.indexOf("POST /git/refs"), di = calls.indexOf("DELETE /git/refs/heads/claude/closed-old");
  eq(ci >= 0 && ci < di, true, "the archive ref is created before the first archive-delete");
  eq(calls.filter((c) => c === "POST /git/refs").length, 2, "one archive ref per unmerged branch, none for merged ones");
  eq(calls.some((c) => /claude\/open|codeagent-live|fresh-empty|young|same-as-main/.test(c) && c.startsWith("DELETE")), false, "open PR, live task, fresh empty, young and same-as-main branches are untouched");
  eq(calls.some((c) => c.startsWith("GET /compare/main...") && c.includes(sha(1))), false, "a merged-PR head needs no compare");
  const log = d1.db.prepare("SELECT branch, action, archive_ref, ok, dry FROM branch_hygiene_log ORDER BY id").all().map((r) => ({ ...r }));
  eq(log.length, 4, "four log rows");
  eq(log.find((r) => r.branch === "claude/closed-old").archive_ref, "refs/archive/claude/closed-old", "the archive ref is logged");
  eq(d1.db.prepare("SELECT last_value AS v FROM metric_registry WHERE metric='repo_branches_open'").get().v, "5", "metric = branches left besides main (10 listed - main - 4 removed)");
  eq(out.setting, "delete_branch_on_merge enabled", "the repo setting is turned on");
  eq(calls.includes("PATCH "), true, "PATCH on the repo");
  eq(d1.db.prepare("SELECT status FROM cloud_ops_events WHERE kind='branch-hygiene-tick'").get().status, "ok", "heartbeat ok");
}
{ // BRANCH-HYGIENE-2: a needs_human task keeps its branch for 7 days; after that, or when closed, the branch is archived and deleted
  const sc = {
    branches: [br("main", 0, true), br("codeagent-nh-fresh", 20), br("codeagent-nh-old", 21), br("codeagent-closed", 22)],
    compare: { [sha(20)]: cmpRes("diverged", 1, 100), [sha(21)]: cmpRes("diverged", 1, 300), [sha(22)]: cmpRes("diverged", 1, 100) },
    needsHuman: [["codeagent-nh-fresh", 30], ["codeagent-nh-old", 24 * 8]], closedTasks: ["codeagent-closed"]
  };
  const { out, calls } = await run(sc);
  eq(out.archived.sort(), ["codeagent-closed", "codeagent-nh-old"], "a closed task and a needs_human task idle for 8 days are archived then deleted");
  eq(calls.some((c) => c.startsWith("DELETE") && c.includes("nh-fresh")), false, "a needs_human task updated 30h ago keeps its branch");
  eq(calls.some((c) => c.startsWith("GET /compare/main...") && c.includes(sha(20))), false, "a protected branch is not even compared");
}
{ // a failed archive stops the delete
  const sc = scenario(); sc.archiveFails = true;
  const { out, calls } = await run(sc);
  eq(out.archived, [], "nothing archived");
  eq(calls.some((c) => c === "DELETE /git/refs/heads/claude/closed-old" || c === "DELETE /git/refs/heads/claude/orphan-old"), false, "no unmerged branch is deleted when its archive ref failed");
  eq(out.deleted.sort(), ["claude/merged-pr", "fix/ancestor"], "merged branches still go");
  eq(out.errors.length, 2, "both failures are reported");
}
{ // dry run
  const { out, calls, d1 } = await run(scenario(), { dry: true });
  eq(calls.some((c) => c.startsWith("DELETE") || c === "POST /git/refs" || c.startsWith("PATCH")), false, "dry run writes nothing to GitHub");
  eq(out.deleted.length + out.archived.length, 4, "dry run still reports what it would do");
  eq(d1.db.prepare("SELECT COUNT(*) AS n FROM branch_hygiene_log WHERE dry=1").get().n, 4, "dry rows are logged as dry");
  eq(d1.db.prepare("SELECT last_value AS v FROM metric_registry WHERE metric='repo_branches_open'").get().v, null, "dry run does not move the metric");
}
{ // kill switch
  const sc = scenario(); sc.config = [["branch_hygiene_enabled", "off"]];
  const { out, calls } = await run(sc);
  eq(out.disabled, true, "kill switch reports disabled");
  eq(calls.length, 0, "kill switch makes no GitHub call");
}
{ // per-tick cap
  const many = [br("main", 0, true)], compare = {};
  for (let i = 1; i <= 55; i++) { many.push(br("claude/old-" + i, 100 + i)); compare[sha(100 + i)] = cmpRes("behind", 0, 300); }
  const { out } = await run({ branches: many, compare });
  eq(out.deleted.length, 40, "at most 40 actions per tick");
  eq(out.remaining, 15, "the rest waits for the next tick");
}
{ // GitHub unreachable
  const { out } = await run({ branches: [], compare: {}, pulls: [] });
  eq(out.ok, true, "an empty repository is fine");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

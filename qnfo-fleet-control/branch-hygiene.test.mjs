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

function grab(name) {
  const i = src.indexOf("function " + name + "(");
  let d = 0;
  const st = src.slice(i - 6, i) === "async " ? i - 6 : i;
  for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(st, k + 1); }
  throw new Error("function " + name + " not found");
}
let passed = 0, failed = 0;
function eq(actual, expected, label) { if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }

const NOW = Date.parse("2026-10-03T10:00:00Z");
const hAgo = (n) => new Date(NOW - n * 3600000).toISOString();

function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE code_tasks (id TEXT, branch TEXT, status TEXT, updated_at TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT); INSERT INTO metric_registry (metric) VALUES ('repo_branches_open'); CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);");
  const stmt = (sql, args) => ({
    bind: (...a2) => stmt(sql, a2),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
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
    let m;
    // MERGEABILITY-REQUERY-1: sc.prSeq[n] scripts successive answers of GET /pulls/n (the last one repeats).
    if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(path)) && sc.prSeq && sc.prSeq[m[1]] && sc.prSeq[m[1]].length) return ok(sc.prSeq[m[1]].length > 1 ? sc.prSeq[m[1]].shift() : sc.prSeq[m[1]][0]);
    if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(path)) && sc.prs) return sc.prs[m[1]] ? ok(sc.prs[m[1]]) : ok({ message: "Not Found" }, 404);
    if (method === "GET" && (m = /^\/pulls\/(\d+)\/files/.exec(path)) && sc.prs) return ok((sc.files || {})[m[1]] || []);
    if (method === "GET" && (m = /^\/commits\/([^/]+)\/check-runs/.exec(path))) return ok({ check_runs: (sc.checks || {})[m[1]] || [] });
    if (method === "GET" && (m = /^\/commits\/([^/]+)\/status$/.exec(path))) return ok({ state: "pending", total_count: 0 });
    if (method === "PUT" && (m = /^\/pulls\/(\d+)\/merge$/.exec(path))) { (sc.merges = sc.merges || []).push({ pr: Number(m[1]), body }); return sc.mergeStatus ? ok({ message: "Base branch was modified" }, sc.mergeStatus) : ok({ sha: "m" + m[1], merged: true }); }
    if (method === "PUT" && /\/update-branch$/.test(path)) { (sc.updates = sc.updates || []).push({ path, body }); return sc.updateStatus ? ok({ message: "merge conflict between base and head" }, sc.updateStatus) : ok({}, 202); }
    if (method === "GET" && path.startsWith("/pulls")) return ok(sc.pulls || []);
    if (method === "GET" && path.startsWith("/compare/main...")) { const sha = decodeURIComponent(path.split("...")[1]); return sc.compare[sha] ? ok(sc.compare[sha]) : ok(null, 404); }
    if (method === "POST" && path === "/git/refs") return sc.archiveFails ? ok({ message: "Validation Failed" }, 422) : ok({}, 201);
    if (method === "DELETE") return ok(null, 204);
    if (method === "GET" && path === "") return ok({ delete_branch_on_merge: sc.setting == null ? false : sc.setting });
    if (method === "POST" && /^\/issues\/\d+\/comments$/.test(path)) return ok({}, 201);
    if (method === "PATCH" && path.startsWith("/pulls/")) return ok({});
    if (method === "PATCH" && path === "") return ok({});
    if (method === "GET" && (m = /^\/check-runs\/(\d+)\/annotations/.exec(path))) return ok((sc.annotations || {})[m[1]] || []);
    return ok(null, 404);
  };
  return { evApi, calls };
}

async function run(sc, opts, d1In) {
  const d1 = d1In || makeD1();
  (sc.liveTasks || []).forEach((br) => d1.db.prepare("INSERT INTO code_tasks (id, branch, status, updated_at) VALUES (?1, ?2, 'branch_pushed', ?3)").run("t-" + br, br, hAgo(1)));
  (sc.needsHuman || []).forEach(([br, ageH]) => d1.db.prepare("INSERT INTO code_tasks (id, branch, status, updated_at) VALUES (?1, ?2, 'needs_human', ?3)").run("nh-" + br, br, hAgo(ageH)));
  (sc.closedTasks || []).forEach((br) => d1.db.prepare("INSERT INTO code_tasks (id, branch, status, updated_at) VALUES (?1, ?2, 'closed', ?3)").run("c-" + br, br, hAgo(1)));
  (sc.config || []).forEach(([k, v]) => d1.db.prepare("INSERT INTO ops_config (key, value) VALUES (?1, ?2)").run(k, v));
  const gh = makeGh(sc);
  const sandbox = { evApi: gh.evApi, EVOLVE_REPO: "QNFO/qnfo-workers", __name: (f) => f, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, encodeURIComponent, Promise, __export: null };
  vm.createContext(sandbox);
  const deps = ["var EVOLVE_REQUIRED = ", "var CM_OK = ", "var EVOLVE_DENY = ", "var CM_DENY = "].map((k) => { const i = src.indexOf(k); return src.slice(i, src.indexOf("\n", i)); }).concat(["cmRequired", "cmChecks", "evMergePr"].map(grab)).join("\n");
  vm.runInContext(deps + "\n" + src.slice(a, b + END.length) + "\nBH_MERGEABLE_WAIT_MS = 0;\nEV_MERGE_RETRY_WAIT_MS = 0;\n__export = { bhDecide, bhMergeDecide, bhRepairDecide, bhRepairIssue, bhConflictDecide, bhConflictIssue, bhNudgeDecide, branchHygieneTick, BH_MAX_ACTIONS, BH_NUDGE_MAX };", sandbox, { filename: "bh-block.js" });
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
  eq(d({ status: "diverged", ahead_by: 3, age_h: 10 }).action, "keep", "unmerged and young (no PR, <24h) is kept");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 50 }).action, "archive-delete", "unmerged orphan past 24h is archived then deleted");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 30, closed_pr: 12 }).action, "archive-delete", "closed-unmerged PR past 12h is archived then deleted");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 30, closed_pr: 12 }).pr, 12, "the closed PR number is logged");
  eq(d({ status: "diverged", ahead_by: 3, age_h: 6, closed_pr: 12 }).action, "keep", "closed-unmerged PR younger than 12h is kept");
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
{ // BRANCH-HYGIENE-2 / CYCLE-TIME-1: a needs_human task keeps its branch for 1 day; after that, or when closed, it is archived and deleted
  const sc = {
    branches: [br("main", 0, true), br("codeagent-nh-fresh", 20), br("codeagent-nh-old", 21), br("codeagent-closed", 22)],
    compare: { [sha(20)]: cmpRes("diverged", 1, 100), [sha(21)]: cmpRes("diverged", 1, 300), [sha(22)]: cmpRes("diverged", 1, 100) },
    needsHuman: [["codeagent-nh-fresh", 12], ["codeagent-nh-old", 48]], closedTasks: ["codeagent-closed"]
  };
  const { out, calls } = await run(sc);
  eq(out.archived.sort(), ["codeagent-closed", "codeagent-nh-old"], "a closed task and a needs_human task idle over 24h are archived then deleted");
  eq(calls.some((c) => c.startsWith("DELETE") && c.includes("nh-fresh")), false, "a needs_human task updated 12h ago keeps its branch");
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

{ // CYCLE-TIME-1: an open PR idle over 24h with no live code task is archived, commented and closed; a fresh one is left alone
  const sc = {
    branches: [br("main", 0, true)],
    pulls: [
      { number: 21, state: "open", updated_at: hAgo(30), head: { ref: "claude/idle-pr", sha: sha(30), repo: { full_name: "QNFO/qnfo-workers" } } },
      { number: 22, state: "open", updated_at: hAgo(2), head: { ref: "claude/fresh-pr", sha: sha(31), repo: { full_name: "QNFO/qnfo-workers" } } }
    ],
    compare: {}
  };
  const { out, calls, d1 } = await run(sc);
  eq(out.closed_prs, [21], "only the PR idle over 24h is closed");
  eq(calls.some((c) => c === "POST /git/refs"), true, "the idle PR head is archived before close");
  eq(calls.some((c) => c === "POST /issues/21/comments"), true, "a comment is posted on the idle PR");
  eq(calls.some((c) => c === "PATCH /pulls/21"), true, "the idle PR is closed via REST PATCH");
  eq(calls.some((c) => c.startsWith("PATCH /pulls/22") || c.startsWith("POST /issues/22/")), false, "a fresh PR is left alone");
  eq(d1.db.prepare("SELECT pr, ok FROM branch_hygiene_log WHERE action='close-stale-pr'").get().pr, 21, "the close is logged with ok=1");
}
{ // a live code task's idle PR is never closed
  const sc = { branches: [br("main", 0, true)], pulls: [ { number: 23, state: "open", updated_at: hAgo(50), head: { ref: "codeagent-livepr", sha: sha(32), repo: { full_name: "QNFO/qnfo-workers" } } } ], liveTasks: ["codeagent-livepr"], compare: {} };
  const { out } = await run(sc);
  eq(out.closed_prs, [], "a live code task's PR is kept even when idle");
}

// ---- STALE-PR-MERGE-FIRST-1: a quiet, green, clean session PR is merged before the closer would close it ----
{
  const R = { full_name: "QNFO/qnfo-workers" };
  const W2 = (f) => ["demo/worker.js", "demo/deployed-current.worker.js"].concat(f || []).map((n) => ({ filename: n, status: "modified" }));
  const green = (h, names) => names.map((n, i) => ({ id: 10 + i, name: n, status: "completed", conclusion: "success", head_sha: h }));
  const ALL = ["gate", "mirror-guard", "comparator", "guard", "CodeQL"];
  const prj = (n, ref, h, over) => Object.assign({ number: n, state: "open", draft: false, merged: false, mergeable: true, mergeable_state: "clean", title: "feat: thing " + n, body: "", labels: [], updated_at: hAgo(3), head: { ref, sha: h, repo: R }, base: { ref: "main", repo: R } }, over || {});
  const lite = (x) => ({ number: x.number, state: "open", draft: x.draft, updated_at: x.updated_at, head: x.head });
  const prs = {
    31: prj(31, "clef-candidate-1", "a31"),                                   // green, clean, 3h quiet: merged
    32: prj(32, "claude/red-gate", "a32", { updated_at: hAgo(30) }),            // gate failed, 30h: closed with the reason
    33: prj(33, "claude/fresh", "a33", { updated_at: hAgo(1) }),               // 1h quiet: left alone
    34: prj(34, "claude/wf", "a34"),                                            // changes a workflow: not merged
    35: prj(35, "claude/hold", "a35", { title: "WIP: do not merge yet" }),      // asks not to be merged
    36: prj(36, "claude/dirty", "a36", { mergeable: false, mergeable_state: "dirty", updated_at: hAgo(30) }), // conflict, 30h: closed
    37: prj(37, "evolve/demo-c9", "a37"),                                        // evolve's own: never merged here
  };
  const sc = {
    branches: [br("main", 0, true)], compare: {}, prs,
    pulls: Object.values(prs).map(lite),
    files: { 31: W2(), 32: W2(), 33: W2(), 34: W2([".github/workflows/x.yml"]), 35: W2(), 36: W2(), 37: W2() },
    checks: { a31: green("a31", ALL), a32: green("a32", ["mirror-guard", "comparator", "guard"]).concat([{ id: 99, name: "gate", status: "completed", conclusion: "failure" }]), a33: green("a33", ALL), a34: green("a34", ALL), a35: green("a35", ALL), a36: green("a36", ALL), a37: green("a37", ALL) },
  };
  const { out, calls, d1, W } = await run(sc);
  eq(out.merged_prs, [31], "only the quiet, green, clean session PR is merged");
  eq((sc.merges || []).map((m) => [m.pr, m.body.sha, m.body.merge_method]), [[31, "a31", "squash"]], "the merge is a squash pinned to the tested head");
  eq(calls.includes("DELETE /git/refs/heads/clef-candidate-1") && calls.includes("POST /issues/31/comments"), true, "the merged branch is deleted and the merge is explained on the PR");
  eq(d1.db.prepare("SELECT pr, ok FROM branch_hygiene_log WHERE action = 'merge-stale-pr'").all().map((r) => [r.pr, r.ok]), [[31, 1]], "the merge is logged in branch_hygiene_log");
  eq(out.closed_prs.sort(), [32, 36], "a red or conflicted PR is still closed at 24h");
  eq(/gate=failure/.test(d1.db.prepare("SELECT why FROM branch_hygiene_log WHERE pr = 32 AND action = 'close-stale-pr'").get().why), true, "the close records why it was not merged");
  eq(calls.some((c) => /^(PATCH|PUT) \/pulls\/(33|34|35|37)/.test(c)), false, "a fresh PR, a workflow PR, a do-not-merge PR and an evolve PR are neither merged nor closed");
  const dec = (pr, files, checks) => W.bhMergeDecide(pr, files, checks, { state: "pending", total_count: 0 });
  eq(dec(prj(40, "x", "h"), W2(), green("h", ALL)).merge, true, "pure: green + clean merges");
  eq(dec(prj(41, "x", "h", { mergeable: null, mergeable_state: "unknown" }), W2(), green("h", ALL)).merge, false, "pure: mergeability not computed: no merge");
  eq(dec(prj(42, "x", "h"), W2(), green("h", ["gate", "mirror-guard", "comparator"])).why.indexOf("guard never ran") >= 0, true, "pure: a missing required check blocks the merge");
  eq(dec(prj(43, "x", "h"), W2(), green("h", ALL).concat([{ id: 50, name: "Analyze (python)", status: "in_progress", conclusion: null }])).merge, false, "pure: a running check blocks the merge");
  eq(dec(prj(44, "x", "h", { draft: true }), W2(), green("h", ALL)).merge, false, "pure: a draft is never merged");
  eq(dec(prj(45, "codeagent-abc", "h"), W2(), green("h", ALL)).merge, false, "pure: a code-loop branch is the merge runner's");
  eq(dec(prj(46, "x", "h", { head: { ref: "x", sha: "h", repo: { full_name: "evil/fork" } } }), W2(), green("h", ALL)).merge, false, "pure: a fork is never merged");
  eq(dec(prj(47, "x", "h", { labels: [{ name: "hold" }] }), W2(), green("h", ALL)).merge, false, "pure: a hold label blocks the merge");
  eq(dec(prj(48, "x", "h", { body: "Please do not merge until the owner looks." }), W2(), green("h", ALL)).merge, false, "pure: 'do not merge' in the body blocks the merge");
  eq(dec(prj(49, "x", "h", { title: "HOLD-LIST-1: holdout set" }), W2(), green("h", ALL)).merge, true, "pure: the word hold inside a title tag does not block");
  eq(JSON.stringify(dec(prj(50, "x", "h"), [{ filename: "docs/a.md" }], green("h", ["gate", "mirror-guard", "comparator"]))).indexOf('"merge":true') >= 0, true, "pure: a docs PR needs gate, mirror-guard and comparator only");
  eq(dec(prj(51, "x", "h"), [{ filename: "docs/QUNIVERSE-CHARTER.md" }], green("h", ALL)).why.indexOf("charter never ran") >= 0, true, "pure: a charter PR also needs charter-guard");
  // CONTROL-PLANE-SELF-MERGE-1 (0.7.0, owner directive 2026-10-06) replaces CONTROL-PLANE-MANUAL-1: a control-plane worker
  // merges when ops_config control_plane_self_merge is on (the default), it has a /health canary and the PR carries
  // worker.js with its mirror, because canonical-deploy.yml reverts a push whose VERSION never reaches /health.
  for (const [n, w] of [[52, "qnfo-fleet-control"], [53, "qnfo-ops"], [54, "qnfo-deploy-guard"], [55, "qnfo-code-orchestrator"], [56, "qnfo-ai"]]) {
    const d = dec(prj(n, "x", "h"), [{ filename: w + "/worker.js" }, { filename: w + "/deployed-current.worker.js" }], green("h", ALL.concat(["charter", "test"])));
    eq(d.merge === true && (d.control_plane || []).join() === w, true, "pure: a green " + w + " PR with its mirror merges and names the worker for the canary");
  }
  const cpOff = W.bhMergeDecide(prj(58, "x", "h"), [{ filename: "qnfo-ops/worker.js" }, { filename: "qnfo-ops/deployed-current.worker.js" }], green("h", ALL), { state: "pending", total_count: 0 }, { controlPlane: false });
  eq(cpOff.merge === false && /control_plane_self_merge is off/.test(cpOff.why), true, "pure: ops_config control_plane_self_merge off restores CONTROL-PLANE-MANUAL-1");
  const noMirror = dec(prj(59, "x", "h"), [{ filename: "qnfo-ops/worker.js" }], green("h", ALL));
  eq(noMirror.merge === false && /without deployed-current\.worker\.js/.test(noMirror.why), true, "pure: worker.js without its mirror is not merged (the canary reverts the pair)");
  const noCanary = dec(prj(60, "x", "h"), [{ filename: "qnfo-containers-pilot/worker.js" }, { filename: "qnfo-containers-pilot/deployed-current.worker.js" }], green("h", ALL));
  eq(noCanary.merge === false && /no \/health canary/.test(noCanary.why), true, "pure: a control-plane worker without a /health canary is never merged");
  const docsOnly = dec(prj(57, "x", "h"), [{ filename: "docs/a.md" }, { filename: "qnfo-ops/README.md" }], green("h", ["gate", "mirror-guard", "comparator"]));
  eq(docsOnly.merge === true && (docsOnly.control_plane || []).length === 0, true, "pure: a non-deployable file under a control-plane worker dir is not a control-plane change");
}
{ // kill switch and dry run: no merge
  const R = { full_name: "QNFO/qnfo-workers" };
  const pr = { number: 61, state: "open", draft: false, mergeable: true, mergeable_state: "clean", title: "t", labels: [], updated_at: hAgo(3), head: { ref: "claude/k", sha: "k1", repo: R }, base: { ref: "main", repo: R } };
  const mk = () => ({ branches: [br("main", 0, true)], compare: {}, prs: { 61: pr }, pulls: [{ number: 61, state: "open", updated_at: hAgo(3), head: pr.head }], files: { 61: [{ filename: "docs/a.md" }] }, checks: { k1: ["gate", "mirror-guard", "comparator"].map((n, i) => ({ id: i, name: n, status: "completed", conclusion: "success" })) } });
  const s1 = mk(); s1.config = [["stale_pr_merge_enabled", "0"]];
  const r1 = await run(s1);
  eq([r1.out.merged_prs, (s1.merges || []).length], [[], 0], "ops_config stale_pr_merge_enabled = 0 stops the merge");
  const s2 = mk(); s2.config = [["branch_hygiene_dry_run", "1"]];
  const r2 = await run(s2);
  eq([r2.out.merged_prs, (s2.merges || []).length], [[], 0], "a dry run merges nothing");
  const s3 = mk(); s3.mergeStatus = 405;
  const r3 = await run(s3);
  eq([r3.out.merged_prs, r3.out.closed_prs, r3.calls.includes("PUT /pulls/61/update-branch")], [[], [], true], "a 405 merge brings the branch up to date and keeps the PR open");
}

{ // STALE-PR-CHECK-REPAIR-1 (agent_issues 2122): green required checks + a failing CodeQL run -> one repair issue, never a merge
  const R = { full_name: "QNFO/qnfo-workers" };
  const mkpr = (n, sha, extra) => Object.assign({ number: n, state: "open", draft: false, mergeable: true, mergeable_state: "unstable", title: "qnfo-social 0.9.0 PROMOTE-ROUTE-1", labels: [], updated_at: hAgo(3), head: { ref: "claude/r" + n, sha, repo: R }, base: { ref: "main", repo: R } }, extra || {});
  const req = ["gate", "guard", "mirror-guard", "comparator"].map((nm, i) => ({ id: 100 + i, name: nm, status: "completed", conclusion: "success" }));
  const codeql = { id: 777, name: "Analyze (javascript-typescript)", status: "completed", conclusion: "failure" };
  const files = [{ filename: "qnfo-social/worker.js" }, { filename: "qnfo-social/deployed-current.worker.js" }, { filename: "qnfo-social/promote-route.test.mjs" }];
  const ann = [{ path: "qnfo-social/promote-route.test.mjs", start_line: 31, annotation_level: "warning", title: "Incomplete URL substring sanitization", message: "'linkedin.com' can be anywhere in the URL" }];
  const p70 = mkpr(70, "r70"), p71 = mkpr(71, "r71");
  const mk = () => ({ branches: [br("main", 0, true)], compare: {}, prs: { 70: p70, 71: p71 }, pulls: [p70, p71].map((p) => ({ number: p.number, state: "open", updated_at: p.updated_at, head: p.head })), files: { 70: files, 71: files },
    checks: { r70: req.concat([codeql]), r71: req.slice(1).concat([{ id: 99, name: "gate", status: "completed", conclusion: "failure" }, codeql]) }, annotations: { 777: ann } });
  const s1 = mk();
  const r1 = await run(s1);
  const iss = () => r1.d1.db.prepare("SELECT title, description, status FROM agent_issues ORDER BY id").all();
  eq([r1.out.merged_prs, (s1.merges || []).length], [[], 0], "repair: a PR with a failing CodeQL run is never merged");
  eq(iss().length, 1, "repair: exactly one issue for the PR whose only failure is non-required (none for a failing required check)");
  eq(iss()[0].title, "STALE-PR-CHECK-REPAIR-1 PR 70: Analyze (javascript-typescript) failing on a green, quiet session pull request", "repair: the title names the PR and the failing check");
  eq(/promote-route\.test\.mjs:31 \[warning\] Incomplete URL substring sanitization/.test(iss()[0].description) && /\ncode-task: repo=qnfo-workers path=qnfo-social\/promote-route\.test\.mjs$/.test(iss()[0].description), true, "repair: the annotation and a code-task line naming the annotated file are in the issue");
  eq(r1.calls.includes("GET /check-runs/777/annotations?per_page=20"), true, "repair: the failing run's annotations are read");
  eq(r1.d1.db.prepare("SELECT pr FROM branch_hygiene_log WHERE action = 'check-repair-issue'").all().map((r) => r.pr), [70], "repair: the filing is logged in branch_hygiene_log");
  eq(r1.d1.db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'stale-pr-check-repair'").get().n, 1, "repair: one stale-pr-check-repair event (the issue-2122 contract's proof)");
  const s2 = mk();
  await run(s2, undefined, r1.d1);
  eq(iss().length, 1, "repair: a second tick files no duplicate while the issue is open");
  const d = r1.W.bhRepairDecide;
  eq(d(p70, files, req, { state: "pending", total_count: 0 }).repair, false, "repair pure: all green -> nothing to repair");
  eq(d(p70, files, req.concat([{ id: 5, name: "Analyze (python)", status: "in_progress", conclusion: null }]), {}).repair, false, "repair pure: a running check -> wait");
  eq(d(mkpr(72, "x", { head: { ref: "codeagent-x", sha: "x", repo: R } }), files, req.concat([codeql]), {}).repair, false, "repair pure: a code-loop branch is the merge runner's");
  eq(d(p70, files, req.concat([codeql, Object.assign({}, codeql, { id: 778, conclusion: "success" })]), {}).repair, false, "repair pure: a re-run that passed supersedes the failure");
}

{ // STALE-PR-CONFLICT-REPAIR-1 (PR 870, 2026-10-10; carried from PR 910): a quiet green PR that conflicts with main -> one repair issue, never a merge, never silent
  const R = { full_name: "QNFO/qnfo-workers" };
  const mkpr = (n, sha, extra) => Object.assign({ number: n, state: "open", draft: false, mergeable: false, mergeable_state: "dirty", title: "qnfo-ai 5.33.0 ACCURACY-GROUND-1", labels: [], updated_at: hAgo(3), head: { ref: "claude/c" + n, sha, repo: R }, base: { ref: "main", repo: R } }, extra || {});
  const req = ["gate", "guard", "mirror-guard", "comparator"].map((nm, i) => ({ id: 200 + i, name: nm, status: "completed", conclusion: "success" }));
  const files = [{ filename: "qnfo-ai/worker.js" }, { filename: "qnfo-ai/deployed-current.worker.js" }, { filename: "qnfo-ai/accuracy-ground.test.mjs" }];
  const p80 = mkpr(80, "c80");
  const mk = () => ({ branches: [br("main", 0, true)], compare: {}, prs: { 80: p80 }, pulls: [p80].map((p) => ({ number: p.number, state: "open", updated_at: p.updated_at, head: p.head })), files: { 80: files }, checks: { c80: req } });
  const s1 = mk();
  const r1 = await run(s1);
  const iss = () => r1.d1.db.prepare("SELECT title, description, status, priority, typeof(created_at) AS ct FROM agent_issues ORDER BY id").all();
  eq([r1.out.merged_prs, (s1.merges || []).length, (s1.updates || []).length], [[], 0, 0], "conflict: a conflicting PR is never merged and never nudged");
  eq(iss().length, 1, "conflict: exactly one issue for the dirty PR");
  eq(iss()[0].title, "STALE-PR-CONFLICT-REPAIR-1 PR 80: merge conflicts with main on a quiet session pull request", "conflict: the title names the PR");
  eq([iss()[0].priority, iss()[0].status, iss()[0].ct], ["high", "open", "integer"], "conflict: filed high and open, created_at in integer milliseconds");
  eq(/qnfo-ai\/worker\.js, qnfo-ai\/deployed-current\.worker\.js/.test(iss()[0].description) && /\/pulls\/80\/commits/.test(iss()[0].description) && /superseded by #<new>/.test(iss()[0].description) && /DoD: PR 80 is merged, or closed as superseded/.test(iss()[0].description), true, "conflict: the issue carries the files, the commit source, the supersede step and the closing condition");
  eq(r1.d1.db.prepare("SELECT pr FROM branch_hygiene_log WHERE action = 'conflict-repair-issue'").all().map((r) => r.pr), [80], "conflict: the filing is logged in branch_hygiene_log");
  eq(r1.d1.db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'stale-pr-conflict-repair'").get().n, 1, "conflict: one stale-pr-conflict-repair event");
  const s2 = mk();
  await run(s2, undefined, r1.d1);
  eq(iss().length, 1, "conflict: a second tick files no duplicate while the issue is open");
  eq(r1.d1.db.prepare("SELECT COUNT(*) AS n FROM branch_hygiene_log WHERE action = 'merge-refused' AND pr = 80").get().n, 1, "refusal log: two ticks, same head and reason -> one merge-refused row");
  const s3 = mk();
  s3.config = [["stale_pr_conflict_repair_enabled", "off"]];
  const r3 = await run(s3);
  eq([r3.d1.db.prepare("SELECT COUNT(*) AS n FROM agent_issues").get().n, r3.d1.db.prepare("SELECT COUNT(*) AS n FROM branch_hygiene_log WHERE action = 'merge-refused'").get().n], [0, 1], "conflict: the switch off files nothing, and the refusal is still logged");
  const d = r1.W.bhConflictDecide;
  eq(d(p80, files).conflict, true, "conflict pure: dirty and quiet -> repair");
  eq(d(mkpr(81, "x", { mergeable: true, mergeable_state: "clean" }), files).conflict, false, "conflict pure: a clean PR is the merge lane's");
  eq(d(mkpr(82, "x", { mergeable: null, mergeable_state: "unknown" }), files).conflict, false, "conflict pure: unknown is not dirty");
  eq(d(mkpr(83, "x", { draft: true }), files).conflict, false, "conflict pure: a draft is left alone");
  eq(d(mkpr(84, "x", { title: "WIP qnfo-ai" }), files).conflict, false, "conflict pure: a hold is respected");
  eq(d(mkpr(85, "x", { head: { ref: "codeagent-x", sha: "x", repo: R } }), files).conflict, false, "conflict pure: a code-loop branch is the merge runner's");
  eq(d(mkpr(86, "x", { head: { ref: "f", sha: "x", repo: { full_name: "someone/fork" } } }), files).conflict, false, "conflict pure: a fork is never repaired here");
}

{ // MERGEABILITY-NUDGE-1 + MERGE-REFUSAL-LOG-1 (agent_issues 2230; PR 834, 2026-10-09): mergeable null on a green quiet PR -> update-branch, a row, never a silent skip
  const R = { full_name: "QNFO/qnfo-workers" };
  const mkpr = (n, sha, extra) => Object.assign({ number: n, state: "open", draft: false, mergeable: null, mergeable_state: "unknown", title: "qnfo-social 0.9.1", labels: [], updated_at: hAgo(3), head: { ref: "claude/n" + n, sha, repo: R }, base: { ref: "main", repo: R } }, extra || {});
  const req = ["gate", "guard", "mirror-guard", "comparator"].map((nm, i) => ({ id: 300 + i, name: nm, status: "completed", conclusion: "success" }));
  const files = [{ filename: "qnfo-social/worker.js" }, { filename: "qnfo-social/deployed-current.worker.js" }];
  const mk = (pr, checks) => ({ branches: [br("main", 0, true)], compare: {}, prs: { [pr.number]: pr }, pulls: [{ number: pr.number, state: "open", updated_at: pr.updated_at, head: pr.head }], files: { [pr.number]: files }, checks: { [pr.head.sha]: checks || req } });
  const p90 = mkpr(90, "n90");
  const s1 = mk(p90);
  const r1 = await run(s1);
  const log = (d1, action) => d1.db.prepare("SELECT pr, sha, why FROM branch_hygiene_log WHERE action = ?1 ORDER BY id").all(action);
  const M20 = 20 * 60000;
  // MERGEABILITY-REQUERY-1 (0.18.0): the first tick that reads null re-reads it (pre-warm + BH_MERGEABLE_READS) and logs the
  // refusal; update-branch is asked only when the same head reads null again on a later tick.
  eq([r1.out.merged_prs, r1.out.nudged_prs || [], r1.out.closed_prs, (s1.updates || []).length], [[], [], [], 0], "requery: the first null answer is not nudged, not merged, not closed");
  eq(r1.calls.filter((c) => c === "GET /pulls/90").length, 6, "requery: one pre-warm read and five reads before the lane gives up for this tick");
  eq(r1.out.prewarmed, 1, "requery: the candidate was pre-warmed");
  eq(log(r1.d1, "merge-refused").map((r) => [r.pr, r.sha, /mergeable null/.test(r.why) && /first null answer/.test(r.why) && /MERGEABILITY-REQUERY-1/.test(r.why)]), [[90, "n90", true]], "requery: the held refusal is a merge-refused row with its reason");
  const s1b = mk(p90);
  const r1b = await run(s1b, { now: NOW + M20 }, r1.d1);
  eq([r1b.out.merged_prs, r1b.out.nudged_prs, r1b.out.closed_prs], [[], [90], []], "nudge: a head that reads null on a second tick is nudged, not merged, not closed");
  eq((s1b.updates || []).map((u) => [u.path, u.body && u.body.expected_head_sha]), [["/pulls/90/update-branch", "n90"]], "nudge: update-branch is pinned to the head that was read");
  eq(log(r1.d1, "merge-nudge").map((r) => [r.pr, r.sha, /MERGEABILITY-NUDGE-1/.test(r.why)]), [[90, "n90", true]], "nudge: one merge-nudge row with the reason");
  for (let i = 2; i < 5; i++) await run(mk(p90), { now: NOW + i * M20 }, r1.d1);
  eq(log(r1.d1, "merge-nudge").length, r1.W.BH_NUDGE_MAX, "nudge: capped per pull request");
  eq(log(r1.d1, "merge-refused").some((r) => r.pr === 90 && /mergeable null/.test(r.why) && /already nudged 3 times/.test(r.why)), true, "nudge: past the cap the refusal is logged with its reason");
  const sOff = mk(p90);
  sOff.config = [["stale_pr_nudge_enabled", "off"]];
  const rOff = await run(sOff);
  eq([(sOff.updates || []).length, log(rOff.d1, "merge-refused").length, log(rOff.d1, "merge-nudge").length], [0, 1, 0], "nudge: the switch off restores the logged refusal");
  const sFail = mk(p90);
  sFail.updateStatus = 422;
  const rFail0 = await run(sFail);
  const rFail = await run(sFail, { now: NOW + M20 }, rFail0.d1);
  eq([rFail.out.nudged_prs || [], log(rFail.d1, "merge-refused").some((r) => /update-branch HTTP 422/.test(r.why))], [[], true], "nudge: a refused update-branch is a logged refusal");
  const p91 = mkpr(91, "n91", { mergeable: true, mergeable_state: "behind" });
  const s2 = mk(p91);
  const r2 = await run(s2);
  eq([r2.out.nudged_prs, (s2.updates || []).length], [[91], 1], "nudge: a branch that is only behind main is brought up to date at once");
  const p92 = mkpr(92, "n92");
  const s4 = mk(p92, req.slice(1).concat([{ id: 399, name: "gate", status: "completed", conclusion: "failure" }]));
  const r4 = await run(s4);
  eq([(s4.updates || []).length, log(r4.d1, "merge-refused").length], [0, 1], "nudge: a PR with a failing required check is not nudged; the refusal is logged");
  const p93 = mkpr(93, "n93", { updated_at: hAgo(30) });
  const s5 = mk(p93);
  const r5 = await run(s5);
  eq([r5.out.nudged_prs || [], r5.out.closed_prs], [[], []], "requery: a PR whose mergeability reads null is not closed on that tick, even past 24h");
  const r5b = await run(mk(p93), { now: NOW + M20 }, r5.d1);
  eq([r5b.out.nudged_prs, r5b.out.closed_prs], [[93], []], "nudge: a nudged PR is not closed on the same tick, even past 24h");
  // The case measured on 2026-10-12 (PRs 941, 943, 944, 946, 960): null right after main moved, clean a few seconds later.
  const p97 = mkpr(97, "n97");
  const s7 = mk(p97);
  s7.prSeq = { 97: [p97, p97, Object.assign({}, p97, { mergeable: true, mergeable_state: "clean" })] };
  const r7 = await run(s7);
  eq([r7.out.merged_prs, (s7.updates || []).length, (s7.merges || []).map((x) => x.pr), log(r7.d1, "merge-refused").length], [[97], 0, [97], 0], "requery: null then clean within the tick is merged on that tick, with no update-branch and no refusal row");
  // LANE-TICK-20-1: the */20 tick runs the lane alone.
  const p98 = mkpr(98, "n98", { mergeable: true, mergeable_state: "clean" });
  const idle = { number: 99, state: "open", updated_at: hAgo(40), head: { ref: "claude/idle99", sha: "n99", repo: R } };
  const s8 = mk(p98);
  s8.pulls.push(idle);
  s8.prs[99] = Object.assign({}, idle, { draft: false, merged: false, mergeable: false, mergeable_state: "dirty", title: "t", labels: [], base: { ref: "main", repo: R } });
  s8.files[99] = files;
  s8.checks.n99 = req;
  const r8 = await run(s8, { laneOnly: true, now: NOW + M20 });
  eq([r8.out.lane_only, r8.out.merged_prs, r8.out.closed_prs], [true, [98], []], "lane tick: a green clean quiet PR is merged on the */20 tick and nothing is closed");
  eq([r8.calls.some((c) => c.indexOf("GET /branches") === 0), r8.calls.some((c) => c.indexOf("GET /pulls?state=open") === 0), r8.calls.some((c) => c === "GET " || c === "PATCH " || c === "PATCH /pulls/99"), r8.d1.db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind = 'branch-hygiene-tick'").get().n], [false, true, false, 0], "lane tick: open pull requests only; no branch sweep, no close, no repository setting, no heartbeat row");
  eq(log(r8.d1, "merge-refused").map((r) => r.pr), [99], "lane tick: a refusal is still a logged row");
  const r9 = await run(mk(p98), { laneOnly: true });
  eq([r9.out.idle, r9.calls.length], ["hourly tick owns minute 0", 0], "lane tick: stands aside at minute 0, where the hourly tick runs");
  const s10 = mk(p98);
  s10.config = [["stale_pr_merge_enabled", "off"]];
  const r10 = await run(s10, { laneOnly: true, now: NOW + M20 });
  eq([r10.out.idle, r10.calls.length], ["merge lane off or dry run", 0], "lane tick: the lane's own switch stops it");
  const nd = r1.W.bhNudgeDecide, why = { merge: false, why: "GitHub reports mergeable null, mergeable_state unknown" };
  eq(nd(p90, why).nudge, true, "nudge pure: null -> nudge");
  eq(nd(mkpr(94, "x", { mergeable: false, mergeable_state: "dirty" }), { merge: false, why: "GitHub reports mergeable false, mergeable_state dirty" }).nudge, false, "nudge pure: a conflict is never nudged");
  eq(nd(mkpr(95, "x", { mergeable: true, mergeable_state: "unstable" }), { merge: false, why: "GitHub reports mergeable true, mergeable_state unstable" }).nudge, false, "nudge pure: unstable belongs to the check-repair lane");
  eq(nd(p90, { merge: false, why: "it changes .github/workflows/x.yml; workflows and repository settings are never merged automatically" }).nudge, false, "nudge pure: another refusal reason is not nudged");
  eq(nd(mkpr(96, "x", { draft: true }), why).nudge, false, "nudge pure: a draft is left alone");
}

{ // SECRET-COMPARE-1 (0.17.0): constant-time token comparison accepts exactly what === accepted between two set strings
  const sb = { TextEncoder, Math, __name: (f) => f, out: null };
  vm.createContext(sb);
  vm.runInContext(grab("secretEq") + "\nout = secretEq;", sb);
  const se = sb.out;
  eq([se("abc123", "abc123"), se("abc123", "abc124"), se("abc", "abc123"), se("abc123", "abc"), se("", ""), se("éx", "éx")], [true, false, false, false, true, true], "secretEq: equal strings only");
  eq([se(null, "a"), se("a", undefined), se(undefined, undefined), se(null, null)], [false, false, false, false], "secretEq: a missing token or secret never matches");
  eq(/\b[A-Za-z0-9]+ [!=]== env\.[A-Z_]*(TOKEN|SECRET|KEY)\b/.test(src), false, "no direct comparison of a presented token with a stored secret remains");
  const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  eq(!!ver && (Number(ver[1]) > 0 || Number(ver[2]) >= 17), true, "VERSION is at least 0.17.0");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

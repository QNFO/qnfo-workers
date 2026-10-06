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
    let m;
    if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(path)) && sc.prs) return sc.prs[m[1]] ? ok(sc.prs[m[1]]) : ok({ message: "Not Found" }, 404);
    if (method === "GET" && (m = /^\/pulls\/(\d+)\/files/.exec(path)) && sc.prs) return ok((sc.files || {})[m[1]] || []);
    if (method === "GET" && (m = /^\/commits\/([^/]+)\/check-runs/.exec(path))) return ok({ check_runs: (sc.checks || {})[m[1]] || [] });
    if (method === "GET" && (m = /^\/commits\/([^/]+)\/status$/.exec(path))) return ok({ state: "pending", total_count: 0 });
    if (method === "PUT" && (m = /^\/pulls\/(\d+)\/merge$/.exec(path))) { (sc.merges = sc.merges || []).push({ pr: Number(m[1]), body }); return sc.mergeStatus ? ok({ message: "Base branch was modified" }, sc.mergeStatus) : ok({ sha: "m" + m[1], merged: true }); }
    if (method === "PUT" && /\/update-branch$/.test(path)) return ok({}, 202);
    if (method === "GET" && path.startsWith("/pulls")) return ok(sc.pulls || []);
    if (method === "GET" && path.startsWith("/compare/main...")) { const sha = decodeURIComponent(path.split("...")[1]); return sc.compare[sha] ? ok(sc.compare[sha]) : ok(null, 404); }
    if (method === "POST" && path === "/git/refs") return sc.archiveFails ? ok({ message: "Validation Failed" }, 422) : ok({}, 201);
    if (method === "DELETE") return ok(null, 204);
    if (method === "GET" && path === "") return ok({ delete_branch_on_merge: sc.setting == null ? false : sc.setting });
    if (method === "POST" && /^\/issues\/\d+\/comments$/.test(path)) return ok({}, 201);
    if (method === "PATCH" && path.startsWith("/pulls/")) return ok({});
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
  const deps = ["var EVOLVE_REQUIRED = ", "var CM_OK = ", "var EVOLVE_DENY = ", "var CM_DENY = "].map((k) => { const i = src.indexOf(k); return src.slice(i, src.indexOf("\n", i)); }).concat(["cmRequired", "cmChecks", "evMergePr"].map(grab)).join("\n");
  vm.runInContext(deps + "\n" + src.slice(a, b + END.length) + "\nBH_MERGEABLE_WAIT_MS = 0;\n__export = { bhDecide, bhMergeDecide, branchHygieneTick, BH_MAX_ACTIONS };", sandbox, { filename: "bh-block.js" });
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

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

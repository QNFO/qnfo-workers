/**
 * pr-merge-sla.test.mjs -- offline suite for PR-MERGE-SLA-10M-1 (qnfo-fleet-control 0.49.0, owner directive 2026-10-26:
 * every pull request merges within 10 minutes of opening).
 *
 * Slices the shipped code out of worker.js and drives it against an in-memory SQLite D1 and a scripted GitHub:
 *   1. the lane marks a green, quiet draft ready (GraphQL) and merges it on the fresh read; a hold, a WIP title, a workflow
 *      change, a failing GraphQL call and GitHub's lag after the ready mark each stop short of a merge and say why;
 *      ops_config stale_pr_merge_drafts = off restores "a draft is never merged"; a draft is never closed as stale;
 *   2. every pull request into main is recorded in pr_sla_state with GitHub's created_at (the clock the 10 minutes run on),
 *      updated on the next tick, and marked merged when the lane merges it;
 *   3. POST /gh/poke: runs both loops once, debounces to one run a minute, answers without running when
 *      ops_config gh_poke_enabled is off, fails closed when the debounce slot cannot be taken, and needs no secret.
 *
 *   node qnfo-fleet-control/pr-merge-sla.test.mjs      -> prints "N passed, 0 failed"
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
let passed = 0, failed = 0;
function eq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return; }
  failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
if (a < 0 || b < a) { console.error("FAIL branch-hygiene block markers missing"); console.log("1 failed"); process.exit(1); }
function grab(name) {
  const i = src.indexOf("function " + name + "(");
  let d = 0;
  const st = src.slice(i - 6, i) === "async " ? i - 6 : i;
  for (let k = src.indexOf("{", i); k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(st, k + 1); }
  throw new Error("function " + name + " not found");
}

const NOW = Date.parse("2026-10-03T10:07:00Z");
const hAgo = (n) => new Date(NOW - n * 3600000).toISOString();
const R = { full_name: "QNFO/qnfo-workers" };

function makeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE code_tasks (id TEXT, branch TEXT, status TEXT, updated_at TEXT); CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT); CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT); INSERT INTO metric_registry (metric) VALUES ('repo_branches_open'); CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, close_channel TEXT); CREATE TABLE scheduler_state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);");
  const stmt = (sql, args) => ({
    bind: (...a2) => stmt(sql, a2),
    run: async () => { const r = db.prepare(sql.replace(/\?(\d+)/g, "?")).run(...args); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql.replace(/\?(\d+)/g, "?")).get(...args) || null,
    all: async () => ({ results: db.prepare(sql.replace(/\?(\d+)/g, "?")).all(...args) }),
  });
  // ?N placeholders: the harness binds positionally, so numbered placeholders are rewritten per statement; repeated ones (?1 used twice) are expanded below.
  const prepare = (sql) => {
    const order = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]));
    const plain = sql.replace(/\?\d+/g, "?");
    const mk = (args) => ({
      bind: (...x) => mk(x),
      run: async () => { const r = db.prepare(plain).run(...order.map((n) => args[n - 1])); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(plain).get(...order.map((n) => args[n - 1])) || null,
      all: async () => ({ results: db.prepare(plain).all(...order.map((n) => args[n - 1])) }),
    });
    return mk([]);
  };
  return { db, AUDIT: { prepare, batch: async (xs) => { const out = []; for (const x of xs) out.push(await x.run()); return out; } } };
}

function makeGh(sc) {
  const calls = [];
  const evApi = async (env, method, path, body) => {
    calls.push(method + " " + path);
    const ok = (j, status = 200) => ({ status, ok: status < 300, j });
    let m;
    if (method === "GET" && path.startsWith("/branches")) return ok(sc.branches || []);
    if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(path)) && sc.prSeq && sc.prSeq[m[1]] && sc.prSeq[m[1]].length) return ok(sc.prSeq[m[1]].length > 1 ? sc.prSeq[m[1]].shift() : sc.prSeq[m[1]][0]);
    if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(path)) && sc.prs) return sc.prs[m[1]] ? ok(sc.prs[m[1]]) : ok({ message: "Not Found" }, 404);
    if (method === "GET" && (m = /^\/pulls\/(\d+)\/files/.exec(path))) return ok((sc.files || {})[m[1]] || []);
    if (method === "GET" && (m = /^\/commits\/([^/]+)\/check-runs/.exec(path))) return ok({ check_runs: (sc.checks || {})[m[1]] || [] });
    if (method === "GET" && (m = /^\/commits\/([^/]+)\/status$/.exec(path))) return ok({ state: "pending", total_count: 0 });
    if (method === "PUT" && (m = /^\/pulls\/(\d+)\/merge$/.exec(path))) { (sc.merges = sc.merges || []).push({ pr: Number(m[1]), body }); return ok({ sha: "merged" + m[1], merged: true });
    }
    if (method === "PUT" && /\/update-branch$/.test(path)) { (sc.updates = sc.updates || []).push({ path, body }); return ok({}, 202); }
    if (method === "GET" && path.startsWith("/pulls")) return ok(sc.pulls || []);
    if (method === "DELETE") return ok(null, 204);
    if (method === "GET" && path === "") return ok({ delete_branch_on_merge: true });
    if (method === "POST" && /^\/issues\/\d+\/comments$/.test(path)) return ok({}, 201);
    if (method === "PATCH") return ok({});
    if (method === "GET" && (m = /^\/issues\/(\d+)\/comments/.exec(path))) return ok((sc.comments || {})[m[1]] || []);
    if (method === "GET" && (m = /^\/commits\/([^/?]+)$/.exec(path))) return ok({ sha: m[1], commit: { committer: { date: (sc.commitAt || {})[m[1]] || hAgo(5) } } });
    return ok(null, 404);
  };
  const evGraphql = async (env, query, variables) => {
    (sc.gql = sc.gql || []).push({ query, variables });
    if (sc.gqlStatus) return { status: sc.gqlStatus, ok: false, j: { message: "Resource not accessible by integration" } };
    if (sc.gqlError) return { status: 200, ok: true, j: { errors: [{ message: sc.gqlError }] } };
    return { status: 200, ok: true, j: { data: { markPullRequestReadyForReview: { pullRequest: { number: 1, isDraft: false } } } } };
  };
  return { evApi, evGraphql, calls };
}

async function run(sc, opts) {
  const d1 = makeD1();
  (sc.config || []).forEach(([k, v]) => d1.db.prepare("INSERT INTO ops_config (key, value) VALUES (?1, ?2)").run(k, v));
  const gh = makeGh(sc);
  const sandbox = { evApi: gh.evApi, evGraphql: gh.evGraphql, EVOLVE_REPO: "QNFO/qnfo-workers", __name: (f) => f, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, encodeURIComponent, Promise, setTimeout, __export: null };
  vm.createContext(sandbox);
  const deps = ["var EVOLVE_REQUIRED = ", "var CM_OK = ", "var EVOLVE_DENY = ", "var CM_CONTROL_PLANE = ", "var CM_LOOP_CANARIED = ", "var CM_DENY = "].map((k) => { const i = src.indexOf(k); return src.slice(i, src.indexOf("\n", i)); }).concat(["cmRequired", "cmChecks", "evMergePr"].map(grab)).join("\n");
  vm.runInContext(deps + "\n" + src.slice(a, b + END.length) + "\nBH_MERGEABLE_WAIT_MS = 0;\nEV_MERGE_RETRY_WAIT_MS = 0;\nBH_READY_WAIT_MS = 0;\n__export = { bhMergeDecide, bhPrAgeRow, bhReadyForReview, branchHygieneTick };", sandbox, { filename: "bh-block.js" });
  const env = { GITHUB_TOKEN: "x", AUDIT: d1.AUDIT };
  const out = await sandbox.__export.branchHygieneTick(env, Object.assign({ now: NOW }, opts || {}));
  return { out, calls: gh.calls, d1, W: sandbox.__export, sc };
}

const green = (h, names) => names.map((n, i) => ({ id: 10 + i, name: n, status: "completed", conclusion: "success", head_sha: h }));
const ALL = ["gate", "mirror-guard", "comparator", "guard", "CodeQL"];
const W2 = (f) => ["demo/worker.js", "demo/deployed-current.worker.js"].concat(f || []).map((n) => ({ filename: n, status: "modified" }));
const prj = (n, ref, h, over) => Object.assign({ number: n, node_id: "PR_node_" + n, state: "open", draft: false, merged: false, mergeable: true, mergeable_state: "clean", title: "feat: thing " + n, body: "", labels: [], created_at: hAgo(4), updated_at: hAgo(3), head: { ref, sha: h, repo: R }, base: { ref: "main", repo: R } }, over || {});
const lite = (x) => ({ number: x.number, state: x.state, draft: x.draft, merged_at: x.merged_at || null, closed_at: x.closed_at || null, created_at: x.created_at, updated_at: x.updated_at, head: x.head, base: x.base });
const scenario = (prs, extra) => Object.assign({ branches: [{ name: "main", protected: true, commit: { sha: "m0" } }], compare: {}, prs, pulls: Object.values(prs).map(lite), files: Object.fromEntries(Object.keys(prs).map((n) => [n, W2()])), checks: Object.fromEntries(Object.values(prs).map((x) => [x.head.sha, green(x.head.sha, ALL)])) }, extra || {});

// ---- 1. the draft path ----
{
  // a green, clean, quiet draft: marked ready, then merged on the fresh read (GitHub answers draft once more before the ready state shows)
  const d = prj(61, "claude/draft-ok", "a61", { draft: true });
  const rdy = prj(61, "claude/draft-ok", "a61");
  const sc = scenario({ 61: d }, { prSeq: { 61: [d, d, rdy] } });
  const { out, d1, calls } = await run(sc);
  eq((sc.gql || []).length, 1, "a green quiet draft is marked ready with one GraphQL call");
  eq(sc.gql[0].variables, { id: "PR_node_61" }, "the mutation names the pull request by its node id");
  eq(/markPullRequestReadyForReview/.test(sc.gql[0].query), true, "the mutation is markPullRequestReadyForReview");
  eq(out.merged_prs, [61], "the draft is merged in the same tick once the fresh read is ready and clean");
  eq((sc.merges || []).map((m) => [m.pr, m.body.sha, m.body.merge_method]), [[61, "a61", "squash"]], "the merge is a squash pinned to the tested head");
  eq(/marked ready/.test(d1.db.prepare("SELECT why FROM branch_hygiene_log WHERE action = 'merge-stale-pr' AND pr = 61").get().why), true, "the merge row says the draft was marked ready first");
  eq(calls.filter((c) => c === "PUT /pulls/61/merge").length, 1, "exactly one merge call");
}
{
  // GitHub still answers draft after the ready mark: nothing is merged, the draft-ready row says so, the next trigger merges it
  const d = prj(62, "claude/draft-lag", "a62", { draft: true });
  const sc = scenario({ 62: d }, { prSeq: { 62: [d] } });
  const { out, d1 } = await run(sc);
  eq(sc.merges || [], [], "a draft GitHub still reports as a draft is not merged");
  eq(out.merged_prs, [], "and is not counted as merged");
  const row = d1.db.prepare("SELECT action, why FROM branch_hygiene_log WHERE pr = 62").get();
  eq(row && row.action, "draft-ready", "the tick logs a draft-ready row, not a refusal");
  eq(/marked ready/.test(row.why), true, "the row says it was marked ready and why it waited");
}
{
  // GraphQL refused (a token without the permission): no merge, a merge-refused row with the reason, the draft stays open
  const d = prj(63, "claude/draft-nogql", "a63", { draft: true });
  const sc = scenario({ 63: d }, { prSeq: { 63: [d] }, gqlStatus: 403 });
  const { out, d1, calls } = await run(sc);
  eq(sc.merges || [], [], "a draft that cannot be marked ready is not merged");
  eq(/could not be marked ready: GraphQL HTTP 403/.test(d1.db.prepare("SELECT why FROM branch_hygiene_log WHERE pr = 63").get().why), true, "the refusal names the GraphQL failure");
  eq(calls.some((c) => /^(PATCH|PUT) \/pulls\/63/.test(c)), false, "and the draft is neither merged nor closed");
  eq(out.closed_prs, [], "it is not in closed_prs");
  const sc2 = scenario({ 63: d }, { prSeq: { 63: [d] }, gqlError: "Pull request is not a draft" });
  const r2 = await run(sc2);
  eq(/GraphQL HTTP 200 Pull request is not a draft/.test(r2.d1.db.prepare("SELECT why FROM branch_hygiene_log WHERE pr = 63").get().why), true, "a GraphQL errors[] answer is a failure too");
}
{
  // every hold still wins for a draft: WIP title, hold label, do-not-merge body, a workflow change, a missing required check, a young draft
  const wip = prj(64, "claude/wip", "a64", { draft: true, title: "WIP: half done" });
  const held = prj(65, "claude/held", "a65", { draft: true, labels: [{ name: "hold" }] });
  const dnm = prj(66, "claude/dnm", "a66", { draft: true, body: "please do not merge" });
  const wf = prj(67, "claude/wf", "a67", { draft: true });
  const nochk = prj(68, "claude/nochk", "a68", { draft: true });
  const young = prj(69, "claude/young", "a69", { draft: true, updated_at: hAgo(0.02) });
  const prs = { 64: wip, 65: held, 66: dnm, 67: wf, 68: nochk, 69: young };
  const sc = scenario(prs, { prSeq: Object.fromEntries(Object.entries(prs).map(([n, x]) => [n, [x]])) });
  sc.files[67] = W2([".github/workflows/x.yml"]);
  sc.checks.a68 = green("a68", ["gate", "mirror-guard", "comparator"]);
  const { out } = await run(sc);
  eq(sc.gql || [], [], "no hold, WIP marker, workflow change, missing check or young draft is ever marked ready");
  eq(sc.merges || [], [], "and none is merged");
  eq(out.merged_prs, [], "merged_prs is empty");
}
{
  // the switch: stale_pr_merge_drafts = off restores "a draft is never merged"
  const d = prj(70, "claude/draft-off", "a70", { draft: true });
  const sc = scenario({ 70: d }, { prSeq: { 70: [d] }, config: [["stale_pr_merge_drafts", "off"]] });
  const { out } = await run(sc);
  eq([sc.gql || [], sc.merges || [], out.merged_prs], [[], [], []], "with the switch off a green quiet draft is left exactly as before");
}
{
  // a code-loop draft stays its runner's, and a draft is never closed as stale (CYCLE-TIME-1 closes non-drafts only)
  const bot = prj(71, "codeagent-abc", "a71", { draft: true });
  const old = prj(72, "claude/old-draft", "a72", { draft: true, updated_at: hAgo(50), mergeable: false, mergeable_state: "dirty" });
  const sc = scenario({ 71: bot, 72: old }, { prSeq: { 71: [bot], 72: [old] } });
  const { out, calls } = await run(sc);
  eq(sc.gql || [], [], "a code-loop draft is not marked ready by the session-PR lane");
  eq(out.closed_prs, [], "a 50-hour-old conflicting draft is not closed as stale");
  eq(calls.some((c) => /^PATCH \/pulls\/72/.test(c)), false, "no PATCH was sent for it");
}

// ---- 2. pr_sla_state ----
{
  const ready = prj(81, "claude/ready", "a81", { created_at: hAgo(0.5), updated_at: hAgo(0.01) }); // inside the quiet window: recorded, not merged
  const draft = prj(82, "claude/dr", "a82", { draft: true, created_at: hAgo(0.2), updated_at: hAgo(0.01) });
  const merged = prj(83, "claude/done", "a83", { state: "closed", merged: true, merged_at: hAgo(1), closed_at: hAgo(1), created_at: hAgo(1.1), updated_at: hAgo(1) });
  const closed = prj(84, "claude/nope", "a84", { state: "closed", closed_at: hAgo(2), created_at: hAgo(2.2), updated_at: hAgo(2) });
  const forkBase = prj(85, "claude/other", "a85", { base: { ref: "dev", repo: R } });
  const sc = scenario({ 81: ready, 82: draft, 83: merged, 84: closed, 85: forkBase }, { prSeq: { 81: [ready], 82: [draft] } });
  sc.pulls = Object.values({ 81: ready, 82: draft, 83: merged, 84: closed, 85: forkBase }).map(lite);
  const first = await run(sc);
  const rows = first.d1.db.prepare("SELECT pr, state, draft, opened_at FROM pr_sla_state ORDER BY pr").all().map((r) => ({ ...r }));
  eq(rows.map((r) => [r.pr, r.state, r.draft]), [[81, "open", 0], [82, "open", 1], [83, "merged", 0], [84, "closed", 0]], "open, draft, merged and closed pull requests into main are recorded; one into another base is not");
  eq(rows[0].opened_at, hAgo(0.5), "opened_at is GitHub's created_at, the clock the 10 minutes run on");
  eq(first.out.pr_age_rows, 4, "the tick reports how many rows it wrote");
  // a second tick updates last_seen and keeps opened_at and the first closed_at
  const before = first.d1.db.prepare("SELECT closed_at FROM pr_sla_state WHERE pr = 83").get().closed_at;
  eq(before, hAgo(1), "a merged pull request carries GitHub's merged_at as its closed_at");
  const second = await run(Object.assign({}, sc, { prSeq: { 81: [ready], 82: [draft] } }));
  eq(second.d1.db.prepare("SELECT COUNT(*) AS n FROM pr_sla_state").get().n, 4, "a tick never duplicates a row");
  // the lane's own merge marks the row merged at once
  const g = prj(86, "claude/green", "a86", { created_at: hAgo(0.3), updated_at: hAgo(0.2) });
  const sc3 = scenario({ 86: g }, { prSeq: { 86: [g] } });
  const t3 = await run(sc3);
  const m3 = t3.d1.db.prepare("SELECT state, closed_at FROM pr_sla_state WHERE pr = 86").get();
  eq([t3.out.merged_prs, m3.state, m3.closed_at !== null], [[86], "merged", true], "a pull request the lane merges is marked merged in the same tick");
  // pure row builder
  const rb = first.W.bhPrAgeRow;
  eq(rb(null, "x"), null, "pure: no pull request, no row");
  eq(rb({ number: 5, created_at: "2026-10-26T06:00:00Z", state: "open", base: { ref: "main", repo: R }, head: { ref: "h" }, draft: true }, "now").draft, 1, "pure: draft is stored as 1");
  eq(rb({ number: 5, created_at: "2026-10-26T06:00:00Z", state: "closed", closed_at: "2026-10-26T06:05:00Z", base: { ref: "main", repo: R } }, "now").closed_at, "2026-10-26T06:05:00Z", "pure: a closed pull request keeps closed_at");
  eq(rb({ number: 5, state: "open", base: { ref: "main", repo: R } }, "now"), null, "pure: no created_at, no row");
}

// ---- 3. POST /gh/poke ----
{
  const i = src.indexOf("// ---- PR-MERGE-SLA-10M-1:BEGIN"), j = src.indexOf("// ---- PR-MERGE-SLA-10M-1:END");
  eq(i > 0 && j > i, true, "the poke block markers are present");
  const block = src.slice(i, j);
  const mk = (cfgRows, brokenSlot) => {
    const d1 = makeD1();
    (cfgRows || []).forEach(([k, v]) => d1.db.prepare("INSERT INTO ops_config (key, value) VALUES (?1, ?2)").run(k, v));
    const calls = { lane: 0, cm: 0, rec: [] };
    const sandbox = {
      VERSION: "t", console, Date, JSON, String, Number, Promise,
      json: (body, status) => ({ body, status: status || 200 }),
      ghAppEnv: async (e) => e,
      branchHygieneTick: async (e, o) => { calls.lane++; calls.laneOpts = o; return { merged_prs: [7] }; },
      codeMergeTick: async () => { calls.cm++; return { merges: 1 }; },
      ghWebhookRecord: async (e, id, ts, kind, text, meta, status) => { calls.rec.push({ id, kind, text, status }); return true; },
      __export: null,
    };
    vm.createContext(sandbox);
    vm.runInContext(block + "\n__export = { ghPokeHandle, ghPokeStatus, ghPokeEnabled, GH_POKE_DEBOUNCE_S };", sandbox, { filename: "poke-block.js" });
    const env = brokenSlot ? { AUDIT: { prepare: (sql) => { if (/scheduler_state/.test(sql)) throw new Error("D1_ERROR: boom"); return d1.AUDIT.prepare(sql); } } } : { AUDIT: d1.AUDIT };
    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(p) };
    const req = (hint) => ({ headers: { get: (h) => (h === "X-Poke-Event" ? hint || "" : null) } });
    return { W: sandbox.__export, env, ctx, pending, calls, d1, req };
  };
  {
    const t = mk();
    const r1 = await t.W.ghPokeHandle(t.req("pull_request opened"), t.env, t.ctx);
    await Promise.all(t.pending);
    eq([r1.status, r1.body.poked, r1.body.ran], [202, true, true], "an unsigned poke is accepted: it needs no secret");
    eq([t.calls.lane, t.calls.cm, t.calls.laneOpts], [1, 1, { laneOnly: true }], "it runs the lane (lane only) and the code-loop runner once");
    eq(t.calls.rec.length === 1 && t.calls.rec[0].kind === "gh-poke" && t.calls.rec[0].status === "lane-run" && /lane merged 1, runner merges 1/.test(t.calls.rec[0].text) && /pull_request opened/.test(t.calls.rec[0].text), true, "and records one gh-poke event with what it did and the hint it was sent");
    const r2 = await t.W.ghPokeHandle(t.req(), t.env, t.ctx);
    await Promise.all(t.pending);
    eq([r2.status, r2.body.debounced, r2.body.ran, t.calls.lane, t.calls.cm], [202, true, false, 1, 1], "a second poke inside a minute is debounced and runs nothing");
    t.d1.db.prepare("UPDATE scheduler_state SET updated_at = ?1 WHERE key = 'gh_poke'").run(new Date(Date.now() - 61000).toISOString());
    const r3 = await t.W.ghPokeHandle(t.req(), t.env, t.ctx);
    await Promise.all(t.pending);
    eq([r3.body.ran, t.calls.lane, t.calls.cm], [true, 2, 2], "after the minute the next poke runs again");
    // simultaneous pokes: exactly one takes the slot
    const u = mk();
    const rs = await Promise.all([1, 2, 3, 4].map(() => u.W.ghPokeHandle(u.req(), u.env, u.ctx)));
    await Promise.all(u.pending);
    eq([rs.filter((r) => r.body.ran).length, u.calls.lane], [1, 1], "four simultaneous pokes start one run");
  }
  {
    const t = mk([["gh_poke_enabled", "off"]]);
    const r = await t.W.ghPokeHandle(t.req(), t.env, t.ctx);
    await Promise.all(t.pending);
    eq([r.status, r.body.enabled, r.body.ran, t.calls.lane, t.calls.cm], [202, false, false, 0, 0], "ops_config gh_poke_enabled = off answers without running either loop");
    eq((await t.W.ghPokeStatus(t.env)).enabled, false, "and the status route reports it off");
  }
  {
    const t = mk(null, true);
    const r = await t.W.ghPokeHandle(t.req(), t.env, t.ctx);
    await Promise.all(t.pending);
    eq([r.status, r.body.ran, t.calls.lane], [202, false, 0], "a poke that cannot take the debounce slot fails closed and runs nothing (the cron is the second path)");
  }
  {
    const t = mk();
    const s0 = await t.W.ghPokeStatus(t.env);
    eq([s0.ok, s0.route, s0.enabled, s0.debounce_s, s0.last], [true, "gh-poke", true, 60, null], "the status route: on, one-minute debounce, nothing recorded yet");
    t.d1.db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('x', '2026-10-26T07:00:00Z', 'gh-poke', 'poked', 'qnfo-fleet-control', 'lane-run')").run();
    eq((await t.W.ghPokeStatus(t.env)).last, { ts: "2026-10-26T07:00:00Z", text: "poked" }, "and shows the last poke once one ran");
    eq(/X-Hub-Signature/.test(block.replace(/\/\/.*$/gm, "")), false, "the poke code never reads a signature (it trusts nothing it carries)");
  }
}
// the routes are wired
eq(/p === "\/gh\/poke" && request\.method === "POST"\) return ghPokeHandle\(request, env, ctx\)/.test(src) && /p === "\/gh\/poke" && request\.method === "GET"\) return json\(await ghPokeStatus\(env\)\)/.test(src), true, "POST and GET /gh/poke are routed");
const vm0 = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
eq(vm0 && (Number(vm0[1]) > 0 || Number(vm0[2]) >= 49), true, "VERSION is at least 0.49.0");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

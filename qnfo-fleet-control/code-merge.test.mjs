/**
 * code-merge.test.mjs -- offline regression lock for CODE-TASK-MERGE-RUNNER-1 (qnfo-fleet-control 0.4.85).
 *
 * Slices the EVOLVE-PR-1 block and the runner block out of worker.js and drives them against an in-memory SQLite D1
 * (node:sqlite, Node 22) and a scripted GitHub API. Patches are produced by the code orchestrator's own hunkPatch and
 * wholeFilePatch (sliced from qnfo-code-orchestrator/worker.js), so the parser and applier are tested against the real
 * producer. Proves: the open decision (a pushed branch becomes a PR opened with the fleet token only after the verify,
 * scope, provenance and integrity gates; an existing PR is adopted), the merge decision (every refusal and wait case, the
 * 3h refusal when no required check starts, and the one green path), the merge with merged_by, post-merge deploy and live
 * verification, the inverse-patch revert through an evolve candidate, the kill switch, the first-ok marker, provenance,
 * reconciliation of person merges and opens, one merge per tick, and that evAdvance still merges, deploys and verifies
 * its own candidates after the shared-helper refactor.
 * Output MUST contain "0 failed" on success; charter-guard.yml greps for exactly that string.
 *
 *   node qnfo-fleet-control/code-merge.test.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const A = src.indexOf("var EVOLVE_REPO = ");
const END = "// ---- CODE-TASK-MERGE-RUNNER-1:END ----";
const B = src.indexOf(END);
if (A < 0 || B < A || src.indexOf("// ---- CODE-TASK-MERGE-RUNNER-1:BEGIN") < A) { console.error("FAIL evolve / code-merge blocks not found in worker.js"); console.log("1 failed"); process.exit(1); }
const orch = readFileSync(join(here, "..", "qnfo-code-orchestrator", "worker.js"), "utf8");
const o1 = orch.indexOf("function lineOps("), o2 = orch.indexOf("function promptForPatch("), o3 = orch.indexOf("function wholeFilePatch("), o4 = orch.indexOf("// ONE bounded step");
if (o1 < 0 || o2 < o1 || o3 < 0 || o4 < o3) { console.error("FAIL orchestrator diff functions not found"); console.log("1 failed"); process.exit(1); }

// ---------------------------------------------------------------- D1 (node:sqlite)
let db;
function freshDb() {
  db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL, goal TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', step TEXT NOT NULL DEFAULT 'read', attempts INTEGER NOT NULL DEFAULT 0, model TEXT, ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, actor TEXT, from_sha TEXT, to_sha TEXT, source_path TEXT, ok INTEGER, note TEXT, ts TEXT, session_id TEXT);
CREATE TABLE worker_live_audit (worker TEXT PRIMARY KEY, http INTEGER, live_version TEXT, registry_before TEXT, match INTEGER, note TEXT, probed_at TEXT);`);
}
function stmtOn(sql) {
  let args = [];
  const self = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  };
  return self;
}
const AUDIT = { prepare: (sql) => stmtOn(sql) };
const rows = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);

// ---------------------------------------------------------------- GitHub (scripted)
const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");
let gh;
function freshGh() {
  gh = { calls: [], pulls: {}, files: {}, checks: {}, statuses: {}, contents: {}, mergeBase: {}, branches: { main: "main1" }, compareFiles: {}, merges: [], comments: [], commits: [], refs: [], blobs: [], newPulls: [], down: false, mergeStatus: null, seq: 0 };
}
function resp(status, j) { return { status, async json() { return j; } }; }
function ghRoute(method, path, body) {
  gh.calls.push(method + " " + path);
  if (gh.down) return resp(503, { message: "down" });
  let m;
  if (method === "GET" && (m = /^\/pulls\/(\d+)$/.exec(path))) return gh.pulls[m[1]] ? resp(200, gh.pulls[m[1]]) : resp(404, {});
  if (method === "GET" && (m = /^\/pulls\?head=QNFO%3A([^&]+)&state=all&per_page=5$/.exec(path))) return resp(200, Object.values(gh.pulls).filter((p) => p.head.ref === decodeURIComponent(m[1])));
  if (method === "GET" && (m = /^\/git\/ref\/heads\/(.+)$/.exec(path)) && m[1] !== "main") return gh.branches[m[1]] ? resp(200, { object: { sha: gh.branches[m[1]] } }) : resp(404, { message: "Not Found" });
  if (method === "GET" && (m = /^\/pulls\/(\d+)\/files\?per_page=100$/.exec(path))) return resp(200, gh.files[m[1]] || []);
  if (method === "GET" && (m = /^\/commits\/([^/]+)\/check-runs\?per_page=100$/.exec(path))) return resp(200, { total_count: (gh.checks[m[1]] || []).length, check_runs: gh.checks[m[1]] || [] });
  if (method === "GET" && (m = /^\/commits\/([^/]+)\/status$/.exec(path))) return resp(200, gh.statuses[m[1]] || { state: "pending", total_count: 0, statuses: [] });
  if (method === "GET" && (m = /^\/compare\/main\.\.\.(.+)$/.exec(path))) return resp(200, { merge_base_commit: { sha: gh.mergeBase[m[1]] || "base0" }, files: gh.compareFiles[m[1]] || [] });
  if (method === "GET" && (m = /^\/contents\/(.+)\?ref=(.+)$/.exec(path))) {
    const key = decodeURIComponent(m[2]) + ":" + m[1].split("/").map(decodeURIComponent).join("/");
    return key in gh.contents ? resp(200, { encoding: "base64", content: b64(gh.contents[key]) }) : resp(404, { message: "Not Found" });
  }
  if (method === "GET" && path === "/git/ref/heads/main") return resp(200, { object: { sha: "main1" } });
  if (method === "GET" && (m = /^\/git\/commits\/(.+)$/.exec(path))) return resp(200, { sha: m[1], tree: { sha: "tree-" + m[1] } });
  if (method === "POST" && path === "/git/commits") { const sha = "k" + (++gh.seq); gh.commits.push({ sha, ...body }); return resp(201, { sha }); }
  if (method === "PATCH" && (m = /^\/git\/refs\/heads\/(.+)$/.exec(path))) {
    gh.refs.push({ branch: m[1], ...body });
    for (const n in gh.pulls) if (gh.pulls[n].head.ref === m[1]) gh.pulls[n].head.sha = body.sha;
    return resp(200, { object: { sha: body.sha } });
  }
  if (method === "PUT" && (m = /^\/pulls\/(\d+)\/merge$/.exec(path))) {
    gh.merges.push({ pr: Number(m[1]), ...body });
    if (gh.mergeStatus) return resp(gh.mergeStatus, { message: "not mergeable" });
    if (gh.pulls[m[1]]) { gh.pulls[m[1]].merged = true; gh.pulls[m[1]].state = "closed"; }
    return resp(200, { sha: "merge-" + m[1], merged: true });
  }
  if (method === "PUT" && /\/update-branch$/.test(path)) return resp(202, {});
  if (method === "DELETE" && /^\/git\/refs\/heads\//.test(path)) return resp(204, null);
  if (method === "POST" && (m = /^\/issues\/(\d+)\/comments$/.exec(path))) { gh.comments.push({ pr: Number(m[1]), body: body.body }); return resp(201, {}); }
  if (method === "PATCH" && /^\/pulls\/\d+$/.test(path)) return resp(200, {});
  if (method === "POST" && path === "/git/blobs") { gh.blobs.push(Buffer.from(body.content, "base64").toString("utf8")); return resp(201, { sha: "blob" + gh.blobs.length }); }
  if (method === "POST" && path === "/git/trees") return resp(201, { sha: "tree-new" });
  if (method === "POST" && path === "/git/refs") return resp(201, { ref: body.ref });
  if (method === "POST" && path === "/pulls") {
    const number = 900 + gh.newPulls.length, sha = gh.branches[body.head];
    gh.newPulls.push({ number, ...body });
    if (sha) { gh.pulls[number] = prJson({ number, title: body.title, head: { ref: body.head, sha, repo: { full_name: "QNFO/qnfo-workers" } } }); gh.files[number] = gh.compareFiles[sha] || []; }
    return resp(201, { number });
  }
  return resp(404, { message: "unscripted " + method + " " + path });
}
async function timedFetch(url, opts) {
  const p = String(url).replace("https://api.github.com/repos/QNFO/qnfo-workers", "");
  return ghRoute((opts && opts.method) || "GET", p, opts && opts.body ? JSON.parse(opts.body) : null);
}

// ---------------------------------------------------------------- sandbox
const sandbox = {
  __name: (f) => f, timedFetch, aiRunAttr: async () => null, console, TextDecoder, TextEncoder, atob, btoa, encodeURIComponent,
  b64encode: (s) => Buffer.from(String(s), "utf8").toString("base64"), DIFF_MAX_D: 600, __export: null,
};
vm.createContext(sandbox);
vm.runInContext(src.slice(A, B + END.length) + "\n" + orch.slice(o1, o2) + "\n" + orch.slice(o3, o4) +
  "\n__export = { cmDecide, cmOpenDecide, cmParsePatch, cmApply, cmBump, cmRevertText, cmRequired, cmChecks, cmTrusted, cmScope, codeMergeTick, cmConfig, evAdvance, evSchema, hunkPatch, wholeFilePatch, CM_DEFAULT_ENABLED };", sandbox, { filename: "code-merge-block.js" });
const W = sandbox.__export;

let passed = 0, failed = 0;
function ok(c, label, extra) { if (c) { passed++; return; } failed++; console.error("FAIL " + label + (extra !== undefined ? "  -- " + JSON.stringify(extra) : "")); }
const NOW = Date.parse("2026-10-03T12:00:00Z");
const ago = (h) => new Date(NOW - h * 36e5).toISOString();
const J = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- fixtures
const filler = Array.from({ length: 40 }, (_, i) => "var f" + i + " = " + i + ";");
const BASE = ['var VERSION = "1.2.3-demo";', "function a() {", "  return 1;", "}", ...filler, "function b() {", "  return 2;", "}", ""].join("\n");
const NEXT = BASE.replace('var VERSION = "1.2.3-demo";', 'var VERSION = "1.2.4-codeagent";').replace("  return 1;", "  return 11;");
const DIR = "qnfo-demo", PATH = DIR + "/worker.js", MIRROR = DIR + "/deployed-current.worker.js";
const PATCH = W.hunkPatch(PATH, BASE, NEXT) + W.hunkPatch(MIRROR, BASE, NEXT);
const ID = "ct_abcdefghijklmn", BRANCH = "codeagent-" + ID.slice(3, 15);
function task(over) {
  return Object.assign({ id: ID, repo: "qnfo-workers", path: PATH, goal: "[issue #50] fix a", status: "published", step: "done", attempts: 0, ctx: JSON.stringify({ base: BASE, patch: PATCH }), branch: BRANCH, pr_url: "https://github.com/QNFO/qnfo-workers/pull/401", last_error: null, created_at: ago(5), updated_at: ago(4) }, over || {});
}
const green = (sha, names) => names.map((n, i) => ({ id: 100 + i, name: n, status: "completed", conclusion: "success", head_sha: sha }));
function prJson(over) {
  return Object.assign({ number: 401, state: "open", merged: false, draft: false, mergeable: true, mergeable_state: "clean", title: "code-task: fix a\nS", head: { ref: BRANCH, sha: "h1", repo: { full_name: "QNFO/qnfo-workers" } }, base: { ref: "main", sha: "base0", repo: { full_name: "QNFO/qnfo-workers" } } }, over || {});
}
function g(over) {
  return Object.assign({
    pr: prJson(), files: [{ filename: PATH, status: "modified" }, { filename: MIRROR, status: "modified" }],
    checks: green("h1", ["gate", "mirror-guard", "comparator", "guard", "CodeQL"]), status: { state: "pending", total_count: 0 },
    provenance: { ok: true, origin: "issue #50" }, integrity: { ok: true, revertible: true, containers: false, version_to: "1.2.4-codeagent" },
  }, over || {});
}
const act = (t, gg) => J(W.cmDecide(t, gg, NOW));

// ================================================================ 1. patch parse / apply against the orchestrator's producer
const P = W.cmParsePatch(PATCH);
ok(Object.keys(P).sort().join(",") === [MIRROR, PATH].sort().join(","), "a path + mirror patch parses into two files");
ok(W.cmApply(BASE, P[PATH], false, false) === NEXT, "forward apply of hunkPatch output reproduces the verified file");
const SHIFTED = "// a line main added on top\n// and another\n" + BASE;
ok(W.cmApply(SHIFTED, P[PATH], false, false) === "// a line main added on top\n// and another\n" + NEXT, "hunks apply at an offset after unrelated lines moved (git apply semantics)");
ok(W.cmApply(BASE.replace("  return 2;", "  return 22;"), P[PATH], false, false) !== null, "a change outside the hunks' context still applies");
ok(W.cmApply(BASE.replace("function a() {", "function a(x) {"), P[PATH], false, false) === null, "a hunk whose context changed does not apply");
ok(W.cmApply(NEXT, P[PATH], true, false) === BASE, "reverse apply restores the base");
const WHOLE = W.wholeFilePatch("docs/x.md", "one\ntwo\n", "one\ntwo\nthree\n");
const PW = W.cmParsePatch(WHOLE)["docs/x.md"];
ok(W.cmApply("one\ntwo\n", PW, false, false) === "one\ntwo\nthree\n", "a whole-file patch applies to its own base");
ok(W.cmApply("one\nTWO\n", PW, false, false) === null, "a whole-file patch does not apply once the file moved");
const NOEOL = W.wholeFilePatch("docs/y.md", "alpha\nbeta", "alpha\nbeta\ngamma");
ok(W.cmApply("alpha\nbeta", W.cmParsePatch(NOEOL)["docs/y.md"], false, false) === "alpha\nbeta\ngamma", "files without a final newline round-trip ('\\ No newline at end of file')");
ok(W.cmApply("alpha\nbeta\n", W.cmParsePatch(NOEOL)["docs/y.md"], false, false) === null, "the final-newline marker is enforced");
const SQLP = W.hunkPatch("docs/s.md", "a\n-- note\nb\n", "a\nb\n");
ok(W.cmApply("a\n-- note\nb\n", W.cmParsePatch(SQLP)["docs/s.md"], false, false) === "a\nb\n", "a removed line that starts with '-- ' is a hunk line, not a header");
const EMPTY = W.wholeFilePatch("docs/e.md", "", "new\n");
ok(W.cmApply("", W.cmParsePatch(EMPTY)["docs/e.md"], false, false) === "new\n", "a patch onto an empty file inserts at the top");
const REV = W.cmRevertText(NEXT, P[PATH], "-revert-c7");
ok(REV && REV.from === "1.2.4-codeagent" && REV.to === "1.2.5-revert-c7" && REV.content === BASE.replace('"1.2.3-demo"', '"1.2.5-revert-c7"'), "the revert undoes the edit and bumps main's VERSION, not the pre-task one", REV && REV.to);
const LATER = NEXT.replace('"1.2.4-codeagent"', '"1.2.9-later"');
const REV2 = W.cmRevertText(LATER, P[PATH], "-revert-c8");
ok(REV2 && REV2.to === "1.2.10-revert-c8" && /return 1;/.test(REV2.content), "the revert tolerates a later VERSION on main (VERSION lines match as wildcards)");
ok(W.cmRevertText(NEXT.replace("  return 11;", "  return 12;"), P[PATH], "-x") === null, "a revert whose lines were changed again on main is refused (needs a person)");
const C1 = W.cmBump('var VERSION = "1.15.4-x"; /* changelog */\nvar y = 1;\n', "-r");
ok(C1 && C1.to === "1.15.5-r" && C1.content.startsWith('var VERSION = "1.15.5-r"; /* changelog */'), "cmBump keeps a trailing changelog comment");
ok(W.cmBump('const VERSION = "1.0.0";\n', "-r") === null && W.cmBump('var VERSION = "1.0.0";\nvar VERSION = "2.0.0";\n', "-r") === null, "const VERSION and duplicate VERSION lines are not bumpable");

// ================================================================ 2. scope, required checks, provenance
ok(J(W.cmScope(PATH)).kind === "worker" && J(W.cmScope("docs/a/b.md")).kind === "doc" && J(W.cmScope("qnfo-x/README.md")).kind === "doc", "worker.js, docs/**.md and <dir>/README.md are in scope");
ok(["scripts/x.py", ".github/workflows/a.yml", "qnfo-x/wrangler.toml", "migrations/a.sql", "qnfo-x/a.test.mjs", "qnfo-x/registry.js", "docs/../x.md"].every((p) => !W.cmScope(p).ok), "scripts, workflows, configs, migrations, tests and other modules are out of scope");
ok(["qnfo-fleet-control", "qnfo-ops", "qnfo-ai", "qnfo-code-orchestrator", "qnfo-code-agent"].every((w) => !W.cmScope(w + "/worker.js").ok), "control-plane and code-loop workers never auto-merge");
ok(J(W.cmRequired([PATH, MIRROR])).join(",") === "gate,mirror-guard,comparator,guard", "a worker.js needs gate, mirror-guard, comparator and guard");
ok(J(W.cmRequired(["docs/x.md"])).join(",") === "gate,mirror-guard,comparator", "a doc needs no version-bump guard (its workflow does not run for docs)");
ok(J(W.cmRequired(["docs/QUNIVERSE-CHARTER.md"])).indexOf("charter") >= 0 && J(W.cmRequired(["qnfo-code-orchestrator/README.md"])).indexOf("test") >= 0, "charter-guard and code-loop-test are required where they run");
ok(W.cmTrusted("qnfo-fleet-dashboard:owner-request", "OWNER-TASK-12: x") && W.cmTrusted("claude-session-intake-smoke", "x"), "owner tasks and session-filed issues are trusted origins");
ok(!W.cmTrusted("qnfo-fleet-dashboard:owner-request", "INTENT-TASK-3: x") && !W.cmTrusted("kaizen-ai", "x") && !W.cmTrusted("email-composer", "x"), "feed intents, model and email loops are not trusted origins");
ok(W.cmTrusted("kaizen-ai", "x", "kaizen-*") && !W.cmTrusted("claude-session-x", "x", "kaizen-*"), "ops_config code_merge_trusted_sources replaces the default list");

// ================================================================ 3. the decision
ok(act(task(), g()).action === "merge", "all gates green: merge", act(task(), g()));
ok(act(task(), g({ integrity: undefined })).action === "need-integrity", "integrity is fetched only when every cheap gate passed");
const refuses = [
  ["a branch that is not the loop's own", task({ branch: "feature-x" }), g()],
  ["a pull URL of another repository", task({ pr_url: "https://github.com/QNFO/other/pull/401" }), g()],
  ["a fork head", task(), g({ pr: prJson({ head: { ref: BRANCH, sha: "h1", repo: { full_name: "evil/qnfo-workers" } } }) })],
  ["a head ref that is not the task branch", task(), g({ pr: prJson({ head: { ref: "codeagent-zzz", sha: "h1", repo: { full_name: "QNFO/qnfo-workers" } } }) })],
  ["a base other than main", task(), g({ pr: prJson({ base: { ref: "develop", repo: { full_name: "QNFO/qnfo-workers" } } }) })],
  ["verify not done", task({ step: "verify" }), g()],
  ["three failed attempts", task({ attempts: 3 }), g()],
  ["a last_error", task({ last_error: "verify failed" }), g()],
  ["no stored patch", task({ ctx: JSON.stringify({ base: BASE }) }), g()],
  ["unparseable ctx", task({ ctx: "{nope" }), g()],
  ["an extra file", task(), g({ files: [{ filename: PATH, status: "modified" }, { filename: "scripts/x.py", status: "modified" }] })],
  ["only the mirror", task(), g({ files: [{ filename: MIRROR, status: "modified" }] })],
  ["an added file", task(), g({ files: [{ filename: PATH, status: "added" }] })],
  ["a path out of scope", task({ path: "scripts/x.py" }), g({ files: [{ filename: "scripts/x.py", status: "modified" }] })],
  ["a denied worker", task({ path: "qnfo-ops/worker.js" }), g({ files: [{ filename: "qnfo-ops/worker.js", status: "modified" }] })],
  ["an untrusted origin", task(), g({ provenance: { ok: false, why: "source issue #50 came from 'kaizen-ai'" } })],
  ["a failed required check", task(), g({ checks: green("h1", ["gate", "mirror-guard", "comparator"]).concat([{ id: 300, name: "guard", status: "completed", conclusion: "failure" }]) })],
  ["a failing commit status", task(), g({ status: { state: "failure", total_count: 1 } })],
  ["a merge conflict", task(), g({ pr: prJson({ mergeable: false, mergeable_state: "dirty" }) })],
  ["content other than the verified patch", task(), g({ integrity: { ok: false, why: "qnfo-demo/worker.js at the PR head is not the verified patch" } })],
  ["a container worker", task(), g({ integrity: { ok: true, revertible: true, containers: true } })],
  ["a worker that cannot be auto-reverted", task(), g({ integrity: { ok: true, revertible: false, revert_why: "no single var VERSION" } })],
];
for (const [label, t, gg] of refuses) ok(act(t, gg).action === "refuse", "refuse: " + label, act(t, gg));
const waits = [
  ["a draft", g({ pr: prJson({ draft: true }) })],
  ["a required check still running", g({ checks: green("h1", ["gate", "mirror-guard", "comparator"]).concat([{ id: 301, name: "guard", status: "in_progress", conclusion: null }]) })],
  ["one required check missing", g({ checks: green("h1", ["gate", "mirror-guard", "comparator"]) })],
  ["a non-required check failed", g({ checks: green("h1", ["gate", "mirror-guard", "comparator", "guard"]).concat([{ id: 302, name: "CodeQL", status: "completed", conclusion: "failure" }]) })],
  ["a pending commit status", g({ status: { state: "pending", total_count: 2 } })],
  ["mergeability not computed", g({ pr: prJson({ mergeable: null, mergeable_state: "unknown" }) })],
  ["a transient integrity read", g({ integrity: { ok: false, transient: true, why: "compare HTTP 502" } })],
  ["a transient provenance read", g({ provenance: { ok: false, transient: true, why: "source issue #50 could not be read" } })],
];
for (const [label, gg] of waits) ok(act(task(), gg).action === "wait", "wait: " + label, act(task(), gg));
ok(act(task(), g({ checks: green("h1", ["gate", "mirror-guard", "comparator"]).concat([{ id: 50, name: "guard", status: "completed", conclusion: "cancelled" }, { id: 51, name: "guard", status: "completed", conclusion: "success" }]) })).action === "merge", "the latest run per check decides (a cancelled run superseded by a green one)");
ok(act(task(), g({ pr: prJson({ mergeable_state: "behind" }) })).action === "merge", "a branch behind main is mergeable (no up-to-date rule on main)");
const noChecks = g({ checks: [{ id: 9, name: "CodeQL", status: "completed", conclusion: "success" }], integrity: undefined });
let nc = act(task(), noChecks);
ok(nc.action === "wait" && nc.mark && nc.mark.nochecks_sha === "h1" && nc.mark.nochecks_since === new Date(NOW).toISOString(), "no required check on a new head: wait and start the 3h clock (no empty commit, no integrity fetch)", nc);
ok(act(task({ nochecks_sha: "h1", nochecks_since: ago(2) }), noChecks).action === "wait" && !act(task({ nochecks_sha: "h1", nochecks_since: ago(2) }), noChecks).mark, "inside 3h: keep waiting, the clock is not reset");
nc = act(task({ nochecks_sha: "h1", nochecks_since: ago(4) }), noChecks);
ok(nc.action === "refuse" && /within 3h/.test(nc.why) && /GITHUB_TOKEN/.test(nc.why), "no required check 3h after the runner first saw the head: refuse, naming the likely cause", nc);
ok(act(task({ nochecks_sha: "h0", nochecks_since: ago(4) }), noChecks).mark.nochecks_sha === "h1", "a new head restarts the clock");
const merged = act(task(), g({ pr: prJson({ merged: true, state: "closed", merged_by: { login: "rwnq8" } }) }));
ok(merged.action === "reconcile" && merged.status === "merged" && merged.by === "gh:rwnq8", "a PR a person merged is reconciled with who merged it");
ok(act(task(), g({ pr: prJson({ state: "closed" }) })).status === "closed", "a PR a person closed is reconciled as closed");
const docT = task({ path: "docs/x.md", ctx: JSON.stringify({ patch: WHOLE }) });
const docG = g({ files: [{ filename: "docs/x.md", status: "modified" }], checks: green("h1", ["gate", "mirror-guard", "comparator"]), integrity: { ok: true } });
ok(act(docT, docG).action === "merge" && act(docT, docG).kind === "doc", "a doc merges on gate, mirror-guard and comparator");
ok(act(task({ status: "pr_open", path: "docs/x.md", ctx: JSON.stringify({ proposal: "x\n" }) }), docG).action === "merge", "a code-agent pr_open row with a stored proposal can merge");
ok(act(task({ status: "pr_open", ctx: JSON.stringify({ proposal: "x" }) }), g({ integrity: { ok: true, revertible: false, revert_why: "a code-agent pull request stores no patch to invert" } })).action === "refuse", "a code-agent worker.js PR is refused (no patch to revert)");
// ---- opening a pushed branch (status branch_pushed): cmOpenDecide
const pushedT = (over) => task(Object.assign({ status: "branch_pushed", pr_url: "https://github.com/QNFO/qnfo-workers/compare/main..." + BRANCH + "?expand=1" }, over || {}));
const og = (over) => Object.assign({ pulls: [], head_sha: "h1", files: [{ filename: PATH, status: "modified" }, { filename: MIRROR, status: "modified" }], provenance: { ok: true, origin: "issue #50" }, integrity: { ok: true, revertible: true, containers: false, version_to: "1.2.4-codeagent" } }, over || {});
const oact = (t, gg) => J(W.cmOpenDecide(t, gg));
ok(oact(pushedT(), og()).action === "open", "a verified, in-scope, trusted, intact branch is opened as a PR", oact(pushedT(), og()));
ok(oact(pushedT(), og({ integrity: undefined })).action === "need-integrity", "integrity is checked before a PR (and with it CI) is opened");
const adopt = oact(pushedT(), og({ pulls: [prJson({ number: 455, state: "closed", merged: true })] }));
ok(adopt.action === "adopt" && adopt.pr === 455, "an existing PR for the branch (any state) is adopted, never duplicated", adopt);
ok(oact(pushedT(), og({ pulls: [prJson({ number: 456, head: { ref: BRANCH, sha: "h1", repo: { full_name: "evil/qnfo-workers" } } })] })).action === "open", "a fork's PR with the same branch name is not adopted");
const orefuses = [
  ["a branch that is not the loop's own", pushedT({ branch: "feature-x" }), og()],
  ["a deleted branch", pushedT(), og({ head_sha: null, branch_missing: true })],
  ["an extra file on the branch", pushedT(), og({ files: [{ filename: PATH, status: "modified" }, { filename: "scripts/deploy_gate.py", status: "modified" }] })],
  ["a path out of scope", pushedT({ path: "scripts/x.py" }), og({ files: [{ filename: "scripts/x.py", status: "modified" }] })],
  ["an untrusted origin", pushedT(), og({ provenance: { ok: false, why: "kaizen-ai" } })],
  ["verify not passed", pushedT({ attempts: 3 }), og()],
  ["content other than the verified patch", pushedT(), og({ integrity: { ok: false, why: "not the verified patch" } })],
  ["a worker that cannot be auto-reverted", pushedT(), og({ integrity: { ok: true, revertible: false, revert_why: "const VERSION" } })],
];
for (const [label, t, gg] of orefuses) ok(oact(t, gg).action === "refuse", "not opened: " + label, oact(t, gg));
ok(oact(pushedT(), og({ pulls: undefined })).action === "wait" && oact(pushedT(), og({ provenance: { ok: false, transient: true, why: "d1" } })).action === "wait", "unread pulls or a transient provenance read only wait");

// ================================================================ 4. end to end: pushed branch -> PR opened by the runner -> merge -> deploy -> verify
function seedTask(over) {
  const t = task(over);
  db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, branch, pr_url, last_error, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(t.id, t.repo, t.path, t.goal, t.status, t.step, t.attempts, t.ctx, t.branch, t.pr_url, t.last_error, t.created_at, t.updated_at);
  return t;
}
function seedHead(headSha) {
  gh.contents["base0:" + PATH] = BASE; gh.contents["base0:" + MIRROR] = BASE;
  gh.contents[headSha + ":" + PATH] = NEXT; gh.contents[headSha + ":" + MIRROR] = NEXT;
  gh.contents[headSha + ":" + DIR + "/wrangler.toml"] = 'name = "qnfo-demo"\nmain = "worker.js"\n';
  gh.compareFiles[headSha] = [{ filename: PATH, status: "modified" }, { filename: MIRROR, status: "modified" }];
}
function seedWorkerPr(num, branch, headSha) {
  gh.pulls[num] = prJson({ number: num, head: { ref: branch, sha: headSha, repo: { full_name: "QNFO/qnfo-workers" } } });
  gh.files[num] = [{ filename: PATH, status: "modified" }, { filename: MIRROR, status: "modified" }];
  seedHead(headSha);
}
freshDb(); freshGh();
const env = { AUDIT, GITHUB_TOKEN: "test-token" };
db.prepare("INSERT INTO agent_issues (id, title, description, source, status) VALUES (50, 'OWNER-TASK-9: fix a', 'desc', 'qnfo-fleet-dashboard:owner-request', 'open')").run();
seedTask({ status: "branch_pushed", pr_url: "https://github.com/QNFO/qnfo-workers/compare/main..." + BRANCH + "?expand=1" });
gh.branches[BRANCH] = "h1";
seedHead("h1");
let r = J(await W.codeMergeTick(env, { now: NOW }));
const cols = rows("PRAGMA table_info(code_tasks)").map((c) => c.name);
ok(["merged_by", "merged_at", "merge_state", "green_since", "nochecks_sha", "pr_opened_by", "version_to", "revert_cid"].every((c) => cols.includes(c)) && !cols.includes("kicked_sha"), "the runner adds its columns to code_tasks");
ok(W.CM_DEFAULT_ENABLED === true && !r.disabled, "with no ops_config row the runner runs (default on)");
ok(r.opened[0].action === "open" && gh.newPulls.length === 1 && gh.newPulls[0].head === BRANCH && gh.newPulls[0].base === "main" && !/\n/.test(gh.newPulls[0].title), "a pushed branch is opened as a PR by the runner (fleet token), head = the task branch", r.opened);
let row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(row.status === "published" && row.pr_url === "https://github.com/QNFO/qnfo-workers/pull/900" && row.pr_opened_by === "qnfo-fleet-control" && row.pr_opened_at === new Date(NOW).toISOString(), "the row becomes published with the pull URL and who opened it", row);
ok(one("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'code-merge.pr-opened'").n === 1 && gh.commits.length === 0 && gh.refs.length === 0, "the open writes one cloud_ops_events row; no commit is pushed");
ok(r.decided.length === 1 && r.decided[0].action === "wait" && gh.merges.length === 0, "the new PR is a merge candidate in the same tick, but no check has run yet", r.decided);
const hb = one("SELECT * FROM cloud_ops_events WHERE id = 'code-merge-tick-2026-10-03'");
ok(hb && hb.status === "ok" && hb.ts === new Date(NOW).toISOString(), "each tick upserts the day's heartbeat, status ok", hb);
const fo = one("SELECT * FROM cloud_ops_events WHERE id = 'code-merge-first-ok'");
ok(fo && fo.status === "ok" && fo.ts === new Date(NOW).toISOString(), "the first ok tick writes code-merge-first-ok", fo);
row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(row.nochecks_sha === "h1" && row.nochecks_since === new Date(NOW).toISOString(), "the no-checks clock starts for the head", row);
gh.checks.h1 = green("h1", ["gate", "mirror-guard", "comparator"]).concat([{ id: 400, name: "guard", status: "in_progress", conclusion: null }]);
r = J(await W.codeMergeTick(env, { now: NOW + 36e5 }));
ok(r.decided[0].action === "wait" && /running guard/.test(r.decided[0].why) && gh.merges.length === 0, "checks started by the PR the runner opened: wait while one runs", r.decided);
ok(one("SELECT ts FROM cloud_ops_events WHERE id = 'code-merge-first-ok'").ts === new Date(NOW).toISOString(), "code-merge-first-ok is written once, never moved");
gh.checks.h1 = green("h1", ["gate", "mirror-guard", "comparator", "guard"]);
r = J(await W.codeMergeTick(env, { now: NOW + 2 * 36e5 }));
ok(r.decided[0].action === "merge" && gh.merges.length === 1 && gh.merges[0].pr === 900 && gh.merges[0].sha === "h1" && gh.merges[0].merge_method === "squash", "green checks: squash-merged, pinned to the tested head", r.decided);
ok(/CODE-TASK-MERGE-RUNNER-1/.test(gh.merges[0].commit_message) && !/\n/.test(gh.merges[0].commit_title) && /\(#900\)$/.test(gh.merges[0].commit_title), "the merge commit names the runner; the title is one line", gh.merges[0]);
row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(row.status === "merged" && row.merged_by === "qnfo-fleet-control" && row.merge_state === "deploying" && row.version_to === "1.2.4-codeagent" && row.merged_sha === "merge-900", "D1 records merged_by qnfo-fleet-control, the merge sha and the VERSION to verify", row);
ok(gh.calls.includes("DELETE /git/refs/heads/" + BRANCH), "the task branch is deleted after the merge (as evolve does)");
ok(one("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'code-merge.merged' AND status = 'ok'").n === 1, "the merge writes one cloud_ops_events row");
r = J(await W.codeMergeTick(env, { now: NOW + 3 * 36e5 }));
ok(r.advanced[0].merge_state === "deploying" && gh.merges.length === 1, "no deploy yet: waits on the canonical deploy, merges nothing new");
db.prepare("INSERT INTO fleet_deploys (worker, to_sha, ok, ts) VALUES ('qnfo-demo', '1.2.4-codeagent', 1, ?)").run(ago(-3.2));
r = J(await W.codeMergeTick(env, { now: NOW + 4 * 36e5 }));
ok(r.advanced[0].merge_state === "deployed" && one("SELECT merge_state FROM code_tasks WHERE id = ?", ID).merge_state === "deployed", "a fleet_deploys row for the new VERSION moves it to deployed");
db.prepare("INSERT INTO worker_live_audit (worker, http, live_version, probed_at) VALUES ('qnfo-demo', 200, '1.2.4-codeagent', ?)").run(new Date(NOW + 3.5 * 36e5).toISOString().replace("T", " ").slice(0, 19));
r = J(await W.codeMergeTick(env, { now: NOW + 5 * 36e5 }));
ok(r.advanced[0].merge_state === "verified" && one("SELECT merge_state FROM code_tasks WHERE id = ?", ID).merge_state === "verified", "a live audit after the deploy with http 200 and the VERSION verifies it");
ok(/CODE-TASK-MERGE-RUNNER-1: code task ct_abcdefghijklmn merged/.test(one("SELECT description FROM agent_issues WHERE id = 50").description), "the source issue gets the evidence line (not closed)");

// ================================================================ 5. a failed live check opens the inverse-patch revert
freshDb(); freshGh();
const T2 = "ct_zyxwvutsrqpo00";
db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, branch, pr_url, created_at, updated_at) VALUES (?, 'qnfo-workers', ?, 'fix', 'published', 'done', 0, ?, ?, 'https://github.com/QNFO/qnfo-workers/pull/402', ?, ?)").run(T2, PATH, JSON.stringify({ patch: PATCH }), "codeagent-" + T2.slice(3, 15), ago(6), ago(6));
await W.codeMergeTick(env, { now: NOW });   // adds the columns (no PR scripted: a read error, nothing else)
db.prepare("UPDATE code_tasks SET status = 'merged', merged_by = 'qnfo-fleet-control', merged_at = ?, merge_state = 'deployed', deployed_at = ?, version_to = '1.2.4-codeagent' WHERE id = ?").run(ago(2), ago(1.5), T2);
db.prepare("INSERT INTO fleet_deploys (worker, to_sha, ok, ts) VALUES ('qnfo-demo', '1.2.4-codeagent', 1, ?)").run(ago(1.5));
db.prepare("INSERT INTO worker_live_audit (worker, http, live_version, probed_at) VALUES ('qnfo-demo', 500, '1.2.4-codeagent', ?)").run(ago(1).replace("T", " ").slice(0, 19));
gh.contents["main:" + PATH] = NEXT;
r = J(await W.codeMergeTick(env, { now: NOW }));
const ev = one("SELECT * FROM evolve_candidates ORDER BY id DESC LIMIT 1");
row = one("SELECT * FROM code_tasks WHERE id = ?", T2);
ok(r.advanced[0].merge_state === "reverting" && row.merge_state === "reverting" && row.revert_cid === ev.id, "http 500 after the deploy: the task is reverting through an evolve candidate", r.advanced);
ok(ev.kind === "revert" && ev.status === "pr-open" && ev.worker === "qnfo-demo" && ev.pr_number === 900 && ev.branch === "evolve/qnfo-demo-c" + ev.id && ev.version_to === "1.2.5-revert-c" + ev.id, "the revert is an evolve 'revert' candidate with its own PR, branch and VERSION", ev);
ok(gh.blobs.length === 1 && gh.blobs[0] === BASE.replace('"1.2.3-demo"', '"1.2.5-revert-c' + ev.id + '"'), "the revert PR carries the inverse patch on today's main with a bumped VERSION (worker.js and mirror)");
r = J(await W.codeMergeTick(env, { now: NOW + 0.5 * 36e5 }));
ok(!gh.calls.includes("GET /pulls/900") && /evolve candidate/.test(r.advanced[0].note || ""), "while the revert is evolve's oldest in-flight candidate, evolveTick drives it (the runner only watches)", r.advanced);
db.prepare("INSERT INTO evolve_candidates (id, worker, ts, status, kind) VALUES (0, 'qnfo-other', ?, 'merged', 'fix')").run(ago(3));   // an older candidate holds evolve's slot
gh.pulls[900] = prJson({ number: 900, title: "evolve(qnfo-demo): revert", head: { ref: ev.branch, sha: "rv1", repo: { full_name: "QNFO/qnfo-workers" } } });
gh.checks.rv1 = green("rv1", ["gate", "guard", "mirror-guard", "comparator"]);
r = J(await W.codeMergeTick(env, { now: NOW + 0.6 * 36e5 }));
ok(gh.merges.some((x) => x.pr === 900) && one("SELECT status FROM evolve_candidates WHERE id = ?", ev.id).status === "merged", "when another candidate holds evolve's slot, the runner drives its revert through evAdvance (merged on green checks)", r.advanced);
db.prepare("DELETE FROM evolve_candidates WHERE id = 0").run();
db.prepare("UPDATE evolve_candidates SET status = 'reverted-verified' WHERE id = ?").run(ev.id);
r = J(await W.codeMergeTick(env, { now: NOW + 36e5 }));
ok(one("SELECT merge_state FROM code_tasks WHERE id = ?", T2).merge_state === "reverted", "a verified evolve revert marks the code task reverted");
db.prepare("UPDATE code_tasks SET merge_state = 'reverting' WHERE id = ?").run(T2);
db.prepare("UPDATE evolve_candidates SET status = 'ci-rejected' WHERE id = ?").run(ev.id);
await W.codeMergeTick(env, { now: NOW + 2 * 36e5 });
ok(one("SELECT merge_state FROM code_tasks WHERE id = ?", T2).merge_state === "revert-failed" && one("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'CODE-MERGE-REVERT-FAILED-1:%' AND status = 'open'").n === 1, "a revert that does not land is revert-failed and files one agent_issue");
// deploy never happened
db.prepare("UPDATE code_tasks SET merge_state = 'deploying', merged_at = ?, version_to = '9.9.9-never' WHERE id = ?").run(ago(4), T2);
await W.codeMergeTick(env, { now: NOW });
ok(one("SELECT merge_state FROM code_tasks WHERE id = ?", T2).merge_state === "deploy-missing", "no fleet_deploys row 3h after the merge: deploy-missing (as evolve)");

// ================================================================ 6. refusals, provenance, kill switch, person merges, budget
freshDb(); freshGh();
db.prepare("INSERT INTO agent_issues (id, title, description, source, status) VALUES (50, 'OWNER-TASK-9: fix a', 'd', 'qnfo-fleet-dashboard:owner-request', 'open')").run();
db.prepare("INSERT INTO agent_issues (id, title, description, source, status) VALUES (60, 'kaizen idea', 'd', 'kaizen-ai', 'open')").run();
seedTask();
seedWorkerPr(401, BRANCH, "h1");
gh.files[401].push({ filename: "scripts/x.py", status: "modified" });
r = J(await W.codeMergeTick(env, { now: NOW }));
row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(r.decided[0].action === "refuse" && row.status === "needs_human" && /^merge-runner: the branch changes/.test(row.last_error) && gh.merges.length === 0 && gh.commits.length === 0, "an extra file: needs_human with the reason, nothing pushed, no merge", row);
ok(gh.comments.length === 1 && gh.comments[0].pr === 401 && /did not merge this pull request/.test(gh.comments[0].body), "the refusal is explained on the PR");
ok(one("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'code-merge.refused' AND status = 'refused'").n === 1, "the refusal writes one cloud_ops_events row");
r = J(await W.codeMergeTick(env, { now: NOW + 36e5 }));
ok(r.decided.length === 0 && gh.comments.length === 1, "a refused task is not re-evaluated or re-commented");
gh.pulls[401].merged = true; gh.pulls[401].state = "closed"; gh.pulls[401].merged_by = { login: "rwnq8" }; gh.pulls[401].merged_at = ago(0); gh.pulls[401].merge_commit_sha = "pm1";
r = J(await W.codeMergeTick(env, { now: NOW + 2 * 36e5 }));
row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(row.status === "merged" && row.merged_by === "gh:rwnq8" && r.reconciled.length === 1, "a refused PR a person merged later is recorded as merged by that person", row);

freshDb(); freshGh();
db.prepare("INSERT INTO agent_issues (id, title, description, source, status) VALUES (60, 'kaizen idea', 'd', 'kaizen-ai', 'open')").run();
seedTask({ goal: "[issue #60] kaizen idea" });
seedWorkerPr(401, BRANCH, "h1");
gh.checks.h1 = green("h1", ["gate", "mirror-guard", "comparator", "guard"]);
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.decided[0].action === "refuse" && /not a trusted origin/.test(one("SELECT last_error FROM code_tasks WHERE id = ?", ID).last_error) && gh.merges.length === 0, "a task from an untrusted issue source is refused although CI is green");

freshDb(); freshGh();
seedTask({ goal: "direct task" });
seedWorkerPr(401, BRANCH, "h1");
gh.checks.h1 = green("h1", ["gate", "mirror-guard", "comparator", "guard"]);
gh.contents["h1:" + PATH] = NEXT + "// pushed by someone\n";
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.decided[0].action === "refuse" && /is not the verified patch/.test(one("SELECT last_error FROM code_tasks WHERE id = ?", ID).last_error) && gh.merges.length === 0, "content beyond the verified patch at the PR head is refused");

freshDb(); freshGh();
db.prepare("INSERT INTO ops_config (key, value) VALUES ('code_merge_runner_enabled', '0')").run();
seedTask();
seedWorkerPr(401, BRANCH, "h1");
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.disabled === true && gh.calls.length === 0 && one("SELECT status FROM cloud_ops_events WHERE id = 'code-merge-tick-2026-10-03'").status === "disabled" && !one("SELECT id FROM cloud_ops_events WHERE id = 'code-merge-first-ok'"), "kill switch '0': no GitHub call (nothing opened or merged), heartbeat 'disabled', no first-ok marker");
db.exec("UPDATE ops_config SET value = 'on'");
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(!r.disabled && gh.calls.length > 0, "kill switch 'on' resumes the runner");

freshDb(); freshGh();
for (const [i, id] of ["ct_doc000000001", "ct_doc000000002"].entries()) {
  const num = 410 + i, br = "codeagent-" + id.slice(3, 15);
  db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, branch, pr_url, created_at, updated_at) VALUES (?, 'qnfo-workers', 'docs/x.md', 'doc', 'published', 'done', 0, ?, ?, ?, ?, ?)").run(id, JSON.stringify({ patch: WHOLE }), br, "https://github.com/QNFO/qnfo-workers/pull/" + num, ago(5), ago(5 - i));
  gh.pulls[num] = prJson({ number: num, head: { ref: br, sha: "d" + i, repo: { full_name: "QNFO/qnfo-workers" } } });
  gh.files[num] = [{ filename: "docs/x.md", status: "modified" }];
  gh.checks["d" + i] = green("d" + i, ["gate", "mirror-guard", "comparator"]);
  gh.contents["base0:docs/x.md"] = "one\ntwo\n"; gh.contents["d" + i + ":docs/x.md"] = "one\ntwo\nthree\n";
}
r = J(await W.codeMergeTick(env, { now: NOW }));
const d1 = one("SELECT * FROM code_tasks WHERE id = 'ct_doc000000001'"), d2 = one("SELECT * FROM code_tasks WHERE id = 'ct_doc000000002'");
ok(gh.merges.length === 1 && d1.status === "merged" && d1.merge_state === "verified" && d1.merged_by === "qnfo-fleet-control", "a green doc PR merges and needs no deploy verification", d1);
ok(d2.status === "published" && d2.green_since === new Date(NOW).toISOString() && /one merge per tick/.test(d2.merge_note), "one merge per tick: the second green PR waits with green_since recorded", d2);
r = J(await W.codeMergeTick(env, { now: NOW + 36e5 }));
ok(gh.merges.length === 2 && one("SELECT status FROM code_tasks WHERE id = 'ct_doc000000002'").status === "merged", "the next tick merges it");

// MERGE-THROUGHPUT-1: the limit is an ops_config dial (clamped 1..5); both green doc PRs merge in one tick when it is 2
{
  freshDb(); freshGh();
  db.prepare("INSERT INTO ops_config (key, value) VALUES ('code_merge_max_merges_per_tick', '2')").run();
  for (const [i, id] of ["ct_doc000000003", "ct_doc000000004"].entries()) {
    const num = 420 + i, br = "codeagent-" + id.slice(3, 15);
    db.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, ctx, branch, pr_url, created_at, updated_at) VALUES (?, 'qnfo-workers', ?, 'doc', 'published', 'done', 0, ?, ?, ?, ?, ?)").run(id, "docs/y" + i + ".md", JSON.stringify({ patch: WHOLE.split("docs/x.md").join("docs/y" + i + ".md") }), br, "https://github.com/QNFO/qnfo-workers/pull/" + num, "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z");
    gh.pulls[num] = prJson({ number: num, head: { ref: br, sha: "e" + i, repo: { full_name: "QNFO/qnfo-workers" } } });
    gh.files[num] = [{ filename: "docs/y" + i + ".md", status: "modified" }];
    gh.checks["e" + i] = green("e" + i, ["gate", "mirror-guard", "comparator"]);
    gh.contents["base0:docs/y" + i + ".md"] = "one\ntwo\n"; gh.contents["e" + i + ":docs/y" + i + ".md"] = "one\ntwo\nthree\n";
  }
  const r2 = J(await W.codeMergeTick(env, { now: NOW }));
  ok(gh.merges.length === 2, "merge dial 2: two green PRs on different files merge in one tick", { merges: gh.merges.length, r: r2.decided });
  const c9 = await W.cmConfig({ AUDIT: env.AUDIT });
  db.exec("UPDATE ops_config SET value = '99' WHERE key = 'code_merge_max_merges_per_tick'");
  const c5 = await W.cmConfig({ AUDIT: env.AUDIT });
  db.exec("UPDATE ops_config SET value = 'abc' WHERE key = 'code_merge_max_merges_per_tick'");
  const c1 = await W.cmConfig({ AUDIT: env.AUDIT });
  ok(c9.maxMerges === 2 && c5.maxMerges === 5 && c1.maxMerges === 1, "merge dial is clamped to 1..5 and a non-number keeps the default 1", { c9: c9.maxMerges, c5: c5.maxMerges, c1: c1.maxMerges });
  freshDb(); freshGh();
}
freshDb(); freshGh();
db.prepare("INSERT INTO agent_issues (id, title, description, source, status) VALUES (50, 'OWNER-TASK-9: fix a', 'd', 'qnfo-fleet-dashboard:owner-request', 'open')").run();
seedTask();
seedWorkerPr(401, BRANCH, "h1");
gh.down = true;
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.heartbeat === "error" && one("SELECT status FROM cloud_ops_events WHERE id = 'code-merge-tick-2026-10-03'").status === "error" && one("SELECT status FROM code_tasks WHERE id = ?", ID).status === "published", "GitHub unreachable: heartbeat 'error', the task is untouched");
gh.down = false;
gh.checks.h1 = green("h1", ["gate", "mirror-guard", "comparator", "guard"]);
await W.evSchema(env);
db.prepare("INSERT INTO evolve_candidates (worker, ts, status, kind) VALUES ('qnfo-demo', ?, 'pr-open', 'fix')").run(ago(1));
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.decided[0].action === "wait" && /has a change in flight/.test(r.decided[0].why) && gh.merges.length === 0, "never merges while the same worker has an evolve candidate in flight", r.decided);
gh.mergeStatus = 405;
db.exec("UPDATE evolve_candidates SET status = 'verified'");
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.decided[0].action === "merge-failed" && gh.calls.includes("PUT /pulls/401/update-branch") && one("SELECT status FROM code_tasks WHERE id = ?", ID).status === "published" && r.heartbeat === "ok", "a 405 merge asks GitHub to update the branch (evolve's path) and keeps the task waiting");

// a legacy PR opened with the Actions GITHUB_TOKEN: its checks never start, so after 3h it is refused (no empty commit)
freshDb(); freshGh();
seedTask({ goal: "direct task" });
seedWorkerPr(401, BRANCH, "h1");
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.decided[0].action === "wait" && one("SELECT nochecks_sha FROM code_tasks WHERE id = ?", ID).nochecks_sha === "h1", "a PR with no required check: the runner waits and starts the clock");
r = J(await W.codeMergeTick(env, { now: NOW + 3.5 * 36e5 }));
row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(r.decided[0].action === "refuse" && row.status === "needs_human" && /no required check .* started on h1 within 3h/.test(row.last_error) && gh.commits.length === 0 && gh.merges.length === 0, "3.5h later: refused with the reason, nothing pushed, nothing merged", row);
ok(gh.comments.length === 1 && /GITHUB_TOKEN/.test(gh.comments[0].body), "the refusal is explained on the PR");

// a pushed branch the runner will not open: refused, compare URL kept; a person opens and merges it -> reconciled
freshDb(); freshGh();
db.prepare("INSERT INTO agent_issues (id, title, description, source, status) VALUES (60, 'kaizen idea', 'd', 'kaizen-ai', 'open')").run();
seedTask({ goal: "[issue #60] kaizen idea", status: "branch_pushed", pr_url: "https://github.com/QNFO/qnfo-workers/compare/main..." + BRANCH + "?expand=1" });
gh.branches[BRANCH] = "h1"; seedHead("h1");
r = J(await W.codeMergeTick(env, { now: NOW }));
row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(r.opened[0].action === "refuse" && row.status === "needs_human" && /not a trusted origin/.test(row.last_error) && /\/compare\//.test(row.pr_url) && gh.newPulls.length === 0, "an untrusted branch is not opened as a PR (CI would run it); needs_human, compare URL kept", row);
gh.pulls[470] = prJson({ number: 470, state: "closed", merged: true, merged_by: { login: "rwnq8" }, merged_at: ago(-1), merge_commit_sha: "pm470" });
r = J(await W.codeMergeTick(env, { now: NOW + 2 * 36e5 }));
row = one("SELECT * FROM code_tasks WHERE id = ?", ID);
ok(row.status === "merged" && row.merged_by === "gh:rwnq8" && row.pr_url === "https://github.com/QNFO/qnfo-workers/pull/470", "a refused branch a person opened and merged is reconciled by branch, with who merged it", row);

// an existing PR for a pushed branch is adopted, not duplicated
freshDb(); freshGh();
seedTask({ goal: "direct task", status: "branch_pushed", pr_url: "https://github.com/QNFO/qnfo-workers/compare/main..." + BRANCH + "?expand=1" });
seedWorkerPr(480, BRANCH, "h1");
gh.branches[BRANCH] = "h1";
r = J(await W.codeMergeTick(env, { now: NOW }));
ok(r.opened[0].action === "adopt" && gh.newPulls.length === 0 && one("SELECT pr_url FROM code_tasks WHERE id = ?", ID).pr_url === "https://github.com/QNFO/qnfo-workers/pull/480", "a PR that already exists for the branch is adopted");

// ================================================================ 7. evAdvance after the shared-helper refactor
freshDb(); freshGh();
await W.evSchema(env);
db.prepare("INSERT INTO evolve_candidates (worker, ts, status, kind, pr_number, branch, version_to, updated_at) VALUES ('qnfo-demo', ?, 'pr-open', 'fix', 501, 'evolve/qnfo-demo-c1', '1.2.4-evolve-c1', ?)").run(ago(1), ago(1));
gh.pulls[501] = prJson({ number: 501, title: "evolve(qnfo-demo): x", head: { ref: "evolve/qnfo-demo-c1", sha: "e1", repo: { full_name: "QNFO/qnfo-workers" } } });
gh.checks.e1 = green("e1", ["gate", "guard", "mirror-guard", "comparator"]);
let c = one("SELECT * FROM evolve_candidates WHERE id = 1");
let a = J(await W.evAdvance(env, c));
ok(a.status === "merged" && gh.merges.length === 1 && gh.merges[0].commit_title === "evolve(qnfo-demo): x (#501)" && gh.merges[0].commit_message === undefined, "evAdvance still self-merges on green required checks (same call as before)", a);
db.prepare("INSERT INTO fleet_deploys (worker, to_sha, ok, ts) VALUES ('qnfo-demo', '1.2.4-evolve-c1', 1, ?)").run(new Date(Date.now() - 60e3).toISOString());
a = J(await W.evAdvance(env, one("SELECT * FROM evolve_candidates WHERE id = 1")));
ok(a.status === "deployed", "evAdvance reads the deploy ledger through evDeployRow", a);
db.prepare("INSERT INTO worker_live_audit (worker, http, live_version, probed_at) VALUES ('qnfo-demo', 200, '1.2.4-evolve-c1', ?)").run(new Date(Date.now() + 60e3).toISOString());
a = J(await W.evAdvance(env, one("SELECT * FROM evolve_candidates WHERE id = 1")));
ok(a.status === "verified", "evAdvance verifies live through evLiveCheck", a);

console.log(`code-merge.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// GITHUB-SETTINGS-ACTIONS-1 offline suite (scripts/github-settings-actions.mjs, agent_issues 2927). No network: a fake GitHub.
// Proves: a refusal is recorded with its status and GitHub's own text and the run is not retried with another credential; dry mode
// writes nothing; live refuses while a required check would never report (the version-bump-guard path filter, an unseen context) or an
// app cannot be resolved; live creates, updates (idempotently) and reverts only the ruleset named main-gate; secret scanning is one PATCH
// per feature and a refusal of one is a recorded limitation; only QNFO/qnfo-workers paths are reachable; a missing credential is a
// refusal and not a write; the committed ruleset config names checks that real pull_request jobs produce.
// Run: node --no-warnings scripts/github-settings-actions.test.mjs   -> prints "N passed, 0 failed"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run, makeApi, workflowChecks, checkProblems, buildRuleset, rulesetDiff, activityActors, unlistedPushers, loadConfig, ACTIONS, SECRET_FEATURES } from "./github-settings-actions.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };

// ---- a fake GitHub ----
function fakeGitHub(opts = {}) {
  const st = {
    rulesets: opts.rulesets || [{ id: 25060446, name: "main-safety", enforcement: "active", rules: [{ type: "deletion" }, { type: "non_fast_forward" }], bypass_actors: [] }],
    sa: Object.assign({ secret_scanning: { status: "enabled" }, secret_scanning_push_protection: { status: "disabled" }, secret_scanning_validity_checks: { status: "disabled" }, secret_scanning_non_provider_patterns: { status: "disabled" } }, opts.sa || {}),
    log: [], tokens: new Set()
  };
  const json = (status, body) => ({ status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
  const fetchImpl = async (url, init) => {
    const method = init.method || "GET";
    const path = url.replace("https://api.github.com", "");
    st.log.push({ method, path, auth: init.headers.Authorization });
    st.tokens.add(init.headers.Authorization);
    if (opts.admin403 && /branches\/main\/protection|\/rulesets|installations/.test(path) && method !== "GET") return json(403, { message: "Resource not accessible by integration", documentation_url: "https://docs.github.com/rest/repos/rules" });
    if (opts.read403 && /branches\/main\/protection/.test(path)) return json(403, { message: "Resource not accessible by integration" });
    let m;
    if (method === "GET" && path === "/repos/QNFO/qnfo-workers") return json(200, { permissions: { admin: true }, security_and_analysis: opts.noSa ? null : st.sa });
    if (method === "PATCH" && path === "/repos/QNFO/qnfo-workers") {
      const f = Object.keys(init.body ? JSON.parse(init.body).security_and_analysis : {})[0];
      if (opts.refuse && opts.refuse.includes(f)) return json(422, { message: "Validation Failed", errors: [{ message: f + " requires GitHub Secret Protection" }] });
      st.sa[f] = { status: "enabled" }; return json(200, {});
    }
    if (method === "GET" && /\/branches\/main\/protection$/.test(path)) return json(404, { message: "Branch not protected" });
    if (method === "GET" && path === "/repos/QNFO/qnfo-workers/rulesets") return json(200, st.rulesets.map((r) => ({ id: r.id, name: r.name, enforcement: r.enforcement })));
    if (method === "GET" && (m = /\/rulesets\/(\d+)$/.exec(path))) { const r = st.rulesets.find((x) => String(x.id) === m[1]); return r ? json(200, r) : json(404, { message: "Not Found" }); }
    if (method === "POST" && path === "/repos/QNFO/qnfo-workers/rulesets") { const b = JSON.parse(init.body); st.rulesets.push({ id: 777, ...b }); return json(201, { id: 777 }); }
    if (method === "PUT" && (m = /\/rulesets\/(\d+)$/.exec(path))) { const i = st.rulesets.findIndex((x) => String(x.id) === m[1]); st.rulesets[i] = { id: Number(m[1]), ...JSON.parse(init.body) }; return json(200, {}); }
    if (method === "DELETE" && (m = /\/rulesets\/(\d+)$/.exec(path))) { st.rulesets = st.rulesets.filter((x) => String(x.id) !== m[1]); return json(204); }
    if (method === "GET" && path === "/repos/QNFO/qnfo-workers/rules/branches/main") return json(200, st.rulesets.filter((r) => r.enforcement === "active").flatMap((r) => r.rules.map((x) => ({ type: x.type, ruleset_id: r.id }))));
    if (method === "GET" && path.startsWith("/repos/QNFO/qnfo-workers/vulnerability-alerts")) return json(204);
    if (method === "GET" && path.startsWith("/repos/QNFO/qnfo-workers/automated-security-fixes")) return json(200, { enabled: true });
    if (method === "GET" && path === "/apps/qnfo-fleet") return opts.noFleetApp || opts.appsViaInstallations ? json(404, { message: "Not Found" }) : json(200, { id: 424242, slug: "qnfo-fleet" });
    if (method === "GET" && path.startsWith("/orgs/QNFO/installations")) return json(200, { installations: opts.noFleetApp ? [] : [{ app_slug: "qnfo-fleet", app_id: 424242 }] });
    if (method === "GET" && path.startsWith("/repos/QNFO/qnfo-workers/pulls?")) return json(200, [{ head: { sha: "aaa" } }, { head: { sha: "bbb" } }]);
    if (method === "GET" && /\/commits\/(aaa|bbb)\/check-runs/.test(path)) return json(200, { check_runs: (opts.contexts || ["gate", "guard", "mirror-guard", "identity-guard", "CodeQL"]).map((name) => ({ name })) });
    if (method === "GET" && path.startsWith("/repos/QNFO/qnfo-workers/activity?")) return json(200, [
      ...Array.from({ length: 3 }, () => ({ activity_type: "push", actor: { login: "github-actions[bot]" } })),
      { activity_type: "pr_merge", actor: { login: "qnfo-fleet[bot]" } }, { activity_type: "push", actor: { login: "qnfo-fleet[bot]" } },
      { activity_type: "pr_merge", actor: { login: "rwnq8" } }, ...(opts.stranger ? [{ activity_type: "push", actor: { login: "someone-else" } }] : [])]);
    return json(404, { message: "Not Found" });
  };
  return { fetchImpl, st };
}

// ---- a synthetic workflow tree ----
const wfRoot = mkdtempSync(join(tmpdir(), "gh-settings-"));
mkdirSync(join(wfRoot, ".github", "workflows"), { recursive: true });
mkdirSync(join(wfRoot, "scripts"), { recursive: true });
const wf = (name, text) => writeFileSync(join(wfRoot, ".github", "workflows", name), text);
wf("deploy-gate.yml", "name: deploy-gate\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\njobs:\n  gate:\n    runs-on: ubuntu-latest\n    steps: []\n");
wf("version-bump-guard.yml", "name: version-bump-guard\non:\n  push:\n    paths:\n      - '*/worker.js'\n  pull_request:\n    paths:\n      - '*/worker.js'\njobs:\n  guard:\n    runs-on: ubuntu-latest\n    steps: []\n");
wf("mirror-guard.yml", "name: mirror-guard\n# comment\non:\n  push:\n    branches: [main]\n  # comment inside\n  pull_request:\n    branches: [main]\n  workflow_dispatch:\njobs:\n  mirror-guard:\n    runs-on: ubuntu-latest\n    steps: []\n");
wf("identity-guard.yml", "name: identity-guard\non:\n  pull_request:\n    branches: [main]\njobs:\n  identity-guard:\n    name: identity-guard\n    runs-on: ubuntu-latest\n    steps: []\n");
const cfg = JSON.parse(readFileSync(join(repoRoot, "scripts", "github-main-ruleset.json"), "utf8"));
writeFileSync(join(wfRoot, "scripts", "github-main-ruleset.json"), JSON.stringify(cfg));

// workflow check detection
const wc = workflowChecks(wfRoot);
ok(wc.find((w) => w.context === "guard").filtered === true && wc.find((w) => w.context === "gate").filtered === false, "a pull_request paths filter is detected, a branches filter is not", wc);
ok(wc.find((w) => w.context === "mirror-guard").onPr && wc.find((w) => w.context === "identity-guard").onPr, "a trigger block with comments and a job name still resolves");
let pr = checkProblems(cfg, wfRoot);
ok(pr.length === 1 && /guard.*paths filter/.test(pr[0]), "the path-filtered guard check is the one problem: " + pr.join(" | "));
wf("version-bump-guard.yml", "name: version-bump-guard\non:\n  push:\n    paths:\n      - '*/worker.js'\n  pull_request:\n  workflow_dispatch:\njobs:\n  guard:\n    runs-on: ubuntu-latest\n    steps: []\n");
ok(checkProblems(cfg, wfRoot).length === 0, "the same workflow without a pull_request paths filter has no problem");
ok(checkProblems({ ...cfg, required_checks: ["gate", "nonesuch"] }, wfRoot).some((p) => /nonesuch.*no workflow job/.test(p)), "a check no job produces is a problem");

// the real repository: the committed config names checks real pull_request jobs always produce
const real = checkProblems(loadConfig(repoRoot), repoRoot);
ok(real.length === 0, "the committed config's required checks are produced by unfiltered pull_request workflows in this repository", real);
ok(JSON.stringify(loadConfig(repoRoot).required_checks) === JSON.stringify(["gate", "guard", "mirror-guard", "identity-guard"]), "the declared checks are the four named in agent_issues 2927");

// payload
const desired = buildRuleset(cfg, [{ slug: "github-actions", actor_id: 15368 }, { slug: "qnfo-fleet", actor_id: 424242 }]);
ok(desired.name === "main-gate" && desired.enforcement === "active" && desired.conditions.ref_name.include[0] === "~DEFAULT_BRANCH", "the ruleset targets the default branch by name main-gate");
ok(desired.rules.map((r) => r.type).join() === "deletion,non_fast_forward,pull_request,required_status_checks", "rules: no deletion, no force push, pull request, required checks");
const rsc = desired.rules.find((r) => r.type === "required_status_checks").parameters;
ok(rsc.required_status_checks.map((c) => c.context).join() === "gate,guard,mirror-guard,identity-guard" && rsc.strict_required_status_checks_policy === false, "the four contexts, not strict (strict would stall every PR whenever main moves)");
ok(desired.rules.find((r) => r.type === "pull_request").parameters.required_approving_review_count === 0, "no approving review is required (one account authors every pull request)");
ok(desired.bypass_actors.some((b) => b.actor_type === "RepositoryRole" && b.actor_id === 5) && desired.bypass_actors.some((b) => b.actor_id === 424242 && b.actor_type === "Integration") && desired.bypass_actors.every((b) => b.bypass_mode === "always"), "admin role and both apps bypass", desired.bypass_actors);
ok(rulesetDiff(null, desired)[0].startsWith("absent") && rulesetDiff(JSON.parse(JSON.stringify(desired)), desired).length === 0 && rulesetDiff({ ...desired, enforcement: "disabled" }, desired).length === 1, "rulesetDiff: absent, equal, one change");
const actors = activityActors([{ activity_type: "push", actor: { login: "github-actions[bot]" } }, { activity_type: "pr_merge", actor: { login: "rwnq8" } }, { activity_type: "push", actor: { login: "github-actions[bot]" } }, { activity_type: "push", actor: { login: "intruder" } }]);
ok(actors["github-actions[bot]"].push === 2 && actors.rwnq8.pr_merge === 1 && unlistedPushers(actors, cfg).join() === "intruder", "activityActors counts by pusher and kind; unlistedPushers names a direct pusher nobody listed (a merger is not one)", actors);

// ---- report: refusal recorded verbatim ----
let g = fakeGitHub({ read403: true });
let res = await run("report", "dry", wfRoot, g.fetchImpl, { GITHUB_TOKEN: "ghs_session" });
const prot = res.matrix.find((x) => x.call === "GET branches/main/protection");
ok(prot.status === 403 && prot.message === "Resource not accessible by integration" && res.classic_protection === "unreadable" && /^no: /.test(res.token_can_administer), "report records the refused call with its status and GitHub's own words", prot);
ok(res.credential === "GITHUB_TOKEN" && res.contexts_seen_on_recent_pr_heads.gate === 2 && res.rules_on_main.join() === "deletion,non_fast_forward" && res.pushers_last_100["github-actions[bot]"].push === 3 && res.unlisted_direct_pushers.length === 0, "report reads the rules, the contexts seen and the pushers of main", res);
ok(g.st.log.every((c) => c.method === "GET"), "report only reads");
g = fakeGitHub();
res = await run("report", "dry", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin", GITHUB_TOKEN: "ghs_x" });
ok(res.credential === "QNFO_GH_PAT" && res.classic_protection === "absent" && /^yes: /.test(res.token_can_administer) && res.org_apps.join() === "qnfo-fleet:424242", "with the admin credential the report says it can administer and lists the org apps");
ok(g.st.tokens.size === 1 && [...g.st.tokens][0] === "Bearer pat_admin", "one credential per run, the admin one when set");

// ---- ruleset-main ----
wf("version-bump-guard.yml", "name: version-bump-guard\non:\n  pull_request:\n    paths:\n      - '*/worker.js'\njobs:\n  guard:\n    runs-on: ubuntu-latest\n    steps: []\n");
g = fakeGitHub();
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(!res.ok && res.problems.some((p) => /guard.*paths filter/.test(p)) && !g.st.log.some((c) => c.method !== "GET") && /live refused/.test(res.note), "live refuses and writes nothing while a required check is path-filtered", res.problems);
wf("version-bump-guard.yml", "name: version-bump-guard\non:\n  pull_request:\njobs:\n  guard:\n    runs-on: ubuntu-latest\n    steps: []\n");
g = fakeGitHub({ contexts: ["gate", "mirror-guard", "identity-guard"] });
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(!res.ok && res.problems.some((p) => /'guard' was not seen/.test(p)) && !g.st.log.some((c) => c.method !== "GET"), "live refuses while a required context was never seen on a recent pull request head");
g = fakeGitHub({ noFleetApp: true });
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(!res.ok && res.problems.some((p) => /qnfo-fleet/.test(p) && /lock that app out/.test(p)) && !g.st.log.some((c) => c.method !== "GET"), "live refuses while the code loop's app cannot be resolved (it would lock the loop out of main)");
g = fakeGitHub({ appsViaInstallations: true });
res = await run("ruleset-main", "dry", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && res.desired.bypass_actors.some((b) => b.actor_id === 424242), "the app id falls back to the org installations when the public app lookup fails");
g = fakeGitHub({ stranger: true });
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(!res.ok && res.problems.some((p) => /someone-else/.test(p) && /would block it/.test(p)) && !g.st.log.some((c) => c.method !== "GET"), "live refuses while an unlisted actor pushes directly to main (the ruleset would block it)");
g = fakeGitHub();
res = await run("ruleset-main", "dry", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && res.problems.length === 0 && res.diff[0].startsWith("absent") && !g.st.log.some((c) => c.method !== "GET") && res.desired.bypass_actors.length === 3, "dry run is clean, shows the diff and writes nothing", res);
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && res.write.status === 201 && res.rules_on_main_after.includes("required_status_checks") && res.rules_on_main_after.includes("pull_request") && g.st.rulesets.length === 2 && g.st.rulesets[0].name === "main-safety", "live creates main-gate beside main-safety and reads the rules back", res);
const before = g.st.log.length;
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && /already matches/.test(res.note) && !g.st.log.slice(before).some((c) => c.method !== "GET"), "a second live run is a no-op");
g.st.rulesets.find((r) => r.name === "main-gate").enforcement = "disabled";
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && res.write.call.startsWith("PUT rulesets/777") && g.st.rulesets.find((r) => r.name === "main-gate").enforcement === "active", "a drifted ruleset is updated in place (PUT), not duplicated");
res = await run("ruleset-main-revert", "dry", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && /would delete ruleset 777/.test(res.note) && g.st.rulesets.length === 2, "revert dry run deletes nothing");
res = await run("ruleset-main-revert", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && res.delete.status === 204 && g.st.rulesets.length === 1 && g.st.rulesets[0].name === "main-safety", "revert live deletes main-gate and never main-safety");

// ---- refusals ----
g = fakeGitHub({ admin403: true });
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_weak" });
ok(!res.ok && res.refused && res.refused.status === 403 && res.refused.message === "Resource not accessible by integration", "a refused write is recorded with status and text", res.refused);
ok(g.st.tokens.size === 1 && [...g.st.tokens][0] === "Bearer pat_weak" && g.st.log.filter((c) => c.method !== "GET").length === 1, "a refusal is not retried: one write, one credential");
g = fakeGitHub();
res = await run("ruleset-main", "live", wfRoot, g.fetchImpl, { GITHUB_TOKEN: "ghs_only" });
ok(!res.ok && res.refused.status === 0 && /no GH_ADMIN_TOKEN/.test(res.refused.message) && g.st.log.length === 0, "a live write without GH_ADMIN_TOKEN is a refusal and sends nothing (GITHUB_TOKEN is never used to write)");

// ---- secret scanning ----
g = fakeGitHub();
res = await run("secret-scanning", "dry", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.ok && res.features.secret_scanning.result === "already enabled" && /dry run/.test(res.features.secret_scanning_push_protection.result) && !g.st.log.some((c) => c.method !== "GET"), "secret-scanning dry run lists what it would enable and writes nothing", res.features);
g = fakeGitHub({ refuse: ["secret_scanning_validity_checks", "secret_scanning_non_provider_patterns"] });
res = await run("secret-scanning", "live", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(!res.ok && g.st.log.filter((c) => c.method === "PATCH").length === 3 && res.features.secret_scanning_push_protection.after === "enabled" && res.limitations.length === 2 && /Secret Protection/.test(res.limitations[0]), "one PATCH per feature: a refusal of two leaves push protection enabled and is recorded as two limitations", res);
g = fakeGitHub({ noSa: true });
res = await run("secret-scanning", "dry", wfRoot, g.fetchImpl, { GH_ADMIN_TOKEN: "pat_admin" });
ok(res.visible_to_credential === false && res.features.secret_scanning.before === "unknown", "a credential that cannot see security_and_analysis says so");

// ---- allowlists ----
ok((await run("delete-repo", "live", wfRoot, g.fetchImpl, {})).error.includes("not allowlisted") && (await run("report", "yolo", wfRoot, g.fetchImpl, {})).error.includes("mode"), "an unknown action or mode is refused");
const api = makeApi(g.fetchImpl, "t");
let threw = 0;
for (const p of ["/repos/QNFO/other/rulesets", "/orgs/QNFO/repos", "/user/repos", "/repos/QNFO/qnfo-workers-evil/rulesets", "/apps/qnfo-fleet/installations", "/apps/Evil_App"]) { try { await api.call("GET", p); } catch (e) { threw++; } }
ok(threw === 6, "only QNFO/qnfo-workers and the org installations are reachable", threw);
ok(ACTIONS.join() === "report,ruleset-main,ruleset-main-revert,secret-scanning" && SECRET_FEATURES.length === 4, "the action list is the documented four");
const wfText = readFileSync(join(repoRoot, ".github", "workflows", "github-settings-actions.yml"), "utf8");
ok(/GH_ADMIN_TOKEN: \$\{\{ secrets\.QNFO_GH_PAT \}\}/.test(wfText) && !/run:.*\$\{\{ (github\.event\.)?inputs\./.test(wfText) && /IN_ACTION: \$\{\{ github\.event\.inputs\.action \}\}/.test(wfText) && /workflow_dispatch:/.test(wfText) && !/schedule:/.test(wfText), "the workflow passes inputs through env, takes the PAT from the secret and is dispatch-only");
ok(!/ghp_|github_pat_|ghs_[A-Za-z0-9]{10}/.test(readFileSync(join(repoRoot, "scripts", "github-settings-actions.mjs"), "utf8")), "no credential value in the script");

rmSync(wfRoot, { recursive: true, force: true });
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

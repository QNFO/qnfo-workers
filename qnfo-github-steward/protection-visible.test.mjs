// PROTECTION-VISIBLE-1 offline suite (agent_issues 2927 INTEG-GITHUB-HARDEN-1). No network: global fetch is a fake GitHub.
//
// Before 0.7.0 the branch-protection step of reconcileRepo acted on a 404 (PUT) and a 200 (check for force pushes) and dropped every
// other answer, so a credential that cannot read protection (403 "Resource not accessible by integration") left every run at
// repos_protected 0 / errors 0 / drift 0 while the public repositories stayed unprotected (github_steward_runs 1-16, 2026-10-17..19).
// These cases pin: the unreadable answer is counted with GitHub's own text and becomes ONE limitation per run; a 404 still gets the PUT and
// a clean 200 still gets none; a rate limit is not a refusal; and the run records the rules on QNFO/qnfo-workers main as a fact.
// Run: node qnfo-github-steward/protection-visible.test.mjs   (exit 0 = all passed)
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " :: " + JSON.stringify(d).slice(0, 300) : "")); } };

const tmp = join(mkdtempSync(join(tmpdir(), "pv-")), "w.mjs");
writeFileSync(tmp, readFileSync(join(here, "worker.js"), "utf8") + "\nexport { reconcileRepo as __rr, runReconcile as __run, protectionUnreadable as __pu, protectionLimitation as __pl, mainRulesVisibility as __mr, VERSION as __v };\n");
const W = await import(pathToFileURL(tmp).href);

const DESIRED = { delete_branch_on_merge: true, allow_auto_merge: true, allow_update_branch: true, allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, has_projects: false };
let calls = [];
function fakeFetch(opts) {
  return async (url, init) => {
    const path = String(url).replace("https://api.github.com", "");
    const method = (init && init.method) || "GET";
    calls.push(method + " " + path);
    const reply = (status, body, headers) => ({ status, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null }, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (method === "GET" && /^\/repos\/QNFO\/[^/]+$/.test(path)) return reply(200, { ...DESIRED, default_branch: "main", private: false });
    if (/\/branches\/main\/protection$/.test(path)) {
      if (method === "GET") return opts.protection(path);
      if (method === "PUT") return reply(200, {});
    }
    if (method === "GET" && /\/rules\/branches\/main$/.test(path)) return reply(200, opts.rules || []);
    if (method === "GET" && path === "/orgs/QNFO") return reply(200, { default_repository_permission: "read", members_can_create_public_repositories: false, has_organization_projects: true });
    if (method === "GET" && path.startsWith("/orgs/QNFO/repos")) return reply(200, opts.repos || []);
    if (method === "GET" && path.startsWith("/users/rwnq8/repos")) return reply(200, []);
    return reply(404, { message: "Not Found" });
  };
}
const R = () => ({ drift: [], limitations: [], errors: [], repos_fixed: 0, repos_protected: 0 });
const env = { GITHUB_TOKEN: "t" };
const pub = (n) => ({ full_name: "QNFO/" + n, private: false, default_branch: "main" });
const reply = (status, body, headers) => ({ status, headers: { get: (k) => (headers && headers[k.toLowerCase()]) || null }, text: async () => JSON.stringify(body) });

{ const [maj, min] = W.__v.split(/[.-]/).map(Number); ok(maj > 0 || min >= 7, "the worker is at least 0.7.0 (a minimum, so the next bump does not break this suite)", W.__v); }

// 1. a credential that cannot read protection: counted, with GitHub's own words, and no PUT is attempted
calls = [];
globalThis.fetch = fakeFetch({ protection: () => reply(403, { message: "Resource not accessible by integration", documentation_url: "https://docs.github.com/rest/branches/branch-protection#get-branch-protection" }) });
let r = R();
await W.__rr(env, pub("alpha"), r);
ok(r.protection_unreadable && r.protection_unreadable.count === 1 && r.protection_unreadable.statuses["403"] === 1, "a 403 on the protection GET is counted", r.protection_unreadable);
ok(/Resource not accessible by integration/.test(r.protection_unreadable.sample) && r.protection_unreadable.example_repo === "QNFO/alpha", "GitHub's own text and an example repository are kept", r.protection_unreadable);
ok(!calls.some((c) => c.startsWith("PUT")), "no PUT is attempted when the protection cannot be read");
ok(r.errors.length === 0 && r.repos_protected === 0, "it is bookkeeping, not a per-repository error");

// 2. aggregation: three repositories are one aggregate and one limitation
await W.__rr(env, pub("beta"), r);
await W.__rr(env, pub("gamma"), r);
ok(r.protection_unreadable.count === 3 && r.protection_unreadable.statuses["403"] === 3, "three repositories, one aggregate", r.protection_unreadable);
W.__pl(r);
ok(r.limitations.length === 1 && /branch_protection: .*"403":3.*3 public repositories.*QNFO\/alpha.*Resource not accessible by integration.*INTEG-GITHUB-HARDEN-1/.test(r.limitations[0]), "the run carries exactly one limitation naming the count and the refusal", r.limitations);
const r0 = R(); W.__pl(r0);
ok(r0.limitations.length === 0, "no refusal, no limitation");

// 3. unchanged paths: a 404 still gets the PUT, a clean 200 gets none
calls = [];
globalThis.fetch = fakeFetch({ protection: () => reply(404, { message: "Branch not protected" }) });
r = R();
await W.__rr(env, pub("delta"), r);
ok(r.repos_protected === 1 && calls.some((c) => c.startsWith("PUT ") && c.includes("/branches/main/protection")) && !r.protection_unreadable, "a 404 still gets the declared protection (repos_protected 1)");
calls = [];
globalThis.fetch = fakeFetch({ protection: () => reply(200, { allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } }) });
r = R();
await W.__rr(env, pub("epsilon"), r);
ok(!calls.some((c) => c.startsWith("PUT")) && !r.protection_unreadable && r.drift.length === 0, "a protected repository without weak settings is left alone");

// 4. a rate limit is not a refusal
globalThis.fetch = fakeFetch({ protection: () => reply(403, { message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0" }) });
r = R();
await W.__rr(env, pub("zeta"), r);
ok(!r.protection_unreadable, "a rate-limited answer is not counted as an unreadable protection");

// 5. main_rules: the DoD of 2927 as a per-tick fact
globalThis.fetch = fakeFetch({ rules: [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "deletion" }] });
r = R();
await W.__mr(env, r);
ok(r.main_rules.status === 200 && r.main_rules.types.join() === "deletion,non_fast_forward" && r.main_rules.required_checks === "no" && r.main_rules.pull_request_required === "no", "today's main: only deletion and non_fast_forward, no required checks", r.main_rules);
globalThis.fetch = fakeFetch({ rules: [{ type: "deletion" }, { type: "pull_request" }, { type: "required_status_checks" }] });
r = R();
await W.__mr(env, r);
ok(r.main_rules.required_checks === "yes" && r.main_rules.pull_request_required === "yes", "with the ruleset applied both read yes", r.main_rules);
globalThis.fetch = fakeFetch({});
globalThis.fetch = async () => ({ status: 500, headers: { get: () => null }, text: async () => "oops" });
r = R();
await W.__mr(env, r);
ok(r.main_rules.status === 500 && r.main_rules.required_checks === "no" && r.main_rules.types.length === 0, "an unreadable answer is recorded with its status, not as a pass", r.main_rules);

// 6. the whole run: both facts land in the result that is stored as github_steward_runs.detail
globalThis.fetch = fakeFetch({ repos: [pub("qnfo-workers"), pub("other")], protection: () => reply(403, { message: "Resource not accessible by integration" }), rules: [{ type: "deletion" }] });
const full = await W.__run({ GITHUB_TOKEN: "t" }, { notifications: false });
ok(full.repos_checked === 2 && full.protection_unreadable.count === 2 && full.limitations.some((l) => /^branch_protection:/.test(l)) && full.main_rules.required_checks === "no" && full.errors.length === 0, "runReconcile carries protection_unreadable, the limitation and main_rules", { n: full.repos_checked, pu: full.protection_unreadable, lim: full.limitations, mr: full.main_rules, err: full.errors });

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// scripts/github-settings-actions.mjs: GITHUB-SETTINGS-ACTIONS-1 (agent_issues 2927 INTEG-GITHUB-HARDEN-1, pillar security).
//
// WHAT   Allowlisted GitHub settings actions for QNFO/qnfo-workers, run by .github/workflows/github-settings-actions.yml (the same
//        shape as cf-ops-actions: workflow_dispatch, one action per run, one RESULT_JSON line, nothing secret printed).
//          report              read-only capability matrix: which settings calls the credential may make (status + GitHub's own
//                              message, verbatim), the rulesets and rules on main, the check contexts seen on recent pull request
//                              heads, who pushes to main (the pusher, not the commit author), the org's app installations, the
//                              secret-scanning state.
//          ruleset-main        dry (default): print the ruleset payload, its diff against what exists, and every safety problem.
//                              live: create or update the ruleset `main-gate` (required checks, pull request required, admin role
//                              and the fleet's apps bypass), then read /rules/branches/main back to prove it.
//          ruleset-main-revert delete the ruleset named `main-gate`, and only that name (dry by default).
//          secret-scanning     enable secret scanning, push protection, validity checks and non-provider patterns, one PATCH per
//                              feature so a refusal of one never hides the others; the answer of each is recorded.
// WHY    No session holds repository Administration rights (a session's GET /branches/main/protection answers 403 "Resource not
//        accessible by integration", 2026-10-19), main has a ruleset that only blocks deletion and force pushes, and every concurrent
//        session clobber in this repository traces to unreviewed direct pushes. The steward's token has administration rights
//        (github_steward_runs 1 and 10: 61 and 49 repositories PATCHed), the repository secret QNFO_GH_PAT reads the org; which of
//        them may write rulesets has never been asked. This action asks, once, with the credential the fleet already has.
// SAFETY * One credential per run (GH_ADMIN_TOKEN, the secret QNFO_GH_PAT). A refusal is recorded with its status and text and is never
//          retried with another credential or another route. The token is never printed.
//        * Only QNFO/qnfo-workers, only the paths below. `live` refuses while a required check would never report (a path-filtered
//          workflow, an unknown context): GitHub then waits for it forever and no pull request could merge.
//        * The ruleset is added beside main-safety; reverting is one action. enforce on `~DEFAULT_BRANCH` only.
// USAGE  GH_ADMIN_TOKEN=... node scripts/github-settings-actions.mjs <action> [--mode dry|live] [--root .]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ACTIONS = ["report", "ruleset-main", "ruleset-main-revert", "secret-scanning"];
export const API = "https://api.github.com";
export const CONFIG_PATH = "scripts/github-main-ruleset.json";
const REPO_RE = /^\/repos\/QNFO\/qnfo-workers(\/|$|\?)/;
const ORG_RE = /^\/(orgs\/QNFO\/installations(\?|$)|apps\/[a-z0-9-]+$)/;
export const SECRET_FEATURES = ["secret_scanning", "secret_scanning_push_protection", "secret_scanning_validity_checks", "secret_scanning_non_provider_patterns"];

// ---- API client: one token, an allowlist of paths, every answer kept verbatim ----
export function makeApi(fetchImpl, token) {
  const calls = [];
  async function call(method, path, body) {
    if (!(REPO_RE.test(path) || ORG_RE.test(path))) throw new Error("path not allowlisted: " + path);
    if (!token) { const r = { status: 0, body: null, text: "", message: "no credential", ok: false }; calls.push({ method, path, status: 0, message: r.message }); return r; }
    const init = { method, headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "qnfo-github-settings-actions", "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res, text = "";
    try { res = await fetchImpl(API + path, init); text = await res.text(); }
    catch (e) { const r = { status: 0, body: null, text: "", message: "network: " + String(e && e.message || e).slice(0, 160), ok: false }; calls.push({ method, path, status: 0, message: r.message }); return r; }
    let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
    const message = res.status >= 400 ? String((j && (j.message || j.error)) || text || "").slice(0, 300) + (j && Array.isArray(j.errors) && j.errors.length ? " " + JSON.stringify(j.errors).slice(0, 240) : "") : "";
    const r = { status: res.status, body: j, text, message, ok: res.status >= 200 && res.status < 300 };
    calls.push({ method, path, status: res.status, message });
    return r;
  }
  return { call, calls };
}

// ---- pure helpers ----
export function loadConfig(root) { return JSON.parse(readFileSync(join(root, CONFIG_PATH), "utf8")); }

// A required check reports only when a workflow that triggers on pull_request to main has a job with that id (or `name:`), and the
// trigger has no `paths:` filter: a filtered workflow never runs for a pull request that changes nothing under it, and the required
// check then stays "Expected" for ever.
export function workflowChecks(root) {
  const dir = join(root, ".github", "workflows");
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    const text = readFileSync(join(dir, f), "utf8");
    const onBlock = /^on:\s*\n((?:[ \t]+.*\n|[ \t]*\n|#.*\n)*)/m.exec(text);
    const trig = onBlock ? onBlock[1] : "";
    const pr = /^[ \t]{2}pull_request:\s*\n((?:[ \t]{3,}.*\n|[ \t]*\n|[ \t]*#.*\n)*)/m.exec(trig);
    const onPr = !!pr || /^[ \t]*pull_request:/m.test(trig) || /^on:\s*\[[^\]]*pull_request/m.test(text);
    const filtered = !!(pr && /^[ \t]{4}paths(-ignore)?:/m.test(pr[1]));
    const jobsAt = text.search(/^jobs:\s*$/m);
    if (jobsAt < 0) continue;
    const jobs = text.slice(jobsAt).split("\n").slice(1);
    let cur = null;
    for (const line of jobs) {
      const k = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
      if (k) { cur = { workflow: f, job: k[1], context: k[1], onPr, filtered }; out.push(cur); continue; }
      const n = /^    name:\s*(.+?)\s*$/.exec(line);
      if (n && cur && !/\$\{\{/.test(n[1])) cur.context = n[1].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export function checkProblems(cfg, root) {
  const problems = [];
  const all = workflowChecks(root);
  for (const ctx of cfg.required_checks) {
    const hit = all.filter((w) => w.context === ctx);
    if (!hit.length) problems.push("required check '" + ctx + "' is produced by no workflow job (GitHub would wait for it for ever)");
    else if (!hit.some((w) => w.onPr && !w.filtered)) problems.push("required check '" + ctx + "' is produced only by " + hit.map((w) => w.workflow + (w.onPr ? " (pull_request has a paths filter)" : " (no pull_request trigger)")).join(", ") + ": a pull request that skips it could never merge");
  }
  return problems;
}

export function buildRuleset(cfg, bypassIntegrations) {
  const rules = [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "pull_request", parameters: { ...cfg.pull_request, allowed_merge_methods: ["squash"] } },
    { type: "required_status_checks", parameters: { strict_required_status_checks_policy: !!cfg.strict_required_status_checks_policy, required_status_checks: cfg.required_checks.map((c) => ({ context: c })) } }
  ];
  const bypass_actors = [
    ...cfg.bypass.repository_roles.map((r) => ({ actor_id: r.actor_id, actor_type: "RepositoryRole", bypass_mode: "always" })),
    ...bypassIntegrations.map((i) => ({ actor_id: i.actor_id, actor_type: "Integration", bypass_mode: "always" }))
  ];
  return { name: cfg.name, target: cfg.target, enforcement: cfg.enforcement, conditions: cfg.conditions, rules, bypass_actors };
}

// Does an existing ruleset already carry the desired rules, checks and bypass list?
export function rulesetDiff(existing, desired) {
  if (!existing) return ["absent: will be created"];
  const d = [];
  if (existing.enforcement !== desired.enforcement) d.push("enforcement " + existing.enforcement + " -> " + desired.enforcement);
  const types = (x) => (x.rules || []).map((r) => r.type).sort().join(",");
  if (types(existing) !== types(desired)) d.push("rule types " + types(existing) + " -> " + types(desired));
  const ctx = (x) => ((x.rules || []).find((r) => r.type === "required_status_checks") || { parameters: { required_status_checks: [] } }).parameters.required_status_checks.map((c) => c.context).sort().join(",");
  if (ctx(existing) !== ctx(desired)) d.push("required checks " + ctx(existing) + " -> " + ctx(desired));
  const by = (x) => (x.bypass_actors || []).map((b) => b.actor_type + ":" + b.actor_id).sort().join(",");
  if (by(existing) !== by(desired)) d.push("bypass " + by(existing) + " -> " + by(desired));
  return d;
}

// GET /repos/.../activity?ref=refs/heads/main: who pushed or merged on main. `actor` is the PUSHER (the token's identity), which a commit's
// author or committer name is not: the status and charter commits are authored as qnfo-selfheal-bot and qnfo-fleet-bot but pushed by the
// Actions app (measured 2026-10-19: github-actions[bot] 47 pushes, qnfo-fleet[bot] 18 merges and 5 pushes, rwnq8 28 merges and 2 pushes).
export function activityActors(list) {
  const by = {};
  for (const a of Array.isArray(list) ? list : []) {
    const who = (a.actor && a.actor.login) || "unknown";
    const kind = a.activity_type || "unknown";
    by[who] = by[who] || {};
    by[who][kind] = (by[who][kind] || 0) + 1;
  }
  return by;
}
// A direct push (activity_type push, not pr_merge) by an actor the ruleset would block: neither a bypass app nor a known admin.
export function unlistedPushers(actors, cfg) {
  // GitHub Actions cannot be a ruleset bypass actor, so pushes by github-actions[bot] must be moved to a bypass-listed identity.
  const known = new Set(cfg.known_direct_pushers || []);
  known.delete("github-actions[bot]");
  return Object.keys(actors).filter((who) => (actors[who].push || 0) > 0 && who !== "github-actions[bot]" && !known.has(who));
}

// Audit the workflow files for any command that pushes directly to refs/heads/main. Those paths currently push as github-actions[bot].
export function workflowPushPaths(root) {
  const dir = join(root, ".github", "workflows");
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort()) {
    const lines = readFileSync(join(dir, f), "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\bgit\s+push\b/.test(line) && /\bmain\b/.test(line)) {
        out.push({ workflow: f, line: i + 1, snippet: line.trim() });
      }
    }
  }
  return out;
}

// ---- reads shared by report and the live safety check ----
async function seenContexts(api, repo, perPr = 8) {
  const seen = {};
  const prs = await api.call("GET", "/repos/" + repo + "/pulls?state=closed&per_page=" + perPr);
  const heads = prs.ok && Array.isArray(prs.body) ? prs.body.map((p) => p.head && p.head.sha).filter(Boolean) : [];
  for (const sha of heads) {
    const cr = await api.call("GET", "/repos/" + repo + "/commits/" + sha + "/check-runs?per_page=100");
    if (cr.ok && cr.body && Array.isArray(cr.body.check_runs)) for (const r of cr.body.check_runs) seen[r.name] = (seen[r.name] || 0) + 1;
  }
  return { seen, prs_sampled: heads.length, prs_status: prs.status };
}

// An app's numeric id: the public GET /apps/<slug> first (no credential needed), then the org's installations (needs an org-admin credential).
async function resolveIntegrations(api, cfg) {
  const out = [], unresolved = [];
  let listing = null;
  for (const i of cfg.bypass.integrations) {
    if (i.actor_id) { out.push({ slug: i.slug, actor_id: i.actor_id }); continue; }
    if (i.slug === "github-actions" || i.slug === "github-actions[bot]") {
      unresolved.push(i.slug + " is not a bypass-eligible actor (move direct pushes to a bypass-listed app identity): ruleset refused");
      continue;
    }
    const pub = await api.call("GET", "/apps/" + i.slug);
    if (pub.ok && pub.body && pub.body.id && pub.body.slug === i.slug) { out.push({ slug: i.slug, actor_id: pub.body.id }); continue; }
    if (!listing) listing = await api.call("GET", "/orgs/QNFO/installations?per_page=100");
    const hit = listing.ok && listing.body && Array.isArray(listing.body.installations) ? listing.body.installations.find((x) => x.app_slug === i.slug) : null;
    if (hit && hit.app_id) out.push({ slug: i.slug, actor_id: hit.app_id });
    else unresolved.push(i.slug + " (GET /apps/" + i.slug + " answered " + pub.status + (pub.message ? " " + pub.message : "") + "; " + (listing.ok ? "not among the org installations" : "installations answered " + listing.status + ": " + listing.message) + ")");
  }
  return { integrations: out, unresolved };
}

// ---- actions ----
export async function actionReport(api, cfg, root) {
  const repo = cfg.repo, r = { action: "report", repo, ok: true, matrix: [] };
  const probe = async (label, path) => { const x = await api.call("GET", path); r.matrix.push({ call: label, status: x.status, message: x.message || undefined }); return x; };
  const repoInfo = await probe("GET repo", "/repos/" + repo);
  r.repo_admin_flag = repoInfo.body && repoInfo.body.permissions ? repoInfo.body.permissions.admin : null;
  r.security_and_analysis = repoInfo.body ? repoInfo.body.security_and_analysis || null : null;
  const prot = await probe("GET branches/main/protection", "/repos/" + repo + "/branches/main/protection");
  r.classic_protection = prot.status === 200 ? "present" : prot.status === 404 ? "absent" : "unreadable";
  const rs = await probe("GET rulesets", "/repos/" + repo + "/rulesets");
  r.rulesets = rs.ok && Array.isArray(rs.body) ? rs.body.map((x) => ({ id: x.id, name: x.name, enforcement: x.enforcement })) : null;
  const rules = await probe("GET rules/branches/main", "/repos/" + repo + "/rules/branches/main");
  r.rules_on_main = rules.ok && Array.isArray(rules.body) ? Array.from(new Set(rules.body.map((x) => x.type))).sort() : null;
  await probe("GET vulnerability-alerts", "/repos/" + repo + "/vulnerability-alerts");
  await probe("GET automated-security-fixes", "/repos/" + repo + "/automated-security-fixes");
  const inst = await probe("GET org installations", "/orgs/QNFO/installations?per_page=100");
  r.org_apps = inst.ok && inst.body && Array.isArray(inst.body.installations) ? inst.body.installations.map((x) => x.app_slug + ":" + x.app_id) : null;
  const cs = await seenContexts(api, repo);
  r.contexts_seen_on_recent_pr_heads = cs.seen; r.prs_sampled = cs.prs_sampled;
  // MAIN-RULESET-PUSH-IDENTITY-1 (issue 100168): audit every write path to main and the identity it uses, report-only.
  const dir = join(root, ".github", "workflows");
  const wfFiles = existsSync(dir) ? readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).sort() : [];
  const pushIdentities = [];
  for (const f of wfFiles) {
    const text = readFileSync(join(dir, f), "utf8");
    if (!text) continue;
    const hasCheckoutToken = /persist-credentials:\s*false/.test(text) ? "checkout does not persist the default token" : "checkout persists the default GITHUB_TOKEN identity (github-actions[bot]) unless overridden";
    const pushes = [];
    if (/\bgit\s+push\b/.test(text)) pushes.push("git push");
    if (/\/contents\//.test(text) && /(PUT|patch)/i.test(text)) pushes.push("contents PUT/PATCH");
    if (/\/git\/refs\//.test(text)) pushes.push("git refs PATCH/POST");
    if (/canary_revert/.test(text)) pushes.push("canary_revert");
    if (/QNFO_GH_PAT/.test(text)) pushIdentities.push({ workflow: f, credential: "QNFO_GH_PAT (admin PAT)", paths: pushes.length ? pushes : ["other"] });
    else if (pushes.length) pushIdentities.push({ workflow: f, credential: hasCheckoutToken, paths: pushes, identity: "github-actions[bot] unless a bypass-listed app token is configured" });
  }
  r.main_push_paths = workflowPushPaths(root);
  r.main_push_identities = pushIdentities;
  r.main_push_identity_note = "ruleset-main refuses while any workflow pushes to main as github-actions[bot]; each push path must move to a bypass-listed identity (QNFO_GH_PAT or the qnfo-fleet app token) before ruleset-main goes live";
  const act = await probe("GET activity main", "/repos/" + repo + "/activity?ref=refs/heads/main&per_page=100");
  r.pushers_last_100 = act.ok ? activityActors(act.body) : null;
  r.unlisted_direct_pushers = act.ok ? unlistedPushers(r.pushers_last_100, cfg) : null;
  r.workflow_problems = checkProblems(cfg, root);
  r.workflow_push_paths = workflowPushPaths(root);
  r.token_can_administer = prot.status === 200 || prot.status === 404 ? "yes: branch protection answered " + prot.status : "no: GET branches/main/protection answered " + prot.status + " " + prot.message;
  return r;
}

export async function actionRulesetMain(api, cfg, root, mode) {
  const repo = cfg.repo, r = { action: "ruleset-main", repo, mode, ok: false, problems: [] };
  r.problems.push(...checkProblems(cfg, root));
  const pushPaths = workflowPushPaths(root);
  r.workflow_push_paths = pushPaths;
  for (const p of pushPaths) r.problems.push("workflow " + p.workflow + " line " + p.line + " pushes to main as github-actions[bot]; move this path to a bypass-listed identity: " + p.snippet);
  const { integrations, unresolved } = await resolveIntegrations(api, cfg);
  for (const u of unresolved) r.problems.push("cannot resolve the app " + u + ": a ruleset without it would lock that app out of main");
  const cs = await seenContexts(api, repo);
  r.contexts_seen = cs.seen;
  for (const ctx of cfg.required_checks) if (!cs.seen[ctx]) r.problems.push("required check '" + ctx + "' was not seen on the last " + cs.prs_sampled + " closed pull request heads (check-runs read answered " + cs.prs_status + ")");
  const act = await api.call("GET", "/repos/" + repo + "/activity?ref=refs/heads/main&per_page=100");
  if (act.ok) {
    r.unlisted_direct_pushers = unlistedPushers(activityActors(act.body), cfg);
    for (const w of r.unlisted_direct_pushers) r.problems.push("'" + w + "' pushed directly to main in the last 100 activities and is neither a bypass app nor a known admin: the ruleset would block it (add it to known_direct_pushers only after deciding it may bypass)");
  } else r.problems.push("the push activity of main is unreadable (" + act.status + " " + act.message + "): cannot tell who the ruleset would block");
  const desired = buildRuleset(cfg, integrations);
  r.desired = desired;
  const list = await api.call("GET", "/repos/" + repo + "/rulesets");
  if (!list.ok) { r.refused = { call: "GET rulesets", status: list.status, message: list.message }; r.problems.push("rulesets unreadable: " + list.status + " " + list.message); return r; }
  const found = (list.body || []).find((x) => x.name === cfg.name) || null;
  const existing = found ? (await api.call("GET", "/repos/" + repo + "/rulesets/" + found.id)).body : null;
  r.diff = rulesetDiff(existing, desired);
  if (mode !== "live") { r.ok = true; r.note = "dry run: nothing written; " + (r.problems.length ? r.problems.length + " problem(s) block live" : "no problem blocks live"); return r; }
  if (r.problems.length) { r.note = "live refused: fix the problems first"; return r; }
  if (existing && !r.diff.length) { r.ok = true; r.note = "ruleset already matches"; return r; }
  const w = existing ? await api.call("PUT", "/repos/" + repo + "/rulesets/" + found.id, desired) : await api.call("POST", "/repos/" + repo + "/rulesets", desired);
  r.write = { call: existing ? "PUT rulesets/" + found.id : "POST rulesets", status: w.status, message: w.message || undefined };
  if (!w.ok) { r.refused = r.write; return r; }
  const back = await api.call("GET", "/repos/" + repo + "/rules/branches/main");
  const types = back.ok && Array.isArray(back.body) ? Array.from(new Set(back.body.map((x) => x.type))) : [];
  r.rules_on_main_after = types.sort();
  r.ok = types.includes("required_status_checks") && types.includes("pull_request");
  r.note = r.ok ? "ruleset live; revert with action ruleset-main-revert" : "written but /rules/branches/main does not show it";
  return r;
}

export async function actionRulesetRevert(api, cfg, mode) {
  const repo = cfg.repo, r = { action: "ruleset-main-revert", repo, mode, ok: false };
  const list = await api.call("GET", "/repos/" + repo + "/rulesets");
  if (!list.ok) { r.refused = { call: "GET rulesets", status: list.status, message: list.message }; return r; }
  const found = (list.body || []).find((x) => x.name === cfg.name);
  if (!found) { r.ok = true; r.note = "no ruleset named " + cfg.name; return r; }
  if (mode !== "live") { r.ok = true; r.note = "dry run: would delete ruleset " + found.id + " (" + cfg.name + ")"; return r; }
  const d = await api.call("DELETE", "/repos/" + repo + "/rulesets/" + found.id);
  r.delete = { status: d.status, message: d.message || undefined };
  r.ok = d.ok;
  if (!d.ok) r.refused = r.delete;
  return r;
}

export async function actionSecretScanning(api, cfg, mode) {
  const repo = cfg.repo, r = { action: "secret-scanning", repo, mode, ok: true, features: {} };
  const before = await api.call("GET", "/repos/" + repo);
  if (!before.ok) { r.ok = false; r.refused = { call: "GET repo", status: before.status, message: before.message }; return r; }
  const sa = (before.body && before.body.security_and_analysis) || null;
  r.visible_to_credential = !!sa;
  for (const f of SECRET_FEATURES) {
    const state = sa && sa[f] ? sa[f].status : "unknown";
    const row = { before: state };
    if (state === "enabled") { row.result = "already enabled"; r.features[f] = row; continue; }
    if (mode !== "live") { row.result = "dry run: would PATCH security_and_analysis." + f + " = enabled"; r.features[f] = row; continue; }
    const p = await api.call("PATCH", "/repos/" + repo, { security_and_analysis: { [f]: { status: "enabled" } } });
    row.patch = { status: p.status, message: p.message || undefined };
    r.features[f] = row;
  }
  if (mode === "live") {
    const after = await api.call("GET", "/repos/" + repo);
    const sa2 = (after.body && after.body.security_and_analysis) || {};
    for (const f of SECRET_FEATURES) { r.features[f].after = sa2[f] ? sa2[f].status : "unknown"; if (r.features[f].after !== "enabled") r.features[f].limitation = (r.features[f].patch && r.features[f].patch.message) || "still " + r.features[f].after; }
    r.limitations = SECRET_FEATURES.filter((f) => r.features[f].after !== "enabled").map((f) => f + ": " + r.features[f].limitation);
    r.ok = r.limitations.length === 0;
  }
  return r;
}

export async function run(action, mode, root, fetchImpl, env) {
  if (!ACTIONS.includes(action)) return { ok: false, action, error: "action not allowlisted; one of " + ACTIONS.join(", ") };
  if (mode !== "dry" && mode !== "live") return { ok: false, action, error: "mode must be dry or live" };
  const cfg = loadConfig(root);
  const admin = (env && env.GH_ADMIN_TOKEN) || "";
  const readTok = admin || (env && env.GITHUB_TOKEN) || "";
  const writes = action !== "report";
  // a dry run only reads, so it may use whichever credential exists; a live write uses the admin credential and nothing else
  const token = writes && mode === "live" ? admin : (admin || readTok);
  const api = makeApi(fetchImpl, token);
  let res;
  if (writes && mode === "live" && !admin) res = { ok: false, action, mode, refused: { call: "(none sent)", status: 0, message: "no GH_ADMIN_TOKEN (repository secret QNFO_GH_PAT is empty or unset): a live write needs a credential with repository administration" } };
  else if (action === "report") res = await actionReport(api, cfg, root);
  else if (action === "ruleset-main") res = await actionRulesetMain(api, cfg, root, mode);
  else if (action === "ruleset-main-revert") res = await actionRulesetRevert(api, cfg, mode);
  else res = await actionSecretScanning(api, cfg, mode);
  res.credential = token === admin && admin ? "QNFO_GH_PAT" : token ? "GITHUB_TOKEN" : "none";
  res.calls = api.calls.length;
  return res;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const action = argv[0] || "";
  const res = await run(action, arg("--mode", "dry"), resolve(arg("--root", process.cwd())), fetch, process.env);
  console.log("RESULT_JSON=" + JSON.stringify(res));
  process.exit(res.ok ? 0 : 1);
}
function isEntry() { try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; } }
if (isEntry()) main();

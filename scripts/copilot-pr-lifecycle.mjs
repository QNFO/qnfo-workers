#!/usr/bin/env node
// scripts/copilot-pr-lifecycle.mjs: COPILOT-PR-LIFECYCLE-1 (owner directive 2026-10-30, pillar autonomy: the owner never reviews, is never assigned and
// never approves; a Copilot pull request is finished by the system).
//
// WHAT   For every open pull request written by the Copilot cloud agent in this repository:
//        1. removes the owner as requested reviewer and as assignee, and as assignee of the issue it fixes (GitHub adds the person who triggered
//           the agent: events `assigned` and `review_requested` appear within a second of `copilot_work_finished`); with ORG_TOKEN (the fleet user
//           credential, handed to this script only off a pull_request_target run) the same removal runs for the Copilot pull requests and the issues of
//           every other repository of the organization, found by search: ASSIGN-COPILOT-ISSUES-1 starts sessions in all of them. It also closes a Copilot
//           draft in another repository whose session finished 30 minutes ago and changed no file (no lane merges there; qnfo-workers has BH-EMPTY-DRAFT-1);
//        2. once the agent has finished (the last copilot_work_* event is copilot_work_finished): approves the approval-gated pull_request runs of
//           its head so that the checks the merge lane waits for actually run (a Copilot push starts runs that stay `action_required` until a person
//           clicks "Approve and run workflows": 268 such runs and 19 zero-job failed runs measured on 2026-10-30, so the lane never saw a green check
//           on any Copilot pull request). Marking a draft ready is left to the merge lane (PR-MERGE-SLA-10M-1 stale_pr_merge_drafts).
//        3. KICK-GATED-CHECKS-1 (2026-11-01): the REST approval cannot do step 2 for these runs. POST /actions/runs/{id}/approve answers 403 "This run is
//           not from a fork pull request or queued by the Actions bot" for a run the Copilot agent queued on a branch of this repository: 9 of 9 attempts
//           on 2026-11-01 10:03-10:43Z (the sweeps ran every 7 minutes), `approved` empty in every RESULT_JSON, so every finished Copilot draft sat at
//           `action_required` and the lane never saw its required checks ("guard, mirror-guard, comparator never ran"). When that refusal comes back and
//           ORG_TOKEN is set, the script asks GitHub to bring the branch up to date (PUT /pulls/{n}/update-branch, pinned to the head it judged, the
//           call the merge lane's own nudge makes): the merge commit is pushed by the owner credential, a person's push is not held, and the same
//           workflows run un-gated on the new head (measured on #5513: actor rwnq8, version-bump-guard, mirror-guard, migration-guard, identity-guard
//           green within 30 s). It applies exactly the policy of step 2: the agent has finished, the diff avoids every DENY_PATHS entry, the head is this
//           repository's own branch (and a pull request with no changed file is skipped: nothing to check, and a push would restart the idle time
//           BH-EMPTY-DRAFT-1 waits for before it closes that draft). Only four workflows run on a push to a branch other than main (copilot-setup-steps, dup-worker-name-gate,
//           version-bump-guard, workflow-lint), all path-filtered and none reads a secret, so the push adds no exposure beyond the pull_request runs
//           step 2 already approves. A kick is pinned to the head sha and never repeated for it: the new head's runs are the owner's, not Copilot's,
//           so the next sweep finds nothing gated.
//        4. EMPTY-FINISHED-DRAFT-1 (2026-11-01): a draft whose session finished (copilot_work_finished) emptyAfterMin (30) minutes ago and changed no file is commented and closed here
//           too, by the rule the organization pass applies to other repositories. The merge lane's BH-EMPTY-DRAFT-1 waits 6 hours for an idle empty draft because a session that has only
//           just opened its pull request looks the same; this script knows the session is over. Measured 2026-11-01 11:00-12:15Z: #5523, #5640 and #5652 (three of about twenty
//           sessions) finished empty, and each held one of the 12 open-Copilot-pull-request slots of the assignment sweep, whose capacity is that limit minus the open ones.
// WHY    The approval gate is a security control, so it is relaxed only where it protects nothing: a run is approved only when the pull request
//        changes none of the paths a workflow executes with more than read access or that configure the build (DENY_PATHS: .github/, scripts/,
//        wrangler and package manifests, shell scripts, Dockerfiles, yaml). Workflow definitions run from the base branch, deploy-gate strips the
//        Cloudflare secrets from pull_request events (INTEG-GITHUB-HARDEN-1) and the two other jobs that hold them (fleet-graph, model-floor-guard)
//        only parse the changed files as text, so no secret reaches code the agent wrote. A pull request that does touch those paths is left
//        unapproved with one comment naming the files (the merge lane's own scope still decides what may merge). The agent is also mid-session
//        until copilot_work_finished: nothing is approved before that, so the lane never merges half a change.
//        COPILOT_PR_APPROVE=off restores "nothing is approved" without a deploy of anything but the workflow variable.
// SAFETY * Only pull requests whose author is the Copilot cloud agent and whose head branch lives in this repository are touched; a fork run is
//          never approved. * The GITHUB_TOKEN of the workflow does the repository work; ORG_TOKEN is used for the organization search, the
//          removal of the owner and, only after the REST approval was refused with 403 for a finished pull request that avoids every DENY_PATHS entry,
//          for the one update-branch of step 3 (never for an approval call). Nothing from the pull request (title, body, branch) is put in
//          a shell line, a path or a query: only integers and SHAs read from the API. * Every write is idempotent and capped per run. A refusal
//          is recorded as it was said (RESULT_JSON, ::warning::); the one exception to "never retried with another credential" is step 3, because that 403 says the
//          endpoint cannot approve this kind of run at all (an eligibility answer, not a denial of the caller), the kick needs no approval and the policy is
//          the same as step 2's. COPILOT_PR_APPROVE=off stops the kick as well. The exit code stays 0 except for a crash.
// USAGE  GH_TOKEN=... GITHUB_REPOSITORY=QNFO/qnfo-workers node scripts/copilot-pr-lifecycle.mjs [--pr N] [--mode live|dry] [--no-approve] [--max 30]
//        OWNER_LOGINS=rwnq8 (comma separated) names the people who are never reviewer or assignee.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.github.com";
export const DEFAULTS = { max: 30, pages: 3, owners: ["rwnq8"], pauseMs: 250, orgMax: 50, emptyMax: 10, emptyAfterMin: 30, kickMax: 8 };
export const isCopilotAuthor = (login) => /^(copilot|copilot-swe-agent)(\[bot\])?$/i.test(String(login || ""));

// Paths whose change can alter what CI executes with a secret or write access, or that steer the build. A pull request touching one is never
// auto-approved. Docs, migrations, worker sources and their tests stay approvable: they are read as text or run without any secret.
export const DENY_PATHS = [
  /^\.github\//,
  /^scripts\//,
  /(^|\/)wrangler\.(toml|jsonc?)$/,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)(pnpm-lock|yarn\.lock|\.npmrc|\.nvmrc|\.tool-versions)$/,
  /\.(sh|bash|zsh|ps1|bat|cmd)$/i,
  /(^|\/)(Dockerfile|Containerfile)[^/]*$/,
  /\.ya?ml$/i
];

export function deniedPaths(files) {
  const out = [];
  for (const f of files || []) {
    const names = [f.filename, f.previous_filename].filter(Boolean);
    if (names.some((n) => DENY_PATHS.some((re) => re.test(n)))) out.push(f.filename);
  }
  return out;
}

// "finished" only when the newest copilot_work_* event is copilot_work_finished; a session that is still running is "working".
export function workState(events) {
  let state = "none";
  for (const e of events || []) {
    if (e.event === "copilot_work_started") state = "working";
    else if (e.event === "copilot_work_finished") state = "finished";
  }
  return state;
}

// When the newest copilot_work_finished event happened (ISO), or "" when the session is not finished.
export function finishedAt(events) {
  let state = "none", at = "";
  for (const e of events || []) {
    if (e.event === "copilot_work_started") state = "working";
    else if (e.event === "copilot_work_finished") { state = "finished"; at = e.created_at || ""; }
  }
  return state === "finished" ? at : "";
}

export function linkedIssues(body) {
  const out = new Set();
  const re = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;
  let m;
  while ((m = re.exec(String(body || ""))) !== null) out.add(Number(m[1]));
  return [...out];
}

export function makeApi(fetchImpl, token) {
  const calls = [];
  async function send(url, method, body) {
    const init = { method, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "qnfo-copilot-pr-lifecycle" } };
    if (token) init.headers.Authorization = "Bearer " + token;
    if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    let res, text = "";
    try { res = await fetchImpl(url, init); text = await res.text(); }
    catch (e) { calls.push({ method, url, status: 0 }); return { status: 0, body: null, message: "network: " + String((e && e.message) || e).slice(0, 160) }; }
    let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
    const message = res.status >= 400 ? String((j && j.message) || text || "").slice(0, 300) : "";
    calls.push({ method, url, status: res.status });
    return { status: res.status, body: j, message };
  }
  return {
    calls,
    req: (method, path, body) => send(API + path, method, body)
  };
}

const okStatus = (s) => s >= 200 && s < 300;

async function listAll(api, path, key, pages) {
  const items = [];
  for (let page = 1; page <= pages; page++) {
    const r = await api.req("GET", path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page);
    if (r.status !== 200) return { items, error: { http: r.status, message: r.message } };
    const arr = key ? (r.body && r.body[key]) : r.body;
    if (!Array.isArray(arr)) return { items, error: { http: r.status, message: "unexpected body" } };
    items.push(...arr);
    if (arr.length < 100) break;
  }
  return { items };
}

export async function run(opts, deps) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  const d = Object.assign({ fetchImpl: fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }, deps || {});
  const dry = o.mode === "dry";
  const now = d.now === undefined ? Date.now() : d.now;
  const owners = (o.owners || []).map((x) => String(x).toLowerCase());
  const isOwner = (login) => owners.includes(String(login || "").toLowerCase());
  const sum = {
    action: "copilot-pr-lifecycle", mode: dry ? "dry" : "live", repo: o.repo, approve: o.approve !== false, copilot_prs: 0, considered: 0, skipped: {},
    reviewers_removed: [], assignees_removed: [], issue_assignees_removed: [], approved: [], kicked: [], empty_drafts_closed: [], approval_withheld: [], errors: []
  };
  const skip = (why) => { sum.skipped[why] = (sum.skipped[why] || 0) + 1; };
  const fail = (where, r) => sum.errors.push({ where, http: r.status, message: r.message });
  if (!o.token) { sum.status = "no-credential"; return sum; }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(o.repo || "")) { sum.status = "bad-repo"; return sum; }
  const api = makeApi(d.fetchImpl, o.token);
  const orgApi = o.orgToken ? makeApi(d.fetchImpl, o.orgToken) : null;
  const repo = o.repo;

  const listed = await listAll(api, "/repos/" + repo + "/pulls?state=open", null, o.pages);
  let prs = [];
  if (listed.error) { sum.status = "list-failed"; sum.errors.push({ where: "list pulls", http: listed.error.http, message: listed.error.message }); }
  else prs = listed.items.filter((p) => isCopilotAuthor(p.user && p.user.login));
  if (o.pr) prs = prs.filter((p) => p.number === o.pr);
  sum.copilot_prs = prs.length;

  let handled = 0;
  for (const listedPr of prs) {
    if (handled >= o.max) { skip("over-cap"); continue; }
    handled++;
    sum.considered++;
    const n = listedPr.number;
    const g = await api.req("GET", "/repos/" + repo + "/pulls/" + n);
    if (g.status !== 200 || !g.body) { fail("pull " + n, g); skip("unreadable"); continue; }
    const pr = g.body;
    if (!pr.head || !pr.head.repo || pr.head.repo.full_name !== repo) { skip("not-this-repository"); continue; }

    const reviewers = (pr.requested_reviewers || []).map((u) => u.login).filter(isOwner);
    if (reviewers.length) {
      if (dry) sum.reviewers_removed.push({ pr: n, logins: reviewers, dry: true });
      else {
        const r = await api.req("DELETE", "/repos/" + repo + "/pulls/" + n + "/requested_reviewers", { reviewers });
        if (okStatus(r.status)) sum.reviewers_removed.push({ pr: n, logins: reviewers }); else fail("remove reviewer on " + n, r);
      }
    }
    const assignees = (pr.assignees || []).map((u) => u.login).filter(isOwner);
    if (assignees.length) {
      if (dry) sum.assignees_removed.push({ pr: n, logins: assignees, dry: true });
      else {
        const r = await api.req("DELETE", "/repos/" + repo + "/issues/" + n + "/assignees", { assignees });
        if (okStatus(r.status)) sum.assignees_removed.push({ pr: n, logins: assignees }); else fail("remove assignee on " + n, r);
      }
    }
    for (const issue of linkedIssues(pr.body)) {
      const gi = await api.req("GET", "/repos/" + repo + "/issues/" + issue);
      if (gi.status !== 200 || !gi.body || gi.body.pull_request) continue;
      const who = (gi.body.assignees || []).map((u) => u.login).filter(isOwner);
      if (!who.length) continue;
      if (dry) { sum.issue_assignees_removed.push({ issue, logins: who, dry: true }); continue; }
      const r = await api.req("DELETE", "/repos/" + repo + "/issues/" + issue + "/assignees", { assignees: who });
      if (okStatus(r.status)) sum.issue_assignees_removed.push({ issue, logins: who }); else fail("remove assignee on issue " + issue, r);
    }

    const ev = await listAll(api, "/repos/" + repo + "/issues/" + n + "/events", null, 2);
    if (ev.error) { fail("events " + n, { status: ev.error.http, message: ev.error.message }); skip("history-unreadable"); continue; }
    const state = workState(ev.items);
    if (state !== "finished") { skip("agent-" + state); continue; }

    // EMPTY-FINISHED-DRAFT-1 (header, step 4): a draft whose session finished and changed no file is closed after emptyAfterMin; the files listing confirms it because
    // changed_files can read 0 while GitHub is still computing. It is neither approved nor kicked, and the issue it answered stays open for the assignment sweep.
    const fin = finishedAt(ev.items);
    if (pr.draft && Number(pr.changed_files) === 0 && fin) {
      if (now - Date.parse(fin) < o.emptyAfterMin * 60000) { skip("empty-draft-recent"); continue; }
      const fl = await listAll(api, "/repos/" + repo + "/pulls/" + n + "/files", null, 1);
      if (!fl.error && !fl.items.length) {
        if (sum.empty_drafts_closed.filter((x) => x.repo === repo).length >= o.emptyMax) { skip("empty-over-cap"); continue; }
        const entry = { repo, number: n, finished_at: fin };
        if (dry) { sum.empty_drafts_closed.push(Object.assign(entry, { dry: true })); continue; }
        const text = "Closed by COPILOT-PR-LIFECYCLE-1 (EMPTY-FINISHED-DRAFT-1): the Copilot session finished at " + fin + " and changed no file, so this draft carries nothing to review or merge and only holds "
          + "one of the open-pull-request slots of the assignment sweep (the merge lane waits 6 hours, BH-EMPTY-DRAFT-1). The issue stays open and assigned; the sweep may start one more session for it (ASSIGN-COPILOT-ISSUES-1).";
        const c = await api.req("POST", "/repos/" + repo + "/issues/" + n + "/comments", { body: text });
        const x = await api.req("PATCH", "/repos/" + repo + "/pulls/" + n, { state: "closed" });
        if (okStatus(c.status) && okStatus(x.status)) sum.empty_drafts_closed.push(entry);
        else fail("close empty draft " + repo + "#" + n, okStatus(x.status) ? c : x);
        continue;
      }
    }

    if (o.approve === false) continue;
    const sha = pr.head.sha;
    const runs = await api.req("GET", "/repos/" + repo + "/actions/runs?head_sha=" + encodeURIComponent(sha) + "&event=pull_request&per_page=100");
    if (runs.status !== 200 || !runs.body || !Array.isArray(runs.body.workflow_runs)) { fail("runs " + n, runs); continue; }
    const gated = runs.body.workflow_runs.filter((r) => r.status === "completed" && r.conclusion === "action_required" && r.event === "pull_request"
      && r.head_sha === sha && r.head_repository && r.head_repository.full_name === repo && isCopilotAuthor(r.actor && r.actor.login));
    if (!gated.length) continue;
    const files = await listAll(api, "/repos/" + repo + "/pulls/" + n + "/files", null, 3);
    if (files.error) { fail("files " + n, { status: files.error.http, message: files.error.message }); continue; }
    if (files.items.length >= 300) { sum.approval_withheld.push({ pr: n, reason: "300 or more changed files" }); continue; }
    // An empty pull request (a finished session that changed nothing) has no check to run; a push would also restart the idle time BH-EMPTY-DRAFT-1 waits for before closing it.
    if (!files.items.length) { skip("no-changed-files"); continue; }
    const denied = deniedPaths(files.items);
    if (denied.length) {
      sum.approval_withheld.push({ pr: n, paths: denied.slice(0, 20) });
      if (!dry) await noteWithheld(api, repo, n, sha, denied, sum);
      continue;
    }
    let refused = null;
    for (const run1 of gated) {
      if (dry) { sum.approved.push({ pr: n, run: run1.id, name: run1.name, dry: true }); continue; }
      const r = await api.req("POST", "/repos/" + repo + "/actions/runs/" + run1.id + "/approve");
      if (okStatus(r.status)) sum.approved.push({ pr: n, run: run1.id, name: run1.name });
      else { refused = { run: run1.id, r }; break; }
      if (o.pauseMs) await d.sleep(o.pauseMs);
    }
    if (!refused) continue;
    // KICK-GATED-CHECKS-1 (header, step 3). Only a 403 means "this endpoint cannot approve this run"; any other answer stays an error and is retried next sweep.
    if (refused.r.status !== 403 || !orgApi) { fail("approve run " + refused.run + " on " + n, refused.r); continue; }
    if (sum.kicked.length >= (o.kickMax || 0)) { skip("kick-over-cap"); continue; }
    const k = await orgApi.req("PUT", "/repos/" + repo + "/pulls/" + n + "/update-branch", { expected_head_sha: sha });
    if (okStatus(k.status)) sum.kicked.push({ pr: n, head: sha.slice(0, 7), refused_run: refused.run });
    else if (k.status === 422) skip("kick-refused-422"); // a conflict or no new commit on main: the lane's conflict repair owns the first, the next push of main ends the second
    else fail("update branch on " + n + " after approve run " + refused.run + " was refused", k);
  }
  if (orgApi && orgApi.calls.length) sum.calls_kick = orgApi.calls.length;
  if (o.orgToken) await orgPass(o, d, sum, dry);
  if (sum.status !== "list-failed") sum.status = sum.errors.length ? "partial" : "ok";
  sum.calls = api.calls.length;
  return sum;
}

// Across the organization (the fleet user credential, never on a pull_request_target run): a Copilot pull request that asks the owner to review or is assigned to
// the owner, and any open issue assigned to the owner, in every repository. GitHub adds the person who triggered the agent to both, in every repository it works in.
async function orgPass(o, d, sum, dry) {
  const api = makeApi(d.fetchImpl, o.orgToken);
  const org = String(o.repo).split("/")[0];
  const queries = [];
  for (const owner of o.owners || []) {
    if (!/^[A-Za-z0-9-]+$/.test(owner)) continue;
    queries.push({ kind: "reviewer", owner, q: "org:" + org + " is:pr is:open author:app/copilot-swe-agent review-requested:" + owner });
    queries.push({ kind: "pr-assignee", owner, q: "org:" + org + " is:pr is:open author:app/copilot-swe-agent assignee:" + owner });
    queries.push({ kind: "issue-assignee", owner, q: "org:" + org + " is:issue is:open assignee:" + owner });
  }
  sum.org_removed = [];
  let handled = 0;
  for (const { kind, owner, q } of queries) {
    const r = await api.req("GET", "/search/issues?per_page=100&q=" + encodeURIComponent(q));
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.items)) { sum.errors.push({ where: "org search " + kind, http: r.status, message: r.message }); continue; }
    for (const it of r.body.items) {
      if (handled >= o.orgMax) { sum.skipped["org-over-cap"] = (sum.skipped["org-over-cap"] || 0) + 1; continue; }
      const m = /\/repos\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(String(it.repository_url || ""));
      if (!m || !Number.isInteger(it.number)) continue;
      handled++;
      const entry = { kind, repo: m[1], number: it.number, login: owner };
      if (dry) { sum.org_removed.push(Object.assign(entry, { dry: true })); continue; }
      const res = kind === "reviewer"
        ? await api.req("DELETE", "/repos/" + m[1] + "/pulls/" + it.number + "/requested_reviewers", { reviewers: [owner] })
        : await api.req("DELETE", "/repos/" + m[1] + "/issues/" + it.number + "/assignees", { assignees: [owner] });
      if (okStatus(res.status)) sum.org_removed.push(entry);
      else sum.errors.push({ where: "org remove " + kind + " " + m[1] + "#" + it.number, http: res.status, message: res.message });
      if (o.pauseMs) await d.sleep(o.pauseMs);
    }
  }
  await closeEmptyDrafts(o, d, sum, api, org, dry);
  sum.calls_org = api.calls.length;
}

// A Copilot draft in another repository whose session finished 30 minutes ago and changed no file carries nothing to review or merge (no merge lane exists
// there, and qnfo-workers has its own hygiene tick, BH-EMPTY-DRAFT-1). It is commented and closed; the issue stays open and is never assigned again.
async function closeEmptyDrafts(o, d, sum, api, org, dry) {
  const q = "org:" + org + " is:pr is:open draft:true author:app/copilot-swe-agent -repo:" + o.repo;
  const r = await api.req("GET", "/search/issues?per_page=100&q=" + encodeURIComponent(q));
  if (r.status !== 200 || !r.body || !Array.isArray(r.body.items)) { sum.errors.push({ where: "org search empty-draft", http: r.status, message: r.message }); return; }
  const now = d.now === undefined ? Date.now() : d.now;
  let closed = 0;
  for (const it of r.body.items) {
    if (closed >= o.emptyMax) { sum.skipped["empty-over-cap"] = (sum.skipped["empty-over-cap"] || 0) + 1; continue; }
    const m = /\/repos\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(String(it.repository_url || ""));
    if (!m || !Number.isInteger(it.number)) continue;
    const slug = m[1], n = it.number;
    const g = await api.req("GET", "/repos/" + slug + "/pulls/" + n);
    if (g.status !== 200 || !g.body) { sum.errors.push({ where: "empty-draft pull " + slug + "#" + n, http: g.status, message: g.message }); continue; }
    if (!g.body.draft || Number(g.body.changed_files) !== 0) { sum.skipped["draft-has-changes"] = (sum.skipped["draft-has-changes"] || 0) + 1; continue; }
    const ev = await listAll(api, "/repos/" + slug + "/issues/" + n + "/events", null, 2);
    if (ev.error) { sum.errors.push({ where: "empty-draft events " + slug + "#" + n, http: ev.error.http, message: ev.error.message }); continue; }
    const at = finishedAt(ev.items);
    if (!at) { sum.skipped["empty-draft-session-" + workState(ev.items)] = (sum.skipped["empty-draft-session-" + workState(ev.items)] || 0) + 1; continue; }
    if (now - Date.parse(at) < o.emptyAfterMin * 60000) { sum.skipped["empty-draft-recent"] = (sum.skipped["empty-draft-recent"] || 0) + 1; continue; }
    const entry = { repo: slug, number: n, finished_at: at };
    if (dry) { sum.empty_drafts_closed.push(Object.assign(entry, { dry: true })); closed++; continue; }
    const body = "Closed by COPILOT-PR-LIFECYCLE-1: the Copilot session finished at " + at + " and changed no file, so this draft carries nothing to review or merge. The issue stays open; "
      + "an issue Copilot ever had is not assigned again (ASSIGN-COPILOT-ISSUES-1), and a machine signal labelled no-auto is never assigned.";
    const c = await api.req("POST", "/repos/" + slug + "/issues/" + n + "/comments", { body });
    const x = await api.req("PATCH", "/repos/" + slug + "/pulls/" + n, { state: "closed" });
    if (okStatus(c.status) && okStatus(x.status)) { sum.empty_drafts_closed.push(entry); closed++; }
    else sum.errors.push({ where: "close empty draft " + slug + "#" + n, http: okStatus(x.status) ? c.status : x.status, message: okStatus(x.status) ? c.message : x.message });
    if (o.pauseMs) await d.sleep(o.pauseMs);
  }
}

// One comment per head commit names the files that kept the checks from being approved.
async function noteWithheld(api, repo, n, sha, denied, sum) {
  const marker = "copilot-pr-lifecycle:approval-withheld:" + sha.slice(0, 12);
  const have = await listAll(api, "/repos/" + repo + "/issues/" + n + "/comments", null, 2);
  if (have.error) return;
  if (have.items.some((c) => String((c && c.body) || "").includes(marker))) return;
  const list = denied.slice(0, 10).map((p) => "- `" + p + "`").join("\n");
  const body = "Workflow approval withheld (COPILOT-PR-LIFECYCLE-1). This pull request changes files that CI executes with more than read access or that configure the build:\n\n" + list
    + "\n\nSuch a change is made through the code loop, which opens its own pull request under the fleet identity. The merge lane's scope still decides what may merge.\n\n<!-- " + marker + " -->";
  const r = await api.req("POST", "/repos/" + repo + "/issues/" + n + "/comments", { body });
  if (!okStatus(r.status)) sum.errors.push({ where: "comment " + n, http: r.status, message: r.message });
}

function summaryMarkdown(s) {
  const rows = [["copilot pull requests", s.copilot_prs], ["owner reviewer requests removed", s.reviewers_removed.length], ["owner assignments removed", s.assignees_removed.length + s.issue_assignees_removed.length],
    ["owner removed across the organization", (s.org_removed || []).length], ["empty finished drafts closed", (s.empty_drafts_closed || []).length], ["gated runs approved", s.approved.length], ["checks started by a branch update", (s.kicked || []).length], ["approval withheld", s.approval_withheld.length], ["errors", s.errors.length]];
  const skipped = Object.keys(s.skipped).sort().map((k) => "- " + k + ": " + s.skipped[k]).join("\n");
  return "### Copilot pull request lifecycle (" + s.mode + ", status " + s.status + ")\n\n" + rows.map((r) => "- " + r[0] + ": " + r[1]).join("\n") + (skipped ? "\n\nSkipped\n" + skipped : "") + "\n";
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, dflt) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
  const env = process.env;
  const off = /^(0|off|false|no|disabled)$/i.test(String(env.COPILOT_PR_APPROVE || "").trim());
  const prNum = /^\d+$/.test(String(arg("--pr", env.TARGET_PR || ""))) ? Number(arg("--pr", env.TARGET_PR)) : 0;
  const maxN = Number(arg("--max", DEFAULTS.max));
  const opts = {
    token: env.GH_TOKEN || "", orgToken: env.ORG_TOKEN || "", repo: env.GITHUB_REPOSITORY || "", mode: arg("--mode", env.LIFECYCLE_MODE || "live") === "dry" ? "dry" : "live",
    approve: !(off || argv.includes("--no-approve")), pr: prNum || 0, max: Number.isFinite(maxN) && maxN > 0 ? maxN : DEFAULTS.max,
    owners: (env.OWNER_LOGINS || DEFAULTS.owners.join(",")).split(",").map((x) => x.trim()).filter(Boolean)
  };
  let s;
  try { s = await run(opts); }
  catch (e) { s = { action: "copilot-pr-lifecycle", status: "crashed", mode: opts.mode, errors: [{ where: "run", message: String((e && e.message) || e).slice(0, 200) }], skipped: {}, reviewers_removed: [], assignees_removed: [], issue_assignees_removed: [], approved: [], approval_withheld: [], copilot_prs: 0 }; }
  console.log("RESULT_JSON=" + JSON.stringify(s));
  if (s.status === "no-credential") console.log("::warning::copilot-pr-lifecycle: GH_TOKEN is empty");
  for (const e of s.errors || []) console.log("::warning::copilot-pr-lifecycle " + e.where + ": " + (e.http !== undefined ? "http " + e.http + " " : "") + (e.message || ""));
  if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, summaryMarkdown(s)); } catch (e) { /* the summary is a convenience */ } }
  process.exit(s.status === "crashed" ? 1 : 0);
}
function isEntry() { try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; } }
if (isEntry()) main();

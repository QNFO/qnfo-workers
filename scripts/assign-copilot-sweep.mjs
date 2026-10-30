#!/usr/bin/env node
// scripts/assign-copilot-sweep.mjs: ASSIGN-COPILOT-ISSUES-1 (owner directive 2026-10-30, pillar autonomy: every new issue in every repository is
// assigned to GitHub Copilot running the Quniverse custom agent, and no issue is ever assigned to a person).
//
// WHAT   Finds the open issues created in the last N hours (default 24) in every active QNFO repository and assigns Copilot to each one that
//        has no Copilot assignee yet, with REST POST /repos/{owner}/{repo}/issues/{n}/assignees and an agent_assignment of
//        {target_repo, base_branch, custom_agent: "quniverse", custom_instructions}. Before that it publishes the agent profile at
//        organization level (QNFO/.github agents/quniverse.agent.md, byte-identical to .github/agents/quniverse.agent.md here) so that
//        custom_agent resolves in every repository and not only in this one.
// WHY    ONE CENTRAL SWEEP, NOT ONE WORKFLOW PER REPOSITORY. (1) Assigning Copilot needs a user-to-server token (GitHub docs, "Using Copilot
//        cloud agent via the API"); the workflow GITHUB_TOKEN is refused. (2) The only user credential the fleet holds is the repository
//        secret QNFO_GH_PAT of THIS repository, and CLAUDE.md forbids copying a sibling credential into other repositories. (3) An issue
//        filed with GITHUB_TOKEN (ci-watchdog) never fires an `issues` event, so only a sweep sees it. The cadence is the workflow_run chain
//        the repository already has, because the GitHub `schedule` event does not fire here (SCHEDULE-EVENT-NEVER-FIRES-1).
//        2026-10-30 measured: 40+ Copilot sessions started on qnfo-workers issues ended as empty draft pull requests titled "work claim
//        unavailable", because the cloud sandbox cannot reach qnfo-deploy-guard. INSTRUCTIONS below and the CLAUDE.md work-claim fallback
//        tell the session that an unreachable claim endpoint is an environment limit, not a refusal.
// SAFETY * Trust: only an issue whose author is OWNER, MEMBER or COLLABORATOR, or one of TRUSTED_BOTS, is assigned. A privileged agent with
//          shell and Cloudflare tools is never handed text written by a stranger on a public repository (prompt injection).
//        * No person: if the assignment call itself adds a human assignee (the token owner), that assignee is removed again. An assignee
//          that was already on the issue is never touched.
//        * No second start: an issue Copilot was ever assigned to (current assignee or any past `assigned` event) is left alone, so a
//          person's or a loop's unassign is final and a finished session is not restarted.
//        * One credential (GH_PAT_TOKEN = QNFO_GH_PAT), never printed. Per-run cap (--max). A 401 or a rate limit stops the run; a
//          refusal for one repository skips that repository's other issues. Every failure is a ::warning:: and the exit code stays 0, so a
//          failed sweep cannot file a WORKFLOW-FAILED-1 issue that the next sweep would assign again.
// USAGE  GH_PAT_TOKEN=... node scripts/assign-copilot-sweep.mjs [--hours 24] [--max 25] [--mode live|dry] [--no-agent-sync]
//        ISSUE_REPO=QNFO/x ISSUE_NUMBER=7 (set by the `issues` trigger) puts that one issue first in the run.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.github.com";
export const ORG = "QNFO";
export const AGENT = "quniverse";
export const COPILOT_BOT = "copilot-swe-agent[bot]";
export const AGENT_SOURCE = { repo: "QNFO/qnfo-workers", path: ".github/agents/quniverse.agent.md", ref: "main" };
export const AGENT_TARGET = { repo: "QNFO/.github", path: "agents/quniverse.agent.md", branch: "master" };
export const TRUSTED_ASSOCIATIONS = ["OWNER", "MEMBER", "COLLABORATOR"];
export const TRUSTED_BOTS = ["github-actions[bot]"];
export const DEFAULTS = { hours: 24, max: 25, pages: 5, pauseMs: 1000 };

// Static text only: nothing from the issue is copied into it.
export const INSTRUCTIONS = "Resolve this issue with code changes in a pull request, not with a plan or a report. Reference the issue in the pull request, run the repository's tests and linters, and mark the pull request ready for review when the work is complete. Never hand the work back to a person and never assign the issue to a user. If the work-claim service (qnfo-deploy-guard) cannot be reached from this sandbox because of the cloud-agent firewall, that is an environment limit and not a refusal: read the open pull requests and copilot/ branches through the GitHub API for the paths you will change, skip any file another open pull request changes, write 'work-claim: unreachable (<verbatim error>)' in the pull request body (CLAUDE.md, CLAIM-UNREACHABLE-FALLBACK-1), and continue. An explicit acquired:false answer from the service, a live secret lease and a HOLD: comment are still binding.";

export const isCopilot = (login) => /^(copilot|copilot-swe-agent)(\[bot\])?$/i.test(String(login || ""));

export function sinceIso(nowMs, hours) {
  return new Date(nowMs - hours * 3600000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function makeApi(fetchImpl, token) {
  const calls = [];
  return {
    calls,
    async req(method, path, body) {
      const init = { method, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "qnfo-assign-copilot-sweep" } };
      if (token) init.headers.Authorization = "Bearer " + token;
      if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
      let res, text = "";
      try { res = await fetchImpl(API + path, init); text = await res.text(); }
      catch (e) { calls.push({ method, path, status: 0 }); return { status: 0, body: null, message: "network: " + String((e && e.message) || e).slice(0, 160) }; }
      let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
      const message = res.status >= 400 ? String((j && j.message) || text || "").slice(0, 300) : "";
      calls.push({ method, path, status: res.status });
      return { status: res.status, body: j, message };
    }
  };
}

// One issue as the sweep sees it, from a search item or a single-issue read.
export function normalize(it) {
  const m = /\/repos\/([^/]+)\/([^/]+)$/.exec(String(it.repository_url || "")) || /github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\//.exec(String(it.html_url || ""));
  return {
    owner: m ? m[1] : "", repo: m ? m[2] : "", number: it.number, state: it.state, pr: !!it.pull_request,
    login: (it.user && it.user.login) || "", assoc: it.author_association || "NONE",
    assignees: (it.assignees || []).map((a) => a.login), created_at: it.created_at || ""
  };
}

export const trusted = (n) => TRUSTED_ASSOCIATIONS.includes(n.assoc) || TRUSTED_BOTS.includes(n.login);

export function agentProblems(text) {
  const out = [];
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(String(text));
  if (!m) return ["no YAML front matter"];
  if (!/^name:\s*\S/m.test(m[1])) out.push("front matter has no name");
  if (!/^description:\s*\S/m.test(m[1])) out.push("front matter has no description");
  if (String(text).length > 30000) out.push("profile is longer than the 30000 characters GitHub allows");
  if (/(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{16,}/.test(text)) out.push("profile contains a GitHub token");
  return out;
}

async function getFile(api, repo, path, ref) {
  const r = await api.req("GET", "/repos/" + repo + "/contents/" + path + "?ref=" + encodeURIComponent(ref));
  if (r.status === 200 && r.body && typeof r.body.content === "string") return { ok: true, sha: r.body.sha, content: r.body.content.replace(/\n/g, "") };
  return { ok: false, status: r.status, message: r.message };
}

// Publishes the agent profile at organization level when it is missing or differs (blob sha), never when the source is unreadable or invalid.
export async function syncOrgAgent(api, dry) {
  const src = await getFile(api, AGENT_SOURCE.repo, AGENT_SOURCE.path, AGENT_SOURCE.ref);
  if (!src.ok) return { status: "source-unreadable", http: src.status, message: src.message };
  const problems = agentProblems(Buffer.from(src.content, "base64").toString("utf8"));
  if (problems.length) return { status: "source-invalid", problems };
  const dst = await getFile(api, AGENT_TARGET.repo, AGENT_TARGET.path, AGENT_TARGET.branch);
  if (dst.ok && dst.sha === src.sha) return { status: "in-sync", sha: src.sha };
  if (!dst.ok && dst.status !== 404) return { status: "target-unreadable", http: dst.status, message: dst.message };
  if (dry) return { status: dst.ok ? "would-update" : "would-create", sha: src.sha };
  const body = { message: "Sync the Quniverse agent from " + AGENT_SOURCE.repo + " " + src.sha.slice(0, 7) + " (ASSIGN-COPILOT-ISSUES-1)", content: src.content, branch: AGENT_TARGET.branch };
  if (dst.ok) body.sha = dst.sha;
  const w = await api.req("PUT", "/repos/" + AGENT_TARGET.repo + "/contents/" + AGENT_TARGET.path, body);
  if (w.status === 200 || w.status === 201) return { status: dst.ok ? "updated" : "created", sha: src.sha };
  return { status: "write-refused", http: w.status, message: w.message };
}

async function searchNew(api, org, since, pages) {
  const q = "org:" + org + " is:issue is:open archived:false created:>=" + since;
  const items = [];
  for (let page = 1; page <= pages; page++) {
    const r = await api.req("GET", "/search/issues?q=" + encodeURIComponent(q) + "&sort=created&order=asc&per_page=100&page=" + page);
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.items)) return { items, error: { http: r.status, message: r.message } };
    items.push(...r.body.items);
    if (r.body.items.length < 100) break;
  }
  return { items };
}

const stopsRun = (r) => r.status === 401 || (r.status === 403 && /rate limit|abuse/i.test(r.message)) || r.status === 429;

export async function run(opts, deps) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  const d = Object.assign({ fetchImpl: fetch, now: Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), env: process.env }, deps || {});
  const dry = o.mode === "dry";
  const sum = { action: "assign-copilot-sweep", mode: dry ? "dry" : "live", agent: AGENT, hours: o.hours, max: o.max, considered: 0, assigned: 0, skipped: {}, deferred: 0, errors: [], agent_sync: null, credential: o.token ? "QNFO_GH_PAT" : "none" };
  const skip = (why, n) => { sum.skipped[why] = (sum.skipped[why] || 0) + 1; if (n) sum.skipped_items = (sum.skipped_items || []).concat(n.owner + "/" + n.repo + "#" + n.number + " " + why).slice(0, 40); };
  if (!o.token) { sum.status = "no-credential"; sum.note = "the repository secret QNFO_GH_PAT is empty or unset: assigning Copilot needs a user token, the workflow GITHUB_TOKEN is refused"; return sum; }
  const api = makeApi(d.fetchImpl, o.token);
  if (o.agentSync !== false) sum.agent_sync = await syncOrgAgent(api, dry);

  const candidates = [];
  if (o.priority) {
    const r = await api.req("GET", "/repos/" + o.priority.repo + "/issues/" + o.priority.number);
    if (r.status === 200 && r.body) candidates.push(normalize(r.body));
    else sum.errors.push({ where: "priority " + o.priority.repo + "#" + o.priority.number, http: r.status, message: r.message });
  }
  const found = await searchNew(api, o.org || ORG, sinceIso(d.now, o.hours), o.pages);
  if (found.error) sum.errors.push({ where: "search", http: found.error.http, message: found.error.message });
  const seen = new Set(candidates.map((n) => n.owner + "/" + n.repo + "#" + n.number));
  for (const it of found.items) { const n = normalize(it); const k = n.owner + "/" + n.repo + "#" + n.number; if (!seen.has(k)) { seen.add(k); candidates.push(n); } }
  // The issue that fired the run goes first, then the rest oldest first so a backlog drains in the order it arrived.
  const isPriority = (n) => !!o.priority && n.owner + "/" + n.repo === o.priority.repo && n.number === o.priority.number;
  const ordered = candidates.filter(isPriority).concat(candidates.filter((n) => !isPriority(n)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));

  const repos = new Map(), refused = new Set();
  let attempts = 0, stopped = false;
  for (const n of ordered) {
    if (stopped) break;
    sum.considered++;
    if (n.pr) { skip("pull-request", n); continue; }
    if (n.state !== "open") { skip("not-open", n); continue; }
    if (n.assignees.some(isCopilot)) { skip("already-assigned", n); continue; }
    if (!trusted(n)) { skip("untrusted-author", n); continue; }
    const slug = n.owner + "/" + n.repo;
    if (refused.has(slug)) { skip("repo-refused", n); continue; }
    if (!repos.has(slug)) {
      const r = await api.req("GET", "/repos/" + slug);
      repos.set(slug, r.status === 200 && r.body ? { ok: true, branch: r.body.default_branch, archived: !!r.body.archived, disabled: !!r.body.disabled } : { ok: false, http: r.status, message: r.message });
    }
    const info = repos.get(slug);
    if (!info.ok) { skip("repo-unreadable", n); sum.errors.push({ where: slug, http: info.http, message: info.message }); continue; }
    if (info.archived || info.disabled) { skip("repo-archived", n); continue; }
    const ev = await api.req("GET", "/repos/" + slug + "/issues/" + n.number + "/events?per_page=100");
    if (ev.status !== 200 || !Array.isArray(ev.body)) { skip("history-unreadable", n); continue; }
    if (ev.body.some((e) => e.event === "assigned" && e.assignee && isCopilot(e.assignee.login))) { skip("previously-assigned", n); continue; }
    if (attempts >= o.max) { sum.deferred++; continue; }
    if (dry) { attempts++; (sum.would_assign = sum.would_assign || []).push(slug + "#" + n.number); continue; }
    attempts++;
    const body = { assignees: [COPILOT_BOT], agent_assignment: { target_repo: slug, base_branch: info.branch, custom_agent: AGENT, custom_instructions: INSTRUCTIONS } };
    const r = await api.req("POST", "/repos/" + slug + "/issues/" + n.number + "/assignees", body);
    const now = r.body && Array.isArray(r.body.assignees) ? r.body.assignees.map((a) => a.login) : [];
    if ((r.status === 200 || r.status === 201) && now.some(isCopilot)) {
      sum.assigned++;
      (sum.assigned_items = sum.assigned_items || []).push(slug + "#" + n.number);
      const added = now.filter((l) => !isCopilot(l) && !n.assignees.includes(l));
      if (added.length) {
        const u = await api.req("DELETE", "/repos/" + slug + "/issues/" + n.number + "/assignees", { assignees: added });
        (sum.person_removed = sum.person_removed || []).push({ issue: slug + "#" + n.number, logins: added, http: u.status });
      }
    } else {
      sum.errors.push({ where: slug + "#" + n.number, http: r.status, message: r.status === 200 || r.status === 201 ? "the answer does not list Copilot as an assignee" : r.message });
      if (stopsRun(r)) { stopped = true; sum.stopped = "http " + r.status + ": " + r.message; }
      else if (r.status === 401 || r.status === 403 || r.status === 404) refused.add(slug);
    }
    if (o.pauseMs) await d.sleep(o.pauseMs);
  }
  sum.status = sum.stopped ? "stopped" : sum.errors.length ? "partial" : "ok";
  sum.calls = api.calls.length;
  return sum;
}

function summaryMarkdown(s) {
  const rows = [["assigned", s.assigned], ["considered", s.considered], ["deferred over the cap", s.deferred], ["errors", s.errors.length]];
  const skipped = Object.keys(s.skipped).sort().map((k) => "- " + k + ": " + s.skipped[k]).join("\n");
  return "### Assign Copilot to new issues (" + s.mode + ", agent " + s.agent + ", status " + s.status + ")\n\n" + rows.map((r) => "- " + r[0] + ": " + r[1]).join("\n") + (skipped ? "\n\nSkipped\n" + skipped : "") + (s.agent_sync ? "\n\nOrganization agent: " + s.agent_sync.status : "") + "\n";
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, dflt) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
  const num = (v, dflt) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : dflt; };
  const env = process.env;
  const opts = { token: env.GH_PAT_TOKEN || "", hours: num(arg("--hours"), DEFAULTS.hours), max: num(arg("--max"), DEFAULTS.max), mode: arg("--mode", "live") === "dry" ? "dry" : "live", agentSync: !argv.includes("--no-agent-sync") };
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.ISSUE_REPO || "") && /^\d+$/.test(env.ISSUE_NUMBER || "")) opts.priority = { repo: env.ISSUE_REPO, number: Number(env.ISSUE_NUMBER) };
  let s;
  try { s = await run(opts); }
  catch (e) { s = { action: "assign-copilot-sweep", status: "crashed", considered: 0, assigned: 0, skipped: {}, deferred: 0, errors: [{ where: "run", message: String((e && e.message) || e).slice(0, 200) }], mode: opts.mode, agent: AGENT }; }
  console.log("RESULT_JSON=" + JSON.stringify(s));
  if (s.status === "no-credential") console.log("::warning::assign-copilot-sweep: " + s.note);
  for (const e of s.errors || []) console.log("::warning::assign-copilot-sweep " + e.where + ": " + (e.http !== undefined ? "http " + e.http + " " : "") + (e.message || ""));
  if (s.agent_sync && /refused|unreadable|invalid/.test(s.agent_sync.status)) console.log("::warning::assign-copilot-sweep organization agent: " + JSON.stringify(s.agent_sync));
  if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, summaryMarkdown(s)); } catch (e) { /* the summary is a convenience */ } }
  process.exit(0);
}
function isEntry() { try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; } }
if (isEntry()) main();

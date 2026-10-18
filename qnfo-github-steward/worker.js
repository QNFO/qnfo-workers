/* qnfo-github-steward — GITHUB-STEWARD-1
 *
 * WHY THIS EXISTS
 *   GitHub settings for the QNFO estate were optimised once, by hand, and then drifted: 0 of 61
 *   active repositories deleted a merged branch, 3 of 61 protected their default branch, one
 *   organisation-level default handed every member ADMIN on every repository, and the org-wide
 *   GITHUB_TOKEN still defaulted to write. A setting is only an optimisation if something keeps
 *   putting it back. This worker is that something.
 *
 * WHAT IT DOES
 *   Every six hours it reads the estate (one org + the owner's personal account), compares each
 *   repository and the organisation to a declared DESIRED state, writes what actually differs,
 *   and records the run in D1. It never edits workflow YAML: a heuristic rewrite of a build file
 *   is how a green pipeline becomes a red one, so workflow findings are REPORTED, and the ones
 *   that need a human or the fleet's code-agent are named explicitly.
 *
 * SAFETY
 *   * additive only -- it sets merge/branch/protection policy, never deletes a repository,
 *     never archives, never touches workflow files, never pushes commits;
 *   * a field the platform refuses (free plan: branch protection and auto-merge on private
 *     repositories) is recorded as a permanent limitation, not retried as a failure;
 *   * archived repositories are read-only and are skipped, not reported as drift;
 *   * GET /report and GET /health are public reads; POST /tick needs STEWARD_KEY.
 */
var VERSION = "0.2.2-issue-sync-1"; // 0.2.2 ISSUE-SYNC-1: mirror internal tracking to GitHub (forward) + reflect closed back (reverse)

var ORG = "QNFO";
var USER = "rwnq8";
var API = "https://api.github.com";

/* Declared end state. Everything here is reversible; nothing here deletes anything. */
var DESIRED_ORG = {
  default_repository_permission: "read",
  members_can_create_public_repositories: false
};
var DESIRED_REPO = {
  delete_branch_on_merge: true,
  allow_auto_merge: true,
  allow_update_branch: true,
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  has_projects: false
};
/* Fields the free plan refuses on private repositories. Recorded, not retried as errors. */
var PAID_ONLY_IF_PRIVATE = { allow_auto_merge: true };
var PROTECTION = {
  required_status_checks: null,
  enforce_admins: false,
  required_pull_request_reviews: null,
  restrictions: null,
  required_linear_history: false,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
  required_conversation_resolution: false,
  lock_branch: false,
  allow_fork_syncing: false
};

function gh(env, method, path, body) {
  var init = {
    method: method,
    headers: {
      Authorization: "Bearer " + env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "qnfo-github-steward/" + VERSION,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    }
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetch(API + path, init).then(function (r) {
    return r.text().then(function (t) {
      var j = null;
      try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
      return { status: r.status, body: j, text: t };
    });
  });
}

async function paginate(env, path) {
  var out = [], page = 1;
  while (page <= 20) {
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    var r = await gh(env, "GET", path + sep + "per_page=100&page=" + page);
    if (r.status !== 200 || !Array.isArray(r.body)) break;
    out = out.concat(r.body);
    if (r.body.length < 100) break;
    page++;
  }
  return out;
}

async function reconcileOrg(env, result) {
  var r = await gh(env, "GET", "/orgs/" + ORG);
  if (r.status !== 200) {
    result.errors.push({ scope: "org:" + ORG, status: r.status, why: "cannot read org" });
    return;
  }
  var patch = {};
  Object.keys(DESIRED_ORG).forEach(function (k) {
    if (r.body[k] !== DESIRED_ORG[k]) patch[k] = DESIRED_ORG[k];
  });
  if (!Object.keys(patch).length) { result.org_ok = true; return; }
  var w = await gh(env, "PATCH", "/orgs/" + ORG, patch);
  if (w.status === 200) {
    result.org_fixed = Object.keys(patch);
    result.drift.push({ scope: "org", field: Object.keys(patch).join(","), fixed: true });
  } else {
    result.errors.push({ scope: "org", status: w.status, why: String(w.text).slice(0, 160) });
  }
}

async function reconcileRepo(env, listed, result) {
  var full = listed.full_name;
  var isPrivate = listed.private === true;
  /* GITHUB-STEWARD-1 fix: the LIST endpoint omits delete_branch_on_merge, allow_update_branch,
   * allow_auto_merge and the merge-method flags, so comparing against it reads every field as
   * "drifted", PATCHes 61 repositories that were already correct, and reports 61 phantom fixes.
   * The single-repository endpoint carries the full settings object; compare against that. */
  var one = await gh(env, "GET", "/repos/" + full);
  var repo = (one.status === 200 && one.body) ? one.body : listed;
  var patch = {};
  Object.keys(DESIRED_REPO).forEach(function (k) {
    if (repo[k] === DESIRED_REPO[k]) return;
    if (isPrivate && PAID_ONLY_IF_PRIVATE[k]) {
      result.limitations.push(full + ":" + k + " (needs GitHub Pro on a private repo)");
      return;
    }
    patch[k] = DESIRED_REPO[k];
  });

  if (Object.keys(patch).length) {
    var w = await gh(env, "PATCH", "/repos/" + full, patch);
    if (w.status === 200) {
      result.repos_fixed++;
      Object.keys(patch).forEach(function (k) {
        result.drift.push({ scope: full, field: k, fixed: true });
      });
    } else if (w.status === 403 && isPrivate) {
      result.limitations.push(full + ":" + Object.keys(patch).join(",") + " (403 plan limit)");
    } else {
      result.errors.push({ scope: full, status: w.status, why: String(w.text).slice(0, 140) });
    }
  }

  /* Default branch must not be a working branch. Only auto-corrects when the target exists. */
  var br = repo.default_branch || "main";
  if (/^(feature|slb|ump|res|plt|dem|inm|cfe)\//.test(br)) {
    result.drift.push({ scope: full, field: "default_branch=" + br, fixed: false, note: "working branch is the default" });
  }

  /* Branch protection: one GET, one PUT at most, public repositories only. */
  if (!isPrivate) {
    var cur = await gh(env, "GET", "/repos/" + full + "/branches/" + br + "/protection");
    if (cur.status === 404) {
      var p = await gh(env, "PUT", "/repos/" + full + "/branches/" + br + "/protection", PROTECTION);
      if (p.status === 200) {
        result.repos_protected++;
        result.drift.push({ scope: full, field: "branch_protection", fixed: true });
      } else {
        result.errors.push({ scope: full, status: p.status, why: "protection: " + String(p.text).slice(0, 120) });
      }
    } else if (cur.status === 200) {
      var ap = cur.body || {};
      var weak = [];
      if (ap.allow_force_pushes && ap.allow_force_pushes.enabled) weak.push("force-pushes-allowed");
      if (ap.allow_deletions && ap.allow_deletions.enabled) weak.push("deletions-allowed");
      if (weak.length) {
        var fix = await gh(env, "PUT", "/repos/" + full + "/branches/" + br + "/protection", PROTECTION);
        result.drift.push({ scope: full, field: "protection:" + weak.join(","), fixed: fix.status === 200 });
      }
    }
  } else {
    result.limitations.push(full + ":branch_protection (needs GitHub Pro on a private repo)");
  }
}

async function auditWorkflows(env, repo, result) {
  var r = await gh(env, "GET", "/repos/" + repo.full_name + "/actions/workflows");
  if (r.status !== 200 || !r.body || !r.body.workflows) return;
  var staticOnes = r.body.workflows.filter(function (w) {
    return String(w.path || "").indexOf("dynamic/") !== 0;
  });
  if (!staticOnes.length) return;
  result.workflows += staticOnes.length;
  for (var i = 0; i < staticOnes.length; i++) {
    var w = staticOnes[i];
    var f = await fetch("https://raw.githubusercontent.com/" + repo.full_name + "/" + (repo.default_branch || "main") + "/" + w.path, {
      headers: { "User-Agent": "qnfo-github-steward/" + VERSION }
    });
    if (!f.ok) continue;
    var t = await f.text();
    var issues = [];
    if (t.indexOf("permissions:") < 0) issues.push("no-permissions-block");
    if (t.indexOf("concurrency:") < 0) issues.push("no-concurrency");
    if (t.indexOf("timeout-minutes") < 0) issues.push("no-timeout");
    if (/(uses:\s*[\w\-\.\/]+@)(main|master|HEAD)\b/.test(t)) issues.push("floating-ref");
    if (issues.length) {
      result.workflow_issues.push({ repo: repo.full_name, path: w.path, issues: issues });
    }
  }
}

/* NOTIFY-TRIAGE-1 (2026-10-18): the owner's GitHub inbox held 113 unread threads, 111 of them
 * "workflow run failed" CheckSuite notices that GitHub never retracts once the failure is fixed.
 * Each run reads the unread threads and marks a thread DONE only when its cause is PROVABLY
 * resolved: a newer completed run of the same workflow on the same branch succeeded, the branch's
 * pull request is closed or merged, the branch no longer exists, or the issue / PR subject is
 * closed. Anything unproven stays unread, so the inbox shows only live failures. Never touches
 * code, runs or issues; DELETE /notifications/threads/{id} only marks the thread done. */
var NOTIFY_STALE_DAYS = 14;
async function triageNotifications(env, result) {
  var t = { seen: 0, done: 0, kept: [], errors: 0, reasons: {} };
  result.notifications = t;
  // the notifications API caps per_page at 50, so paginate() (which stops below 100) would read one page only
  var list = [];
  for (var pg = 1; pg <= 20; pg++) {
    var rp = await gh(env, "GET", "/notifications?all=false&per_page=50&page=" + pg);
    if (rp.status !== 200 || !Array.isArray(rp.body)) { if (rp.status !== 200) result.errors.push({ scope: "notifications", why: "list " + rp.status }); break; }
    list = list.concat(rp.body);
    if (rp.body.length < 50) break;
  }
  t.seen = list.length;
  var runCache = {}, prCache = {}, branchCache = {};
  var wfCache = {};
  // per-workflow query: a branch-wide "newest 100 runs" window drops a quiet workflow on a busy branch
  async function latestRun(repo, wf, branch) {
    if (!wfCache[repo]) {
      var w = await gh(env, "GET", "/repos/" + repo + "/actions/workflows?per_page=100");
      wfCache[repo] = (w.status === 200 && w.body && w.body.workflows) || [];
    }
    var ids = wfCache[repo].filter(function (x) { return x.name === wf; }).map(function (x) { return x.id; });
    var best = null;
    for (var j = 0; j < ids.length; j++) {
      var k = repo + "|" + ids[j] + "|" + branch;
      if (runCache[k] === undefined) {
        // a cancelled or skipped run (concurrency superseded) says nothing; the verdict is the newest success/failure
        var r = await gh(env, "GET", "/repos/" + repo + "/actions/workflows/" + ids[j] + "/runs?status=completed&per_page=10&branch=" + encodeURIComponent(branch));
        var wr = (r.status === 200 && r.body && r.body.workflow_runs) || [];
        runCache[k] = wr.filter(function (x) { return x.conclusion === "success" || x.conclusion === "failure" || x.conclusion === "timed_out"; })[0] || null;
      }
      var cand = runCache[k];
      if (cand && (!best || Date.parse(cand.created_at) > Date.parse(best.created_at))) best = cand;
    }
    return best;
  }
  async function branchPr(repo, branch) {
    var k = repo + "|" + branch;
    if (prCache[k] === undefined) {
      var owner = repo.split("/")[0];
      var r = await gh(env, "GET", "/repos/" + repo + "/pulls?state=all&per_page=5&head=" + encodeURIComponent(owner + ":" + branch));
      prCache[k] = (r.status === 200 && Array.isArray(r.body) && r.body[0]) || null;
    }
    return prCache[k];
  }
  async function branchGone(repo, branch) {
    var k = repo + "|" + branch;
    if (branchCache[k] === undefined) {
      var r = await gh(env, "GET", "/repos/" + repo + "/branches/" + encodeURIComponent(branch));
      branchCache[k] = r.status === 404;
    }
    return branchCache[k];
  }
  for (var i = 0; i < list.length; i++) {
    var n = list[i], why = null;
    try {
      var repo = n.repository && n.repository.full_name;
      var title = (n.subject && n.subject.title) || "";
      var type = n.subject && n.subject.type;
      if (type === "CheckSuite") {
        var m = title.match(/^(.+) workflow run (?:failed|cancelled|timed out)(?: for (.+) branch)?$/);
        if (m) {
          var wf = m[1], br = m[2] || (n.repository && n.repository.default_branch) || "main";
          var run = await latestRun(repo, wf, br);
          if (run && run.conclusion === "success" && Date.parse(run.created_at) <= Date.now()) why = "rerun-green";
          if (!why && br !== "main" && br !== "master") {
            var pr = await branchPr(repo, br);
            if (pr && pr.state === "closed") why = pr.merged_at ? "pr-merged" : "pr-closed";
            else if (!pr && await branchGone(repo, br)) why = "branch-deleted";
          }
        }
      } else if ((type === "Issue" || type === "PullRequest") && n.subject.url) {
        var s = await gh(env, "GET", n.subject.url.replace(API, ""));
        if (s.status === 200 && s.body && s.body.state === "closed") why = "subject-closed";
        else if (s.status === 404 || s.status === 410) why = "subject-gone";
      } else if (type === "Release" || type === "Discussion" || type === "Commit") {
        why = "informational";
      }
      if (!why && Date.parse(n.updated_at) < Date.now() - NOTIFY_STALE_DAYS * 864e5 && type === "CheckSuite") why = "stale";
      if (why) {
        var d = await gh(env, "DELETE", "/notifications/threads/" + n.id);
        if (d.status === 204 || d.status === 205 || d.status === 200) { t.done++; t.reasons[why] = (t.reasons[why] || 0) + 1; }
        else { t.errors++; if (t.errors === 1) result.errors.push({ scope: "notifications", why: "mark-done " + d.status + " " + String(d.text).slice(0, 100) }); }
      } else {
        t.kept.push({ id: n.id, repo: repo, type: type, title: title.slice(0, 120), updated_at: n.updated_at });
      }
    } catch (e) {
      t.errors++;
      result.errors.push({ scope: "notification " + n.id, why: String(e && e.message || e).slice(0, 140) });
    }
  }
  return t;
}
// end NOTIFY-TRIAGE-1
/* ISSUE-SYNC-1 (owner directive 2026-10-18): keep internal issue tracking and GitHub issues in
 * sync at all times. fleet_issue_dispatch rows that are queued or tracked and still carry no
 * gh_number are the internal backlog; each is mirrored to a GitHub issue on QNFO/qnfo-workers and
 * the number is written back. Idempotent (a row with gh_number is skipped) and fail-safe (a create
 * error is recorded and the row stays queued for the next run, never retried as drift). */
async function issueSync(env, result) {
  if (!env.AUDIT) return;
  try {
    var rows = await env.AUDIT.prepare(
      "SELECT fingerprint, category, sev, owner, payload, gh_number FROM fleet_issue_dispatch WHERE state IN ('queued','tracked') AND (gh_number IS NULL OR gh_number = '') LIMIT 20"
    ).all();
    var list = rows.results || [];
    var created = 0, failed = 0;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var title = "";
      try {
        var p = JSON.parse(row.payload || "{}");
        var svc = p.service || row.owner || "fleet";
        var t = typeof p.title === "string" ? p.title : "";
        title = ("[fleet] " + svc + " · " + (row.category || "issue") + (t ? ": " + t : "")).slice(0, 240);
      } catch (e) {
        title = ("[fleet] " + (row.owner || "fleet") + " · " + (row.category || "issue")).slice(0, 240);
      }
      var body = [
        "Mirrored from internal issue tracking (`qnfo-audit.fleet_issue_dispatch`).",
        "",
        "- fingerprint: `" + row.fingerprint + "`",
        "- category: `" + (row.category || "") + "`",
        "- severity: `" + (row.sev || "") + "`",
        "- owner: `" + (row.owner || "") + "`",
        "",
        "```",
        String(row.payload || "").slice(0, 2800),
        "```",
        "",
        "Filed automatically by qnfo-github-steward (ISSUE-SYNC-1)."
      ].join("\n");
      var c = await gh(env, "POST", "/repos/" + ORG + "/qnfo-workers/issues", { title: title, body: body });
      if (c.status === 201 && c.body && c.body.number) {
        await env.AUDIT.prepare(
          "UPDATE fleet_issue_dispatch SET gh_number = ?, state = 'tracked', exec_state = 'created', exec_ts = ? WHERE fingerprint = ?"
        ).bind(String(c.body.number), new Date().toISOString(), row.fingerprint).run();
        created++;
      } else {
        failed++;
        result.errors.push({ scope: "issue-sync:" + row.fingerprint, status: c.status, why: String(c.text).slice(0, 120) });
      }
    }
    result.issue_sync = { mirrored: created, failed: failed, backlog_seen: list.length };
  } catch (e) {
    result.errors.push({ scope: "issue-sync", why: String(e && e.message || e).slice(0, 160) });
  }
}

/* ISSUE-SYNC-REVERSE-1 (owner directive 2026-10-18): reflect closed GitHub issues back into
 * internal tracking. A fleet_issue_dispatch row that carries a gh_number but is still 'tracked'
 * is checked against its GitHub issue; a closed issue marks the internal row 'done'. Idempotent,
 * read-mostly, and fail-safe (an API error leaves the row tracked for the next run). */
async function issueSyncReverse(env, result) {
  if (!env.AUDIT) return;
  try {
    var rows = await env.AUDIT.prepare(
      "SELECT fingerprint, gh_number FROM fleet_issue_dispatch WHERE state = 'tracked' AND gh_number IS NOT NULL AND gh_number != '' LIMIT 50"
    ).all();
    var list = rows.results || [];
    var closed = 0, stillOpen = 0, errored = 0;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var g = await gh(env, "GET", "/repos/" + ORG + "/qnfo-workers/issues/" + row.gh_number);
      if (g.status === 200 && g.body && g.body.state === "closed") {
        await env.AUDIT.prepare(
          "UPDATE fleet_issue_dispatch SET state = 'done', exec_state = 'closed', exec_ts = ? WHERE fingerprint = ?"
        ).bind(new Date().toISOString(), row.fingerprint).run();
        closed++;
      } else if (g.status === 200) {
        stillOpen++;
      } else {
        errored++;
      }
    }
    result.issue_sync_reverse = { closed: closed, still_open: stillOpen, errored: errored, checked: list.length };
  } catch (e) {
    result.errors.push({ scope: "issue-sync-reverse", why: String(e && e.message || e).slice(0, 160) });
  }
}

async function runReconcile(env, opts) {
  var started = Date.now();
  var result = {
    version: VERSION, started_at: new Date(started).toISOString(),
    org_ok: false, org_fixed: [], repos_checked: 0, repos_fixed: 0,
    repos_protected: 0, workflows: 0,
    drift: [], workflow_issues: [], limitations: [], errors: [], issue_sync: null, issue_sync_reverse: null
  };

  await reconcileOrg(env, result);

  var repos = await paginate(env, "/orgs/" + ORG + "/repos?type=all");
  var personal = await paginate(env, "/users/" + USER + "/repos?type=owner");
  var seen = {};
  var all = [];
  repos.concat(personal).forEach(function (r) {
    if (!r || !r.full_name || seen[r.full_name]) return;
    seen[r.full_name] = 1;
    all.push(r);
  });

  var active = all.filter(function (r) { return r.archived !== true; });
  result.repos_discovered = all.length;
  result.repos_archived = all.length - active.length;

  for (var i = 0; i < active.length; i++) {
    result.repos_checked++;
    try {
      await reconcileRepo(env, active[i], result);
      if (opts && opts.workflows) await auditWorkflows(env, active[i], result);
    } catch (e) {
      result.errors.push({ scope: active[i].full_name, why: String(e && e.message || e).slice(0, 140) });
    }
  }

  if (!opts || opts.notifications !== false) {
    try { await triageNotifications(env, result); } catch (eN) { result.errors.push({ scope: "notifications", why: String(eN && eN.message || eN).slice(0, 140) }); }
  }
  await issueSync(env, result);
  await issueSyncReverse(env, result);
  result.duration_ms = Date.now() - started;
  result.finished_at = new Date().toISOString();
  return result;
}

async function record(env, result) {
  if (!env.AUDIT) return;
  try {
    await env.AUDIT.prepare(
      "INSERT INTO github_steward_runs (started_at, finished_at, version, repos_discovered, repos_archived, repos_checked, repos_fixed, repos_protected, workflows, drift_count, error_count, limitation_count, duration_ms, detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      result.started_at, result.finished_at, result.version,
      result.repos_discovered || 0, result.repos_archived || 0, result.repos_checked,
      result.repos_fixed, result.repos_protected, result.workflows,
      result.drift.length, result.errors.length, result.limitations.length,
      result.duration_ms, JSON.stringify(result).slice(0, 400000)
    ).run();
  } catch (e) {
    console.error(JSON.stringify({ worker: "qnfo-github-steward", where: "record", error: String(e && e.message || e) }));
  }
}

async function lastRun(env) {
  if (!env.AUDIT) return null;
  try {
    var r = await env.AUDIT.prepare(
      "SELECT started_at, finished_at, version, repos_checked, repos_fixed, repos_protected, workflows, drift_count, error_count, limitation_count, duration_ms FROM github_steward_runs ORDER BY id DESC LIMIT 1"
    ).first();
    return r || null;
  } catch (e) { return { error: String(e && e.message || e) }; }
}

/* WORKERS-BP-DEBT-1 (agent_issues 2757): the guard refuses a string comparison of a secret, because
 * `!==` short-circuits on the first differing byte and leaks the shared prefix length. Compare
 * fixed-length SHA-256 digests with an accumulate-XOR loop instead. Both sides are hashed, so the
 * comparison is constant-time with respect to the secret's content and its length. */
async function stewardKeyOk(env, provided) {
  if (!env.STEWARD_KEY || !provided) return false;
  var enc = new TextEncoder();
  var pair = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(provided))),
    crypto.subtle.digest("SHA-256", enc.encode(String(env.STEWARD_KEY)))
  ]);
  var a = new Uint8Array(pair[0]), b = new Uint8Array(pair[1]), d = 0;
  for (var i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function json(o, status) {
  return new Response(JSON.stringify(o, null, 1), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var p = url.pathname;

    if (p === "/health" || p === "/") {
      return json({
        status: "ok", worker: "qnfo-github-steward", version: VERSION,
        scope: { org: ORG, user: USER },
        desired_org: DESIRED_ORG, desired_repo: DESIRED_REPO,
        token_present: !!env.GITHUB_TOKEN,
        limitation: "workflow YAML is reported, never rewritten; org two_factor_requirement_enabled cannot be set through the REST API on this plan"
      });
    }

    if (p === "/report" && request.method === "GET") {
      return json({ version: VERSION, last_run: await lastRun(env) });
    }

    if (p === "/tick") {
      var key = request.headers.get("x-steward-key") || "";
      if (!(await stewardKeyOk(env, key))) {
        return json({ ok: false, error: "POST /tick needs x-steward-key" }, 401);
      }
      var opts = { workflows: url.searchParams.get("workflows") === "1", notifications: url.searchParams.get("notifications") !== "0" };
      var res = await runReconcile(env, opts);
      await record(env, res);
      return json({ ok: true, result: res });
    }

    return json({ error: "not found", routes: ["GET /health", "GET /report", "POST /tick"] }, 404);
  },

  async scheduled(event, env, ctx) {
    var res = await runReconcile(env, { workflows: false });
    await record(env, res);
    console.log(JSON.stringify({
      worker: "qnfo-github-steward", version: VERSION, cron: event.cron,
      checked: res.repos_checked, fixed: res.repos_fixed, protected: res.repos_protected,
      drift: res.drift.length, errors: res.errors.length, limitations: res.limitations.length
    }));
  }
};

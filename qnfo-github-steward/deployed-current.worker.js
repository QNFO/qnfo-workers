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
var VERSION = "0.4.6-portfolio-heartbeat"; // 0.4.6 PORTFOLIO-HEARTBEAT-1 (2026-10-18): publish the portfolio run as in_progress BEFORE the work, so a tick killed by the CPU budget is distinguishable from a record that was never writtenIVENESS-1 (2026-10-18): this worker, on its own 10-minute cron and outside the qnfo-code-orchestrator process, reads the freshest fleet_crons.last_fired and files liveness:dispatcher-stalled when the per-minute dispatcher has been quiet for over 20 minutes -- the one stall no watchdog inside that failure domain can report, because NEVER-STALL-1 is itself a fleet_cron dispatched by the tick it would be reporting on. // 0.4.4 NOTIFY-ATTEMPT-TITLE-1 (2026-10-18): a re-run notification title ("workflow run, Attempt #2 failed") is parsed like the first attempt, so its resolved thread is cleared (three were kept at 10:52Z). // 0.4.3 TRACKER-SYNC-1: stale pr-without-task rows are cleared every tick; a merge fix reads merged_by from the single PR; 0.4.2 TRACKER-SYNC-1: the recent-PR window is a deliberate partial read (every post-backfill tick refused it); 0.4.1 org projects declared on (the portfolio board needs them); 0.4.0 PORTFOLIO-SYNC-1: projects derived from the census, metric breaches as roadmap objectives, programs/projects/issues/roadmap mirrored to GitHub labels, milestones, issues and a Projects board every 10 minutes; 0.3.1 a task is matched to its PR by number too (pr-without-task false positive on PR 381); 0.3.0 TRACKER-SYNC-1: agent_issues <-> GitHub issues and code_tasks <-> PRs every 10 minutes (0.2.2 ISSUE-SYNC-1)

var ORG = "QNFO";
var USER = "rwnq8";
var API = "https://api.github.com";

/* Declared end state. Everything here is reversible; nothing here deletes anything. */
var DESIRED_ORG = {
  default_repository_permission: "read",
  members_can_create_public_repositories: false,
  /* PORTFOLIO-SYNC-1: the org Projects (v2) board "QNFO Fleet Portfolio" needs organization projects enabled; with it off,
   * createProjectV2 fails with a bare "Something went wrong" (measured 2026-10-18 10:11Z and 10:15Z). */
  has_organization_projects: true
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
        // NOTIFY-ATTEMPT-TITLE-1: a re-run reads "<wf> workflow run, Attempt #2 failed for <b> branch"
        var m = title.match(/^(.+) workflow run(?:, Attempt #\d+)? (?:failed|cancelled|timed out)(?: for (.+) branch)?$/);
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


/* TRACKER-SYNC-1 (owner directive 2026-10-18, verbatim: "qnfo-audit.code_tasks AND GITHUB ISSUES/PRS NEED TO BE
 * COORDINATED AND IN-SYNC AT ALL TIMES TO AVOID PHANTOM ISSUES AND INCORRECT METRICS").
 *
 * Measured before this change (2026-10-18 ~09:05Z): 228 open agent_issues, 0 of them on GitHub; code task ct_m3uh71laryg91d
 * 'failed' while its PR 812 had MERGED; 7 codeagent-* PRs with no code_tasks row. Runs every 10 minutes (SLA grid).
 *
 * Authority, so the two sides can never flap:
 *   issue state -> D1 agent_issues (it carries the close-evidence gate). Open in D1 = open on GitHub. A GitHub issue closed
 *                  by hand while D1 is open is reopened with a comment; D1 is never closed without evidence from here.
 *   merge state -> GitHub. A PR that merged marks its code task merged (merged_by github:<login>). Every other disagreement
 *                  is written to code_task_pr_links.drift and surfaces in v_tracker_drift / metric tracker_drift.
 * Public repository: bodies are fenced (no mention or reference expansion), tokens and e-mail addresses are redacted, and
 * personal or security issues are mirrored by number only. Scope (owner choice 2026-10-18): open issues only. */
var TS_REPO = "/repos/" + ORG + "/qnfo-workers";
var TS_LABEL = "fleet-issue";
var TS_CRON = "3,13,23,33,43,53 * * * *";
var TS_CREATE_PER_TICK = 20;
var TS_STATE_FIX_PER_TICK = 20;
var TS_PRIVATE_CATEGORIES = { personal: 1, security: 1 };

function tsRedact(s) {
  return String(s == null ? "" : s)
    .replace(/(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_\-]{16,}|xox[abpr]-[A-Za-z0-9\-]{10,})/g, "[redacted-token]")
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+\/=\-]{12,}/gi, "$1 [redacted]")
    .replace(/([?&](?:key|token|secret|sig|signature|password|api_key|apikey)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b[a-f0-9]{40,}\b/gi, "[redacted-hex]");
}

/* A fenced block: GitHub expands no mention, reference or HTML inside it. */
function tsFence(s, max) {
  var t = tsRedact(s).replace(/```/g, "'''");
  if (t.length > max) t = t.slice(0, max) + "\n... (truncated; full text in qnfo-audit)";
  return "```text\n" + t + "\n```";
}

function tsIsPrivate(row) {
  return !!TS_PRIVATE_CATEGORIES[String(row.category || "").toLowerCase()] || /personal/i.test(String(row.source || ""));
}

function tsTitle(row) {
  if (tsIsPrivate(row)) return "[#" + row.id + "] " + String(row.category || "private") + " issue (details kept in qnfo-audit)";
  return ("[#" + row.id + "] " + tsRedact(row.title || "(untitled)").replace(/@/g, "@\u200b")).slice(0, 240);
}

function tsBody(row) {
  var b = [
    "Mirrored from `qnfo-audit.agent_issues` id **" + row.id + "** (TRACKER-SYNC-1). D1 is authoritative for this issue's state:",
    "it closes here when it closes there with evidence, and a hand close here is reopened.",
    "",
    "| field | value |", "|:--|:--|",
    "| priority | " + String(row.priority || "") + " |",
    "| category | " + String(row.category || "") + " |",
    "| source | " + tsRedact(row.source || "").replace(/\|/g, "/").slice(0, 120) + " |",
    "| opened | " + (row.created_at ? new Date(Number(row.created_at)).toISOString() : "") + " |",
    ""
  ];
  if (tsIsPrivate(row)) b.push("Details are not mirrored: personal and security issues stay in qnfo-audit.");
  else b.push(tsFence(row.description || "", 6000));
  return b.join("\n");
}

/* Every page, or null: a partial list must never be read as "these issues are closed". windowOk: the caller asked for the
 * newest maxPages pages only (pull requests sorted by updated), so hitting the page cap is the window, not a failure. */
async function tsListAll(env, path, maxPages, windowOk) {
  var out = [];
  for (var page = 1; page <= maxPages; page++) {
    var r = await gh(env, "GET", path + (path.indexOf("?") >= 0 ? "&" : "?") + "per_page=100&page=" + page);
    if (r.status !== 200 || !Array.isArray(r.body)) return null;
    out = out.concat(r.body);
    if (r.body.length < 100) return out;
  }
  return windowOk ? out : null;
}

async function tsState(env, k, v) {
  if (v === undefined) {
    var r = await env.AUDIT.prepare("SELECT v FROM tracker_sync_state WHERE k = ?").bind(k).first();
    return r ? r.v : null;
  }
  await env.AUDIT.prepare("INSERT INTO tracker_sync_state (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .bind(k, String(v), new Date().toISOString()).run();
}

async function tsIssues(env, out) {
  var now = new Date().toISOString();
  var open = await tsListAll(env, TS_REPO + "/issues?state=open&labels=" + TS_LABEL, 15);
  if (!open) { out.errors.push({ scope: "tracker-issues", why: "could not list open " + TS_LABEL + " issues; no state change this tick" }); return; }
  var openNums = {}, byId = {};
  open.forEach(function (g) {
    if (g.pull_request) return;
    openNums[g.number] = 1;
    var m = /^\[#(\d+)\]/.exec(g.title || "");
    if (m) byId[m[1]] = g.number;
  });

  var links = (await env.AUDIT.prepare(
    "SELECT l.issue_id, l.gh_number, l.gh_state, a.status, a.close_channel, t.close_evidence FROM gh_issue_links l LEFT JOIN agent_issues a ON a.id = l.issue_id LEFT JOIN issue_triage t ON t.issue_id = l.issue_id"
  ).all()).results || [];
  var mism = links.filter(function (l) { return (l.status === "open") !== !!openNums[l.gh_number]; });
  var mismIds = {};
  /* A label rename or an API anomaly would make every link look closed: refuse a mass flip instead of acting on it. */
  if (links.length >= 10 && mism.length > links.length / 2) {
    out.errors.push({ scope: "tracker-issues", why: mism.length + " of " + links.length + " links disagree; refusing a mass state flip" });
    mism = [];
  }
  mism.forEach(function (l) { mismIds[l.issue_id] = 1; });
  var fixed = 0;
  for (var i = 0; i < mism.length && fixed < TS_STATE_FIX_PER_TICK; i++) {
    var l = mism[i], r;
    if (l.status === "open") {
      r = await gh(env, "PATCH", TS_REPO + "/issues/" + l.gh_number, { state: "open" });
      if (r.status >= 200 && r.status < 300) {
        await gh(env, "POST", TS_REPO + "/issues/" + l.gh_number + "/comments", { body: "Reopened by TRACKER-SYNC-1: agent_issues " + l.issue_id + " is still open in qnfo-audit, which is authoritative. It closes here when it is closed there with close evidence." });
        out.reopened++;
      }
    } else {
      await gh(env, "POST", TS_REPO + "/issues/" + l.gh_number + "/comments", { body: "Closed in qnfo-audit (agent_issues " + l.issue_id + ": status **" + String(l.status || "missing") + "**, channel " + String(l.close_channel || "none recorded") + "). Close evidence:\n\n" + tsFence(l.close_evidence || "(none recorded)", 3000) });
      r = await gh(env, "PATCH", TS_REPO + "/issues/" + l.gh_number, { state: "closed", state_reason: l.status === "wontfix" ? "not_planned" : "completed" });
      if (r.status >= 200 && r.status < 300) out.closed++;
    }
    if (r && r.status >= 200 && r.status < 300) {
      fixed++;
      await env.AUDIT.prepare("UPDATE gh_issue_links SET gh_state = ?, d1_status = ?, synced_at = ? WHERE issue_id = ?")
        .bind(l.status === "open" ? "open" : "closed", l.status || "missing", now, l.issue_id).run();
    } else {
      out.errors.push({ scope: "tracker-issue " + l.issue_id, status: r && r.status, why: String(r && r.text || "").slice(0, 120) });
    }
  }
  /* Record GitHub's state for links that agree, so v_tracker_drift reads the truth and not the last write. */
  var stmts = [];
  links.forEach(function (x) {
    var st = openNums[x.gh_number] ? "open" : "closed";
    if (!mismIds[x.issue_id] && (x.gh_state !== st)) stmts.push(env.AUDIT.prepare("UPDATE gh_issue_links SET gh_state = ?, d1_status = ?, synced_at = ? WHERE issue_id = ?").bind(st, x.status || "missing", now, x.issue_id));
  });
  if (stmts.length) await env.AUDIT.batch(stmts);

  /* Mirror open issues that have no GitHub issue yet, oldest first. A "[#id]" title already on GitHub is linked, not re-filed. */
  var todo = ((await env.AUDIT.prepare(
    "SELECT a.id, a.title, a.description, a.source, a.category, a.priority, a.created_at FROM agent_issues a LEFT JOIN gh_issue_links l ON l.issue_id = a.id WHERE a.status = 'open' AND l.issue_id IS NULL ORDER BY a.id LIMIT ?"
  ).bind(TS_CREATE_PER_TICK).all()).results) || [];
  for (var j = 0; j < todo.length; j++) {
    var row = todo[j];
    var num = byId[String(row.id)];
    if (num) {
      out.relinked++;
    } else {
      var c = await gh(env, "POST", TS_REPO + "/issues", { title: tsTitle(row), body: tsBody(row), labels: [TS_LABEL] });
      if (c.status !== 201 || !c.body || !c.body.number) {
        out.errors.push({ scope: "tracker-mirror " + row.id, status: c.status, why: String(c.text).slice(0, 120) });
        if (c.status === 403 || c.status === 429) break; /* rate limited: the rest waits for the next tick */
        continue;
      }
      num = c.body.number;
      out.mirrored++;
    }
    await env.AUDIT.prepare("INSERT OR REPLACE INTO gh_issue_links (issue_id, gh_number, gh_state, d1_status, synced_at) VALUES (?, ?, 'open', 'open', ?)").bind(row.id, num, now).run();
  }
}

function tsPrNum(url) {
  var m = /\/pull\/(\d+)/.exec(String(url || ""));
  return m ? Number(m[1]) : null;
}

async function tsCodeTasks(env, out) {
  var now = new Date().toISOString();
  var backfilled = await tsState(env, "pr_backfill_done");
  var prs = await tsListAll(env, TS_REPO + "/pulls?state=all&sort=updated&direction=desc", backfilled ? 2 : 30, !!backfilled);
  if (!prs) { out.errors.push({ scope: "tracker-prs", why: "could not list pull requests; no code task change this tick" }); return; }
  var byNum = {}, byHead = {};
  prs.forEach(function (p) { byNum[p.number] = p; if (p.head && p.head.ref) byHead[p.head.ref] = p; });

  var tasks = ((await env.AUDIT.prepare(
    "SELECT t.id, t.status, t.branch, t.pr_url, k.pr_number AS known_pr, k.pr_state AS known_state, k.task_status AS known_status, k.drift AS known_drift FROM code_tasks t LEFT JOIN code_task_pr_links k ON k.task_id = t.id"
  ).all()).results) || [];
  var known = {};
  (((await env.AUDIT.prepare("SELECT task_id, pr_state, drift FROM code_task_pr_links WHERE task_id LIKE 'pr:%'").all()).results) || []).forEach(function (k) { known[k.task_id] = k; });
  /* Write a link only when it changed: an unchanged row rewritten every 10 minutes is write volume nothing reads. */
  var same = function (a, b) { return String(a == null ? "" : a) === String(b == null ? "" : b); };
  var branches = {}, taskPrs = {}, stmts = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (t.branch) branches[t.branch] = 1;
    var n = tsPrNum(t.pr_url) || t.known_pr || null;
    if (n) taskPrs[n] = 1;
    var p = (n && byNum[n]) || (t.branch && byHead[t.branch]) || null;
    if (!p) {
      /* Not in the recent window. Settled links (terminal PR, same task status) need no read; anything else gets one. */
      if (backfilled && t.known_status === t.status && (t.known_state === "merged" || t.known_state === "closed" || (!n && t.known_state === "never-opened"))) continue;
      if (n) { var g = await gh(env, "GET", TS_REPO + "/pulls/" + n); if (g.status === 200) p = g.body; else continue; }
    }
    var prState = !p ? "never-opened" : (p.merged_at ? "merged" : p.state);
    var drift = null, status = t.status;
    if (prState === "merged" && t.status !== "merged") {
      /* The list endpoint carries no merged_by; read the one PR so the ledger names who merged it. */
      if (!p.merged_by) { var one = await gh(env, "GET", TS_REPO + "/pulls/" + p.number); if (one.status >= 200 && one.status < 300 && one.body) p = one.body; }
      var note = "TRACKER-SYNC-1: PR #" + p.number + " merged on GitHub at " + p.merged_at + "; code_tasks said '" + t.status + "'";
      var u = await env.AUDIT.prepare(
        "UPDATE code_tasks SET status = 'merged', merged_at = ?, merged_sha = COALESCE(merged_sha, ?), merged_by = COALESCE(merged_by, ?), merge_note = ? || CASE WHEN merge_note IS NULL THEN '' ELSE ' | was: ' || substr(merge_note, 1, 400) END, updated_at = ? WHERE id = ? AND status <> 'merged'"
      ).bind(p.merged_at, p.merge_commit_sha || null, "github:" + String(p.merged_by && p.merged_by.login || "unknown"), note, now, t.id).run();
      if (u && u.meta && u.meta.changes) { out.tasks_fixed.push(t.id + " #" + p.number + " " + t.status + "->merged"); status = "merged"; }
      else drift = "pr-merged-task-" + t.status;
    } else if (t.status === "merged" && prState !== "merged") {
      drift = "task-merged-pr-" + prState;
    } else if (prState === "open" && ["closed", "failed", "publish_failed"].indexOf(t.status) >= 0) {
      drift = "pr-open-task-" + t.status;
    }
    if (drift) out.task_drift++;
    if (same(t.known_pr, p ? p.number : null) && same(t.known_state, prState) && same(t.known_status, status) && same(t.known_drift, drift)) continue;
    stmts.push(env.AUDIT.prepare(
      "INSERT INTO code_task_pr_links (task_id, pr_number, pr_state, merged_at, head_sha, task_status, drift, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(task_id) DO UPDATE SET pr_number = excluded.pr_number, pr_state = excluded.pr_state, merged_at = excluded.merged_at, head_sha = excluded.head_sha, task_status = excluded.task_status, drift = excluded.drift, synced_at = excluded.synced_at"
    ).bind(t.id, p ? p.number : null, prState, p ? (p.merged_at || null) : null, p && p.head ? p.head.sha : null, status, drift, now));
  }
  /* A code-loop PR the ledger does not know is work the metrics never count: drift while open or within 30 days. */
  var cutoff = Date.now() - 30 * 86400000;
  Object.keys(byHead).forEach(function (h) {
    var p = byHead[h];
    if (h.indexOf("codeagent-") !== 0 || branches[h] || taskPrs[p.number]) return;
    var recent = p.state === "open" || Date.parse(p.merged_at || p.closed_at || p.updated_at || 0) >= cutoff;
    if (recent) out.task_drift++;
    var k = known["pr:" + p.number], st = p.merged_at ? "merged" : p.state, dr = recent ? "pr-without-task" : null;
    if (k && same(k.pr_state, st) && same(k.drift, dr)) return;
    stmts.push(env.AUDIT.prepare(
      "INSERT INTO code_task_pr_links (task_id, pr_number, pr_state, merged_at, head_sha, task_status, drift, synced_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(task_id) DO UPDATE SET pr_state = excluded.pr_state, merged_at = excluded.merged_at, drift = excluded.drift, synced_at = excluded.synced_at"
    ).bind("pr:" + p.number, p.number, p.merged_at ? "merged" : p.state, p.merged_at || null, p.head ? p.head.sha : null, recent ? "pr-without-task" : null, now));
  });
  /* A pr-without-task row is only revisited while its PR is in the recent window, so clear what is no longer true: a PR a
   * task now points at, or one merged more than 30 days ago. Without this a fixed false positive stays drift for good. */
  stmts.push(env.AUDIT.prepare(
    "UPDATE code_task_pr_links SET drift = NULL, synced_at = ? WHERE task_id LIKE 'pr:%' AND drift IS NOT NULL AND (pr_number IN (SELECT pr_number FROM code_task_pr_links WHERE task_id NOT LIKE 'pr:%' AND pr_number IS NOT NULL) OR (merged_at IS NOT NULL AND merged_at < ?))"
  ).bind(now, new Date(cutoff).toISOString()));
  for (var s = 0; s < stmts.length; s += 50) await env.AUDIT.batch(stmts.slice(s, s + 50));
  if (!backfilled) await tsState(env, "pr_backfill_done", now);
}

/* DISPATCH-LIVENESS-1 (owner directive 2026-10-18, verbatim: "THE SYSTEM SHALL NEVER STOP OR
 * TERMINATE WITH ANY OUTSTANDING BREACHES ... THE SYSTEM SHALL ALWAYS KEEP GOING").
 *
 * Every fleet_cron is dispatched by the per-minute tick inside qnfo-code-orchestrator. If that worker
 * dies, its dispatcher dies with it -- and NEVER-STALL-1, the task that would report a stall, is itself a
 * fleet_cron dispatched by that same tick. Nothing inside the failure domain can notice the failure.
 *
 * This worker is a different process on its own 10-minute Cloudflare cron. It reads the freshest
 * last_fired across every enabled fleet_cron: while the dispatcher lives that advances at least every 10
 * minutes, and when it stops the number freezes. A dispatcher quiet for over 20 minutes files
 * liveness:dispatcher-stalled here, and ISSUE-SYNC-1 mirrors it to GitHub on the same tick.
 *
 * Idempotent: one row per condition, created once. A queued alarm that recovers before it was mirrored is
 * cancelled rather than filed; a tracked one is left to the normal close path so it never drifts. */
var DL_FP = "liveness:dispatcher-stalled";
var DL_IDLE_LIMIT_MIN = 20;
async function dispatchLiveness(env, result) {
  if (!env.AUDIT) return;
  try {
    var row = await env.AUDIT.prepare(
      "SELECT MAX(last_fired) AS newest FROM fleet_crons WHERE enabled = 1 AND last_fired IS NOT NULL"
    ).first();
    var newest = row && row.newest ? Date.parse(row.newest) : 0;
    var idleMin = newest ? Math.round((Date.now() - newest) / 60000) : 9999;
    var now = new Date().toISOString();
    if (idleMin > DL_IDLE_LIMIT_MIN) {
      var payload = JSON.stringify({
        service: "qnfo-code-orchestrator",
        title: "fleet cron dispatch has been quiet for " + idleMin + " minutes",
        detail: "The freshest fleet_crons.last_fired is " + (newest ? row.newest : "absent") +
          ". The per-minute tick in qnfo-code-orchestrator dispatches every fleet cron, including NEVER-STALL-1, so a stall here means no scheduled task is running and the watchdog cannot report it. Check /health on qnfo-code-orchestrator, its cron triggers, and the loop_lock row.",
        idle_min: idleMin,
        limit_min: DL_IDLE_LIMIT_MIN
      });
      await env.AUDIT.prepare(
        "INSERT OR IGNORE INTO fleet_issue_dispatch (fingerprint, category, sev, owner, action, payload, state, created_at) VALUES (?, 'liveness', 'critical', 'qnfo-code-orchestrator', 'investigate-dispatch', ?, 'queued', ?)"
      ).bind(DL_FP, payload, now).run();
      result.dispatch_liveness = { idle_min: idleMin, limit_min: DL_IDLE_LIMIT_MIN, stalled: true };
      return;
    }
    // Healthy: cancel an alarm that was raised but never mirrored, so a transient blip leaves no issue behind.
    await env.AUDIT.prepare(
      "UPDATE fleet_issue_dispatch SET state = 'done', exec_state = 'recovered', exec_ts = ? WHERE fingerprint = ? AND state = 'queued' AND (gh_number IS NULL OR gh_number = '')"
    ).bind(now, DL_FP).run();
    result.dispatch_liveness = { idle_min: idleMin, limit_min: DL_IDLE_LIMIT_MIN, stalled: false };
  } catch (e) {
    result.errors.push({ scope: "dispatch-liveness", why: String(e && e.message || e).slice(0, 160) });
  }
}

async function trackerSync(env) {
  var started = Date.now();
  var out = { version: VERSION, started_at: new Date(started).toISOString(), mirrored: 0, relinked: 0, closed: 0, reopened: 0, tasks_fixed: [], task_drift: 0, errors: [] };
  if (!env.AUDIT || !env.GITHUB_TOKEN) { out.errors.push({ scope: "tracker", why: "AUDIT binding or GITHUB_TOKEN missing" }); return out; }
  try { await tsIssues(env, out); } catch (e) { out.errors.push({ scope: "tracker-issues", why: String(e && e.message || e).slice(0, 160) }); }
  try { await tsCodeTasks(env, out); } catch (e) { out.errors.push({ scope: "tracker-prs", why: String(e && e.message || e).slice(0, 160) }); }
  /* The fleet_issue_dispatch mirror (ISSUE-SYNC-1) rides the same 10-minute grid instead of the 6-hourly reconcile. */
  var legacy = { errors: [], issue_sync: null, issue_sync_reverse: null, dispatch_liveness: null };
  await dispatchLiveness(env, legacy);
  await issueSync(env, legacy);
  await issueSyncReverse(env, legacy);
  out.dispatch_liveness = legacy.dispatch_liveness;
  out.dispatch_sync = legacy.issue_sync;
  out.dispatch_sync_reverse = legacy.issue_sync_reverse;
  out.errors = out.errors.concat(legacy.errors);
  try {
    var d = ((await env.AUDIT.prepare("SELECT kind, count(*) AS n FROM v_tracker_drift GROUP BY kind").all()).results) || [];
    var issue = 0, task = 0, unmirrored = 0;
    d.forEach(function (r) { if (r.kind === "code-task-pr") task += r.n; else issue += r.n; if (r.kind === "issue-unmirrored") unmirrored += r.n; });
    out.drift = { issue: issue, code_task: task, unmirrored: unmirrored };
    var at = new Date().toISOString();
    var put = function (m, v) { return env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = 'MEASURED' WHERE metric = ?").bind(String(v), at, m); };
    var w = [put("tracker_issue_drift", issue), put("tracker_code_task_drift", task)];
    /* tracker_drift is graded (it can file an issue) only after the first full open-issue backfill, so the backfill is not
     * reported as a breach of itself; until then it stays PENDING while its parts are measured. */
    var full = await tsState(env, "issue_backfill_done");
    if (!full && unmirrored === 0) { full = at; await tsState(env, "issue_backfill_done", at); }
    if (full) w.push(put("tracker_drift", issue + task));
    await env.AUDIT.batch(w);
  } catch (e) { out.errors.push({ scope: "tracker-metrics", why: String(e && e.message || e).slice(0, 160) }); }
  out.duration_ms = Date.now() - started;
  try { await tsState(env, "last_run", JSON.stringify(out).slice(0, 20000)); } catch (e) { out.errors.push({ scope: "tracker-record", why: String(e && e.message || e).slice(0, 120) }); }
  return out;
}
// end TRACKER-SYNC-1

/* PORTFOLIO-SYNC-1 (owner directive 2026-10-18, verbatim: "THE SYSTEM SHALL AUTOMATICALLY POPULATE AND MAINTAIN ITS OWN FLEET
 * ROADMAP AND BACKLOG, AS WELL AS ISSUES/TASKS FOR ALL FIXES/REMEDIATION AND PLANNED ENHANCEMENTS/UPGRADES, WHICH SHALL BE
 * CANONICAL ACROSS THE FLEET AND ALWAYS IN-SYNC WITH GITHUB ASSETS AND ISSUE/PROJECT TRACKING. THE SYSTEM SHALL MANAGE ITS OWN
 * PORTFOLIO, ITS OWN PROGRAMS, AND ITS OWN PROJECTS AUTOMATICALLY.")
 *
 * Measured before (2026-10-18 ~10:00Z): projects hand-written (21 rows, 0 of 30 live workers covered, 7 on 404 repos);
 * roadmap_implementation 141 rows / 117 open / 0 on GitHub; 0 milestones; 0 org Projects; 20 metrics in breach with no
 * roadmap objective.
 *
 * One 10-minute tick (after TRACKER-SYNC-1, same cron), each step bounded, idempotent and isolated:
 *   1 DERIVE      projects from service_registry (live worker -> W.<worker>) and portfolio_repos (active public non-fork repo
 *                 -> R.<repo>); a derived project whose source vanished is retired. Refused on a degenerate source (<10 rows,
 *                 DEGENERATE-DETECTION-SOURCE-1). Only source='derived' rows are ever retired.
 *   2 OBJECTIVES  every metric in breach (v_metric_trigger_state hit=1) is roadmap objective RM-METRIC-<key>; verified with the
 *                 measured value when the breach clears, reopened on re-breach.
 *   3 PLACE       every open mirrored issue -> project / program / kind (fix, enhancement, research, owner).
 *   4 GITHUB      programs + kinds -> labels; projects -> milestones (closed on retire); issues -> milestone + labels, compared
 *                 with GitHub's live state; roadmap items -> issues labelled roadmap, closed with evidence when D1 verifies,
 *                 reopened when closed by hand (D1 authoritative).
 *   5 BOARD       best effort: org Projects v2 board "QNFO Fleet Portfolio" carrying every mirrored item.
 *   6 MEASURE     v_portfolio_drift -> metric portfolio_drift (target 0). */
var PS_REPO = "/repos/" + ORG + "/qnfo-workers";
var PS_BOARD = "QNFO Fleet Portfolio";
var PS_MS_PER_TICK = 15, PS_ISSUE_PER_TICK = 40, PS_RM_CREATE_PER_TICK = 15, PS_RM_STATE_PER_TICK = 20, PS_BOARD_PER_TICK = 30;
var PS_RM_DONE = { verified: 1, "enforced-verified": 1, "violated-remediated": 1, retired: 1 };
var PS_PROGRAMS = {
  "QNFO.RSCH": { label: "program:research", color: "1d76db", desc: "Research & Publications" },
  "QNFO.INFRA": { label: "program:infra", color: "5319e7", desc: "Cloudflare Infrastructure" },
  "QNFO.OPS": { label: "program:ops", color: "0e8a16", desc: "Operations & Governance" },
  "QNFO.REACH": { label: "program:reach", color: "fbca04", desc: "Reach & Distribution" },
  "QNFO.PERSONAL": { label: "program:personal", color: "c5def5", desc: "Personal Twin (names only)" }
};
var PS_KINDS = {
  fix: { color: "d73a4a", desc: "Fix / remediation" },
  enhancement: { color: "a2eeef", desc: "Planned enhancement / upgrade" },
  research: { color: "bfdadc", desc: "Research work" },
  owner: { color: "e99695", desc: "Owner request" }
};

function psProgramForWorker(w) {
  w = String(w || "");
  if (/^personal/.test(w)) return "QNFO.PERSONAL";
  if (/research|pdf|paper|radar|ai-search|ipatent|arxiv|citation|errata/.test(w)) return "QNFO.RSCH";
  if (/social|subscriber|signal|idea|outreach|cloud-ops|email/.test(w)) return "QNFO.REACH";
  if (/fleet|steward|evolve|lifecycle|deploy-guard|observability|orchestrator|calibration|kaizen|backlog|qnfo-ops|audit/.test(w)) return "QNFO.OPS";
  return "QNFO.INFRA";
}
function psProgramForRepo(r) {
  if (r.pillar === "personal" || r.tier === "client-config") return "QNFO.PERSONAL";
  if (r.tier === "research" || r.pillar === "research") return "QNFO.RSCH";
  if (r.tier === "demo" || r.pillar === "reach") return "QNFO.REACH";
  if (r.tier === "governance" || r.pillar === "autonomy") return "QNFO.OPS";
  return "QNFO.INFRA";
}
function psKind(category, source) {
  var c = String(category || "").toLowerCase();
  if (/owner/.test(c) || /owner-request/.test(String(source || ""))) return "owner";
  if (/research/.test(c)) return "research";
  if (/bug|defect|reliab|remediat|self-heal|security|integrity|quality|incident/.test(c)) return "fix";
  return "enhancement";
}
function psMsTitle(p) { return (p.project_code + " · " + tsRedact(p.name || "")).slice(0, 120); }
function psNow() { return new Date().toISOString().replace("T", " ").slice(0, 19); }

async function psDerive(env, out) {
  var now = psNow();
  var workers = ((await env.AUDIT.prepare("SELECT service, purpose FROM service_registry WHERE kind = 'worker' AND state = 'live'").all()).results) || [];
  var repos = ((await env.AUDIT.prepare("SELECT name, tier, pillar, description, visibility, archived, fork FROM portfolio_repos WHERE seen = 1").all()).results) || [];
  if (workers.length < 10 || repos.length < 10) {
    out.errors.push({ scope: "portfolio-derive", why: "degenerate source (workers " + workers.length + ", repos " + repos.length + "); no project created or retired this tick" });
    return;
  }
  var want = {};
  workers.forEach(function (w) {
    want["W." + w.service] = { program: psProgramForWorker(w.service), name: w.service, desc: tsRedact(w.purpose || "worker " + w.service).slice(0, 400), owner: w.service };
  });
  repos.forEach(function (r) {
    if (Number(r.archived) || Number(r.fork) || String(r.visibility) !== "public" || r.name === "qnfo-workers") return;
    var prog = psProgramForRepo(r);
    if (prog === "QNFO.PERSONAL") return;
    want["R." + r.name] = { program: prog, name: r.name, desc: tsRedact(r.description || "repository " + r.name).slice(0, 400), owner: null, repo: ORG + "/" + r.name };
  });
  var have = {};
  (((await env.AUDIT.prepare("SELECT project_code, program_code, status, source FROM projects").all()).results) || []).forEach(function (p) { have[p.project_code] = p; });
  var stmts = [];
  Object.keys(want).forEach(function (code) {
    var w = want[code], h = have[code];
    if (!h) {
      stmts.push(env.AUDIT.prepare("INSERT INTO projects (project_code, program_code, name, description, status, github_repo, source, owner_service, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, 'derived', ?, ?, ?)")
        .bind(code, w.program, w.name, w.desc, w.repo || ORG + "/qnfo-workers", w.owner, now, now));
      out.projects_created++;
    } else if (h.source === "derived" && (h.status !== "active" || h.program_code !== w.program)) {
      stmts.push(env.AUDIT.prepare("UPDATE projects SET status = 'active', program_code = ?, completed_at = NULL, updated_at = ? WHERE project_code = ?").bind(w.program, now, code));
      out.projects_reactivated++;
    }
  });
  Object.keys(have).forEach(function (code) {
    var h = have[code];
    if (h.source === "derived" && h.status === "active" && !want[code]) {
      stmts.push(env.AUDIT.prepare("UPDATE projects SET status = 'retired', completed_at = ?, updated_at = ? WHERE project_code = ?").bind(now, now, code));
      out.projects_retired++;
    }
  });
  for (var i = 0; i < stmts.length; i += 50) await env.AUDIT.batch(stmts.slice(i, i + 50));
}

async function psObjectives(env, out) {
  var rows = ((await env.AUDIT.prepare("SELECT metric_key, title, owner, operator, threshold, val, hit FROM v_metric_trigger_state WHERE val IS NOT NULL").all()).results) || [];
  if (!rows.length) { out.errors.push({ scope: "portfolio-objectives", why: "v_metric_trigger_state returned no measured rows; objectives untouched" }); return; }
  var have = {};
  (((await env.AUDIT.prepare("SELECT id, item, status FROM roadmap_implementation WHERE source = 'metric-breach'").all()).results) || []).forEach(function (r) { have[r.item] = r; });
  var now = psNow(), stmts = [];
  rows.forEach(function (m) {
    var item = "RM-METRIC-" + m.metric_key, h = have[item];
    var ev = "measured " + m.val + " (" + m.operator + " " + m.threshold + ") at " + now + "Z from v_metric_trigger_state";
    if (Number(m.hit) === 1) {
      if (!h) {
        stmts.push(env.AUDIT.prepare("INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) VALUES (?, 'metric-breach', ?, 'objective', ?, 'open', ?)")
          .bind(item, String(m.title || m.metric_key).slice(0, 300), m.owner || null, "breach: " + ev));
        out.objectives_opened++;
      } else if (PS_RM_DONE[h.status]) {
        stmts.push(env.AUDIT.prepare("UPDATE roadmap_implementation SET status = 'open', evidence = ?, verified_at = NULL WHERE id = ?").bind("re-breach: " + ev, h.id));
        out.objectives_reopened++;
      }
    } else if (h && !PS_RM_DONE[h.status]) {
      stmts.push(env.AUDIT.prepare("UPDATE roadmap_implementation SET status = 'verified', evidence = ?, verified_at = ? WHERE id = ?").bind("cleared: " + ev, now, h.id));
      out.objectives_verified++;
    }
  });
  for (var i = 0; i < stmts.length; i += 50) await env.AUDIT.batch(stmts.slice(i, i + 50));
}

async function psPlace(env, out, projects) {
  var active = {};
  projects.forEach(function (p) { if (p.status === "active") active[p.project_code] = p; });
  var rows = ((await env.AUDIT.prepare(
    "SELECT a.id, a.category, a.source, t.owner, m.project_code AS cur_p, m.kind AS cur_k FROM agent_issues a JOIN gh_issue_links l ON l.issue_id = a.id LEFT JOIN issue_triage t ON t.issue_id = a.id LEFT JOIN issue_project_map m ON m.issue_id = a.id WHERE a.status = 'open'"
  ).all()).results) || [];
  var fallback = active["W.qnfo-fleet-control"] ? "W.qnfo-fleet-control" : Object.keys(active)[0];
  var now = new Date().toISOString(), stmts = [];
  rows.forEach(function (r) {
    var code = null;
    [r.owner, r.source].forEach(function (cand) {
      if (code || !cand) return;
      var s = String(cand).split(/[:|\s]/)[0];
      if (active["W." + s]) code = "W." + s;
    });
    code = code || fallback;
    if (!code) return;
    var kind = psKind(r.category, r.source);
    if (r.cur_p !== code || r.cur_k !== kind) {
      stmts.push(env.AUDIT.prepare("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(issue_id) DO UPDATE SET project_code = excluded.project_code, program_code = excluded.program_code, kind = excluded.kind, updated_at = excluded.updated_at")
        .bind(r.id, code, active[code].program_code, kind, now));
      out.issues_placed++;
    }
  });
  for (var i = 0; i < stmts.length; i += 50) await env.AUDIT.batch(stmts.slice(i, i + 50));
}

async function psLabels(env, out) {
  var have = await tsListAll(env, PS_REPO + "/labels", 5);
  if (!have) { out.errors.push({ scope: "portfolio-labels", why: "could not list labels" }); return false; }
  var names = {};
  have.forEach(function (l) { names[l.name] = 1; });
  var need = [{ name: "roadmap", color: "0052cc", description: "Fleet roadmap item (roadmap_implementation)" }];
  Object.keys(PS_PROGRAMS).forEach(function (k) { need.push({ name: PS_PROGRAMS[k].label, color: PS_PROGRAMS[k].color, description: k + " " + PS_PROGRAMS[k].desc }); });
  Object.keys(PS_KINDS).forEach(function (k) { need.push({ name: "kind:" + k, color: PS_KINDS[k].color, description: PS_KINDS[k].desc }); });
  for (var i = 0; i < need.length; i++) {
    if (names[need[i].name]) continue;
    var r = await gh(env, "POST", PS_REPO + "/labels", need[i]);
    if (r.status === 201) out.labels_created++;
    else { out.errors.push({ scope: "portfolio-label " + need[i].name, status: r.status, why: String(r.text).slice(0, 100) }); return false; }
  }
  return true;
}

async function psMilestones(env, out, projects) {
  var list = await tsListAll(env, PS_REPO + "/milestones?state=all", 10);
  if (!list) { out.errors.push({ scope: "portfolio-milestones", why: "could not list milestones; no milestone change this tick" }); return null; }
  var byCode = {};
  list.forEach(function (m) { var k = String(m.title || "").split(" · ")[0]; if (k) byCode[k] = m; });
  var done = 0, stmts = [], now = psNow();
  for (var i = 0; i < projects.length; i++) {
    var p = projects[i], m = byCode[p.project_code];
    if (p.status === "active") {
      if (!m) {
        if (done >= PS_MS_PER_TICK) continue;
        var c = await gh(env, "POST", PS_REPO + "/milestones", { title: psMsTitle(p), description: p.program_code === "QNFO.PERSONAL" ? "QNFO.PERSONAL | details kept in qnfo-audit" : (p.program_code + " | " + tsRedact(p.description || "")).slice(0, 700) });
        if (c.status !== 201 || !c.body) { out.errors.push({ scope: "portfolio-milestone " + p.project_code, status: c.status, why: String(c.text).slice(0, 100) }); if (c.status === 403 || c.status === 429) break; continue; }
        m = c.body; byCode[p.project_code] = m; out.milestones_created++; done++;
      } else if (m.state !== "open") {
        if (done >= PS_MS_PER_TICK) continue;
        var o = await gh(env, "PATCH", PS_REPO + "/milestones/" + m.number, { state: "open" });
        if (o.status === 200) { m.state = "open"; out.milestones_reopened++; done++; }
      }
      if (p.gh_milestone !== m.number) stmts.push(env.AUDIT.prepare("UPDATE projects SET gh_milestone = ?, updated_at = ? WHERE project_code = ?").bind(m.number, now, p.project_code));
      p.gh_milestone = m.number;
    } else {
      if (m && m.state === "open" && done < PS_MS_PER_TICK) {
        var x = await gh(env, "PATCH", PS_REPO + "/milestones/" + m.number, { state: "closed" });
        if (x.status === 200) { m.state = "closed"; out.milestones_closed++; done++; }
      }
      if (m && p.gh_milestone !== m.number) stmts.push(env.AUDIT.prepare("UPDATE projects SET gh_milestone = ? WHERE project_code = ?").bind(m.number, p.project_code));
    }
  }
  for (var j = 0; j < stmts.length; j += 50) await env.AUDIT.batch(stmts.slice(j, j + 50));
  return byCode;
}

function psManaged(n) { return n === "fleet-issue" || n === "roadmap" || /^program:|^kind:/.test(n); }
function psLabelNames(g) { return (g.labels || []).map(function (l) { return typeof l === "string" ? l : l.name; }); }
function psLabelSet(program, kind, extra) {
  var s = extra.slice();
  if (PS_PROGRAMS[program]) s.push(PS_PROGRAMS[program].label);
  if (PS_KINDS[kind]) s.push("kind:" + kind);
  return s.sort();
}
function psSameLabels(g, want) { return JSON.stringify(psLabelNames(g).filter(psManaged).sort()) === JSON.stringify(want); }
function psKeepLabels(g, want) { return psLabelNames(g).filter(function (n) { return !psManaged(n); }).concat(want); }

async function psIssues(env, out, projects, openFleet) {
  var byCode = {}, gByNum = {};
  projects.forEach(function (p) { byCode[p.project_code] = p; });
  openFleet.forEach(function (g) { gByNum[g.number] = g; });
  var rows = ((await env.AUDIT.prepare("SELECT m.issue_id, m.project_code, m.program_code, m.kind, m.synced_milestone, m.gh_node, l.gh_number FROM issue_project_map m JOIN gh_issue_links l ON l.issue_id = m.issue_id JOIN agent_issues a ON a.id = m.issue_id WHERE a.status = 'open'").all()).results) || [];
  var done = 0, stmts = [], now = new Date().toISOString();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], g = gByNum[r.gh_number], p = byCode[r.project_code];
    if (!g || !p || !p.gh_milestone) continue;
    var want = psLabelSet(r.program_code, r.kind, ["fleet-issue"]);
    if (g.milestone && g.milestone.number === p.gh_milestone && psSameLabels(g, want)) {
      if (r.synced_milestone !== p.gh_milestone || !r.gh_node) stmts.push(env.AUDIT.prepare("UPDATE issue_project_map SET synced_milestone = ?, synced_labels = ?, gh_node = ?, synced_at = ? WHERE issue_id = ?").bind(p.gh_milestone, want.join(","), g.node_id || null, now, r.issue_id));
      continue;
    }
    if (done >= PS_ISSUE_PER_TICK) continue;
    var u = await gh(env, "PATCH", PS_REPO + "/issues/" + r.gh_number, { milestone: p.gh_milestone, labels: psKeepLabels(g, want) });
    if (u.status === 200) {
      done++; out.issues_synced++;
      stmts.push(env.AUDIT.prepare("UPDATE issue_project_map SET synced_milestone = ?, synced_labels = ?, gh_node = ?, synced_at = ? WHERE issue_id = ?").bind(p.gh_milestone, want.join(","), g.node_id || null, now, r.issue_id));
    } else {
      out.errors.push({ scope: "portfolio-issue " + r.issue_id, status: u.status, why: String(u.text).slice(0, 100) });
      if (u.status === 403 || u.status === 429) break;
    }
  }
  for (var j = 0; j < stmts.length; j += 50) await env.AUDIT.batch(stmts.slice(j, j + 50));
}

function psRmProject(r, byCode) {
  var ref = String(r.artifact_ref || "") + " " + String(r.title || "");
  var re = /\b((?:qnfo|personal|q08|idea|radar)-[a-z0-9-]+)\b/g, m;
  while ((m = re.exec(ref))) { var p = byCode["W." + m[1]]; if (p && p.status === "active") return p; }
  var f = byCode["W.qnfo-fleet-control"];
  return f && f.status === "active" ? f : null;
}

async function psRoadmap(env, out, projects) {
  var byCode = {};
  projects.forEach(function (p) { byCode[p.project_code] = p; });
  var open = await tsListAll(env, PS_REPO + "/issues?state=open&labels=roadmap", 10);
  if (!open) { out.errors.push({ scope: "portfolio-roadmap", why: "could not list open roadmap issues; no roadmap change this tick" }); return null; }
  var openNums = {}, byId = {};
  open.forEach(function (g) { if (g.pull_request) return; openNums[g.number] = g; var m = /^\[RM-(\d+)\]/.exec(g.title || ""); if (m) byId[m[1]] = g.number; });
  var links = ((await env.AUDIT.prepare("SELECT g.roadmap_id, g.gh_number, g.gh_state, g.gh_node, r.status, r.evidence, r.item FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id").all()).results) || [];
  var mism = links.filter(function (l) { return (!PS_RM_DONE[l.status]) !== !!openNums[l.gh_number]; });
  if (links.length >= 10 && mism.length > links.length / 2) {
    out.errors.push({ scope: "portfolio-roadmap", why: mism.length + " of " + links.length + " roadmap links disagree; refusing a mass state flip" });
    mism = [];
  }
  var now = new Date().toISOString(), fixed = 0, mismIds = {};
  mism.forEach(function (l) { mismIds[l.roadmap_id] = 1; });
  for (var i = 0; i < mism.length && fixed < PS_RM_STATE_PER_TICK; i++) {
    var l = mism[i], r;
    if (!PS_RM_DONE[l.status]) {
      r = await gh(env, "PATCH", PS_REPO + "/issues/" + l.gh_number, { state: "open" });
      if (r.status === 200) { await gh(env, "POST", PS_REPO + "/issues/" + l.gh_number + "/comments", { body: "Reopened by PORTFOLIO-SYNC-1: roadmap item " + tsRedact(l.item) + " is '" + l.status + "' in qnfo-audit.roadmap_implementation, which is authoritative." }); out.roadmap_reopened++; }
    } else {
      await gh(env, "POST", PS_REPO + "/issues/" + l.gh_number + "/comments", { body: "Verified in qnfo-audit (roadmap " + tsRedact(l.item) + ": status **" + l.status + "**). Evidence:\n\n" + tsFence(l.evidence || "(none recorded)", 3000) });
      r = await gh(env, "PATCH", PS_REPO + "/issues/" + l.gh_number, { state: "closed", state_reason: l.status === "retired" ? "not_planned" : "completed" });
      if (r.status === 200) out.roadmap_closed++;
    }
    if (r && r.status === 200) { fixed++; await env.AUDIT.prepare("UPDATE roadmap_gh_links SET gh_state = ?, d1_status = ?, synced_at = ? WHERE roadmap_id = ?").bind(PS_RM_DONE[l.status] ? "closed" : "open", l.status, now, l.roadmap_id).run(); }
    else out.errors.push({ scope: "portfolio-roadmap-state " + l.roadmap_id, status: r && r.status, why: String(r && r.text || "").slice(0, 100) });
  }
  var stmts = [];
  links.forEach(function (x) {
    var g = openNums[x.gh_number], st = g ? "open" : "closed";
    if (!mismIds[x.roadmap_id] && (x.gh_state !== st || (g && !x.gh_node))) stmts.push(env.AUDIT.prepare("UPDATE roadmap_gh_links SET gh_state = ?, d1_status = ?, gh_node = COALESCE(gh_node, ?), synced_at = ? WHERE roadmap_id = ?").bind(st, x.status, g ? g.node_id : null, now, x.roadmap_id));
  });
  for (var s = 0; s < stmts.length; s += 50) await env.AUDIT.batch(stmts.slice(s, s + 50));

  /* Place open roadmap issues: an item mirrored before its project's milestone existed (milestones are capped per tick) is
   * moved into the milestone and given its labels once the milestone exists. Compared with GitHub's live state. */
  var place = ((await env.AUDIT.prepare("SELECT g.roadmap_id, g.gh_number, g.project_code, r.source, r.title, r.artifact_ref FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id WHERE r.status NOT IN ('verified','enforced-verified','violated-remediated','retired')").all()).results) || [];
  var placed = 0, pst = [];
  for (var q = 0; q < place.length && placed < PS_ISSUE_PER_TICK; q++) {
    var x2 = place[q], g2 = openNums[x2.gh_number], p2 = psRmProject(x2, byCode);
    if (!g2 || !p2 || !p2.gh_milestone) continue;
    var want2 = psLabelSet(p2.program_code, x2.source === "metric-breach" ? "fix" : "enhancement", ["roadmap"]);
    if (g2.milestone && g2.milestone.number === p2.gh_milestone && psSameLabels(g2, want2)) {
      if (x2.project_code !== p2.project_code) pst.push(env.AUDIT.prepare("UPDATE roadmap_gh_links SET project_code = ? WHERE roadmap_id = ?").bind(p2.project_code, x2.roadmap_id));
      continue;
    }
    var u2 = await gh(env, "PATCH", PS_REPO + "/issues/" + x2.gh_number, { milestone: p2.gh_milestone, labels: psKeepLabels(g2, want2) });
    if (u2.status === 200) { placed++; out.roadmap_placed = (out.roadmap_placed || 0) + 1; pst.push(env.AUDIT.prepare("UPDATE roadmap_gh_links SET project_code = ?, synced_at = ? WHERE roadmap_id = ?").bind(p2.project_code, now, x2.roadmap_id)); }
    else { out.errors.push({ scope: "portfolio-roadmap-place " + x2.roadmap_id, status: u2.status, why: String(u2.text).slice(0, 100) }); if (u2.status === 403 || u2.status === 429) break; }
  }
  if (pst.length) await env.AUDIT.batch(pst);

  /* Rows copied from agent_issues (source 'agent_issues') are already on GitHub as their [#id] issue (TRACKER-SYNC-1); mirroring
   * them again would track one defect twice, so they are never filed here. */
  var todo = ((await env.AUDIT.prepare("SELECT r.id, r.item, r.source, r.title, r.artifact_type, r.artifact_ref, r.status, r.evidence FROM roadmap_implementation r LEFT JOIN roadmap_gh_links g ON g.roadmap_id = r.id WHERE g.roadmap_id IS NULL AND r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') AND r.source <> 'agent_issues' ORDER BY r.id LIMIT ?").bind(PS_RM_CREATE_PER_TICK).all()).results) || [];
  for (var j = 0; j < todo.length; j++) {
    var row = todo[j], p = psRmProject(row, byCode), num = byId[String(row.id)], node = num && openNums[num] ? openNums[num].node_id : null;
    if (!num) {
      var body = [
        "Mirrored from qnfo-audit.roadmap_implementation id **" + row.id + "** (PORTFOLIO-SYNC-1). D1 is authoritative: this closes",
        "when the item is verified there, with its evidence, and a hand close here is reopened.", "",
        "| field | value |", "|:--|:--|",
        "| item | " + tsRedact(row.item).replace(/\|/g, "/") + " |",
        "| status | " + String(row.status) + " |",
        "| source | " + tsRedact(row.source || "").replace(/\|/g, "/").slice(0, 160) + " |",
        "| artifact | " + tsRedact((row.artifact_type || "") + " " + (row.artifact_ref || "")).replace(/\|/g, "/").slice(0, 200) + " |",
        "| project | " + (p ? p.project_code : "") + " |", "",
        tsFence(row.evidence || "(no evidence yet)", 3000)
      ].join("\n");
      var payload = { title: ("[RM-" + row.id + "] " + tsRedact(row.item) + ": " + tsRedact(row.title || "")).replace(/@/g, "@\u200b").slice(0, 240), body: body, labels: psLabelSet(p ? p.program_code : "QNFO.OPS", row.source === "metric-breach" ? "fix" : "enhancement", ["roadmap"]) };
      if (p && p.gh_milestone) payload.milestone = p.gh_milestone;
      var c = await gh(env, "POST", PS_REPO + "/issues", payload);
      if (c.status !== 201 || !c.body) { out.errors.push({ scope: "portfolio-roadmap-mirror " + row.id, status: c.status, why: String(c.text).slice(0, 100) }); if (c.status === 403 || c.status === 429) break; continue; }
      num = c.body.number; node = c.body.node_id; out.roadmap_mirrored++;
    } else out.roadmap_relinked++;
    await env.AUDIT.prepare("INSERT OR REPLACE INTO roadmap_gh_links (roadmap_id, gh_number, gh_state, d1_status, project_code, gh_node, synced_at) VALUES (?, ?, 'open', ?, ?, ?, ?)").bind(row.id, num, row.status, p ? p.project_code : null, node, now).run();
  }
  return open;
}

async function psGql(env, query, variables) {
  var r = await fetch(API + "/graphql", { method: "POST", headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-github-steward/" + VERSION, "Content-Type": "application/json" }, body: JSON.stringify({ query: query, variables: variables || {} }) });
  var j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok || !j || j.errors) throw new Error("graphql " + r.status + " " + JSON.stringify(j && j.errors || "").slice(0, 160));
  return j.data;
}

/* Best effort: a failure is a recorded limitation, never a failed tick; milestones + labels are the primary view (two paths). */
async function psBoard(env, out) {
  try {
    var pid = await tsState(env, "portfolio_board_id");
    if (!pid) {
      var d = await psGql(env, "query($l:String!){organization(login:$l){id projectsV2(first:50){nodes{id title}}}}", { l: ORG });
      var found = (d.organization.projectsV2.nodes || []).filter(function (n) { return n.title === PS_BOARD; })[0];
      if (!found) {
        var c = await psGql(env, "mutation($o:ID!,$t:String!){createProjectV2(input:{ownerId:$o,title:$t}){projectV2{id}}}", { o: d.organization.id, t: PS_BOARD });
        pid = c.createProjectV2.projectV2.id; out.board_created = true;
      } else pid = found.id;
      await tsState(env, "portfolio_board_id", pid);
    }
    var items = ((await env.AUDIT.prepare("SELECT 'i' AS t, issue_id AS k, gh_node FROM issue_project_map WHERE gh_node IS NOT NULL AND gh_item IS NULL UNION ALL SELECT 'r', roadmap_id, gh_node FROM roadmap_gh_links WHERE gh_node IS NOT NULL AND gh_item IS NULL AND gh_state = 'open' LIMIT ?").bind(PS_BOARD_PER_TICK).all()).results) || [];
    var st = [];
    for (var i = 0; i < items.length; i++) {
      var a = await psGql(env, "mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}", { p: pid, c: items[i].gh_node });
      var iid = a.addProjectV2ItemById.item.id;
      st.push(items[i].t === "i" ? env.AUDIT.prepare("UPDATE issue_project_map SET gh_item = ? WHERE issue_id = ?").bind(iid, items[i].k) : env.AUDIT.prepare("UPDATE roadmap_gh_links SET gh_item = ? WHERE roadmap_id = ?").bind(iid, items[i].k));
      out.board_items_added++;
    }
    if (st.length) await env.AUDIT.batch(st);
  } catch (e) {
    out.limitations.push("projects-v2 board: " + String(e && e.message || e).slice(0, 160));
  }
}

async function portfolioSync(env) {
  var started = Date.now();
  var out = { version: VERSION, started_at: new Date(started).toISOString(), projects_created: 0, projects_reactivated: 0, projects_retired: 0, objectives_opened: 0, objectives_reopened: 0, objectives_verified: 0, issues_placed: 0, labels_created: 0, milestones_created: 0, milestones_reopened: 0, milestones_closed: 0, issues_synced: 0, roadmap_mirrored: 0, roadmap_relinked: 0, roadmap_closed: 0, roadmap_reopened: 0, board_items_added: 0, errors: [], limitations: [] };
  if (!env.AUDIT || !env.GITHUB_TOKEN) { out.errors.push({ scope: "portfolio", why: "AUDIT binding or GITHUB_TOKEN missing" }); return out; }
  /* PORTFOLIO-HEARTBEAT-1: measured 2026-10-18, /portfolio reported last_run 13:43:19Z while the
   * 13:53 tick was running, and there was no way to tell a stalled tick from a record that simply
   * had not been written yet (the record is only written at the END, line ~1119). Publishing an
   * in_progress marker first makes the two distinguishable: a marker with an old started_at and no
   * completion means the tick died; no marker at all means it never started. A heartbeat write must
   * never block the tick, so it is best-effort. */
  try { await tsState(env, "portfolio_last_run", JSON.stringify({ version: VERSION, started_at: out.started_at, state: "in_progress" })); } catch (e) { /* heartbeat is best-effort */ }
  var step = async function (name, fn) { try { return await fn(); } catch (e) { out.errors.push({ scope: "portfolio-" + name, why: String(e && e.message || e).slice(0, 160) }); return null; } };
  await step("derive", function () { return psDerive(env, out); });
  await step("objectives", function () { return psObjectives(env, out); });
  var projects = (await step("projects", async function () { return ((await env.AUDIT.prepare("SELECT project_code, program_code, name, description, status, gh_milestone FROM projects ORDER BY project_code").all()).results) || []; })) || [];
  await step("place", function () { return psPlace(env, out, projects); });
  var labelsOk = await step("labels", function () { return psLabels(env, out); });
  var ms = labelsOk ? await step("milestones", function () { return psMilestones(env, out, projects); }) : null;
  if (ms) {
    var openFleet = await step("list", function () { return tsListAll(env, PS_REPO + "/issues?state=open&labels=fleet-issue", 15); });
    if (openFleet) await step("issues", function () { return psIssues(env, out, projects, openFleet); });
    else out.errors.push({ scope: "portfolio-issues", why: "could not list open fleet-issue issues; no issue placement this tick" });
    await step("roadmap", function () { return psRoadmap(env, out, projects); });
  }
  await psBoard(env, out);
  await step("measure", async function () {
    var d = ((await env.AUDIT.prepare("SELECT kind, count(*) AS n FROM v_portfolio_drift GROUP BY kind").all()).results) || [];
    var total = 0; out.drift = {};
    d.forEach(function (r) { out.drift[r.kind] = r.n; total += r.n; });
    out.drift.total = total;
    await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = 'MEASURED' WHERE metric = 'portfolio_drift'").bind(String(total), new Date().toISOString()).run();
  });
  out.duration_ms = Date.now() - started;
  try { await tsState(env, "portfolio_last_run", JSON.stringify(out).slice(0, 20000)); } catch (e) { out.errors.push({ scope: "portfolio-record", why: String(e && e.message || e).slice(0, 120) }); }
  return out;
}

/* GET /roadmap: portfolio -> programs -> projects (open work by kind, open roadmap items, milestone link). Personal projects
 * are counted, never itemised (PERSONAL-QNFO-SEPARATION-1). */
async function portfolioTree(env) {
  var progs = ((await env.AUDIT.prepare("SELECT program_code, name FROM programs ORDER BY program_code").all()).results) || [];
  var projs = ((await env.AUDIT.prepare("SELECT project_code, program_code, name, source, gh_milestone FROM projects WHERE status = 'active' ORDER BY project_code").all()).results) || [];
  var kinds = ((await env.AUDIT.prepare("SELECT m.project_code, m.kind, count(*) AS n FROM issue_project_map m JOIN agent_issues a ON a.id = m.issue_id AND a.status = 'open' GROUP BY m.project_code, m.kind").all()).results) || [];
  var rms = ((await env.AUDIT.prepare("SELECT g.project_code, count(*) AS n FROM roadmap_gh_links g JOIN roadmap_implementation r ON r.id = g.roadmap_id WHERE r.status NOT IN ('verified','enforced-verified','violated-remediated','retired') GROUP BY g.project_code").all()).results) || [];
  var kBy = {}, rBy = {};
  kinds.forEach(function (k) { (kBy[k.project_code] = kBy[k.project_code] || {})[k.kind] = k.n; });
  rms.forEach(function (r) { rBy[r.project_code] = r.n; });
  var tree = { portfolio: "QNFO", repo: ORG + "/qnfo-workers", programs: [] };
  progs.forEach(function (g) {
    var ps = projs.filter(function (p) { return p.program_code === g.program_code; });
    var node = { program: g.program_code, name: g.name, label: PS_PROGRAMS[g.program_code] ? PS_PROGRAMS[g.program_code].label : null, projects: ps.length };
    if (g.program_code !== "QNFO.PERSONAL") node.items = ps.map(function (p) { return { project: p.project_code, name: p.name, source: p.source, milestone: p.gh_milestone ? "https://github.com/" + ORG + "/qnfo-workers/milestone/" + p.gh_milestone : null, open: kBy[p.project_code] || {}, roadmap_open: rBy[p.project_code] || 0 }; });
    tree.programs.push(node);
  });
  return tree;
}
// end PORTFOLIO-SYNC-1

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
  /* ISSUE-SYNC-1 moved to the 10-minute tracker tick (TRACKER-SYNC-1). */
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

    if (p === "/tracker" && request.method === "GET") {
      var last = null;
      try { last = JSON.parse(await tsState(env, "last_run") || "null"); } catch (e) { last = { error: String(e && e.message || e) }; }
      return json({ version: VERSION, cron: TS_CRON, last_run: last });
    }

    if (p === "/tracker/tick" && request.method === "POST") {
      if (!(await stewardKeyOk(env, request.headers.get("x-steward-key") || ""))) {
        return json({ ok: false, error: "POST /tracker/tick needs x-steward-key" }, 401);
      }
      return json({ ok: true, result: await trackerSync(env) });
    }

    if (p === "/portfolio" && request.method === "GET") {
      var plast = null;
      try { plast = JSON.parse(await tsState(env, "portfolio_last_run") || "null"); } catch (e) { plast = { error: String(e && e.message || e) }; }
      return json({ version: VERSION, cron: TS_CRON, last_run: plast });
    }

    if (p === "/roadmap" && request.method === "GET") {
      try { return json(await portfolioTree(env)); } catch (e) { return json({ error: String(e && e.message || e).slice(0, 200) }, 500); }
    }

    if (p === "/portfolio/tick" && request.method === "POST") {
      if (!(await stewardKeyOk(env, request.headers.get("x-steward-key") || ""))) {
        return json({ ok: false, error: "POST /portfolio/tick needs x-steward-key" }, 401);
      }
      return json({ ok: true, result: await portfolioSync(env) });
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

    return json({ error: "not found", routes: ["GET /health", "GET /report", "POST /tick", "GET /tracker", "POST /tracker/tick", "GET /portfolio", "GET /roadmap", "POST /portfolio/tick"] }, 404);
  },

  async scheduled(event, env, ctx) {
    if (event && event.cron === TS_CRON) {
      var ts = await trackerSync(env);
      console.log(JSON.stringify({ worker: "qnfo-github-steward", version: VERSION, cron: event.cron, tracker: { mirrored: ts.mirrored, relinked: ts.relinked, closed: ts.closed, reopened: ts.reopened, tasks_fixed: ts.tasks_fixed.length, drift: ts.drift, errors: ts.errors.length } }));
      /* PORTFOLIO-SYNC-1 runs after the tracker so it places the issues this tick just mirrored. */
      var ps = await portfolioSync(env);
      console.log(JSON.stringify({ worker: "qnfo-github-steward", version: VERSION, cron: event.cron, portfolio: { projects_created: ps.projects_created, projects_retired: ps.projects_retired, objectives_opened: ps.objectives_opened, objectives_verified: ps.objectives_verified, milestones_created: ps.milestones_created, issues_synced: ps.issues_synced, roadmap_mirrored: ps.roadmap_mirrored, roadmap_closed: ps.roadmap_closed, drift: ps.drift, errors: ps.errors.length, limitations: ps.limitations.length } }));
      return;
    }
    var res = await runReconcile(env, { workflows: false });
    await record(env, res);
    console.log(JSON.stringify({
      worker: "qnfo-github-steward", version: VERSION, cron: event.cron,
      checked: res.repos_checked, fixed: res.repos_fixed, protected: res.repos_protected,
      drift: res.drift.length, errors: res.errors.length, limitations: res.limitations.length
    }));
  }
};

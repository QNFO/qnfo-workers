#!/usr/bin/env python3
"""conflict_repair.py -- CONFLICT-REPAIR-DOER-1 (agent_issues 2305, charter pillar: autonomy).

WHAT  The doer for STALE-PR-CONFLICT-REPAIR-1 issues (qnfo-fleet-control files one per quiet pull request that conflicts with
      main). For one pull request it
        1. reads the pull request (open, same repository, not a draft, `mergeable_state: dirty`);
        2. branches `repair/pr-<n>-<head sha7>` from origin/main and merges the pull request's head into it without committing;
        3. resolves what can be resolved without judgement, keeping main's meaning everywhere else:
             - a conflict whose every hunk is only the `var VERSION = "..."` line of a worker.js takes the pull request's
               line (the next step bumps it), which is how nearly every conflict on this repository arises: two changes to
               one worker each bump the same line;
             - deployed-current.worker.js is never merged: it is rewritten from the resolved worker.js (mirror-guard);
             - anything else is a semantic overlap. The merge is aborted, nothing is pushed, and the outcome is
               `needs-session` with the files, so the issue stays open for a doer that can read the code;
        4. bumps each changed worker's VERSION above what main and every other open pull request claim (VERSION-AHEAD-1);
        5. runs the checks a pull request gets: node --check, the changed workers' suites (scripts/run-suites.mjs),
           mirror-guard, version-bump-guard and the workers-standards guard;
        6. with --push: pushes the branch, opens the replacement pull request naming the old one, dispatches the check
           workflows that accept a dispatch (a pull request opened with GITHUB_TOKEN starts none by itself), comments on
           the old pull request and closes it as superseded by the new number.
      Every run writes one cloud_ops_events row (kind conflict-repair-reapplied, status ok | warn) and a branch_hygiene_log
      row; a pull request head that was already attempted is skipped (one attempt per head sha).
      It never merges, never force-pushes, never touches main, and refuses a pull request that changes .github/ (the
      Actions token may not push workflow files).
USAGE python3 scripts/conflict_repair.py --pr <n> [--push] [--keep-branch]
      python3 scripts/conflict_repair.py --all [--push] [--max 3]      every open STALE-PR-CONFLICT-REPAIR-1 issue's pull request
      python3 scripts/conflict_repair.py --selftest
      Reads GH_TOKEN (gh), CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (ledger rows; skipped with a warning when absent).
      Exit 0 unless the arguments are wrong: an outcome is data, written to the ledger and printed as JSON.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.environ.get("GITHUB_REPOSITORY") or "QNFO/qnfo-workers"
DB_ID = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"
VERSION_LINE = re.compile(r'^var VERSION = "([^"\n]*)"(;?.*)$', re.M)
ISSUE_PR = re.compile(r"STALE-PR-CONFLICT-REPAIR-1\b[^\d#]{0,40}#?(\d+)")
DISPATCHABLE = ["deploy-gate.yml", "version-bump-guard.yml", "charter-guard.yml", "version-compare.yml"]


def emit(msg):
    print(msg, flush=True)


SECRET_ENV = re.compile(r"TOKEN|SECRET|KEY|PASSWORD|CLOUDFLARE|CF_ACCOUNT", re.I)


def clean_env():
    """The environment without credentials: the suites and guards run the pull request's own code, which gets no token."""
    return {k: v for k, v in os.environ.items() if not SECRET_ENV.search(k)}


def sh(args, cwd=None, check=True, timeout=900, env=None):
    r = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
    if check and r.returncode != 0:
        raise RuntimeError("%s: %s" % (" ".join(args[:4]), (r.stderr or r.stdout).strip()[:400]))
    return r


def git(args, cwd=None, check=True):
    return sh(["git"] + list(args), cwd, check).stdout


def gh(path, method="GET", fields=None, raw=False):
    """One REST call through gh (GraphQL listings are refused in sessions). Returns parsed JSON, text when raw, or None on failure."""
    cmd = ["gh", "api", "-X", method, path]
    if raw:
        cmd += ["-H", "Accept: application/vnd.github.raw"]
    for k, v in (fields or {}).items():
        cmd += ["-f", "%s=%s" % (k, v)]
    r = sh(cmd, check=False, timeout=120)
    if r.returncode != 0:
        return None
    if raw:
        return r.stdout
    try:
        return json.loads(r.stdout) if r.stdout.strip() else {}
    except ValueError:
        return None


# ---- pure helpers ------------------------------------------------------------------------------------------------------

def read_version(text):
    m = VERSION_LINE.search(str(text or ""))
    return m.group(1) if m else None


def core(v):
    """'0.14.0-conflict-repair' -> (0, 14, 0); None when there is no numeric core."""
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)", str(v or ""))
    return tuple(int(x) for x in m.groups()) if m else None


def bump_above(version, others):
    """version stays when its core is above every core in others; otherwise the highest core's patch + 1, the suffix kept."""
    mine = core(version)
    top = max([c for c in (core(o) for o in others) if c] or [None], key=lambda c: c or (-1,))
    if mine is None:
        return None
    if top is None or mine > top:
        return version
    suffix = re.sub(r"^\d+\.\d+\.\d+", "", version)
    # keep the kind of release the change declared: a minor bump stays a minor bump above main
    if mine[2] == 0 and mine[1] > 0:
        return "%d.%d.0%s" % (top[0], top[1] + 1, suffix)
    return "%d.%d.%d%s" % (top[0], top[1], top[2] + 1, suffix)


def set_version(text, new):
    if len(VERSION_LINE.findall(text)) != 1:
        return None
    return VERSION_LINE.sub(lambda m: 'var VERSION = "' + new + '"' + m.group(2), text, count=1)


def resolve_version_only(text):
    """A file with merge conflict markers -> its text with every hunk resolved to the incoming (pull request) side, when every
    hunk is nothing but the VERSION line on both sides; None when any hunk carries something else (a semantic overlap)."""
    out, i, lines, hunks = [], 0, str(text).split("\n"), 0
    while i < len(lines):
        if not lines[i].startswith("<<<<<<< "):
            out.append(lines[i])
            i += 1
            continue
        ours, base, theirs, part = [], [], [], "ours"
        i += 1
        while i < len(lines) and not lines[i].startswith(">>>>>>> "):
            if lines[i].startswith("||||||| "):
                part = "base"
            elif lines[i] == "=======":
                part = "theirs"
            else:
                (ours if part == "ours" else base if part == "base" else theirs).append(lines[i])
            i += 1
        if i >= len(lines):
            return None  # an unterminated hunk
        i += 1
        if len(ours) != 1 or len(theirs) != 1 or not VERSION_LINE.fullmatch(ours[0]) or not VERSION_LINE.fullmatch(theirs[0]):
            return None
        out.append(theirs[0])
        hunks += 1
    return "\n".join(out) if hunks else None


def eligible(pr):
    """A pull request object -> None when the doer may take it, else the reason it does not."""
    if not isinstance(pr, dict) or not pr.get("number"):
        return "the pull request could not be read"
    if pr.get("state") != "open":
        return "the pull request is " + str(pr.get("state"))
    if pr.get("draft"):
        return "the pull request is a draft"
    head = pr.get("head") or {}
    if ((head.get("repo") or {}).get("full_name") or "") != ((pr.get("base") or {}).get("repo") or {}).get("full_name"):
        return "the head is a fork"
    if str(head.get("ref") or "").startswith("repair/"):
        return "the pull request is itself a repair"
    if pr.get("mergeable") is True:
        return "the pull request does not conflict with main"
    return None


def branch_name(pr):
    return "repair/pr-%d-%s" % (int(pr["number"]), str((pr.get("head") or {}).get("sha") or "")[:7])


def replacement_text(pr, bumped, checks):
    title = re.sub(r"\s*\(re-applied from #\d+\)$", "", str(pr.get("title") or "pull request %s" % pr["number"]))[:200] + " (re-applied from #%d)" % pr["number"]
    body = ("Charter pillar: autonomy. CONFLICT-REPAIR-DOER-1 (agent_issues 2305): pull request #%d conflicted with main and went quiet, so its "
            "commits are re-applied here on top of main. Only VERSION-line and mirror conflicts were resolved; every other line is the "
            "original change or main.\n\n" % pr["number"])
    if bumped:
        body += "VERSION raised above main and the open pull requests: " + "; ".join("%s %s -> %s" % b for b in bumped) + ".\n\n"
    body += "Checked on the runner before the push: " + "; ".join("%s %s" % (k, "ok" if v else "FAILED") for k, v in checks) + ".\n\n"
    body += "Supersedes #%d, which is closed with this number.\n\n---\nOriginal description:\n\n%s\n" % (pr["number"], str(pr.get("body") or "")[:6000])
    return title, body


def issue_prs(titles):
    """Issue titles -> the pull request numbers they name, in order, once each."""
    out = []
    for t in titles or []:
        m = ISSUE_PR.search(str(t or ""))
        if m and int(m.group(1)) not in out:
            out.append(int(m.group(1)))
    return out


# ---- the re-apply ------------------------------------------------------------------------------------------------------

def reapply(head_ref, base_ref, branch, cwd=None, message=None):
    """Merges head_ref into a new branch cut from base_ref and resolves VERSION-only and mirror conflicts.
    Returns {"outcome": "reapplied", "workers": [dir], "resolved": [path]} with the merge staged but NOT committed, or
    {"outcome": "needs-session" | "clean" | "error", ...} with the tree restored."""
    git(["checkout", "-q", "-B", branch, base_ref], cwd)
    r = sh(["git", "merge", "--no-ff", "--no-commit", head_ref], cwd, check=False)
    conflicted = [p for p in git(["diff", "--name-only", "--diff-filter=U"], cwd).split("\n") if p]
    if r.returncode != 0 and not conflicted:
        sh(["git", "merge", "--abort"], cwd, check=False)
        return {"outcome": "error", "error": (r.stderr or r.stdout).strip()[:300]}
    resolved, hard = [], []
    for p in conflicted:
        full = os.path.join(cwd or ".", p)
        if os.path.basename(p) == "deployed-current.worker.js":
            continue  # rewritten from worker.js below
        if os.path.basename(p) == "worker.js" and os.path.isfile(full):
            with open(full, encoding="utf-8", errors="replace") as fh:
                fixed = resolve_version_only(fh.read())
            if fixed is not None:
                with open(full, "w", encoding="utf-8") as fh:
                    fh.write(fixed)
                git(["add", p], cwd)
                resolved.append(p)
                continue
        hard.append(p)
    if hard:
        sh(["git", "merge", "--abort"], cwd, check=False)
        return {"outcome": "needs-session", "files": hard, "resolved": resolved}
    changed = [p for p in git(["diff", "--name-only", "--cached", base_ref], cwd).split("\n") if p]
    changed = sorted(set(changed) | set(conflicted))
    workers = sorted({p.split("/")[0] for p in changed if re.fullmatch(r"[^/]+/(?:worker\.js|deployed-current\.worker\.js)", p)})
    for w in workers:
        src, mirror = os.path.join(cwd or ".", w, "worker.js"), os.path.join(cwd or ".", w, "deployed-current.worker.js")
        if os.path.isfile(src) and (os.path.isfile(mirror) or (w + "/deployed-current.worker.js") in conflicted):
            shutil.copyfile(src, mirror)
            git(["add", w + "/deployed-current.worker.js"], cwd)
            if (w + "/deployed-current.worker.js") in conflicted:
                resolved.append(w + "/deployed-current.worker.js")
    return {"outcome": "reapplied" if conflicted else "clean", "workers": workers, "resolved": resolved, "changed": changed}


def claimed_versions(worker, skip_pr=None):
    """VERSIONs that main and the open pull requests (except skip_pr) claim for a worker (REST, as CLAUDE.md prescribes)."""
    out = []
    refs = [("main", None)]
    for p in gh("repos/%s/pulls?state=open&per_page=100" % REPO) or []:
        if p.get("number") != skip_pr:
            refs.append((p["head"]["sha"], p["number"]))
    for ref, _n in refs:
        v = read_version(gh("repos/%s/contents/%s/worker.js?ref=%s" % (REPO, worker, ref), raw=True))
        if v:
            out.append(v)
    return out


def bump_workers(workers, skip_pr, cwd=None, claims=claimed_versions):
    """Raises each worker's VERSION above the claims and mirrors it. Returns [(worker, old, new)] for the ones that moved."""
    moved = []
    for w in workers:
        path = os.path.join(cwd or ".", w, "worker.js")
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        old = read_version(text)
        new = bump_above(old, claims(w, skip_pr)) if old else None
        if not new or new == old:
            continue
        fixed = set_version(text, new)
        if fixed is None:
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(fixed)
        mirror = os.path.join(cwd or ".", w, "deployed-current.worker.js")
        if os.path.isfile(mirror):
            shutil.copyfile(path, mirror)
            git(["add", w + "/deployed-current.worker.js"], cwd)
        git(["add", w + "/worker.js"], cwd)
        moved.append((w, old, new))
    return moved


def run_checks(workers, base_ref, cwd=None):
    """[(name, passed)] of the checks a pull request gets, run on the staged-and-committed tree."""
    out = []
    root = cwd or "."
    env = clean_env()
    for w in workers:
        if os.path.isfile(os.path.join(root, w, "worker.js")):
            out.append(("node --check " + w, sh(["node", "--check", w + "/worker.js"], cwd, check=False, env=env).returncode == 0))
    changed = os.path.join(root, ".conflict-repair-changed.txt")
    dirs = sorted({p.split("/")[0] for p in git(["diff", "--name-only", base_ref, "HEAD"], cwd).split("\n") if p})
    with open(changed, "w", encoding="utf-8") as fh:
        fh.write("\n".join(dirs) + "\n")
    try:
        out.append(("suites", sh(["node", "scripts/run-suites.mjs", "--changed-file", changed, "--jobs", "4", "--timeout", "180"], cwd, check=False, timeout=1500, env=env).returncode == 0))
    finally:
        os.remove(changed)
    out.append(("mirror-guard", sh([sys.executable, "scripts/mirror-guard.py", "--scope-to-diff=" + base_ref], cwd, check=False, env=env).returncode == 0))
    out.append(("version-bump-guard", sh([sys.executable, "scripts/version-bump-guard.py", git(["rev-parse", base_ref], cwd).strip(), git(["rev-parse", "HEAD"], cwd).strip()], cwd, check=False, env=env).returncode == 0))
    out.append(("workers-standards-guard", sh([sys.executable, "scripts/workers_standards_guard.py", base_ref], cwd, check=False, env=env).returncode == 0))
    return out


def ledger(pr_number, head_sha, status, text, meta):
    acct, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    if not (acct and token):
        emit("::warning::conflict-repair: no Cloudflare credentials, the outcome is recorded only in this log")
        return False
    try:
        from apply_migrations import d1
        d1(acct, token, DB_ID, "INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, status, text, job, meta) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'conflict-repair-reapplied', ?2, ?3, 'conflict-repair', ?4)",
           ["conflict-repair-%d-%s" % (pr_number, str(head_sha)[:7]), status, text[:900], json.dumps(meta)[:3000]])
        d1(acct, token, DB_ID, "INSERT INTO branch_hygiene_log (ts, branch, sha, action, why, pr, ok, dry) VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?1, ?2, 'conflict-repair-reapplied', ?3, ?4, ?5, ?6)",
           [str(meta.get("branch") or ""), str(head_sha), text[:400], pr_number, 1 if status == "ok" else 0, 0 if meta.get("pushed") else 1])
        return True
    except Exception as e:  # noqa: BLE001
        emit("::warning::conflict-repair: ledger write failed: " + str(e)[:200])
        return False


def attempted(pr_number, head_sha):
    acct, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    if not (acct and token):
        return False
    try:
        from apply_migrations import d1
        rows = d1(acct, token, DB_ID, "SELECT id FROM cloud_ops_events WHERE id = ?1 AND json_extract(meta, '$.pushed') = 1", ["conflict-repair-%d-%s" % (pr_number, str(head_sha)[:7])])
        return bool(rows)
    except Exception:  # noqa: BLE001
        return False


def open_issue_prs():
    acct, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    if not (acct and token):
        return []
    from apply_migrations import d1
    rows = d1(acct, token, DB_ID, "SELECT title FROM agent_issues WHERE status = 'open' AND title LIKE 'STALE-PR-CONFLICT-REPAIR-1%' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, id LIMIT 20")
    return issue_prs([r.get("title") for r in rows or []])


def repair(number, push=False, keep_branch=False):
    pr = gh("repos/%s/pulls/%d" % (REPO, number))
    why = eligible(pr)
    if why:
        return {"pr": number, "outcome": "skipped", "why": why}
    head_sha = pr["head"]["sha"]
    if push and attempted(number, head_sha):
        return {"pr": number, "outcome": "skipped", "why": "head %s was already re-applied and pushed" % head_sha[:7]}
    files = [f.get("filename") for f in gh("repos/%s/pulls/%d/files?per_page=100" % (REPO, number)) or []]
    branch = branch_name(pr)
    meta = {"pr": number, "head": head_sha, "branch": branch, "pushed": 0}
    if any(str(f).startswith(".github/") for f in files):
        res = {"pr": number, "outcome": "needs-session", "why": "the pull request changes .github/, which the Actions token may not push", "files": [f for f in files if str(f).startswith(".github/")]}
        ledger(number, head_sha, "warn", "CONFLICT-REPAIR-DOER-1 PR %d not re-applied: %s" % (number, res["why"]), dict(meta, outcome="needs-session"))
        return res
    start = git(["rev-parse", "--abbrev-ref", "HEAD"]).strip()
    git(["fetch", "-q", "origin", "main"])
    git(["fetch", "-q", "origin", "+refs/pull/%d/head:refs/remotes/origin/pr-%d" % (number, number)])
    res = {"pr": number, "branch": branch}
    try:
        r = reapply("refs/remotes/origin/pr-%d" % number, "origin/main", branch)
        res.update(r)
        if r["outcome"] not in ("reapplied", "clean"):
            ledger(number, head_sha, "warn", "CONFLICT-REPAIR-DOER-1 PR %d not re-applied (%s): %s" % (number, r["outcome"], ", ".join(r.get("files") or []) or r.get("error") or ""), dict(meta, outcome=r["outcome"], files=r.get("files")))
            if push and r["outcome"] == "needs-session":
                gh("repos/%s/issues/%d/comments" % (REPO, number), "POST", {"body": "CONFLICT-REPAIR-DOER-1 could not re-apply this pull request onto main without judgement. Overlapping files: `%s`. Only VERSION-line and mirror conflicts are resolved automatically; the repair issue stays open for a session or the code loop." % "`, `".join(r.get("files") or [])})
            return res
        bumped = bump_workers(r["workers"], number)
        res["bumped"] = bumped
        git(["-c", "user.name=qnfo-conflict-repair", "-c", "user.email=conflict-repair@users.noreply.github.com", "commit", "-q", "-m",
             "re-apply #%d onto main (CONFLICT-REPAIR-DOER-1)\n\n%s\n\nResolved without judgement: %s. VERSION: %s." % (
                 number, str(pr.get("title") or "")[:200], ", ".join(r["resolved"]) or "nothing (clean merge)", "; ".join("%s %s -> %s" % b for b in bumped) or "unchanged")])
        checks = run_checks(r["workers"], "origin/main")
        res["checks"] = checks
        res["sha"] = git(["rev-parse", "HEAD"]).strip()
        if not all(v for _, v in checks):
            res["outcome"] = "checks-failed"
            ledger(number, head_sha, "warn", "CONFLICT-REPAIR-DOER-1 PR %d re-applied but not pushed, failed: %s" % (number, ", ".join(k for k, v in checks if not v)), dict(meta, outcome="checks-failed"))
            return res
        if not push:
            res["outcome"] = "reapplied-dry"
            return res
        git(["push", "origin", branch])
        meta["pushed"] = 1
        title, body = replacement_text(pr, bumped, checks)
        new = gh("repos/%s/pulls" % REPO, "POST", {"title": title, "head": branch, "base": "main", "body": body})
        if new and new.get("number"):
            res["new_pr"] = new["number"]
            for wf in DISPATCHABLE:
                sh(["gh", "workflow", "run", wf, "--repo", REPO, "--ref", branch], check=False, timeout=60)
            gh("repos/%s/issues/%d/comments" % (REPO, number), "POST", {"body": "Superseded by #%d: CONFLICT-REPAIR-DOER-1 re-applied this change onto main (%s)." % (new["number"], "; ".join("%s %s -> %s" % b for b in bumped) or "no VERSION change")})
            gh("repos/%s/pulls/%d" % (REPO, number), "PATCH", {"state": "closed"})
            res["outcome"] = "replaced"
        else:
            res["outcome"] = "branch-pushed"
        ledger(number, head_sha, "ok", "CONFLICT-REPAIR-DOER-1 PR %d re-applied onto main as %s (%s), replacement %s" % (number, branch, res["sha"][:7], ("#%d" % res["new_pr"]) if res.get("new_pr") else "not opened: the branch waits for an opener"),
               dict(meta, outcome=res["outcome"], new_pr=res.get("new_pr"), sha=res["sha"], bumped=bumped))
        return res
    finally:
        sh(["git", "merge", "--abort"], check=False)
        sh(["git", "checkout", "-q", "-f", start], check=False)
        if not keep_branch:
            sh(["git", "branch", "-q", "-D", branch], check=False)


def selftest():
    import tempfile
    fails = []

    def ok(c, name, detail=None):
        emit(("PASS " if c else "FAIL ") + name + ("" if c or detail is None else " -- " + repr(detail)[:400]))
        if not c:
            fails.append(name)
    os.environ["CONFLICT_REPAIR_SELFTEST_TOKEN"] = "x"
    ce = clean_env()
    ok("CONFLICT_REPAIR_SELFTEST_TOKEN" not in ce and not any(SECRET_ENV.search(k) for k in ce) and "PATH" in ce, "clean_env drops every credential-named variable and keeps PATH")
    ok(core("0.14.0-conflict-repair") == (0, 14, 0) and core("x") is None, "core reads the numeric part")
    ok(bump_above("0.14.0-fix", ["0.13.9", "0.12.0"]) == "0.14.0-fix", "a VERSION already ahead stays")
    ok(bump_above("0.13.2-fix", ["0.13.5-a", "0.13.4"]) == "0.13.6-fix", "a patch release lands one patch above the highest claim, suffix kept")
    ok(bump_above("0.14.0-feature", ["0.16.1-perf", "0.15.0"]) == "0.17.0-feature", "a minor release stays a minor release above the highest claim")
    ok(bump_above("1.2.3", []) == "1.2.3" and bump_above("nope", ["1.0.0"]) is None, "no claims: unchanged; no numeric core: refused")
    ok(set_version('a\nvar VERSION = "1.0.0"; // x\nb', "1.0.1") == 'a\nvar VERSION = "1.0.1"; // x\nb' and set_version('var VERSION = "1";\nvar VERSION = "2";', "3") is None, "set_version rewrites the one VERSION line, refuses two")
    conflict = 'top\n<<<<<<< HEAD\nvar VERSION = "0.16.1-main";\n=======\nvar VERSION = "0.14.0-pr";\n>>>>>>> pr\nbody\n'
    ok(resolve_version_only(conflict) == 'top\nvar VERSION = "0.14.0-pr";\nbody\n', "a VERSION-only hunk takes the pull request's line")
    diff3 = 'top\n<<<<<<< HEAD\nvar VERSION = "0.16.1-main";\n||||||| base\nvar VERSION = "0.13.0";\n=======\nvar VERSION = "0.14.0-pr";\n>>>>>>> pr\n'
    ok(resolve_version_only(diff3) == 'top\nvar VERSION = "0.14.0-pr";\n', "diff3 markers are read too")
    ok(resolve_version_only(conflict + '<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> pr\n') is None, "a second hunk that is code makes the file a semantic overlap")
    ok(resolve_version_only('<<<<<<< HEAD\nvar VERSION = "1.0.0";\nconst x = 1;\n=======\nvar VERSION = "1.0.1";\n>>>>>>> pr\n') is None and resolve_version_only("no markers") is None and resolve_version_only('<<<<<<< HEAD\nvar VERSION = "1";\n') is None, "a hunk with more than the VERSION line, no hunk, or an unterminated hunk is refused")
    base_pr = {"number": 7, "state": "open", "draft": False, "mergeable": False, "title": "fix x", "body": "why", "head": {"sha": "abcdef1234", "ref": "fix/x", "repo": {"full_name": "o/r"}}, "base": {"repo": {"full_name": "o/r"}}}
    ok(eligible(base_pr) is None and "closed" in eligible(dict(base_pr, state="closed")) and "draft" in eligible(dict(base_pr, draft=True)) and "fork" in eligible(dict(base_pr, head=dict(base_pr["head"], repo={"full_name": "x/r"})))
       and "does not conflict" in eligible(dict(base_pr, mergeable=True)) and "itself a repair" in eligible(dict(base_pr, head=dict(base_pr["head"], ref="repair/pr-1-abc"))) and eligible(None), "eligible: open, same repository, not a draft, conflicting, not a repair")
    ok(branch_name(base_pr) == "repair/pr-7-abcdef1", "the branch names the pull request and its head")
    t, b = replacement_text(base_pr, [("w", "1.0.0", "1.0.2")], [("suites", True)])
    ok(t == "fix x (re-applied from #7)" and "Supersedes #7" in b and "w 1.0.0 -> 1.0.2" in b and "suites ok" in b and "Charter pillar: autonomy" in b and replacement_text(dict(base_pr, title=t), [], [])[0] == t, "the replacement names the old pull request, the bumps and the checks, and the suffix is not stacked")
    ok(issue_prs(["STALE-PR-CONFLICT-REPAIR-1 PR 910: quiet and conflicting", "STALE-PR-CONFLICT-REPAIR-1: PR #870 x", "STALE-PR-CONFLICT-REPAIR-1 PR 910 again", "OTHER-1 PR 5"]) == [910, 870], "issue titles give their pull request numbers once")
    # end to end in a throwaway repository: two changes bump one VERSION line; the quiet one is re-applied and bumped
    with tempfile.TemporaryDirectory() as d:
        def g(*a):
            return git(list(a), d)
        g("init", "-q", "-b", "main"); g("config", "user.email", "a@b.c"); g("config", "user.name", "t")
        os.mkdir(os.path.join(d, "w"))
        src = 'var VERSION = "1.0.0";\nexport default {\n  a: 1,\n\n\n\n\n  z: 1\n};\n'
        for f in ("worker.js", "deployed-current.worker.js"):
            open(os.path.join(d, "w", f), "w").write(src)
        open(os.path.join(d, "notes.txt"), "w").write("one\n")
        g("add", "-A"); g("commit", "-qm", "base")
        g("checkout", "-q", "-b", "quiet")
        for f in ("worker.js", "deployed-current.worker.js"):
            open(os.path.join(d, "w", f), "w").write(src.replace('"1.0.0"', '"1.0.1-quiet"').replace("z: 1", "z: 2"))
        g("commit", "-qam", "quiet change")
        g("checkout", "-q", "main")
        for f in ("worker.js", "deployed-current.worker.js"):
            open(os.path.join(d, "w", f), "w").write(src.replace('"1.0.0"', '"1.0.3-main"').replace("a: 1", "a: 9"))
        g("commit", "-qam", "main moved")
        r = reapply("quiet", "main", "repair/pr-1-abc", d)
        text = open(os.path.join(d, "w", "worker.js")).read()
        ok(r["outcome"] == "reapplied" and r["workers"] == ["w"] and "w/worker.js" in r["resolved"] and "w/deployed-current.worker.js" in r["resolved"] and 'var VERSION = "1.0.1-quiet";' in text and "a: 9" in text and "z: 2" in text and "<<<<<<<" not in text,
           "reapply: the VERSION conflict is resolved, main's line and the change's line both survive", (r, text))
        moved = bump_workers(r["workers"], 1, d, claims=lambda w, skip: ["1.0.3-main", "1.0.4-other-pr"])
        text = open(os.path.join(d, "w", "worker.js")).read()
        ok(moved == [("w", "1.0.1-quiet", "1.0.5-quiet")] and 'var VERSION = "1.0.5-quiet";' in text and text == open(os.path.join(d, "w", "deployed-current.worker.js")).read(), "bump_workers: VERSION lands above main and the other open claim, the mirror is identical", moved)
        g("commit", "-qm", "re-apply"); ok(git(["status", "--porcelain"], d).strip() == "", "the re-apply commits cleanly")
        g("checkout", "-q", "main"); g("checkout", "-q", "-b", "semantic")
        for f in ("worker.js", "deployed-current.worker.js"):
            cur = open(os.path.join(d, "w", f)).read()
            open(os.path.join(d, "w", f), "w").write(cur.replace("a: 9", "a: 7").replace('"1.0.3-main"', '"1.0.4-sem"'))
        g("commit", "-qam", "semantic change"); g("checkout", "-q", "main")
        for f in ("worker.js", "deployed-current.worker.js"):
            cur = open(os.path.join(d, "w", f)).read()
            open(os.path.join(d, "w", f), "w").write(cur.replace("a: 9", "a: 8").replace('"1.0.3-main"', '"1.0.6-main"'))
        g("commit", "-qam", "main moved again")
        r2 = reapply("semantic", "main", "repair/pr-2-def", d)
        ok(r2["outcome"] == "needs-session" and r2["files"] == ["w/worker.js"] and git(["status", "--porcelain"], d).strip() == "" and "a: 8" in open(os.path.join(d, "w", "worker.js")).read(), "reapply: an overlap in code is refused, the merge aborted and main's text kept", r2)
        g("checkout", "-q", "main"); g("checkout", "-q", "-b", "clean"); open(os.path.join(d, "notes.txt"), "w").write("one\ntwo\n"); g("commit", "-qam", "notes"); g("checkout", "-q", "main")
        ok(reapply("clean", "main", "repair/pr-3-aaa", d)["outcome"] == "clean", "reapply: a change that no longer conflicts is a clean merge")
    emit("conflict_repair selftest: " + ("ok" if not fails else "%d FAILED" % len(fails)))
    return 1 if fails else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pr", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--max", type=int, default=3)
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--keep-branch", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not a.pr and not a.all:
        ap.error("--pr <n> or --all")
    try:
        numbers = [a.pr] if a.pr else open_issue_prs()[: max(1, a.max)]
    except Exception as e:  # noqa: BLE001
        emit("::warning::conflict-repair: cannot read the repair issues: " + str(e)[:200])
        numbers = []
    if not numbers:
        emit(json.dumps({"conflict_repair": "nothing to do"}))
        return 0
    for n in numbers:
        try:
            emit(json.dumps({"conflict_repair": repair(n, a.push, a.keep_branch)}, default=str))
        except Exception as e:  # noqa: BLE001  (one pull request's failure never stops the next)
            emit(json.dumps({"conflict_repair": {"pr": n, "outcome": "error", "error": type(e).__name__ + ": " + str(e)[:300]}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

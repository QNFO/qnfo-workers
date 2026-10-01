#!/usr/bin/env python3
"""code-task-publish.py -- CODE-TASK-PUBLISH-1: PULL-BASED PR publishing for the qnfo-code-orchestrator loop.

WHY
  The orchestrator worker (and any session) holds no GitHub PR-write credential and a session cannot mint one,
  so a human sat on the critical path between "verified patch" and "PR". The GitHub Actions GITHUB_TOKEN already has
  contents: write + pull-requests: write for this repo. So the worker PARKS the verified patch in D1
  (code_tasks.status = 'ready_to_publish', patch in ctx.patch) and this script PULLS it from a workflow run.

WHAT IT DOES (per ready task of THIS repo)
  claim (ready_to_publish -> publishing, compare-and-set) -> re-check path policy -> reuse an existing PR for the
  branch if one exists (idempotent) -> else `git apply --check` + apply on a fresh branch off origin/main -> commit ->
  push -> open PR -> record status='published' + pr_url.  Any failure records status='publish_failed' with last_error.
  It NEVER merges, never force-pushes, never touches main, never deletes rows, and uses no credential other than the
  environment's (CF_ACCOUNT_ID / CLOUDFLARE_API_TOKEN for D1, GH_TOKEN for gh). No secret value is read or printed.

EXIT  0 = nothing failed (including "no tasks").  1 = at least one task ended publish_failed (loud, never silent).
      2 = configuration/transport error (could not read the queue).
USAGE python3 scripts/code-task-publish.py [--repo-dir .] [--base main] | --selftest
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

AUDIT_DB = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
REPO_NAME = "qnfo-workers"
REPO_NAME_FULL = "QNFO/qnfo-workers"
MAX_PATCH = 200_000
STALE_PUBLISHING_MIN = 30
D1_TIMEOUT_S = 45
D1_READ_ATTEMPTS = 3
# Mirror of the worker's DENY_PATH: the loop must never publish edits to workflows, wrangler config, deploy targets, env files.
DENY_PATH = re.compile(r"^(\.github/|\.git/)|(^|/)(wrangler\.toml|deploy-targets\.txt|\.env[^/]*)$", re.I)
BRANCH_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$")


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def ago(minutes: int) -> str:
    t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=minutes)
    return t.strftime("%Y-%m-%dT%H:%M:%S.000Z")


# ------------------------------------------------------------------ stores
class MissingTable(RuntimeError):
    """D1 said 'no such table'. For code_tasks that means the orchestrator has not run yet (it creates the table lazily),
    i.e. there is nothing to publish; every other D1 failure stays a hard error."""


class D1Store:
    """Cloudflare D1 over the REST API, same secrets the fleet workflows use (CF_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)."""

    def _q(self, sql, params):
        acct, token = os.environ.get("CF_ACCOUNT_ID", ""), os.environ.get("CLOUDFLARE_API_TOKEN", "")
        if not acct or not token:
            raise RuntimeError("CF_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set")
        url = f"https://api.cloudflare.com/client/v4/accounts/{acct}/d1/database/{AUDIT_DB}/query"
        req = urllib.request.Request(url, data=json.dumps({"sql": sql, "params": params}).encode(), method="POST",
                                     headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                                              "User-Agent": "qnfo-code-task-publish/1"})
        # D1-READ-RETRY-1 (#337): the REST read occasionally stalls (TimeoutError: The read operation timed out) and the
        # next run succeeds, so a SELECT is retried with backoff. Writes are not: a timed-out UPDATE may have landed,
        # and the claim is a compare-and-set whose retry would misread "already claimed" as "lost the race".
        attempts = D1_READ_ATTEMPTS if sql.lstrip().upper().startswith("SELECT") else 1
        try:
            for i in range(attempts):
                try:
                    with urllib.request.urlopen(req, timeout=D1_TIMEOUT_S) as r:
                        d = json.load(r)
                    break
                except (TimeoutError, urllib.error.URLError) as e:
                    if isinstance(e, urllib.error.HTTPError) or i + 1 >= attempts:
                        raise
                    print(f"[publish] D1 read attempt {i + 1}/{attempts} failed ({type(e).__name__}); retrying", flush=True)
                    time.sleep(2 ** i)
        except urllib.error.HTTPError as e:
            msg = ""
            try:  # Cloudflare error bodies carry {"errors":[{"message":...}]}; no secrets in them
                msg = "; ".join(str(x.get("message", "")) for x in (json.load(e).get("errors") or []))[:200]
            except Exception:
                pass
            if e.code == 400 and "no such table" in msg.lower():
                raise MissingTable(f"D1 HTTP 400: {msg}") from None
            raise RuntimeError(f"D1 HTTP {e.code}" + (f": {msg}" if msg else "")) from None
        if not d.get("success", d.get("ok", False)):
            raise RuntimeError("D1 query rejected")
        return d["result"][0]

    def rows(self, sql, params=()):
        return self._q(sql, list(params)).get("results") or []

    def changes(self, sql, params=()):
        return int((self._q(sql, list(params)).get("meta") or {}).get("changes") or 0)


class SqliteStore:
    """Offline stand-in with the same two methods (selftest only)."""

    def __init__(self, db):
        self.db = db
        db.row_factory = sqlite3.Row

    def rows(self, sql, params=()):
        return [dict(r) for r in self.db.execute(sql, list(params)).fetchall()]

    def changes(self, sql, params=()):
        c = self.db.execute(sql, list(params))
        self.db.commit()
        return c.rowcount


def list_ready(store):
    try:
        return store.rows(
            "SELECT * FROM code_tasks WHERE status='ready_to_publish' OR (status='publishing' AND updated_at < ?) ORDER BY created_at ASC LIMIT 20",
            [ago(STALE_PUBLISHING_MIN)])
    except MissingTable as e:
        # CODE-TASK-PUBLISH-NOTABLE-1 (watchdog issue 248): the table does not exist until qnfo-code-orchestrator first
        # runs, so every main push turned this workflow red with a bare 'D1 HTTP 400'. No table = nothing to publish.
        print("code_tasks does not exist yet (%s): nothing to publish" % e)
        return []


def claim(store, task):
    """Compare-and-set: only one publisher run wins a task. A stale 'publishing' row (crashed run) is re-claimable."""
    return store.changes(
        "UPDATE code_tasks SET status='publishing', updated_at=? WHERE id=? AND (status='ready_to_publish' OR (status='publishing' AND updated_at < ?))",
        [now(), task["id"], ago(STALE_PUBLISHING_MIN)]) == 1


def finish(store, tid, status, pr_url=None, err=None):
    store.changes("UPDATE code_tasks SET status=?, pr_url=COALESCE(?, pr_url), last_error=?, updated_at=? WHERE id=?",
                  [status, pr_url, (err or None) and ("publish: " + err)[:500], now(), tid])


# ------------------------------------------------------------------ git / PR
class GhPR:
    """Opens PRs with the gh CLI authenticated by GH_TOKEN (the workflow's GITHUB_TOKEN). Never merges."""

    def existing(self, branch):
        r = subprocess.run(["gh", "pr", "list", "--head", branch, "--state", "all", "--json", "url", "--limit", "1"],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("gh pr list failed: " + r.stderr.strip()[:200])
        j = json.loads(r.stdout or "[]")
        return j[0]["url"] if j else None

    def create(self, branch, base, title, body):
        r = subprocess.run(["gh", "pr", "create", "--head", branch, "--base", base, "--title", title, "--body", body],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("gh pr create failed: " + r.stderr.strip()[:200])
        return r.stdout.strip().splitlines()[-1]


def git(repo_dir, *args, check=True):
    r = subprocess.run(["git", "-c", "user.name=qnfo-code-task-publish", "-c", "user.email=fleet-bot@qnfo.org", *args],
                       cwd=repo_dir, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(("git " + args[0] + " failed: " + (r.stderr or r.stdout).strip())[:300])
    return r


def publish_one(task, repo_dir, base, pr):
    """Returns (status, pr_url, error). Raises nothing: every failure is a returned publish_failed."""
    try:
        try:
            ctx = json.loads(task.get("ctx") or "{}")
        except ValueError:
            return "publish_failed", None, "ctx is not valid JSON"
        patch, path = ctx.get("patch"), str(task.get("path") or "")
        branch = task.get("branch") or ("codeagent-" + str(task["id"])[3:15])
        if not isinstance(patch, str) or not patch.strip():
            return "publish_failed", None, "task has no patch in ctx.patch"
        if len(patch) > MAX_PATCH:
            return "publish_failed", None, f"patch larger than {MAX_PATCH} chars"
        if not path or path.startswith("/") or ".." in path or DENY_PATH.search(path):
            return "publish_failed", None, "path refused by policy: " + path[:100]
        if not BRANCH_RE.match(branch) or branch in ("main", "master") or ".." in branch:
            return "publish_failed", None, "branch refused: " + branch[:100]
        if task.get("repo") != REPO_NAME:
            return "publish_failed", None, "task repo is not " + REPO_NAME
        # The patch may only touch the task's declared path.
        files = set(re.findall(r"^\+\+\+ b/(.+)$", patch, re.M)) | set(re.findall(r"^--- a/(.+)$", patch, re.M))
        if files != {path}:
            return "publish_failed", None, "patch touches files other than the task path: " + ",".join(sorted(files))[:150]

        have = pr.existing(branch)  # idempotency: a crashed earlier run may already have opened the PR
        if have:
            return "published", have, None

        git(repo_dir, "checkout", "-q", "--detach", "origin/" + base)
        git(repo_dir, "reset", "-q", "--hard")
        git(repo_dir, "clean", "-qfd")
        git(repo_dir, "checkout", "-q", "-B", branch)
        pf = os.path.join(tempfile.mkdtemp(prefix="ctp-"), "task.patch")
        with open(pf, "w", encoding="utf-8", newline="") as fh:
            fh.write(patch)
        chk = git(repo_dir, "apply", "--check", pf, check=False)
        if chk.returncode != 0:
            return "publish_failed", None, "patch does not apply to " + base + ": " + (chk.stderr or "").strip()[:250]
        git(repo_dir, "apply", pf)
        git(repo_dir, "add", "--", path)
        git(repo_dir, "commit", "-q", "-m", "code-task " + task["id"] + ": " + str(task.get("goal") or "")[:60])
        git(repo_dir, "push", "origin", "refs/heads/" + branch + ":refs/heads/" + branch)
        body = ("Opened by code-task-publish from verified code-task `" + task["id"] + "`.\n\nGoal: " + str(task.get("goal") or "")[:500] +
                "\n\nThe patch passed the orchestrator's deterministic verifier. Review and merge it on GitHub (or close it); this workflow never merges.")
        try:
            url = pr.create(branch, base, "code-task: " + str(task.get("goal") or "")[:70], body)
        except RuntimeError as e:
            # Repo setting "Allow GitHub Actions to create pull requests" may be off. The branch is already
            # pushed, so record it as branch_pushed with the compare URL instead of failing the task; the
            # owner (from the compare URL) or the next run with a PR-capable token opens the PR from that branch.
            if "not permitted to create or approve pull requests" in str(e) or "createPullRequest" in str(e):
                return "branch_pushed", "https://github.com/" + REPO_NAME_FULL + "/compare/" + base + "..." + branch + "?expand=1", None
            raise
        return "published", url, None
    except Exception as e:  # noqa: BLE001 - a failure must become a recorded status, not a crash
        return "publish_failed", None, str(e)[:300]


def publish_all(store, repo_dir, base, pr, log=print):
    ready = list_ready(store)
    if not ready:
        log("no ready_to_publish tasks")
        return {"published": 0, "failed": 0, "skipped": 0}
    out = {"published": 0, "failed": 0, "skipped": 0}
    for t in ready:
        if t.get("repo") != REPO_NAME:
            log(f"skip {t['id']}: repo {t.get('repo')} is not {REPO_NAME}")
            out["skipped"] += 1
            continue
        if not claim(store, t):
            log(f"skip {t['id']}: claimed by another run")
            out["skipped"] += 1
            continue
        st, url, err = publish_one(t, repo_dir, base, pr)
        finish(store, t["id"], st, url, err)
        if st == "branch_pushed":
            out["published"] += 1
            log(f"::warning::branch_pushed {t['id']} -> {url} (PR creation refused by repo setting)")
        elif st == "published":
            out["published"] += 1
            log(f"published {t['id']} -> {url}")
        else:
            out["failed"] += 1
            log(f"::error::publish_failed {t['id']}: {err}")
    return out


# ------------------------------------------------------------------ selftest
class FakePR:
    def __init__(self, refuse=False):
        self.by_branch, self.created, self.refuse = {}, [], refuse

    def existing(self, branch):
        return self.by_branch.get(branch)

    def create(self, branch, base, title, body):
        if self.refuse:
            raise RuntimeError("gh pr create failed: GitHub Actions is not permitted to create or approve pull requests")
        url = f"https://github.com/QNFO/{REPO_NAME}/pull/{len(self.created) + 1}"
        self.by_branch[branch] = url
        self.created.append(branch)
        return url


DDL = ("CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT NOT NULL, path TEXT NOT NULL, goal TEXT NOT NULL, "
       "status TEXT NOT NULL DEFAULT 'queued', step TEXT NOT NULL DEFAULT 'read', attempts INTEGER NOT NULL DEFAULT 0, model TEXT, "
       "ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")


def _sh(cwd, *a):
    subprocess.run(a, cwd=cwd, check=True, capture_output=True, text=True)


def selftest():
    fails = []

    def check(name, cond, extra=""):
        print(("PASS " if cond else "FAIL ") + name + (("  -- " + str(extra)) if not cond and extra else ""))
        if not cond:
            fails.append(name)

    def fixture():
        root = tempfile.mkdtemp(prefix="ctp-selftest-")
        remote, work = os.path.join(root, "remote.git"), os.path.join(root, "work")
        _sh(root, "git", "init", "-q", "--bare", "-b", "main", remote)
        _sh(root, "git", "clone", "-q", remote, work)
        _sh(work, "git", "checkout", "-q", "-b", "main")
        os.makedirs(os.path.join(work, "scripts"))
        with open(os.path.join(work, "scripts/x.py"), "w") as fh:
            fh.write("def f():\n    return 1\n")
        _sh(work, "git", "add", "-A")
        _sh(work, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init")
        _sh(work, "git", "push", "-q", "origin", "main")
        db = sqlite3.connect(":memory:")
        db.execute(DDL)
        return remote, work, SqliteStore(db)

    good = ("diff --git a/scripts/x.py b/scripts/x.py\n--- a/scripts/x.py\n+++ b/scripts/x.py\n@@ -1,2 +1,2 @@\n-def f():\n-    return 1\n+def f():\n+    return 2\n")
    stale = good.replace("return 1", "return 99")  # base the file no longer has -> must not apply

    def add(store, tid, patch, repo=REPO_NAME, path="scripts/x.py", status="ready_to_publish", branch=None):
        store.changes("INSERT INTO code_tasks (id,repo,path,goal,status,step,ctx,branch,created_at,updated_at) VALUES (?,?,?,?,?,'done',?,?,?,?)",
                      [tid, repo, path, "return 2", status, json.dumps({"patch": patch}), branch or ("codeagent-" + tid[3:15]), now(), now()])

    def row(store, tid):
        return store.rows("SELECT * FROM code_tasks WHERE id=?", [tid])[0]

    quiet = lambda *_: None  # noqa: E731

    # 1. no tasks
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR()
    r = publish_all(store, work, "main", pr, quiet)
    check("no tasks: no-op, nothing created", r == {"published": 0, "failed": 0, "skipped": 0} and not pr.created, r)
    add(store, "ct_notready0001", good, status="needs_human")
    add(store, "ct_alreadydone1", good, status="published")
    r = publish_all(store, work, "main", pr, quiet)
    check("non-ready statuses are never touched", r["published"] == 0 and not pr.created and row(store, "ct_notready0001")["status"] == "needs_human")

    # 2. patch applies -> branch pushed, PR opened, recorded
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR()
    add(store, "ct_applyok00001", good)
    r = publish_all(store, work, "main", pr, quiet)
    t = row(store, "ct_applyok00001")
    check("patch applies: status published with pr_url", r["published"] == 1 and t["status"] == "published" and (t["pr_url"] or "").endswith("/pull/1"), t)
    shown = subprocess.run(["git", "--git-dir", remote, "show", "codeagent-applyok00001:scripts/x.py"], capture_output=True, text=True)
    check("patch applies: branch on the remote carries the change", shown.stdout == "def f():\n    return 2\n", shown.stderr)
    main_show = subprocess.run(["git", "--git-dir", remote, "show", "main:scripts/x.py"], capture_output=True, text=True)
    check("main is untouched (never merged)", main_show.stdout == "def f():\n    return 1\n")

    # 3. patch fails to apply -> publish_failed with a reason, no PR, no push
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR()
    add(store, "ct_applybad0001", stale)
    r = publish_all(store, work, "main", pr, quiet)
    t = row(store, "ct_applybad0001")
    check("patch fails: publish_failed with reason, never silent", r["failed"] == 1 and t["status"] == "publish_failed" and "does not apply" in (t["last_error"] or ""), t)
    br = subprocess.run(["git", "--git-dir", remote, "branch", "--list", "codeagent-applybad0001"], capture_output=True, text=True)
    check("patch fails: no PR and nothing pushed", not pr.created and br.stdout.strip() == "")
    add(store, "ct_policybad001", good, path=".github/workflows/x.yml")
    add(store, "ct_nopatch00001", "")
    add(store, "ct_wrongfile001", good.replace("scripts/x.py", "scripts/y.py"))
    publish_all(store, work, "main", pr, quiet)
    check("policy / empty / wrong-file patches are publish_failed with reasons",
          all(row(store, i)["status"] == "publish_failed" and row(store, i)["last_error"] for i in ("ct_policybad001", "ct_nopatch00001", "ct_wrongfile001")))

    # 4. idempotency: a second run does nothing; a crashed run's existing PR is adopted, not duplicated
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR()
    add(store, "ct_idem00000001", good)
    publish_all(store, work, "main", pr, quiet)
    publish_all(store, work, "main", pr, quiet)
    check("second run: exactly one PR", len(pr.created) == 1 and row(store, "ct_idem00000001")["status"] == "published")
    add(store, "ct_crashed00001", good, branch="codeagent-crashed00001")
    pr.by_branch["codeagent-crashed00001"] = "https://github.com/QNFO/qnfo-workers/pull/42"
    r = publish_all(store, work, "main", pr, quiet)
    t = row(store, "ct_crashed00001")
    check("existing PR for the branch is adopted (no duplicate PR/push)", t["status"] == "published" and t["pr_url"].endswith("/pull/42") and len(pr.created) == 1, t)
    add(store, "ct_inflight0001", good, status="publishing")
    r = publish_all(store, work, "main", pr, quiet)
    check("a fresh 'publishing' claim by another run is left alone", row(store, "ct_inflight0001")["status"] == "publishing" and r["published"] == 0)
    add(store, "ct_otherrepo001", good, repo="qnfo-site")
    publish_all(store, work, "main", pr, quiet)
    check("tasks for other repos are skipped, not failed", row(store, "ct_otherrepo001")["status"] == "ready_to_publish")
    check("a lost claim race is detected", claim(store, row(store, "ct_idem00000001")) is False)

    # 5. PR creation refused by the repo setting -> branch stays pushed, recorded as branch_pushed with a compare URL, not a failure
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR(refuse=True)
    add(store, "ct_nopr00000001", good)
    r = publish_all(store, work, "main", pr, quiet)
    t = row(store, "ct_nopr00000001")
    check("PR creation refused: branch_pushed with compare URL, not publish_failed",
          t["status"] == "branch_pushed" and "/compare/main...codeagent-nopr00000001" in (t["pr_url"] or "") and r["failed"] == 0, t)
    shown = subprocess.run(["git", "--git-dir", remote, "show", "codeagent-nopr00000001:scripts/x.py"], capture_output=True, text=True)
    check("PR creation refused: the branch still carries the change", shown.stdout == "def f():\n    return 2\n", shown.stderr)

    # 6. CODE-TASK-PUBLISH-NOTABLE-1: a missing code_tasks table is an empty queue; any other D1 error is still a hard failure
    class NoTable:
        def rows(self, sql, params=()):
            raise MissingTable("D1 HTTP 400: no such table: code_tasks at offset 14: SQLITE_ERROR")
        changes = rows

    class BrokenD1:
        def rows(self, sql, params=()):
            raise RuntimeError("D1 HTTP 500")
        changes = rows

    check("no code_tasks table: list_ready returns [] (nothing to publish)", list_ready(NoTable()) == [])
    remote, work, _ = fixture()
    r = publish_all(NoTable(), work, "main", FakePR(), quiet)
    check("no code_tasks table: publish_all is a clean no-op", r["published"] == 0 and r["failed"] == 0, r)
    try:
        list_ready(BrokenD1())
        check("a real D1 failure still raises", False)
    except RuntimeError as e:
        check("a real D1 failure still raises", "500" in str(e) and not isinstance(e, MissingTable), e)

    print(f"\nselftest: {len(fails)} failure(s)")
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-dir", default=".")
    ap.add_argument("--base", default="main")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    store = D1Store()
    try:
        git(a.repo_dir, "fetch", "-q", "origin", a.base)
        out = publish_all(store, a.repo_dir, a.base, GhPR())
    except RuntimeError as e:
        print("::error::code-task-publish could not run: " + str(e))
        return 2
    print(json.dumps(out))
    return 1 if out["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())

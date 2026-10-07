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
  Then (PR-OUTCOME-RECONCILE-1) it reads the state of each published / branch_pushed / pr_open task's PR and records
  status='merged' or 'closed' once a person has merged or closed it.

PR OPENED BY THE FLEET (CODE-TASK-MERGE-RUNNER-1, CODE_TASK_PR_OPENER=qnfo-fleet-control)
  A PR opened with the Actions GITHUB_TOKEN starts no pull_request workflow, so its required checks never run, and this
  workflow holds no other GitHub credential. With CODE_TASK_PR_OPENER=qnfo-fleet-control (set in code-task-publish.yml)
  the script pushes the branch and stops at status='branch_pushed' with the compare URL; qnfo-fleet-control opens the PR
  with the fleet's own token within the hour (CI then starts by itself) and merges it when the checks and its gates pass.
  An existing PR for the branch is still adopted. Without the variable the script opens the PR itself, as before.
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
import shutil
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

    def state(self, url):
        """OPEN, MERGED or CLOSED for a PR URL (read-only)."""
        r = subprocess.run(["gh", "pr", "view", url, "--json", "state", "--jq", ".state"], capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError("gh pr view failed: " + r.stderr.strip()[:200])
        return r.stdout.strip().upper()


def git(repo_dir, *args, check=True):
    r = subprocess.run(["git", "-c", "user.name=qnfo-code-task-publish", "-c", "user.email=fleet-bot@qnfo.org", *args],
                       cwd=repo_dir, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(("git " + args[0] + " failed: " + (r.stderr or r.stdout).strip())[:300])
    return r


def compare_url(base, branch):
    return "https://github.com/" + REPO_NAME_FULL + "/compare/" + base + "..." + branch + "?expand=1"


# PUBLISH-JS-CHECK-1 (2026-10-02): the orchestrator's in-Worker JS verifier passed a patch that does not parse (code task
# ct_4c0lf1nu36lp6g: unescaped double quotes inside a string at personal-companion/worker.js:934), and the PR reached CI,
# where deploy-gate rejected it (run 36981662012, ci-watchdog #445). This runner has a real JavaScript parser, so every
# .js/.mjs file the patch touches is parsed here after `git apply`, before anything is pushed. A file that does not parse
# goes back to the orchestrator's propose step with the parser's message as feedback (SELF-REPAIR-1 counts the attempt),
# never to a PR. The check is syntax only: imports are not resolved and nothing is executed.
#
# PUBLISH-PY-CHECK-1 (2026-10-07, SCOPE-SCRIPTS-1, issue 2100): the same gate for a patched .py file, so that a scripts/*.py code
# task that does not parse goes back to propose instead of to a pull request once the merge runner takes that path. This runner
# is Python, so compile() is the parser; the file is read, never imported or executed.
def py_syntax_error(repo_dir, f):
    """The parse error of one .py file, or None."""
    src = os.path.join(repo_dir, f)
    if not os.path.isfile(src):
        return None
    try:
        with open(src, "rb") as fh:
            compile(fh.read(), f, "exec")
    except SyntaxError as e:
        return (f + ": SyntaxError: " + str(e.msg) + " (" + f + ":" + str(e.lineno or 0) + ")")[:400]
    except ValueError as e:  # a null byte in the source
        return (f + ": " + str(e))[:400]
    return None


def js_syntax_errors(repo_dir, files):
    """First parse error among the patched .js/.mjs/.py files, or None (a .js file is also None when node is not installed)."""
    for f in files:
        if f.endswith(".py"):
            bad = py_syntax_error(repo_dir, f)
            if bad:
                return bad
            continue
        if not (f.endswith(".js") or f.endswith(".mjs")):
            continue
        src = os.path.join(repo_dir, f)
        if not os.path.isfile(src):
            continue
        tmp = os.path.join(tempfile.mkdtemp(prefix="ctp-js-"), "check.mjs")  # .mjs: parse as an ES module on any Node version
        shutil.copyfile(src, tmp)
        try:
            r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True, timeout=60)
        except FileNotFoundError:
            return None
        if r.returncode != 0:
            lines = [ln for ln in (r.stderr or "").splitlines() if ln.strip()]
            where = next((ln.strip().replace(tmp, f) for ln in lines if tmp in ln), f)
            what = next((ln.strip() for ln in lines if "Error" in ln), lines[-1].strip() if lines else "parse failed")
            return (f + ": " + what + " (" + where + ")")[:400]
    return None


def requeue_for_syntax(store, tid, err):
    """Send a task whose patch does not parse back to the orchestrator's propose step with the parser's message."""
    lang = "Python does not parse after applying the edits (compile, PUBLISH-PY-CHECK-1): " if "SyntaxError" in err and ".py:" in err else \
        "JavaScript does not parse after applying the edits (node --check, PUBLISH-JS-CHECK-1): "
    msg = (lang + err)[:500]
    return store.changes(
        "UPDATE code_tasks SET status='queued', step='propose', attempts=attempts+1, lease_until=NULL, last_error=?, "
        "ctx=json_set(COALESCE(ctx, '{}'), '$.lastError', ?), updated_at=? WHERE id=?",
        [msg, msg, now(), tid])


# REBASE-BEFORE-PUBLISH-1 (2026-10-06, transformation lever T1.3, pillar autonomy). The orchestrator parks the patch it built
# against the file it read (ctx.base) together with the SEARCH/REPLACE edits it applied (ctx.edits) and the mirror it saw
# identical (ctx.mirror). main moves between the proposal and this run (every canonical deploy rewrites the VERSION line the
# patch also touches), so `git apply --check` refused three publishes in the 14 days to 2026-10-06 ("patch does not apply":
# ct_826d5o9zjt6eix radar-hub, ct_hsbeng8unl6djw calendar-api, ct_6dpoljohrddtgn qnfo-email) and qnfo-fleet-control re-proposed
# each one with a model call (at most twice). A patch that no longer applies is now rebuilt without a model: the same edits are
# re-applied to the file at the current base (each SEARCH text exactly once in the whole file, the orchestrator's applyEdits
# rule over the whole file instead of its window), a js/mjs VERSION line is bumped from the current base as the orchestrator's
# bumpVersion does, and the mirror carries the same text when it still equals the source on main. No edits, a SEARCH that is
# gone or ambiguous, a mirror that drifted, or a rebuild that changes nothing still end publish_failed with the reason.
VERSION_DECL = re.compile(r'^((?:var|const|let) VERSION\s*=\s*")(\d+)\.(\d+)\.(\d+)([^"\n]*)(";?)', re.M)
MAX_EDITS = 8  # = the orchestrator's MAX_EDITS


def bump_version(cur: str, text: str) -> str:
    """The orchestrator's bumpVersion: patch number + 1 with the -codeagent tag, when the declaration is unchanged and unique."""
    a, b = VERSION_DECL.search(cur), VERSION_DECL.search(text)
    if not a or not b or a.group(0) != b.group(0) or text.count(a.group(0)) != 1:
        return text
    return text.replace(a.group(0), a.group(1) + a.group(2) + "." + a.group(3) + "." + str(int(a.group(4)) + 1) + "-codeagent" + a.group(6))


def apply_edits(cur: str, edits):
    """The orchestrator's applyEdits over the whole file: (text, None) or (None, reason)."""
    if not isinstance(edits, list) or not edits:
        return None, "no SEARCH/REPLACE edits parked in ctx.edits"
    if len(edits) > MAX_EDITS:
        return None, f"too many edits ({len(edits)} > {MAX_EDITS})"
    spans = []
    for i, e in enumerate(edits, 1):
        srch, repl = (e or {}).get("search"), (e or {}).get("replace")
        if not isinstance(srch, str) or not srch or not isinstance(repl, str):
            return None, f"edit {i}: malformed (search/replace must be non-empty strings)"
        n = cur.count(srch)
        if n != 1:
            return None, f"edit {i}: SEARCH text occurs {n} times in the current file (it must occur exactly once)"
        at = cur.index(srch)
        spans.append((at, at + len(srch), repl))
    spans.sort()
    for i in range(1, len(spans)):
        if spans[i][0] < spans[i - 1][1]:
            return None, "edits overlap"
    out = cur
    for at, end, repl in reversed(spans):
        out = out[:at] + repl + out[end:]
    return out, None


def _read_text(fp):
    with open(fp, encoding="utf-8", newline="") as fh:
        return fh.read()


def rebase_edits(repo_dir, path, ctx, base):
    """Rebuild the task's change from ctx.edits on the checked-out base. Returns (files, note, error): files is the set of
    paths written (the source and, when ctx.mirror names one that equals the source on the base, its mirror)."""
    fp = os.path.join(repo_dir, path)
    if not os.path.isfile(fp):
        return None, None, path + " is not a file on " + base
    cur = _read_text(fp)
    text, err = apply_edits(cur, ctx.get("edits"))
    if err:
        return None, None, err
    if path.endswith((".js", ".mjs")):
        text = bump_version(cur, text)
    if text == cur:
        return None, None, "re-applying the edits changes nothing on " + base + " (the change may already be on main)"
    files = {path}
    mirror = ctx.get("mirror")
    if isinstance(mirror, str) and mirror:
        if mirror.startswith("/") or ".." in mirror or DENY_PATH.search(mirror) or not os.path.isfile(os.path.join(repo_dir, mirror)):
            return None, None, "mirror " + mirror[:80] + " is not a file on " + base
        if _read_text(os.path.join(repo_dir, mirror)) != cur:
            return None, None, "mirror " + mirror[:80] + " no longer equals the source on " + base + " (mirror-guard would fail)"
        files.add(mirror)
    for f in sorted(files):
        with open(os.path.join(repo_dir, f), "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
    head = git(repo_dir, "rev-parse", "--short", "origin/" + base, check=False).stdout.strip() or base
    edits = ctx.get("edits") or []
    note = ("REBASE-BEFORE-PUBLISH-1: the parked patch did not apply to " + base + "@" + head + "; " + str(len(edits)) +
            " edit" + ("" if len(edits) == 1 else "s") + " re-applied to the current file" + (", mirror rewritten" if mirror in files else "") + " (no model call)")
    return files, note, None


def note_rebase(store, tid, note):
    return store.changes("UPDATE code_tasks SET ctx=json_set(COALESCE(ctx, '{}'), '$.rebased', ?), updated_at=? WHERE id=?", [note[:300], now(), tid])


def publish_one(task, repo_dir, base, pr, delegate=False):
    """Returns (status, pr_url, error, note). Raises nothing: every failure is a returned publish_failed.
    delegate=True: push the branch and stop at branch_pushed; qnfo-fleet-control opens the PR with the fleet token."""
    try:
        try:
            ctx = json.loads(task.get("ctx") or "{}")
        except ValueError:
            return "publish_failed", None, "ctx is not valid JSON", None
        patch, path = ctx.get("patch"), str(task.get("path") or "")
        branch = task.get("branch") or ("codeagent-" + str(task["id"])[3:15])
        if not isinstance(patch, str) or not patch.strip():
            return "publish_failed", None, "task has no patch in ctx.patch", None
        if len(patch) > MAX_PATCH:
            return "publish_failed", None, f"patch larger than {MAX_PATCH} chars", None
        if not path or path.startswith("/") or ".." in path or DENY_PATH.search(path):
            return "publish_failed", None, "path refused by policy: " + path[:100], None
        if not BRANCH_RE.match(branch) or branch in ("main", "master") or ".." in branch:
            return "publish_failed", None, "branch refused: " + branch[:100], None
        if task.get("repo") != REPO_NAME:
            return "publish_failed", None, "task repo is not " + REPO_NAME, None
        # The patch may only touch the task's declared path.
        files = set(re.findall(r"^\+\+\+ b/(.+)$", patch, re.M)) | set(re.findall(r"^--- a/(.+)$", patch, re.M))
        # PATCH-MODE-1: a worker source may carry its deployed-current mirror in the same patch (mirror-guard), nothing else.
        mirror = path[: -len("worker.js")] + "deployed-current.worker.js" if path.endswith("/worker.js") or path == "worker.js" else None
        if files != {path} and not (mirror and files == {path, mirror}):
            return "publish_failed", None, "patch touches files other than the task path: " + ",".join(sorted(files))[:150], None

        have = pr.existing(branch)  # idempotency: a crashed earlier run may already have opened the PR
        if have:
            return "published", have, None, None

        git(repo_dir, "checkout", "-q", "--detach", "origin/" + base)
        git(repo_dir, "reset", "-q", "--hard")
        git(repo_dir, "clean", "-qfd")
        git(repo_dir, "checkout", "-q", "-B", branch)
        pf = os.path.join(tempfile.mkdtemp(prefix="ctp-"), "task.patch")
        with open(pf, "w", encoding="utf-8", newline="") as fh:
            fh.write(patch)
        chk = git(repo_dir, "apply", "--check", pf, check=False)
        note = None
        if chk.returncode != 0:
            why = "patch does not apply to " + base + ": " + (chk.stderr or "").strip()[:250]
            files, note, rb_err = rebase_edits(repo_dir, path, ctx, base)
            if rb_err:
                git(repo_dir, "reset", "-q", "--hard")
                return "publish_failed", None, why + "; rebase: " + rb_err, None
        else:
            git(repo_dir, "apply", pf)
        bad = js_syntax_errors(repo_dir, sorted(files))
        if bad:
            git(repo_dir, "reset", "-q", "--hard")
            git(repo_dir, "checkout", "-q", "--detach", "origin/" + base)
            return "syntax_retry", None, bad, None
        git(repo_dir, "add", "--", *sorted(files))
        git(repo_dir, "commit", "-q", "-m", "code-task " + task["id"] + ": " + str(task.get("goal") or "")[:60])
        git(repo_dir, "push", "origin", "refs/heads/" + branch + ":refs/heads/" + branch)
        if delegate:
            return "branch_pushed", compare_url(base, branch), None, note
        body = ("Opened by code-task-publish from verified code-task `" + task["id"] + "`.\n\nGoal: " + str(task.get("goal") or "")[:500] +
                "\n\nThe patch passed the orchestrator's deterministic verifier. Review and merge it on GitHub (or close it); this workflow never merges.")
        try:
            url = pr.create(branch, base, "code-task: " + str(task.get("goal") or "")[:70], body)
        except RuntimeError as e:
            # Repo setting "Allow GitHub Actions to create pull requests" may be off. The branch is already
            # pushed, so record it as branch_pushed with the compare URL instead of failing the task; the
            # owner (from the compare URL) or the next run with a PR-capable token opens the PR from that branch.
            if "not permitted to create or approve pull requests" in str(e) or "createPullRequest" in str(e):
                return "branch_pushed", compare_url(base, branch), None, note
            raise
        return "published", url, None, note
    except Exception as e:  # noqa: BLE001 - a failure must become a recorded status, not a crash
        return "publish_failed", None, str(e)[:300], None


def publish_all(store, repo_dir, base, pr, log=print, delegate=False):
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
        st, url, err, note = publish_one(t, repo_dir, base, pr, delegate)
        if st == "syntax_retry":
            requeue_for_syntax(store, t["id"], err)
            out["retried"] = out.get("retried", 0) + 1
            log(f"::warning::syntax_retry {t['id']}: {err} (sent back to the orchestrator, no branch pushed)")
            continue
        finish(store, t["id"], st, url, err)
        if note:
            note_rebase(store, t["id"], note)
            out["rebased"] = out.get("rebased", 0) + 1
            log(f"::notice::rebased {t['id']}: {note}")
        if st == "branch_pushed" and delegate:
            out["published"] += 1
            log(f"branch_pushed {t['id']} -> {url} (qnfo-fleet-control opens the PR with the fleet token)")
        elif st == "branch_pushed":
            out["published"] += 1
            log(f"::warning::branch_pushed {t['id']} -> {url} (PR creation refused by repo setting)")
        elif st == "published":
            out["published"] += 1
            log(f"published {t['id']} -> {url}")
        else:
            out["failed"] += 1
            log(f"::error::publish_failed {t['id']}: {err}")
    return out


# PR-OUTCOME-RECONCILE-1 (2026-10-01): a published task kept status 'published' after its PR merged or closed (#297 merged
# at 10:40Z and #368 at 21:04Z, both still 'published' hours later), so the fleet's watchmaker index counted merged PRs as
# "waiting on a person". Each run reads the PR state of every published / branch_pushed task and records the outcome:
# status 'merged' or 'closed' (with the PR URL). The orchestrator's own 'pr_open' rows are covered the same way. An open PR,
# a branch with no PR yet, or a failed lookup leaves the row as is. Read-only on GitHub; it never merges or closes anything.
PULL_URL = re.compile(r"^https://github\.com/[^/]+/[^/]+/pull/\d+$")


def reconcile_outcomes(store, pr, log=print):
    out = {"merged": 0, "closed": 0, "open": 0, "errors": 0}
    try:
        rows = store.rows("SELECT id, branch, pr_url, status FROM code_tasks WHERE status IN ('published','branch_pushed','pr_open') ORDER BY updated_at ASC LIMIT 50")
    except MissingTable:
        return out
    for t in rows:
        url = t.get("pr_url") or ""
        try:
            if not PULL_URL.match(url):
                found = pr.existing(t["branch"]) if t.get("branch") else None
                if not found or not PULL_URL.match(found):
                    out["open"] += 1
                    continue
                url = found
            st = pr.state(url)
        except RuntimeError as e:
            out["errors"] += 1
            log(f"::warning::reconcile {t['id']}: {e}")
            continue
        if st in ("MERGED", "CLOSED"):
            new = "merged" if st == "MERGED" else "closed"
            store.changes("UPDATE code_tasks SET status=?, pr_url=?, updated_at=? WHERE id=? AND status IN ('published','branch_pushed','pr_open')",
                          [new, url, now(), t["id"]])
            out[new] += 1
            log(f"{t['id']}: PR {url} {new}")
        else:
            out["open"] += 1
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

    def state(self, url):
        st = getattr(self, "states", {}).get(url)
        if st is None:
            raise RuntimeError("gh pr view failed: not found")
        return st


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

    # 3b. PUBLISH-JS-CHECK-1: a .js patch that does not parse is sent back to the orchestrator, never pushed; one that parses publishes
    if shutil.which("node"):
        remote, work, store = fixture()
        os.makedirs(os.path.join(work, "w"))
        with open(os.path.join(work, "w/worker.js"), "w") as fh:
            fh.write('export default { fetch() { return new Response("a"); } };\n')
        _sh(work, "git", "add", "-A")
        _sh(work, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "js")
        _sh(work, "git", "push", "-q", "origin", "main")
        _sh(work, "git", "fetch", "-q", "origin", "main")
        pr = FakePR()
        jsp = lambda new: ("diff --git a/w/worker.js b/w/worker.js\n--- a/w/worker.js\n+++ b/w/worker.js\n@@ -1 +1 @@\n"  # noqa: E731
                           "-export default { fetch() { return new Response(\"a\"); } };\n+" + new + "\n")
        add(store, "ct_jsbad0000001", jsp('export default { fetch() { return new Response("<script src="https://x.example/a.js">"); } };'), path="w/worker.js")
        add(store, "ct_jsgood000001", jsp('export default { fetch() { return new Response("b"); } };'), path="w/worker.js", branch="codeagent-jsgood000001")
        r = publish_all(store, work, "main", pr, quiet)
        tb, tg = row(store, "ct_jsbad0000001"), row(store, "ct_jsgood000001")
        cb = json.loads(tb["ctx"] or "{}")
        check("js parse fails: sent back to propose with the parser's message, attempts counted",
              tb["status"] == "queued" and tb["step"] == "propose" and tb["attempts"] == 1 and "node --check" in (tb["last_error"] or "")
              and "w/worker.js" in (cb.get("lastError") or "") and r.get("retried") == 1, dict(tb))
        brb = subprocess.run(["git", "--git-dir", remote, "branch", "--list", "codeagent-jsbad0000001"], capture_output=True, text=True)
        check("js parse fails: nothing pushed, no PR", brb.stdout.strip() == "" and "codeagent-jsbad0000001" not in pr.created)
        check("js that parses (an ES module) still publishes", tg["status"] == "published" and r["published"] == 1, dict(tg))
    else:
        print("SKIP PUBLISH-JS-CHECK-1 selftest: node not installed")

    # 3b2. PUBLISH-PY-CHECK-1: a .py patch that does not parse is sent back to propose with the parser's message, never pushed
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR()
    add(store, "ct_pybad0000001", good.replace("+    return 2", "+    return (2"))
    r = publish_all(store, work, "main", pr, quiet)
    tb = row(store, "ct_pybad0000001")
    cb = json.loads(tb["ctx"] or "{}")
    check("py parse fails: sent back to propose with the parser's message and line, attempts counted",
          tb["status"] == "queued" and tb["step"] == "propose" and tb["attempts"] == 1 and "PUBLISH-PY-CHECK-1" in (tb["last_error"] or "")
          and "scripts/x.py:2" in (tb["last_error"] or "") and "SyntaxError" in (cb.get("lastError") or "") and r.get("retried") == 1, dict(tb))
    brb = subprocess.run(["git", "--git-dir", remote, "branch", "--list", "codeagent-pybad0000001"], capture_output=True, text=True)
    check("py parse fails: nothing pushed, no PR", brb.stdout.strip() == "" and "codeagent-pybad0000001" not in pr.created)
    check("py helper: a file that parses is None, a missing file is None",
          py_syntax_error(work, "scripts/x.py") is None and py_syntax_error(work, "scripts/none.py") is None)

    # 3c. REBASE-BEFORE-PUBLISH-1: a patch main has moved under is rebuilt from ctx.edits on the current base, no model call
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR()

    def add_edits(tid, patch, edits, path="scripts/x.py", mirror=None):
        store.changes("INSERT INTO code_tasks (id,repo,path,goal,status,step,ctx,branch,created_at,updated_at) VALUES (?,?,?,?,?,'done',?,?,?,?)",
                      [tid, REPO_NAME, path, "return 2", "ready_to_publish", json.dumps({"patch": patch, "edits": edits, "mirror": mirror}), "codeagent-" + tid[3:15], now(), now()])

    add_edits("ct_rebaseok0001", stale, [{"search": "    return 1", "replace": "    return 2"}])
    add_edits("ct_rebasegone01", stale, [{"search": "    return 7", "replace": "    return 2"}])
    add_edits("ct_rebasesame01", stale, [{"search": "    return 1", "replace": "    return 1"}])
    r = publish_all(store, work, "main", pr, quiet)
    t = row(store, "ct_rebaseok0001")
    check("stale patch with edits: rebuilt on main and published, the rebase recorded on the task",
          t["status"] == "published" and r.get("rebased") == 1 and str(json.loads(t["ctx"]).get("rebased", "")).startswith("REBASE-BEFORE-PUBLISH-1") and t["last_error"] is None, dict(t))
    shown = subprocess.run(["git", "--git-dir", remote, "show", "codeagent-rebaseok0001:scripts/x.py"], capture_output=True, text=True)
    check("rebased branch carries the re-applied edit", shown.stdout == "def f():\n    return 2\n", shown.stderr)
    tg, ts = row(store, "ct_rebasegone01"), row(store, "ct_rebasesame01")
    check("edit whose SEARCH is gone: publish_failed with both reasons, nothing pushed",
          tg["status"] == "publish_failed" and "does not apply" in tg["last_error"] and "rebase: edit 1: SEARCH text occurs 0 times" in tg["last_error"], dict(tg))
    check("edits that change nothing: publish_failed, never an empty branch", ts["status"] == "publish_failed" and "changes nothing" in ts["last_error"], dict(ts))
    brg = subprocess.run(["git", "--git-dir", remote, "branch", "--list", "codeagent-rebasegone01", "codeagent-rebasesame01"], capture_output=True, text=True)
    check("failed rebases push no branch", brg.stdout.strip() == "" and r["failed"] == 2)
    check("rebase helpers: apply_edits refuses an ambiguous SEARCH and overlapping edits",
          apply_edits("a b a", [{"search": "a", "replace": "c"}])[1].startswith("edit 1: SEARCH text occurs 2 times")
          and apply_edits("abc", [{"search": "ab", "replace": "x"}, {"search": "bc", "replace": "y"}])[1] == "edits overlap"
          and apply_edits("abc", [{"search": "b", "replace": "B"}])[0] == "aBc")
    check("rebase helpers: bump_version bumps the patch number from the current base with the -codeagent tag",
          bump_version('var VERSION = "1.2.3-main"; // x\nq', 'var VERSION = "1.2.3-main"; // x\nz') == 'var VERSION = "1.2.4-codeagent"; // x\nz'
          and bump_version('var VERSION = "1.2.3";\n', 'var VERSION = "9.9.9";\n') == 'var VERSION = "9.9.9";\n')
    if shutil.which("node"):
        remote, work, store = fixture()
        os.makedirs(os.path.join(work, "w"))
        src = 'var VERSION = "1.2.3-main"; // live\nexport default { fetch() { return new Response("a"); } };\n'
        for f in ("w/worker.js", "w/deployed-current.worker.js"):
            with open(os.path.join(work, f), "w") as fh:
                fh.write(src)
        _sh(work, "git", "add", "-A")
        _sh(work, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "js")
        _sh(work, "git", "push", "-q", "origin", "main")
        _sh(work, "git", "fetch", "-q", "origin", "main")
        pr = FakePR()
        stale_js = "".join("diff --git a/%s b/%s\n--- a/%s\n+++ b/%s\n@@ -1 +1 @@\n-var VERSION = \"1.2.2-old\"; // live\n+var VERSION = \"1.2.3-codeagent\"; // live\n" % (f, f, f, f)
                           for f in ("w/worker.js", "w/deployed-current.worker.js"))
        add_edits("ct_rebasejs0001", stale_js, [{"search": 'new Response("a")', "replace": 'new Response("b")'}], path="w/worker.js", mirror="w/deployed-current.worker.js")
        r = publish_all(store, work, "main", pr, quiet)
        tj = row(store, "ct_rebasejs0001")
        want = 'var VERSION = "1.2.4-codeagent"; // live\nexport default { fetch() { return new Response("b"); } };\n'
        got = [subprocess.run(["git", "--git-dir", remote, "show", "codeagent-rebasejs0001:" + f], capture_output=True, text=True).stdout for f in ("w/worker.js", "w/deployed-current.worker.js")]
        check("js rebase: VERSION bumped from the current main, the edit applied, the mirror identical, parsed and published",
              tj["status"] == "published" and got[0] == want and got[1] == want and "mirror rewritten" in json.loads(tj["ctx"]).get("rebased", ""), (dict(tj), got))
        _sh(work, "git", "checkout", "-q", "--detach", "origin/main")
        with open(os.path.join(work, "w/deployed-current.worker.js"), "w") as fh:
            fh.write(src.replace("1.2.3", "1.2.2"))
        _sh(work, "git", "add", "-A")
        _sh(work, "git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "mirror drift")
        _sh(work, "git", "push", "-q", "origin", "HEAD:main")
        _sh(work, "git", "fetch", "-q", "origin", "main")
        add_edits("ct_rebasemir001", stale_js, [{"search": 'new Response("a")', "replace": 'new Response("c")'}], path="w/worker.js", mirror="w/deployed-current.worker.js")
        publish_all(store, work, "main", pr, quiet)
        tm = row(store, "ct_rebasemir001")
        check("js rebase: a mirror that drifted from the source on main is refused with the reason", tm["status"] == "publish_failed" and "no longer equals the source" in tm["last_error"], dict(tm))
    else:
        print("SKIP REBASE-BEFORE-PUBLISH-1 js selftest: node not installed")

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

    # 7. PR-OUTCOME-RECONCILE-1: merged / closed PRs are recorded; open, unknown and PR-less rows are left alone
    remote, work, store = fixture()
    pr = FakePR()
    pr.states = {"https://github.com/QNFO/qnfo-workers/pull/297": "MERGED", "https://github.com/QNFO/qnfo-workers/pull/300": "CLOSED",
                 "https://github.com/QNFO/qnfo-workers/pull/301": "OPEN", "https://github.com/QNFO/qnfo-workers/pull/302": "MERGED"}
    pr.by_branch = {"codeagent-bp": "https://github.com/QNFO/qnfo-workers/pull/302"}
    add(store, "ct_merged000001", good, status="published")
    add(store, "ct_closed000001", good, status="published")
    add(store, "ct_open00000001", good, status="published")
    add(store, "ct_gone00000001", good, status="published")
    add(store, "ct_bp0000000001", good, status="branch_pushed", branch="codeagent-bp")
    add(store, "ct_bpnopr000001", good, status="branch_pushed", branch="codeagent-none")
    add(store, "ct_needshuman01", good, status="needs_human")
    add(store, "ct_propen000001", good, status="pr_open")
    for tid, url in (("ct_merged000001", 297), ("ct_closed000001", 300), ("ct_open00000001", 301), ("ct_gone00000001", 999), ("ct_propen000001", 302)):
        store.changes("UPDATE code_tasks SET pr_url=? WHERE id=?", [f"https://github.com/QNFO/qnfo-workers/pull/{url}", tid])
    store.changes("UPDATE code_tasks SET pr_url=? WHERE id IN ('ct_bp0000000001','ct_bpnopr000001')", ["https://github.com/QNFO/qnfo-workers/compare/main...x?expand=1"])
    r = reconcile_outcomes(store, pr, quiet)
    check("a merged PR is recorded as merged", row(store, "ct_merged000001")["status"] == "merged")
    check("a closed PR is recorded as closed", row(store, "ct_closed000001")["status"] == "closed")
    check("an open PR is left published", row(store, "ct_open00000001")["status"] == "published")
    check("a failed lookup is left published and counted", row(store, "ct_gone00000001")["status"] == "published" and r["errors"] == 1, r)
    t = row(store, "ct_bp0000000001")
    check("a branch_pushed task whose PR was opened later is reconciled with that PR's URL", t["status"] == "merged" and t["pr_url"].endswith("/pull/302"), t)
    check("a branch with no PR stays branch_pushed", row(store, "ct_bpnopr000001")["status"] == "branch_pushed")
    check("the orchestrator's pr_open row is reconciled too", row(store, "ct_propen000001")["status"] == "merged")
    check("other statuses are never touched", row(store, "ct_needshuman01")["status"] == "needs_human")
    check("reconcile counts", r == {"merged": 3, "closed": 1, "open": 2, "errors": 1}, r)
    r2 = reconcile_outcomes(store, pr, quiet)
    check("reconcile is idempotent", r2["merged"] == 0 and r2["closed"] == 0, r2)

    # 8. CODE-TASK-MERGE-RUNNER-1: with the fleet as PR opener the branch is pushed and no PR is created here
    remote, work, store = fixture()
    _sh(work, "git", "fetch", "-q", "origin", "main")
    pr = FakePR()
    add(store, "ct_delegate0001", good)
    r = publish_all(store, work, "main", pr, quiet, delegate=True)
    t = row(store, "ct_delegate0001")
    check("delegated: branch_pushed with the compare URL, no PR created by the workflow token",
          t["status"] == "branch_pushed" and "/compare/main...codeagent-delegate0001" in (t["pr_url"] or "") and not pr.created and r["failed"] == 0 and t["last_error"] is None, t)
    shown = subprocess.run(["git", "--git-dir", remote, "show", "codeagent-delegate0001:scripts/x.py"], capture_output=True, text=True)
    check("delegated: the pushed branch carries the verified change", shown.stdout == "def f():\n    return 2\n", shown.stderr)
    add(store, "ct_delegate0002", good, branch="codeagent-delegate0002")
    pr.by_branch["codeagent-delegate0002"] = "https://github.com/QNFO/qnfo-workers/pull/77"
    publish_all(store, work, "main", pr, quiet, delegate=True)
    check("delegated: an existing PR for the branch is still adopted", row(store, "ct_delegate0002")["status"] == "published" and row(store, "ct_delegate0002")["pr_url"].endswith("/pull/77"))

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
    delegate = os.environ.get("CODE_TASK_PR_OPENER", "").strip() == "qnfo-fleet-control"
    try:
        git(a.repo_dir, "fetch", "-q", "origin", a.base)
        out = publish_all(store, a.repo_dir, a.base, GhPR(), delegate=delegate)
        out["outcomes"] = reconcile_outcomes(store, GhPR())
    except RuntimeError as e:
        print("::error::code-task-publish could not run: " + str(e))
        return 2
    print(json.dumps(out))
    return 1 if out["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())

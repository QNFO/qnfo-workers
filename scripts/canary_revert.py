#!/usr/bin/env python3
"""CONTROL-PLANE-CANARY-1 (2026-10-06, pillar autonomy; CONTROL-PLANE-SELF-MERGE-1, owner directive 2026-10-06).

WHAT   After canonical-deploy.yml has deployed the workers changed by a push to main, this script polls the /health route
       of every CONTROL-PLANE worker in that set until it reports the VERSION the push carries. A worker whose version does
       not arrive inside the window is treated as a bad deploy: the push is reverted on main (git revert of the pushed
       commit, with each failed worker's VERSION bumped above the bad one so version-bump-guard and the deploy ledger stay
       monotonic, and its mirror kept identical), the revert is pushed, its deploy is dispatched (REVERT-REDEPLOY-1: a push
       made with GITHUB_TOKEN starts no workflow run, so canonical-deploy.yml is run by `gh workflow run` for the failed
       workers, and deploy-qnfo-ops.yml, the break-glass path that needs no /ops/deploy, when qnfo-ops is one of them), and
       one agent_issues row CONTROL-PLANE-REVERTED-1 records what was seen. A revert is never reverted (one level), so a
       broken /health route cannot ping-pong main; the dispatched redeploy runs the canary with --no-revert, which files
       CONTROL-PLANE-CANARY-FAILED-1 when the revert does not arrive either. A merge commit (the lane's merge method) is
       reverted with -m 1; any git failure becomes an error outcome and the issue is still filed.
       The canary proves that the pushed VERSION arrived, not that the worker works: a change that keeps /health up but
       breaks a cron step or the merge lane is for LOOP-WATCH-1 and the metric triggers, the next line of defence.
WHY    CONTROL-PLANE-MANUAL-1 (2026-10-02, human_actions 21) kept qnfo-fleet-control from merging any pull request that
       changes a control-plane worker, because nothing could undo a bad control-plane deploy: the fleet's own revert lives
       in qnfo-fleet-control, which is one of the workers at risk. This canary runs on the GitHub runner with the
       repository token, independent of every worker, so the merge lane may merge control-plane session PRs on its own.
USAGE  python3 scripts/canary_revert.py --targets /tmp/targets.txt --pushed <sha> [--canary-min 8] [--poll-sec 20] [--dry-run]
       python3 scripts/canary_revert.py --selftest
       --targets is the canonical-deploy target file ("<worker> <path> [create]" per line). Reads CLOUDFLARE_API_TOKEN and
       CLOUDFLARE_ACCOUNT_ID to file the issue (skipped, with a warning, when absent). Exit 0 always; a revert prints a
       ::warning:: so the run stays readable and ci-watchdog does not file a second issue for it.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# Control-plane workers with a versioned /health route (read 2026-10-06: every one answered 200 with {"version": ...}).
# Mirrors CP_CANARY_WORKERS in qnfo-fleet-control (bhControlPlaneDecide); fold-guard parity is the test's job.
CANARY_WORKERS = ["qnfo-fleet-control", "qnfo-ops", "qnfo-deploy-guard", "qnfo-gateway", "qnfo-ai", "qnfo-observability", "qnfo-code-orchestrator"]
HEALTH_URL = "https://{worker}.q08.workers.dev/health"
VERSION_RE = re.compile(r'^var VERSION = "([^"\n]*)"', re.M)
VERSION_LINE_RE = re.compile(r'^var VERSION = "[^"\n]*"(;?)', re.M)
DB_ID = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"


def emit(msg):
    print(msg, flush=True)


def parse_targets(text):
    """'<worker> <path> [create]' per line -> [(worker, path)]; blank and comment lines ignored."""
    out = []
    for line in str(text or "").splitlines():
        parts = line.split()
        if len(parts) < 2 or parts[0].startswith("#"):
            continue
        out.append((parts[0], parts[1]))
    return out


def read_version(text):
    m = VERSION_RE.search(str(text or ""))
    return m.group(1) if m else None


def judge(health, want):
    """One /health answer against the wanted VERSION -> (state, seen). state: ok | wrong-version | no-version."""
    if not isinstance(health, dict):
        return "no-version", None
    seen = health.get("version") or health.get("VERSION") or health.get("v")
    if not seen:
        return "no-version", None
    return ("ok" if str(seen) == str(want) else "wrong-version"), str(seen)


def is_revert_commit(message):
    m = str(message or "").strip().lower()
    return m.startswith("revert") or "control-plane-canary-1" in m


def bump_for_revert(base_content, bad_version, tag):
    """The base (pre-push) worker text with its VERSION set above the bad one: numeric core of the bad version, patch + 1, plus tag.
    Returns (new_version, new_content) or None when either text has no single VERSION line."""
    lines = VERSION_LINE_RE.findall(str(base_content or ""))
    if len(lines) != 1:
        return None
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)", str(bad_version or ""))
    if not m:
        return None
    new_version = "%s.%s.%d%s" % (m.group(1), m.group(2), int(m.group(3)) + 1, tag)
    new_content = VERSION_LINE_RE.sub(lambda mm: 'var VERSION = "' + new_version + '"' + mm.group(1), str(base_content), count=1)
    return new_version, new_content


def fetch_health(worker, timeout=10):
    req = urllib.request.Request(HEALTH_URL.format(worker=worker), headers={"User-Agent": "qnfo-canary/1.0 (+canonical-deploy)"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, ValueError, OSError):
        return None


def poll(wanted, minutes, poll_sec, fetch=fetch_health, clock=time.monotonic, sleep=time.sleep):
    """wanted: {worker: version}. Polls every worker until all report their version or the window ends.
    Returns {worker: {"want", "state", "seen", "polls"}}."""
    out = {w: {"want": v, "state": "pending", "seen": None, "polls": 0} for w, v in wanted.items()}
    deadline = clock() + max(1, minutes) * 60
    while True:
        pending = [w for w in out if out[w]["state"] != "ok"]
        for w in pending:
            st, seen = judge(fetch(w), out[w]["want"])
            out[w]["polls"] += 1
            out[w]["seen"] = seen
            out[w]["state"] = st
        if all(out[w]["state"] == "ok" for w in out) or clock() >= deadline:
            break
        sleep(poll_sec)
    for w in out:
        if out[w]["state"] != "ok":
            out[w]["state"] = "failed:" + out[w]["state"]
    return out


def git(args, check=True):
    return subprocess.run(["git"] + list(args), check=check, capture_output=True, text=True).stdout


def revert_flags(parents_line):
    """'<sha> <parent> [<parent>]' from `git rev-list --parents -n1` -> the extra git-revert flags: a merge commit (two
    parents, every session PR the lane merges with the merge method) needs -m 1 to revert against main's side."""
    parts = str(parents_line or "").split()
    return ["-m", "1"] if len(parts) >= 3 else []


def dispatch_redeploy(workers):
    """REVERT-REDEPLOY-1: a push made with GITHUB_TOKEN starts no workflow run (GitHub suppresses them; see
    apply-binding-install-gate-1.yml), so the revert commit would sit on main undeployed. Dispatch canonical-deploy.yml for
    the failed workers (it queues behind this run: cancel-in-progress is false) and, when qnfo-ops is among them, the
    break-glass deploy-qnfo-ops.yml too (raw_put.py deploys qnfo-ops from main without /ops/deploy when /health is down,
    and skips itself when the canonical route is healthy). Returns {"redeploy": [...], "redeploy_error": ...}."""
    repo = os.environ.get("GITHUB_REPOSITORY") or "QNFO/qnfo-workers"
    runs = [["gh", "workflow", "run", "canonical-deploy.yml", "--repo", repo, "--ref", "main", "-f", "workers=" + " ".join(workers)]]
    if "qnfo-ops" in workers:
        runs.append(["gh", "workflow", "run", "deploy-qnfo-ops.yml", "--repo", repo, "--ref", "main"])
    out, errors = [], []
    for cmd in runs:
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60)
            out.append(cmd[3])
        except (subprocess.CalledProcessError, OSError, subprocess.TimeoutExpired) as e:
            err = getattr(e, "stderr", None) or getattr(e, "stdout", None) or str(e)
            errors.append(cmd[3] + ": " + str(err).strip()[:200])
    res = {"redeploy": out}
    if errors:
        res["redeploy_error"] = "; ".join(errors)
    return res


def revert_push(pushed, failed, dry):
    """failed: [(worker, dir, bad_version)]. Reverts the pushed commit on the current checkout, re-bumps each failed worker's
    VERSION above the bad one, mirrors it, commits, pushes to main and dispatches the redeploy. Returns a dict with sha or
    refused/error; a git failure (a conflict, a lost remote) is an error, never an exception, so the issue is still filed."""
    try:
        return _revert_push(pushed, failed, dry)
    except (subprocess.CalledProcessError, OSError) as e:
        git(["revert", "--abort"], check=False)
        err = getattr(e, "stderr", None) or getattr(e, "stdout", None) or str(e)
        return {"error": "git failed: " + str(err).strip()[:300]}


def _revert_push(pushed, failed, dry):
    message = git(["log", "-1", "--format=%B", pushed])
    if is_revert_commit(message):
        return {"refused": "the pushed commit is itself a revert; one level only"}
    flags = revert_flags(git(["rev-list", "--parents", "-n1", pushed]))
    if dry:
        return {"dry": True, "would_revert": pushed, "merge_commit": bool(flags), "workers": [w for w, _, _ in failed]}
    git(["fetch", "origin", "main"])
    git(["checkout", "-q", "-B", "canary-revert", "origin/main"])
    git(["revert", "--no-commit"] + flags + [pushed])
    bumped = []
    for worker, d, bad in failed:
        path = os.path.join(d, "worker.js")
        with open(path, encoding="utf-8") as fh:
            base = fh.read()
        res = bump_for_revert(base, bad, "-revert-" + str(pushed)[:7])
        if not res:
            git(["revert", "--abort"], check=False)
            return {"error": "cannot bump the VERSION line of " + path}
        new_version, content = res
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        mirror = os.path.join(d, "deployed-current.worker.js")
        if os.path.exists(mirror):
            with open(mirror, "w", encoding="utf-8") as fh:
                fh.write(content)
            git(["add", mirror])
        git(["add", path])
        bumped.append((worker, bad, new_version))
    title = "revert: " + str(pushed)[:7] + " did not reach /health on " + ", ".join(w for w, _, _ in failed) + " (CONTROL-PLANE-CANARY-1)"
    body = "\n".join("%s: pushed VERSION %s never answered on /health within the canary window; reverted to the previous content as %s." % b for b in bumped)
    git(["commit", "-q", "-m", title + "\n\n" + body + "\n\nAutomatic revert by canonical-deploy.yml (scripts/canary_revert.py). The failed pull request stays as it is; its author fixes it in a new pull request."])
    sha = git(["rev-parse", "HEAD"]).strip()
    last = None
    for attempt in range(3):
        try:
            git(["push", "origin", "HEAD:main"])
            res = {"sha": sha, "bumped": bumped, "title": title}
            res.update(dispatch_redeploy([w for w, _, _ in failed]))
            return res
        except subprocess.CalledProcessError as e:
            last = (e.stderr or e.stdout or str(e))[:300]
            time.sleep(2 * (attempt + 1))
            git(["fetch", "origin", "main"], check=False)
            git(["rebase", "origin/main"], check=False)
    return {"error": "push to main failed: " + str(last), "sha": sha}


def issue_text(pushed, results, outcome):
    """(title, description) of the issue row: CONTROL-PLANE-REVERTED-1 when the revert is on main and its deploy is
    dispatched; CONTROL-PLANE-CANARY-FAILED-1 when nothing was reverted or the revert sits on main undeployed."""
    failed = [w for w in results if results[w]["state"] != "ok"]
    if "sha" in outcome and not outcome.get("redeploy_error"):
        title = "CONTROL-PLANE-REVERTED-1: push " + str(pushed)[:7] + " reverted, " + ", ".join(failed) + " never reached the pushed VERSION"
        step = "the revert commit is " + str(outcome.get("sha")) + " and its deploy is dispatched (" + ", ".join(outcome.get("redeploy") or []) + ")."
    elif "sha" in outcome:
        title = "CONTROL-PLANE-CANARY-FAILED-1: push " + str(pushed)[:7] + " reverted on main as " + str(outcome.get("sha"))[:7] + " but the redeploy of " + ", ".join(failed) + " was not dispatched"
        step = ("first dispatch the deploy of the revert commit " + str(outcome.get("sha")) + " (gh workflow run canonical-deploy.yml -f workers=\""
                + " ".join(failed) + "\"; a push made with GITHUB_TOKEN starts no run): " + str(outcome.get("redeploy_error"))[:200] + ".")
    else:
        title = "CONTROL-PLANE-CANARY-FAILED-1: push " + str(pushed)[:7] + " did not reach /health on " + ", ".join(failed) + " and could not be reverted"
        step = "nothing was reverted (" + str(outcome.get("refused") or outcome.get("error") or "no outcome")[:200] + "), so the live worker is the one to repair first."
    seen = "; ".join("%s wanted %s, saw %s after %d polls" % (w, results[w]["want"], results[w]["seen"], results[w]["polls"]) for w in failed)
    desc = ("Charter pillar: autonomy. canonical-deploy.yml canary (scripts/canary_revert.py, CONTROL-PLANE-CANARY-1) on push "
            + str(pushed) + ": " + seen + ". Outcome: " + json.dumps(outcome)[:400]
            + ". The push came from a pull request the merge lane accepted (CONTROL-PLANE-SELF-MERGE-1); its author fixes the "
            "change in a new pull request, with the /health route answering the new VERSION. "
            "session-task: read the canonical-deploy run for this push, reproduce the /health failure locally (node --check, the "
            "worker suites, a wrangler dev health call), open a corrected pull request; " + step)
    return title, desc


def file_issue(acct, token, pushed, results, outcome):
    """One CONTROL-PLANE-REVERTED-1 (or CONTROL-PLANE-CANARY-FAILED-1 when the revert itself failed) row in qnfo-audit."""
    try:
        from apply_migrations import d1
    except Exception as e:  # pragma: no cover
        emit("::warning::cannot import the D1 helper: " + str(e)[:120])
        return None
    title, desc = issue_text(pushed, results, outcome)
    now_ms = int(time.time() * 1000)
    try:
        d1(acct, token, DB_ID, "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
                               "SELECT ?1, ?2, 'ci:canonical-deploy', 'reliability', 'high', 'open', ?3, ?3 "
                               "WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = ?1 AND status = 'open')", [title, desc, now_ms])
        return title
    except Exception as e:
        emit("::warning::issue not filed: " + str(e)[:200])
        return None


def selftest():
    checks = []

    def ok(cond, name, detail=None):
        checks.append((bool(cond), name))
        emit(("PASS " if cond else "FAIL ") + name + ("" if cond or detail is None else " -- " + str(detail)[:300]))

    ok(parse_targets("qnfo-ops qnfo-ops/worker.js\n# c\nqnfo-ai qnfo-ai/worker.js create\n\nbad\n") == [("qnfo-ops", "qnfo-ops/worker.js"), ("qnfo-ai", "qnfo-ai/worker.js")], "targets: worker and path per line, comments and bad lines skipped")
    ok(read_version('x\nvar VERSION = "0.7.0-a"; /* c */\n') == "0.7.0-a" and read_version("nothing") is None, "read_version reads the single VERSION line")
    ok(judge({"version": "1.2.3-x"}, "1.2.3-x") == ("ok", "1.2.3-x") and judge({"version": "1.2.2"}, "1.2.3-x")[0] == "wrong-version" and judge({"ok": True}, "1")[0] == "no-version" and judge(None, "1")[0] == "no-version", "judge: ok, wrong-version, no-version")
    ok(is_revert_commit("Revert \"x\"") and is_revert_commit("revert: abc (CONTROL-PLANE-CANARY-1)") and not is_revert_commit("feat: x"), "a revert commit is recognised, one level only")
    r = bump_for_revert('a\nvar VERSION = "0.6.1-base"; /* old */\nb', "0.7.0-bad", "-revert-abc1234")
    ok(r and r[0] == "0.7.1-revert-abc1234" and 'var VERSION = "0.7.1-revert-abc1234";' in r[1] and r[1].endswith("\nb"), "bump_for_revert: base content, VERSION above the bad one, tag kept")
    ok(bump_for_revert('var VERSION = "1";\nvar VERSION = "2";', "1.0.0", "-r") is None and bump_for_revert('var VERSION = "1.0.0";', "nope", "-r") is None, "bump_for_revert refuses two VERSION lines or a bad version")
    answers = {"qnfo-ops": [{"version": "old"}, {"version": "new"}], "qnfo-ai": [None, None, None]}
    calls = {"qnfo-ops": 0, "qnfo-ai": 0}

    def fake_fetch(w):
        i = calls[w]
        calls[w] += 1
        a = answers[w]
        return a[min(i, len(a) - 1)]
    t = {"v": 0.0}
    res = poll({"qnfo-ops": "new", "qnfo-ai": "new"}, 1, 20, fetch=fake_fetch, clock=lambda: t["v"], sleep=lambda s: t.__setitem__("v", t["v"] + s))
    ok(res["qnfo-ops"]["state"] == "ok" and res["qnfo-ops"]["polls"] == 2 and res["qnfo-ai"]["state"] == "failed:no-version" and res["qnfo-ai"]["polls"] >= 3, "poll: a worker that arrives stops being polled, a silent one fails at the window")
    ok(set(CANARY_WORKERS) == {"qnfo-fleet-control", "qnfo-ops", "qnfo-deploy-guard", "qnfo-gateway", "qnfo-ai", "qnfo-observability", "qnfo-code-orchestrator"}, "the canary worker set is the control plane with a /health route")
    ok(revert_flags("c0ffee aaa111 bbb222\n") == ["-m", "1"] and revert_flags("c0ffee aaa111\n") == [] and revert_flags("") == [], "revert_flags: a merge commit reverts with -m 1, a squash or plain commit without")
    bogus = revert_push("0" * 40, [("qnfo-ops", "qnfo-ops", "0.0.1")], False)
    ok(isinstance(bogus, dict) and "error" in bogus and "git failed" in bogus["error"], "revert_push turns a git failure into an error outcome instead of raising", bogus)
    fake = {"qnfo-ops": {"want": "2.0.0", "state": "failed:wrong-version", "seen": "1.9.9", "polls": 3}, "qnfo-ai": {"want": "5.0.0", "state": "ok", "seen": "5.0.0", "polls": 1}}
    t1, d1_ = issue_text("c0ffee1234567", fake, {"sha": "abc1234def", "redeploy": ["canonical-deploy.yml", "deploy-qnfo-ops.yml"]})
    t2, d2 = issue_text("c0ffee1234567", fake, {"sha": "abc1234def", "redeploy": [], "redeploy_error": "canonical-deploy.yml: HTTP 403"})
    t3, d3 = issue_text("c0ffee1234567", fake, {"refused": "the pushed commit is itself a revert; one level only"})
    ok(t1.startswith("CONTROL-PLANE-REVERTED-1: push c0ffee1 reverted, qnfo-ops never") and "qnfo-ai" not in t1 and "deploy-qnfo-ops.yml" in d1_ and "session-task:" in d1_, "issue_text: a reverted and redeployed push files CONTROL-PLANE-REVERTED-1 naming only the failed worker", t1)
    ok(t2.startswith("CONTROL-PLANE-CANARY-FAILED-1: push c0ffee1 reverted on main as abc1234 but the redeploy of qnfo-ops was not dispatched") and "gh workflow run canonical-deploy.yml" in d2 and "HTTP 403" in d2, "issue_text: a revert that was pushed but not redeployed is a canary failure with the dispatch as its first step", t2)
    ok(t3.startswith("CONTROL-PLANE-CANARY-FAILED-1: push c0ffee1 did not reach /health on qnfo-ops and could not be reverted") and "one level only" in d3, "issue_text: a refused or failed revert is a canary failure that names the reason", t3)
    fails = [n for c, n in checks if not c]
    emit("canary-revert selftest: " + ("ok, " + str(len(checks)) + " checks" if not fails else str(len(fails)) + " FAILED"))
    return 0 if not fails else 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--targets", help="canonical-deploy target file")
    ap.add_argument("--pushed", help="the pushed commit sha")
    ap.add_argument("--canary-min", type=int, default=8)
    ap.add_argument("--poll-sec", type=int, default=20)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-revert", action="store_true", help="verify only: file the issue on a miss, never revert (the dispatched redeploy of a revert runs this way)")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not a.targets or not a.pushed:
        ap.error("--targets and --pushed are required")
    try:
        return run(a)
    except Exception as e:  # exit 0 always: the canary never fails the deploy run, it files what it saw
        emit("::warning::canary: unexpected failure " + type(e).__name__ + ": " + str(e)[:300])
        return 0


def run(a):
    with open(a.targets, encoding="utf-8") as fh:
        targets = parse_targets(fh.read())
    cp = [(w, p) for w, p in targets if w in CANARY_WORKERS]
    if not cp:
        emit("canary: no control-plane worker in this push (" + ", ".join(w for w, _ in targets) + "): nothing to watch")
        return 0
    wanted, dirs = {}, {}
    for w, p in cp:
        text = git(["show", a.pushed + ":" + p], check=False)
        v = read_version(text)
        if not v:
            emit("::warning::canary: " + p + " at " + a.pushed[:7] + " has no VERSION line; " + w + " is not watched")
            continue
        wanted[w] = v
        dirs[w] = p.split("/")[0]
    if not wanted:
        return 0
    emit("canary: watching " + json.dumps(wanted) + " for up to " + str(a.canary_min) + " min")
    results = poll(wanted, a.canary_min, a.poll_sec)
    for w in results:
        emit("canary: " + w + " " + results[w]["state"] + " (wanted " + str(results[w]["want"]) + ", saw " + str(results[w]["seen"]) + ", " + str(results[w]["polls"]) + " polls)")
    failed = [(w, dirs[w], wanted[w]) for w in results if results[w]["state"] != "ok"]
    if not failed:
        emit("canary: every control-plane worker reports its pushed VERSION")
        return 0
    if a.no_revert:
        outcome = {"refused": "verify-only run (workflow_dispatch): the canary files what it saw and reverts nothing"}
    else:
        outcome = revert_push(a.pushed, failed, a.dry_run)
    emit("::warning::canary: " + ", ".join(w for w, _, _ in failed) + " did not arrive; revert outcome " + json.dumps(outcome)[:300])
    acct, token = os.environ.get("CLOUDFLARE_ACCOUNT_ID"), os.environ.get("CLOUDFLARE_API_TOKEN")
    if a.dry_run:
        return 0
    if acct and token:
        emit("canary: issue " + str(file_issue(acct, token, a.pushed, results, outcome)))
    else:
        emit("::warning::canary: CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN absent, the revert is recorded only in this log and the revert commit")
    return 0


if __name__ == "__main__":
    sys.exit(main())

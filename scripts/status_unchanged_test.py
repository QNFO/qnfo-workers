#!/usr/bin/env python3
"""Offline test for status_unchanged.py: real git repo in a temp dir, no network. Exit 0 = all passed."""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "status_unchanged.py")
fails = []

def check(label, cond):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond:
        fails.append(label)

def sh(*a, cwd):
    return subprocess.run(a, cwd=cwd, capture_output=True, text=True)

def run(cwd, *args):
    return sh(sys.executable, SCRIPT, *args, cwd=cwd).returncode

with tempfile.TemporaryDirectory() as d:
    sh("git", "init", "-q", cwd=d); sh("git", "config", "user.email", "t@t", cwd=d); sh("git", "config", "user.name", "t", cwd=d)
    f = "status.json"
    def write(obj):
        with open(os.path.join(d, f), "w") as fh:
            json.dump(obj, fh, indent=1)
    base = {"ok": True, "due": 0, "fail": 0, "job_status": "success", "head": "aaa", "spent_ms": 10, "verifier": "v@aaa"}
    write(base)
    check("untracked file is NOT skipped (first write commits)", run(d, f) == 1)
    sh("git", "add", f, cwd=d); sh("git", "commit", "-q", "-m", "x", cwd=d)
    check("identical file is skipped", run(d, f) == 0)
    write(dict(base, head="bbb", spent_ms=999, verifier="v@bbb"))
    check("only head/spent_ms/verifier changed -> skipped", run(d, f) == 0)
    write(dict(base, fail=1))
    check("an outcome count changed -> committed", run(d, f) == 1)
    write(dict(base, job_status="failure"))
    check("job_status changed -> committed", run(d, f) == 1)
    write(dict(base, ok=False))
    check("ok flipped -> committed", run(d, f) == 1)
    extra = dict(base); extra["new_field"] = 1; write(extra)
    check("a new field appeared -> committed", run(d, f) == 1)
    gone = dict(base); gone.pop("due"); write(gone)
    check("a field disappeared -> committed", run(d, f) == 1)
    with open(os.path.join(d, f), "w") as fh:
        fh.write("{not json")
    check("corrupt JSON -> committed (fail-safe)", run(d, f) == 1)
    with open(os.path.join(d, f), "w") as fh:
        fh.write("[1,2]")
    check("non-object JSON -> committed (fail-safe)", run(d, f) == 1)
    check("missing file -> committed (fail-safe)", run(d, "nope.json") == 1)
    write(dict(base, actor="zzz")); sh("git", "add", f, cwd=d); sh("git", "commit", "-q", "-m", "y", cwd=d)
    write(dict(base, actor="qqq"))
    check("custom --ignore list: actor ignored", run(d, f, "--ignore", "actor,head") == 0)
    write(dict(base, actor="zzz", head="ccc"))
    check("custom --ignore list: head not ignored when omitted", run(d, f, "--ignore", "actor") == 1)

    sh("git", "branch", "-f", "snap", "HEAD", cwd=d)
    write(dict(base, head="ddd", fail=2)); sh("git", "add", f, cwd=d); sh("git", "commit", "-q", "-m", "z", cwd=d)
    write(dict(base, head="eee", fail=2))
    check("--ref compares against the named ref (HEAD has fail=2: skipped)", run(d, f) == 0)
    check("--ref snap (fail=0) differs from fail=2 -> committed", run(d, f, "--ref", "snap") == 1)
    check("--ref unknown ref -> committed (fail-safe)", run(d, f, "--ref", "no/such") == 1)

    # STATUS-THROTTLE-1: batch outcome-preserving changes to one commit per window; outcome changes commit at once.
    import datetime as _dt
    def stamp(minutes_ago):
        t = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(minutes=minutes_ago)
        return t.strftime("%Y-%m-%dT%H:%M:%SZ")
    def commit(obj, msg="c", env=None):
        write(obj); sh("git", "add", f, cwd=d)
        subprocess.run(["git", "commit", "-q", "-m", msg], cwd=d, capture_output=True, text=True,
                       env=dict(os.environ, **(env or {})))
    T = ("--throttle-min", "30")
    young = dict(base, ts=stamp(5), open_issues=40)
    commit(young)
    write(dict(young, ts=stamp(0), head="fff", open_issues=52))
    check("count changed, committed copy 5 min old -> throttled", run(d, f, *T) == 0)
    check("same change without --throttle-min -> committed (old behaviour)", run(d, f) == 1)
    write(dict(young, ts=stamp(0), open_issues=52, job_status="failure"))
    check("job_status changed inside the window -> committed", run(d, f, *T) == 1)
    write(dict(young, ts=stamp(0), open_issues=52, ok=False))
    check("ok flipped inside the window -> committed", run(d, f, *T) == 1)
    write(dict(young, ts=stamp(0), open_issues=52, error="boom"))
    check("a new error key inside the window -> committed (key set changed)", run(d, f, *T) == 1)
    commit(dict(young, ts=stamp(45)))
    write(dict(young, ts=stamp(0), open_issues=52))
    check("count changed, committed copy 45 min old -> committed", run(d, f, *T) == 1)
    commit(dict(young, ts=stamp(5), deploy_fail=0))
    write(dict(young, ts=stamp(0), deploy_fail=1, open_issues=41))
    check("custom --outcome key changed -> committed", run(d, f, *T, "--outcome", "deploy_fail") == 1)
    check("custom --outcome key unchanged -> throttled", run(d, f, *T, "--outcome", "ok") == 0)
    # A file made only of stamps (canonical-deploy before ACTIONS-QUOTA-1): --ignore "" makes it a heartbeat.
    commit({"workflow": "w", "head": "a1", "ts": stamp(10)})
    write({"workflow": "w", "head": "b2", "ts": stamp(0)})
    check("stamps-only file, default ignore -> skipped forever (why --ignore \"\" exists)", run(d, f) == 0)
    check("stamps-only file, --ignore \"\", 10 min old -> throttled", run(d, f, "--ignore", "", *T) == 0)
    commit({"workflow": "w", "head": "a1", "ts": stamp(31)})
    write({"workflow": "w", "head": "c3", "ts": stamp(0)})
    check("stamps-only file, --ignore \"\", 31 min old -> committed (heartbeat)", run(d, f, "--ignore", "", *T) == 1)
    # No stamp in the committed copy: the commit time of the ref's last change to the file is the age.
    commit({"ok": True, "n": 1}, env={"GIT_COMMITTER_DATE": stamp(3)})
    write({"ok": True, "n": 2})
    check("no stamp, committed 3 min ago (git time) -> throttled", run(d, f, *T) == 0)
    commit({"ok": True, "n": 3}, env={"GIT_COMMITTER_DATE": stamp(90)})
    write({"ok": True, "n": 4})
    check("no stamp, committed 90 min ago (git time) -> committed", run(d, f, *T) == 1)
    commit({"ok": True, "n": 5, "ts": "not a time"}, env={"GIT_COMMITTER_DATE": stamp(2)})
    write({"ok": True, "n": 6, "ts": stamp(0)})
    check("unparseable stamp falls back to git time -> throttled", run(d, f, *T) == 0)
    commit({"ok": True, "n": 7, "audited_at": (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(minutes=4)).strftime("%Y-%m-%d %H:%M:%S")})
    write({"ok": True, "n": 8, "audited_at": "2099-01-01 00:00:00"})
    check("--stamp-key with a space-separated UTC stamp -> throttled", run(d, f, *T, "--stamp-key", "audited_at") == 0)
    check("a non-string stamp falls back to git time (fresh) -> throttled", run(d, f, *T, "--stamp-key", "n") == 0)
    commit({"ok": True, "n": 9, "ts": "2099-01-01T00:00:00Z"})
    write({"ok": True, "n": 10, "ts": stamp(0)})
    check("a committed stamp in the future is not a valid age -> committed (fail-safe)", run(d, f, *T) == 1)
    check("--throttle-min 0 -> never throttled", run(d, f, "--throttle-min", "0") == 1)
    check("--throttle-min garbage -> never throttled (fail-safe)", run(d, f, "--throttle-min", "x") == 1)
    check("throttle against an unknown ref -> committed (fail-safe)", run(d, f, *T, "--ref", "no/such") == 1)
    check("throttle on a missing file -> committed (fail-safe)", run(d, "nope.json", *T) == 1)

print("%d failed" % len(fails))
sys.exit(1 if fails else 0)

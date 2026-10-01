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

print("%d failed" % len(fails))
sys.exit(1 if fails else 0)

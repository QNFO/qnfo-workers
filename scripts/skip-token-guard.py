#!/usr/bin/env python3
"""SKIP-TOKEN-GUARD-1: a pull request names no skip-CI token in its title, description or commit messages.

GitHub does not start push or pull_request workflows for a commit whose message contains one of its skip tokens, wherever in the message
the token sits. A squash merge builds the main commit's message from the pull request's title, description and commit messages, so a
sentence that only talks about the token suppresses every push workflow on that merge: the deploy, the migration apply, the conflict
repair, the guards. It happened on 2026-10-19 with the merge of #2811 (03d801a0, a gate-fix description that explained how the gate treats
a status commit): none of the push-triggered workflows ran, the migration had to be applied by hand and the worker deploys of that
push would have been lost. Bot status commits on main carry the token on purpose and never pass through a pull request, so a pull
request that carries one is always a mistake.

USAGE  python3 scripts/skip-token-guard.py --base origin/main     (reads PR_TITLE and PR_BODY from the environment)
       python3 scripts/skip-token-guard.py --selftest
Exit 1 and one line per finding when a token is present; the line says where and how to reword it.
"""
import argparse
import os
import re
import subprocess
import sys

# The five bracketed forms GitHub documents, and the skip-checks trailer.
TOKEN_RE = re.compile(r"\[\s*(skip ci|ci skip|no ci|skip actions|actions skip)\s*\]", re.I)
TRAILER_RE = re.compile(r"^\s*skip-checks:\s*true\s*$", re.I | re.M)


def findings_in(label, text):
    """[(label, token)] for every token in one piece of text."""
    out = []
    for m in TOKEN_RE.finditer(text or ""):
        out.append((label, m.group(0)))
    for m in TRAILER_RE.finditer(text or ""):
        out.append((label, m.group(0).strip()))
    return out


def check(title, body, commits):
    """commits: [(sha, message)]. Returns the findings, empty when the pull request is clean."""
    res = findings_in("the pull request title", title) + findings_in("the pull request description", body)
    for sha, msg in commits:
        res += findings_in("commit " + sha[:8], msg)
    return res


def commit_messages(base):
    p = subprocess.run(["git", "log", "--format=%H%x1f%B%x1e", base + "..HEAD"], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip()[:300])
    out = []
    for rec in p.stdout.split("\x1e"):
        rec = rec.strip("\n")
        if "\x1f" in rec:
            sha, msg = rec.split("\x1f", 1)
            out.append((sha.strip(), msg))
    return out


def selftest():
    fail = 0

    def ok(c, m):
        nonlocal fail
        if c:
            print("PASS " + m)
        else:
            fail += 1
            print("FAIL " + m)

    ok(check("t", "b", [("a" * 40, "msg")]) == [], "a clean pull request passes")
    ok(len(check("fix [skip ci] x", "", [])) == 1, "a token in the title is found")
    ok(len(check("t", "a status commit with [CI SKIP] still never triggers a run", [])) == 1, "a token inside a sentence of the description is found, whatever its case")
    ok(len(check("t", "", [("b" * 40, "subject\n\nbody [no ci]")])) == 1, "a token in a commit body is found")
    ok(len(check("t", "[skip actions] and [actions skip]", [])) == 2, "each of the five forms counts")
    ok(len(check("t", "", [("c" * 40, "subject\n\nskip-checks: true")])) == 1, "the skip-checks trailer is found")
    ok(check("t", "skip checks in the prose, skip ci without brackets, [skip] alone", []) == [], "prose without the bracketed form passes")
    ok(check("t", "the [skip-ci] marker with a hyphen is not one of the five", []) == [], "a hyphenated look-alike is not a token")
    ok(check("t", "", [("d" * 40, "x [ skip ci ]")]) != [], "spaces inside the brackets do not hide it")
    res = check("t", "[skip ci]", [("e" * 40, "[ci skip]")])
    ok([r[0] for r in res] == ["the pull request description", "commit eeeeeeee"], "each finding names where it is: " + repr([r[0] for r in res]))
    print("skip-token-guard selftest: " + ("%d FAILED" % fail if fail else "ok"))
    return 1 if fail else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    try:
        commits = commit_messages(a.base)
    except RuntimeError as e:
        print("::warning::SKIP-TOKEN-GUARD-1 could not read the commits of the pull request (%s); checking title and description only" % e)
        commits = []
    res = check(os.environ.get("PR_TITLE", ""), os.environ.get("PR_BODY", ""), commits)
    if not res:
        print("SKIP-TOKEN-GUARD-1: no skip-CI token in the title, the description or %d commit message(s)" % len(commits))
        return 0
    for where, tok in res:
        print("::error::SKIP-TOKEN-GUARD-1: %s contains %r. GitHub starts no push workflow for a commit whose message holds it, so the squash merge of this "
              "pull request would skip the deploy, the migration apply and the guards. Reword it (for example \"the skip-ci marker\")." % (where, tok))
    return 1


if __name__ == "__main__":
    sys.exit(main())

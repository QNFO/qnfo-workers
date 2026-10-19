#!/usr/bin/env python3
"""Offline test for PATCH-CAP-VERSION-LINE-1 (scripts/code-task-publish.py MAX_PATCH).

A version bump in a worker whose `var VERSION` line carries its release notes (qnfo-fleet-dashboard 202,642 chars,
qnfo-fleet-control 199,469 chars) is a ~816,000-char patch once the mirror is counted, so a 200,000-char cap refused every code
task on those files. Proves: the cap admits the measured 816,888-char patch of ct_d5z3pztl2s5ynh (the size check no longer
refuses it; the next check, repo identity, does), a patch over the cap and a whole-file fallback of a 1.2 MB worker are still
refused with "patch larger than", and the cap is below a D1 row (2 MB).
Run: python3 scripts/code_task_publish_patch_size_test.py   (prints "N passed, 0 failed")
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("code_task_publish", os.path.join(HERE, "code-task-publish.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

passed = failed = 0


def ok(cond, msg, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + msg + ((" :: " + str(extra)[:300]) if extra is not None else ""))


def task_with(patch_len):
    # A repo the publisher refuses AFTER the size check, so no git or network call is reached.
    return {"id": "ct_test000000000", "repo": "someone/else", "path": "qnfo-fleet-dashboard/worker.js", "branch": None,
            "ctx": json.dumps({"patch": "d" * patch_len})}


ok(P.MAX_PATCH >= 820_000, "the cap admits an 816,888-char version-bump patch on a 202k VERSION line", P.MAX_PATCH)
ok(P.MAX_PATCH <= 1_500_000, "the cap stays well under one D1 row (2 MB)", P.MAX_PATCH)

status, url, err, note = P.publish_one(task_with(816_888), "/nonexistent", "main", None)
ok(status == "publish_failed" and "patch larger than" not in str(err), "816,888 chars passes the size check (refused later, on the repo)", err)
ok("task repo is not" in str(err), "the next check in order (repo identity) is the one that answers", err)

status, url, err, note = P.publish_one(task_with(P.MAX_PATCH + 1), "/nonexistent", "main", None)
ok(status == "publish_failed" and str(err).startswith("patch larger than"), "one char over the cap is still refused with the size message", err)

status, url, err, note = P.publish_one(task_with(2_400_000), "/nonexistent", "main", None)
ok(str(err).startswith("patch larger than"), "a whole-file fallback of a 1.2 MB worker plus its mirror stays refused", err)

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

#!/usr/bin/env python3
"""
FOLD-PAIR-1 + MODEL-FLOOR-GUARD-FIX-1 (issues 100610, 1000009) -- idempotent, fail-closed.

WHY
---
FOLD-PAIR-1 (issue 100610). The qnfo-lifecycle host embeds qnfo-backlog-exec as a
member module. The member was fixed and now closes an agent_issues row WITH the
audit stamp -- qnfo-backlog-exec/worker.js:67 carries
    SET status='closed', close_channel='auto:backlog-exec', updated_at=...
but the host's inlined copy at qnfo-lifecycle/worker.js:149 still carries
    SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'
Verified live on main 2026-10-24: the literal close_channel='auto:backlog-exec'
occurs 0 times in the whole 203,634-byte host bundle while the guest has it at
line 67. So the fold's own write is unaudited and the pair test is red on main.
That red is not cosmetic: it is the gate in front of the code loop's largest
failure class (126 failed, 49 superseded tasks never drain).

MODEL-FLOOR-GUARD-FIX-1 (issue 1000009). qnfo-fleet-control pins
RT_PROBE_AUTHOR_MODEL to a model the floor policy bans, so the probe-authoring
path keeps the guard red on main (model-floor-guard failed on main 3 runs in a
row while the same commit passed on codeagent branches). The same bundle already
uses @cf/zai-org/glm-5.3-flash elsewhere, so this replacement introduces no new
model surface -- it makes the file consistent with itself and with the policy.

MIRROR: qnfo-fleet-control/worker.js and qnfo-fleet-control/deployed-current.worker.js
must stay byte-identical (mirror guard), so both are patched with the same edit.

Idempotent: a second run detects the post-state and writes nothing.
Fail-closed: an anchor that is missing or ambiguous writes NOTHING for that file
and exits non-zero -- it never guesses.
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKER = "FOLD-PAIR-1+MODEL-FLOOR-GUARD-FIX-1"

BANNED = '"@cf/meta/llama-3.1-8b-instruct"'
ALLOWED = '"@cf/zai-org/glm-5.3-flash"'

FOLD_OLD = "SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'"
FOLD_NEW = ("SET status='closed', close_channel='auto:backlog-exec', "
            "updated_at=?1 WHERE id=?2 AND status='open'")
FOLD_MARK = "close_channel='auto:backlog-exec'"

MODEL_TARGETS = [
    "qnfo-fleet-control/worker.js",
    "qnfo-fleet-control/deployed-current.worker.js",
]
FOLD_TARGETS = ["qnfo-lifecycle/worker.js"]


def _read(full):
    return open(full, encoding="utf-8", errors="surrogateescape").read()


def _write(full, src):
    open(full, "w", encoding="utf-8", errors="surrogateescape").write(src)


def patch_model(path):
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        print("FAIL-CLOSED %s: absent" % path)
        return 1, False
    src = _read(full)
    n = src.count(BANNED)
    if n == 0:
        print("already applied %s (banned model absent)" % path)
        return 0, False
    if n != 1:
        print("FAIL-CLOSED %s: banned model anchor matched %d times (expected 1) - nothing written"
              % (path, n))
        return 1, False
    _write(full, src.replace(BANNED, ALLOWED, 1))
    print("WROTE %s: RT_PROBE_AUTHOR_MODEL -> %s" % (path, ALLOWED))
    return 0, True


def patch_fold(path):
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        print("FAIL-CLOSED %s: absent" % path)
        return 1, False
    src = _read(full)
    n = src.count(FOLD_OLD)
    if n == 0:
        if FOLD_MARK in src:
            print("already applied %s (fold already stamps the channel)" % path)
            return 0, False
        print("FAIL-CLOSED %s: fold anchor absent and no stamp present - refusing to guess" % path)
        return 1, False
    if n != 1:
        print("FAIL-CLOSED %s: fold anchor matched %d times (expected 1) - nothing written"
              % (path, n))
        return 1, False
    _write(full, src.replace(FOLD_OLD, FOLD_NEW, 1))
    print("WROTE %s: agent_issues fold now stamps close_channel='auto:backlog-exec'" % path)
    return 0, True


def main():
    print("== %s ==" % MARKER)
    rc = 0
    changed = []
    for p in MODEL_TARGETS:
        r, c = patch_model(p)
        rc = rc or r
        if c:
            changed.append(p)
    for p in FOLD_TARGETS:
        r, c = patch_fold(p)
        rc = rc or r
        if c:
            changed.append(p)

    if rc == 0 and len(MODEL_TARGETS) == 2:
        a = os.path.join(ROOT, MODEL_TARGETS[0])
        b = os.path.join(ROOT, MODEL_TARGETS[1])
        if os.path.isfile(a) and os.path.isfile(b) and _read(a) != _read(b):
            print("FAIL-CLOSED: fleet-control mirror pair diverged after patch")
            rc = 1
        else:
            print("mirror pair identical")

    print("changed=%r rc=%d" % (changed, rc))
    return rc


if __name__ == "__main__":
    sys.exit(main())

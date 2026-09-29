#!/usr/bin/env python3
"""patch-404hint-list-1.py

CF-WORKER-READ-404-HINT-LIST-1 -- residual gap in the #1382 fix.

DEFECT (VERIFIED LIVE 2026-09-29T16:15Z)
  cf_worker_read(worker="qnfo-nonexistent-probe-xyz") returned:
    "CF API 404 reading qnfo-nonexistent-probe-xyz - not a deployed worker.
     38 workers exist. Use an exact name from that list."
  The string promises "that list" but delivers NO list whenever the fuzzy
  match is empty (_near.length == 0). The caller is told to use a list it
  cannot see -- the same unactionable-404 class #1382 was filed to fix.

FIX
  Always emit real names: keep the "similar:" clause when a fuzzy match
  exists, and fall back to a deterministic sample of actual deployed names
  otherwise. Reword the tail so it is true in both branches.

INVARIANTS
  * fail-closed: every anchor must match EXACTLY once, else exit 3, no write
  * idempotent: re-run prints ALREADY APPLIED and exits 0
  * VERSION-PIN-AGNOSTIC-1: asserts the property (new VERSION != old), not a frozen literal
  * mirror parity: qnfo-ops/deployed-current.worker.js updated in the same run
"""
import os
import re
import subprocess
import sys

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
SRC = os.path.join(ROOT, "qnfo-ops", "worker.js")
MIRROR = os.path.join(ROOT, "qnfo-ops", "deployed-current.worker.js")

MARKER = "CF-WORKER-READ-404-HINT-LIST-1"
NEW_VERSION = "2.37.24-404hint-list"

OLD_TAIL = '            _wrh = " - not a deployed worker. " + _names.length + " workers exist" +\n'
OLD_TAIL2 = '              (_near.length ? "; similar: " + _near.join(", ") : "") +\n'
OLD_TAIL3 = '              ". Use an exact name from that list.";\n'

NEW_TAIL = '            _wrh = " - not a deployed worker. " + _names.length + " workers exist" +\n'
NEW_TAIL2 = '              (_near.length ? "; similar: " + _near.join(", ") : "; e.g. " + _names.slice(0, 10).join(", ")) +\n'
NEW_TAIL3 = '              ". Pass an exact name from this list.";\n'


def die(code, msg):
    print("FAIL(%d): %s" % (code, msg))
    sys.exit(code)


def read(p):
    if not os.path.exists(p):
        die(3, "missing file: %s" % p)
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def patch_text(txt, label):
    if MARKER in txt:
        return None, "ALREADY APPLIED"
    counts = {k: txt.count(k) for k in (OLD_TAIL, OLD_TAIL2, OLD_TAIL3)}
    bad = {k: v for k, v in counts.items() if v != 1}
    if bad:
        die(3, "%s: anchor count != 1 -> %r" % (label, bad))
    out = txt.replace(OLD_TAIL, NEW_TAIL, 1)
    out = out.replace(OLD_TAIL2, NEW_TAIL2, 1)
    out = out.replace(OLD_TAIL3, NEW_TAIL3, 1)
    # marker comment rides along with the fix, on its own line above the tail
    out = out.replace(
        NEW_TAIL,
        "            // %s: always emit real names, never promise a list we do not send\n" % MARKER + NEW_TAIL,
        1,
    )
    # VERSION bump (property-asserted)
    m = re.search(r'(var\s+VERSION\s*=\s*")([^"]+)(")', out)
    if not m:
        die(3, "%s: VERSION declaration not found" % label)
    old_ver = m.group(2)
    if old_ver == NEW_VERSION:
        die(3, "%s: VERSION already %s but marker absent (inconsistent tree)" % (label, NEW_VERSION))
    out = out[: m.start(2)] + NEW_VERSION + out[m.end(2):]
    return out, "PATCHED %s -> %s" % (old_ver, NEW_VERSION)


def main():
    src = read(SRC)
    new_src, msg = patch_text(src, "worker.js")
    if new_src is None:
        print("ALREADY APPLIED (worker.js) - nothing to do")
    else:
        write(SRC, new_src)
        print(msg)

    # syntax gate
    r = subprocess.run(["node", "--check", SRC], capture_output=True, text=True)
    if r.returncode != 0:
        die(3, "node --check failed: %s" % (r.stderr or r.stdout))
    print("NODE_CHECK_OK")

    # mirror parity in the same run
    if os.path.exists(MIRROR):
        mir = read(MIRROR)
        new_mir, mmsg = patch_text(mir, "mirror")
        if new_mir is None:
            print("ALREADY APPLIED (mirror)")
        else:
            write(MIRROR, new_mir)
            print(mmsg)
        same = read(SRC) == read(MIRROR)
        print("MIRROR_IDENTICAL=%s" % ("yes" if same else "no"))
        if not same:
            die(3, "mirror parity broken after patch")
    else:
        print("MIRROR_ABSENT (skipped)")

    print("MARKER_COUNT=%d" % read(SRC).count(MARKER))
    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

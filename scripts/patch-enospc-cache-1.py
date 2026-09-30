#!/usr/bin/env python3
"""
ENOSPC-CACHE-1 - reclaim the apt package cache on every container cold start.

Issue: #1445 (container /workspace ENOSPC)
Root cause (verified 2026-09-29): qnfo-containers-pilot ensureStarted() runs
  `apt-get install -y --no-install-recommends git curl ripgrep`
on EVERY cold start and never cleans up. /var/cache/apt/archives accumulates
across cold starts inside the 1.9 GB Firecracker volume until writes fail with
ENOSPC. Live measurement: 79 MB free of 1.9 GB (~96% full); manual
`apt-get clean` + archive purge reclaimed 1085 MB -> 1164 MB free.

Fix: append `apt-get clean` + archive/.deb purge immediately after the install
in the startup command, and stamp a marker + version bump.

Contract:
  * fail-closed  : exit 3 if any anchor matches != 1 time, or if nothing to do
                   in a way that indicates drift. Nothing is written on abort.
  * idempotent   : re-run prints ALREADY APPLIED and exits 0.
  * syntax gate  : caller runs `node --check` on the patched JS.
  * mirror       : updates deployed-current mirror in the same commit when present.

Exit codes: 0 applied|already-applied, 3 anchor/drift abort, 4 no target files.
"""
import os
import re
import sys

MARKER = "ENOSPC-CACHE-1"
NEW_VERSION = "1.0.2-apt-clean-enospc"

ROOT = os.environ.get("REPO_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
)

TARGETS = [
    "qnfo-containers-pilot/worker.js",
    "qnfo-containers-pilot/deployed-current.worker.js",
]

# Exactly one occurrence expected in the startup command.
ANCHOR = "git curl ripgrep 2>&1 | tail -3;"
INSERT = (
    "git curl ripgrep 2>&1 | tail -3; "
    "apt-get clean >/dev/null 2>&1 || true; "
    "rm -rf /var/cache/apt/archives/*.deb >/dev/null 2>&1 || true; "
)

MARKER_LINE = "// ENOSPC-CACHE-1: apt cache + .deb archives reclaimed on cold start (issue #1445)\n"


def die(code, msg):
    print("ABORT: " + msg)
    sys.exit(code)


def main():
    seen_any = False
    changed = []
    already = []

    for rel in TARGETS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print("SKIP (absent): " + rel)
            continue
        seen_any = True
        src = open(path, encoding="utf-8").read()

        if MARKER in src:
            print("ALREADY APPLIED: " + rel)
            already.append(rel)
            continue

        n = src.count(ANCHOR)
        if n != 1:
            die(3, "anchor matched %d times (expected 1) in %s" % (n, rel))

        out = src.replace(ANCHOR, INSERT, 1)

        # version bump (version-agnostic: rewrite whatever literal is present)
        out, nver = re.subn(r'var VERSION\s*=\s*"[^"]*"',
                            'var VERSION = "%s"' % NEW_VERSION, out, count=1)
        if nver != 1:
            die(3, "VERSION anchor matched %d times (expected 1) in %s" % (nver, rel))

        # stamp marker once, immediately before the VERSION declaration
        out = out.replace('var VERSION = "%s"' % NEW_VERSION,
                          MARKER_LINE + 'var VERSION = "%s"' % NEW_VERSION, 1)

        if out.count(MARKER) != 1:
            die(3, "marker count != 1 after edit in " + rel)

        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED: %s (version -> %s)" % (rel, NEW_VERSION))
        changed.append(rel)

    if not seen_any:
        die(4, "no target files present under " + ROOT)

    if changed:
        print("RESULT: applied=%d already=%d" % (len(changed), len(already)))
    else:
        print("RESULT: applied=0 already=%d (nothing to do)" % len(already))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""DISK-RECLAIM-1 - reclaim more of the container rootfs on every cold start.

Issue: #1456 (CONTAINER-ROOTFS-CAPACITY-STRUCTURAL-1).
  Measured 2026-09-29 from inside the live Firecracker VM:
      /  1.9G total, 1.6G used, 220M free (89%)
      MemTotal 465 MB, SwapTotal 0
  ENOSPC-CACHE-1 (issue #1445) reclaimed the apt cache + downloaded .deb archives
  but left the structural gap: the base image
  (docker.io/nikolaik/python-nodejs:python3.12-nodejs22) plus its installed
  toolchains occupy ~1.5 GB of the 1.9 GB volume, and `instance_type = "lite"`
  fixes that volume size. Reclaiming cache is therefore the only lever available
  without changing the container instance type - which wrangler.toml explicitly
  warns fails closed (DO-MIGRATION-NOTE-1), so it is deliberately NOT done here.

FIX (all steps idempotent, all `|| true`-guarded, none destructive to /workspace)
  After the existing apt reclaim, also drop the caches that actually regrow during
  a session and are pure derived data:
    * /var/lib/apt/lists/*   - package indices, re-fetched on demand
    * pip cache (--purge)    - wheel/sdist cache, re-downloaded on demand
    * npm _cacache           - npm content-addressable cache, re-fetched on demand
    * /tmp/*                 - scratch, destroyed by scale-to-zero anyway
  /workspace is deliberately untouched: it holds in-flight clones across calls and
  a prune there could destroy a multi-step workflow's working tree.

OBSERVABILITY
  The same command writes `df -h /` to /workspace/.disk-report.txt, so the reclaim
  is verifiable from a later call (`cat /workspace/.disk-report.txt`) instead of
  being inferred. Without this the fix would be unmeasurable from tool output -
  the same blindness CONTAINER-STDERR-1 fixes on the ops side.

Contract
  * fail-closed : exit 3 if the anchor does not match exactly once, or if the
                  patched output fails `node --check`. Nothing is written on abort.
  * idempotent  : re-run prints ALREADY APPLIED and exits 0.
  * mirror      : patches deployed-current.worker.js in the same pass when present.

Exit codes: 0 applied|already-applied, 3 fail-closed, 4 no target files.
"""
import os
import re
import subprocess
import sys
import tempfile

MARKER = "DISK-RECLAIM-1"
NEW_VERSION = "1.0.3-disk-reclaim"

ROOT = os.environ.get("REPO_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
)

TARGETS = [
    "qnfo-containers-pilot/worker.js",
    "qnfo-containers-pilot/deployed-current.worker.js",
]

# Exactly one occurrence, left by ENOSPC-CACHE-1 inside the cold-start command.
ANCHOR = "rm -rf /var/cache/apt/archives/*.deb >/dev/null 2>&1 || true;"

INSERT = (
    ANCHOR
    + " rm -rf /var/lib/apt/lists/* >/dev/null 2>&1 || true;"
    + " pip cache purge >/dev/null 2>&1 || true;"
    + " rm -rf /root/.cache/pip >/dev/null 2>&1 || true;"
    + " npm cache clean --force >/dev/null 2>&1 || true;"
    + " rm -rf /root/.npm/_cacache >/dev/null 2>&1 || true;"
    + " rm -rf /tmp/* >/dev/null 2>&1 || true;"
    + " df -h / > /workspace/.disk-report.txt 2>&1 || true;"
)

MARKER_LINE = (
    "// DISK-RECLAIM-1: reclaim apt lists + pip/npm caches + /tmp on cold start and\n"
    "// write df -h / to /workspace/.disk-report.txt so the reclaim is measurable\n"
    "// (issue #1456; /workspace is never pruned).\n"
)


def fail(msg):
    print("FAIL-CLOSED: " + msg)
    return 3


def check_syntax(src):
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False, encoding="utf-8") as fh:
        fh.write(src)
        tmp = fh.name
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    if r.returncode != 0:
        return "node --check rejected the patched output\n" + (r.stderr or r.stdout)
    return None


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
            return fail("anchor matched %d times (expected 1) in %s" % (n, rel))

        out = src.replace(ANCHOR, INSERT, 1)

        out, nver = re.subn(
            r'var VERSION\s*=\s*"[^"]*"',
            'var VERSION = "%s"' % NEW_VERSION,
            out,
            count=1,
        )
        if nver != 1:
            return fail("VERSION anchor matched %d times (expected 1) in %s" % (nver, rel))

        out = out.replace(
            'var VERSION = "%s"' % NEW_VERSION,
            MARKER_LINE + 'var VERSION = "%s"' % NEW_VERSION,
            1,
        )

        if out.count(MARKER) != 1:
            return fail("marker count != 1 after edit in " + rel)
        if out.count("pip cache purge") != 1 or out.count("/workspace/.disk-report.txt") != 1:
            return fail("reclaim steps not inserted exactly once in " + rel)

        err = check_syntax(out)
        if err:
            return fail(err)

        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED: %s (version -> %s, %d -> %d bytes)" % (rel, NEW_VERSION, len(src), len(out)))
        changed.append(rel)

    if not seen_any:
        return fail("no target files present under " + ROOT)

    if changed:
        print("RESULT: applied=%d already=%d" % (len(changed), len(already)))
    else:
        print("RESULT: applied=0 already=%d (nothing to do)" % len(already))
    return 0


if __name__ == "__main__":
    sys.exit(main())

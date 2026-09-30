#!/usr/bin/env python3
"""CONTAINER-CONFIG-MISSING-1 (2026-09-29) -- qnfo-containers-pilot.

MEASURED ROOT CAUSE (issue #1485), source of truth SHA
be99b4b173c71103e3d56fa06b850e9b8cfa1aef:

    async ensureStarted() {
      if (this.ctx.container.running) return;   <-- unguarded deref
    async _doStart() {
      if (this.ctx.container.running) return;   <-- same deref

deployment_history id 172 deployed qnfo-containers-pilot at
2026-09-29T19:30:35.100Z via qnfo-ops:cf_worker_deploy (PUT /content), which
cannot transmit the [[containers]] block. `this.ctx.container` became undefined
and every exec path died with a bare TypeError. cloud_ops_events recorded 124
rows of kind=container.error with text
    "Cannot read properties of undefined (reading 'running')"
one every few seconds while container-warmup-every-10min fires.

FIX: fail closed with a typed, self-identifying error instead of a TypeError.
This does NOT restore [[containers]] -- that is CONTAINER-CONFIG-RESTORE-3
(#1485/#1487, deploy-metadata path). It makes a recurrence diagnosable in one
read and gives the seven container-backed tools an actionable message.

FAIL-CLOSED / IDEMPOTENT
  marker present              -> exit 0, no write
  anchor count == 0           -> exit 1, no write
  post-write assertion fails  -> exit 1, no write
"""
import os
import re
import sys

MARKER = "CONTAINER-CONFIG-MISSING-1"
TARGETS = (
    "qnfo-containers-pilot/worker.js",
    "qnfo-containers-pilot/deployed-current.worker.js",
)
RE_ANCHOR = re.compile(r'([ \t]*)if \(this\.ctx\.container\.running\)\s*return;')
VERSION_RE = re.compile(r'VERSION = "(\d+)\.(\d+)\.(\d+)-[^"]*"')
GUARD = (
    'if (!this.ctx.container) { throw new Error("%s: ctx.container is undefined '
    '- the [[containers]] block is not attached to this deployment (issue #1485). '
    'A /content PUT drops it; redeploy through the metadata-preserving path."); }'
    % MARKER
)


def patch(path):
    src = open(path, encoding="utf-8").read()
    if MARKER in src:
        print("OK (already patched): " + path)
        return False
    hits = RE_ANCHOR.findall(src)
    if not hits:
        print("FAIL (fail-closed): anchor count 0 in " + path)
        return None

    def repl(m):
        ind = m.group(1)
        return ind + GUARD + "\n" + ind + "if (this.ctx.container.running) return;"

    new = RE_ANCHOR.sub(repl, src)
    vms = list(VERSION_RE.finditer(new))
    if len(vms) == 1:
        old_v = vms[0].group(0)
        new_v = 'VERSION = "%s.%s.%d-container-ctx-guard"' % (
            vms[0].group(1), vms[0].group(2), int(vms[0].group(3)) + 1)
        new = new.replace(old_v, new_v, 1)
        print("  version %s -> %s" % (old_v, new_v))
    elif len(vms) == 0:
        print("  NOTE version literal not found; guard still required")

    if MARKER not in new:
        print("FAIL (post-write assertion): marker absent in " + path)
        return None
    if len(RE_ANCHOR.findall(new)) != len(hits):
        print("FAIL (post-write assertion): anchor count changed in " + path)
        return None
    open(path, "w", encoding="utf-8").write(new)
    print("PATCHED %s (%d -> %d bytes, %d guard site(s))"
          % (path, len(src), len(new), len(hits)))
    return True


def main():
    root = os.environ.get("REPO_ROOT") or os.getcwd()
    touched = 0
    for rel in TARGETS:
        p = os.path.join(root, rel)
        if not os.path.exists(p):
            print("SKIP (missing): " + rel)
            continue
        r = patch(p)
        if r is None:
            return 1
        if r:
            touched += 1
    if touched == 0:
        print("nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())

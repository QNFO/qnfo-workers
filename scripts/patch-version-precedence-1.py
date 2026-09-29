#!/usr/bin/env python3
"""patch-version-precedence-1.py - VERSION-PRECEDENCE-1 + NOTE-APPEND-IDEMPOTENT-1.

DEFECT A - VERSION-PRECEDENCE-1 (false DRIFT; measured 2026-09-29 15:58:20Z)
  scripts/deploy-drift-guard.py extracted the repo version with

      CONST = re.compile(r'(?:var|let|const)\\s+(?:QNFO_)?VERSION\\s*=\\s*"([^"]+)"')

  and repo_artifact() returned the FIRST match. An artifact that declares BOTH
  `QNFO_VERSION` (a build/fabric tag) and `VERSION` (the value /health serves) therefore
  reported the fabric tag as its repo version. qnfo-archive is the proof:

      const QNFO_VERSION = "qnfo-archive/fabric-20260910";
      const VERSION      = "1.2.0";

  live /health answers 1.2.0, the service registry records 1.2.0, and the repo VERSION
  constant is 1.2.0 -- yet worker_live_audit recorded note=DRIFT with
  registry_before="qnfo-archive/fabric-20260910". The two strings are not comparable
  versions, so that DRIFT can never be reconciled: it is permanent by construction.

  The same defect is a DIRECTION hazard, not just noise. --ahead decides what may be
  auto-deployed by cmp_ver(repo, live) on that same string, and fleet-autodeploy.yml is
  default-ON. A file whose QNFO_VERSION parses numerically ahead of live would be marked
  "repo strictly ahead" on the strength of a build tag and redeployed unattended -- the
  exact class of overwrite the strictly-ahead rule exists to prevent.

  FIX: prefer the plain `VERSION` constant; keep `QNFO_VERSION` as a fallback so no worker
  becomes invisible to the drift check (a silent skip is the defect the guard refuses).

DEFECT B - NOTE-APPEND-IDEMPOTENT-1 (unclassifiable note; same audit)
  scripts/fleet-autoaudit.py classify().put() appends a class to an existing note. Two
  directories can resolve to the SAME worker name (DUP-WORKER-1: `agent-orchestrator` and
  `qnfo-agent-orchestrator` both declare name = "qnfo-agent-orchestrator"), so the same
  class arrives twice and the row was written as `NO_REPO_VERSION+NO_REPO_VERSION`
  (qnfo-memory-mcp, same audit). No note-keyed query or classifier matches that string, so
  the row drops out of every per-class report -- a silent loss of audit coverage.

  FIX: append a class only when it is not already present.

Both edits are fail-closed and idempotent: every anchor must occur exactly once, and the
marker short-circuits a re-run instead of double-patching.
"""
import sys

GUARD = "scripts/deploy-drift-guard.py"
AUDIT = "scripts/fleet-autoaudit.py"
MARKER = "VERSION-PRECEDENCE-1"

OLD_CONST = "CONST = re.compile(r'(?:var|let|const)\\s+(?:QNFO_)?VERSION\\s*=\\s*\"([^\"]+)\"')"

NEW_CONST = "\n".join([
    "# VERSION-PRECEDENCE-1: capture the prefix so the plain VERSION constant can win.",
    "CONST = re.compile(r'(?:var|let|const)\\s+(QNFO_)?VERSION\\s*=\\s*\"([^\"]+)\"')",
])

NEW_HELPER = '''def _repo_version(text):
    """VERSION-PRECEDENCE-1: prefer the plain `VERSION` constant over `QNFO_VERSION`.

    A worker artifact can declare both. `QNFO_VERSION` is a build/fabric tag
    (e.g. "qnfo-archive/fabric-20260910"); `VERSION` is the value the worker actually
    serves on /health. Returning the first regex match made qnfo-archive report a fabric
    tag as its repo version -- a permanent false DRIFT against a live /health of 1.2.0,
    and a corrupted numeric direction comparison for --ahead. The plain constant wins;
    QNFO_VERSION remains a fallback so no worker becomes invisible to the drift check.
    """
    hits = CONST.findall(text)
    if not hits:
        return None
    for prefix, val in hits:
        if not prefix:
            return val
    return hits[0][1]


'''

OLD_CALL = """            m = CONST.search(text)
            if m:
                return m.group(1), p, text"""

NEW_CALL = """            v = _repo_version(text)
            if v:
                return v, p, text"""

OLD_NOTE = """            rows[worker]["note"] += "+" + note"""

NEW_NOTE = """            # NOTE-APPEND-IDEMPOTENT-1 (VERSION-PRECEDENCE-1): DUP-WORKER-1 can deliver the
            # same class twice for one resolved worker name; appending it again produced
            # "NO_REPO_VERSION+NO_REPO_VERSION", a note no classifier or query matches.
            if note not in rows[worker]["note"].split("+"):
                rows[worker]["note"] += "+" + note"""


def die(msg):
    print("::error::" + msg, file=sys.stderr)
    sys.exit(3)


def apply(path, pairs):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    if MARKER in text:
        print("IDEMPOTENT: %s already carries %s" % (path, MARKER))
        return False
    for old, new in pairs:
        n = text.count(old)
        if n != 1:
            die("%s: anchor occurs %d times, want exactly 1: %r" % (path, n, old[:80]))
        text = text.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("PATCHED: %s" % path)
    return True


def main():
    apply(GUARD, [
        (OLD_CONST, NEW_CONST),
        (OLD_CALL, NEW_CALL),
        ("def repo_artifact(d):", NEW_HELPER + "def repo_artifact(d):"),
    ])
    apply(AUDIT, [(OLD_NOTE, NEW_NOTE)])
    for path, post in ((GUARD, "def _repo_version("),
                       (GUARD, "v = _repo_version(text)"),
                       (AUDIT, "NOTE-APPEND-IDEMPOTENT-1")):
        with open(path, encoding="utf-8") as fh:
            body = fh.read()
        if post not in body:
            die("%s: post-condition missing: %s" % (path, post))
        print("VERIFIED: %s carries %s" % (path, post))
    print("OK: VERSION-PRECEDENCE-1 + NOTE-APPEND-IDEMPOTENT-1 applied")


if __name__ == "__main__":
    main()

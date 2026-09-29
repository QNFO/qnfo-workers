#!/usr/bin/env python3
"""patch-version-quote-1.py - VERSION-QUOTE-1 applier (2026-09-29).

DEFECT
  scripts/deploy-drift-guard.py extracts a worker's repo version with

      CONST = re.compile(r'(?:var|let|const)\\s+(QNFO_)?VERSION\\s*=\\s*"([^"]+)"')

  The pattern requires DOUBLE quotes, so an artifact that declares its version
  with single quotes is invisible to _repo_version(). That returns None and the
  worker lands in NO_REPO_VERSION, a class documented as "worker is live but the
  repo has no version constant (source gap)".

  The repo does have the constant and it matches live /health exactly:

      idea-hub/deployed-current.worker.js
        const VERSION='1.0.6-quarantine-wired-20260926';
      live /health -> 1.0.6-quarantine-wired-20260926

  Measured 2026-09-29 16:05:10Z worker_live_audit - NO_REPO_VERSION = 4
  (idea-hub, qnfo-agent-orchestrator, qnfo-memory-mcp, qnfo-social). idea-hub is
  a proven false positive. The class is a false-negative generator for every
  artifact that quotes its version with single quotes.

FIX
  Accept single OR double quotes.

GUARANTEES
  fail-closed  anchor absent and marker absent -> exit 3, nothing written.
  idempotent   marker present -> exit 0 no-op.
  verified     the rewritten pattern is behaviourally tested on single-quoted,
               double-quoted and QNFO_VERSION samples, then the whole file is
               compiled, before anything is written.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
MARKER = "VERSION-QUOTE-1"
ANCHOR = "CONST = re.compile("
NEW_BLOCK = [
    "# VERSION-QUOTE-1 (2026-09-29): accept single OR double quoted VERSION constants.",
    "CONST = re.compile(r'(?:var|let|const)\\s+(QNFO_)?VERSION\\s*=\\s*[\\'\"]([^\\'\"]+)[\\'\"]')",
]
SAMPLES = [
    ("const VERSION='1.0.6-quarantine-wired-20260926';", "1.0.6-quarantine-wired-20260926"),
    ('const VERSION = "fleet-executor/0.3.2";', "fleet-executor/0.3.2"),
    ('const QNFO_VERSION = "qnfo-archive/fabric-20260910";', "qnfo-archive/fabric-20260910"),
]


def main():
    if not os.path.isfile(TARGET):
        print("FATAL target missing " + TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()
    if MARKER in text:
        print("VERSION-QUOTE-1 already applied - no-op")
        return 0
    out, hits = [], 0
    for ln in text.split("\n"):
        if ln.startswith(ANCHOR):
            out.extend(NEW_BLOCK)
            hits += 1
        else:
            out.append(ln)
    if hits != 1:
        print("FATAL anchor count %d (want 1) - refusing to patch" % hits)
        return 3
    new_text = "\n".join(out)
    probe = re.compile(r'(?:var|let|const)\s+(QNFO_)?VERSION\s*=\s*[\'"]([^\'"]+)[\'"]')
    bad = 0
    for sample, want in SAMPLES:
        m = probe.search(sample)
        got = m.group(2) if m else None
        if got != want:
            bad += 1
            print("VERIFY FAIL %r -> %r want %r" % (sample, got, want))
    if bad:
        return 3
    try:
        compile(new_text, TARGET, "exec")
    except SyntaxError as e:
        print("FATAL compile " + str(e))
        return 3
    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(new_text)
    print("VERSION-QUOTE-1 applied markers=%d" % new_text.count(MARKER))
    return 0


if __name__ == "__main__":
    sys.exit(main())

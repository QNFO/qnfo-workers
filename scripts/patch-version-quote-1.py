#!/usr/bin/env python3
"""patch-version-quote-1.py - VERSION-QUOTE-1 applier (2026-09-29).

Two independent defects in scripts/deploy-drift-guard.py's repo-version
extractor. Both make a live worker look like it has no repo version constant
(NO_REPO_VERSION), a class whose docstring claims "worker is live but the repo
has no version constant (source gap)" - so a false positive here silently hides
a real drift instead of reporting one.

DEFECT A - QUOTING
      CONST = re.compile(r'(?:var|let|const)\\s+(QNFO_)?VERSION\\s*=\\s*"([^"]+)"')
  requires DOUBLE quotes, so a single-quoted declaration is invisible:

      idea-hub/deployed-current.worker.js
        const VERSION='1.0.6-quarantine-wired-20260926';
      live /health -> 1.0.6-quarantine-wired-20260926
  identical strings, yet the worker is reported NO_REPO_VERSION.

DEFECT B - CONSTANT NAME
  Only VERSION / QNFO_VERSION are recognised. qnfo-memory-mcp declares

      var PROTOCOL_VERSION = "2024-11-05";
      var SERVER_VERSION   = "2.0.3";    <- the value /health actually serves
      live /health -> 2.0.3

  so the extractor returns None. A blanket `[A-Z_]*VERSION` wildcard would be
  WRONG: PROTOCOL_VERSION precedes SERVER_VERSION and is a different fact.
  SERVER_VERSION is therefore matched explicitly, as a lower-precedence
  fallback, never as a prefix wildcard.

Measured 2026-09-29 16:05:10Z worker_live_audit - NO_REPO_VERSION = 4
(idea-hub, qnfo-agent-orchestrator, qnfo-memory-mcp, qnfo-social).

FIX
  A  quote-agnostic CONST regex.
  B  explicit SERVER_CONST regex plus a fallback inside _repo_version, placed
     AFTER the plain VERSION and QNFO_VERSION candidates so precedence is
     unchanged for every worker that already resolves.

GUARANTEES
  fail-closed  every anchor must match exactly once, else exit 3, write nothing.
  idempotent   marker present -> exit 0 no-op.
  verified     the patched module is executed and its real _repo_version is
               called on five samples - single-quoted, double-quoted,
               QNFO_VERSION precedence, SERVER_VERSION, and the
               PROTOCOL_VERSION-must-not-match case - before anything is written.
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
    "# VERSION-QUOTE-1 (2026-09-29): SERVER_VERSION fallback. PROTOCOL_VERSION is a",
    "# different fact and is deliberately NOT matched (see the module docstring).",
    "SERVER_CONST = re.compile(r'(?:var|let|const)\\s+SERVER_VERSION\\s*=\\s*[\\'\"]([^\\'\"]+)[\\'\"]')",
]
OLD_BODY = (
    "    hits = CONST.findall(text)\n"
    "    if not hits:\n"
    "        return None\n"
    "    for prefix, val in hits:\n"
    "        if not prefix:\n"
    "            return val\n"
    "    return hits[0][1]"
)
NEW_BODY = (
    "    hits = CONST.findall(text)\n"
    "    if hits:\n"
    "        for prefix, val in hits:\n"
    "            if not prefix:\n"
    "                return val\n"
    "        return hits[0][1]\n"
    "    # VERSION-QUOTE-1: explicit SERVER_VERSION fallback, never a wildcard prefix.\n"
    "    # PROTOCOL_VERSION precedes SERVER_VERSION in qnfo-memory-mcp and is not the\n"
    "    # value the worker serves on /health.\n"
    "    m = SERVER_CONST.search(text)\n"
    "    return m.group(1) if m else None"
)
CHECKS = [
    ("const VERSION='1.0.6-quarantine-wired-20260926';",
     "1.0.6-quarantine-wired-20260926"),
    ('const VERSION = "fleet-executor/0.3.2";',
     "fleet-executor/0.3.2"),
    ('var QNFO_VERSION = "qnfo-archive/fabric-20260910";\nconst VERSION = "1.2.0";',
     "1.2.0"),
    ('var PROTOCOL_VERSION = "2024-11-05";\nvar SERVER_NAME = "qnfo-memory-mcp";\n'
     'var SERVER_VERSION = "2.0.3";',
     "2.0.3"),
    ('var PROTOCOL_VERSION = "2024-11-05";', None),
    ('const OTHER = "x";', None),
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
        print("FATAL anchor A count %d (want 1) - refusing to patch" % hits)
        return 3
    new_text = "\n".join(out)
    nb = new_text.count(OLD_BODY)
    if nb != 1:
        print("FATAL anchor B count %d (want 1) - refusing to patch" % nb)
        return 3
    new_text = new_text.replace(OLD_BODY, NEW_BODY)
    try:
        code = compile(new_text, TARGET, "exec")
    except SyntaxError as e:
        print("FATAL compile " + str(e))
        return 3
    ns = {"__name__": "drift_guard_probe", "__file__": TARGET}
    try:
        exec(code, ns)
    except SystemExit:
        pass
    except Exception as e:
        print("FATAL exec " + type(e).__name__ + " " + str(e))
        return 3
    fn = ns.get("_repo_version")
    if not callable(fn):
        print("FATAL _repo_version undefined after patch")
        return 3
    for sample, want in CHECKS:
        got = fn(sample)
        if got != want:
            print("VERIFY FAIL %r -> %r want %r" % (sample[:48], got, want))
            return 3
    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(new_text)
    print("VERSION-QUOTE-1 applied checks=%d markers=%d"
          % (len(CHECKS), new_text.count(MARKER)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

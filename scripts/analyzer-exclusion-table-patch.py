#!/usr/bin/env python3
"""analyzer-exclusion-table-patch.py

SELFHEAL-EXCLUSION-TABLE-1 (issue 1376), 2026-09-29.

WHY THIS EXISTS
---------------
telemetryAnalyze() in qnfo-ops/worker.js hardcodes a TWO-pattern exclusion:

    AND text = ?2 AND (meta IS NULL OR (meta NOT LIKE '%no such column%'
                                     AND meta NOT LIKE '%no such table%'))

The authoritative classifier for this fleet is the D1 table
`tool_error_exclusions` (25 patterns across 8 classes: agent-input,
client-path-violation, expected-miss, guard-refusal, same-zone-fetch,
test-fixture, upstream-availability, wrong-runtime) -- and the
`tool_failures_24h` view ALREADY joins it. The analyzer does not.

CONSEQUENCE (verified live 2026-09-29)
-------------------------------------
The self-heal loop's PRIMARY SIGNAL counts agent-authored input errors and
already-classified transients as tool malfunction, so it files tickets for
non-defects: "malformed JSON", "Unterminated string in JSON", "empty SQL",
"unknown tool", "is not available", "HTTP 5", "SELFTEST-", "FRAMEWORK-DOGFOOD",
"C:/Users" client-path violations, and the same-zone fetch artifact. That is
exactly the defect the issue describes: the metric is not a tool-health signal.

FIX
---
Make the analyzer use the SAME predicate as the view:

    AND text = ?2 /* SELFHEAL-EXCLUSION-TABLE-1 */
    AND NOT EXISTS (SELECT 1 FROM tool_error_exclusions x
                    WHERE instr(COALESCE(meta,''), x.pattern) > 0
                       OR instr(COALESCE(text,''), x.pattern) > 0)

One classifier, one source of truth. Adding a pattern to the table now
suppresses it in both the view and the analyzer, with no code change.

SAFETY
------
* Fail-closed: the anchor must match EXACTLY ONCE or exit 3, nothing written.
* Idempotent: re-run prints ALREADY APPLIED and exits 0.
* The okRow query is already inside a try/catch in telemetryAnalyze, so a D1
  error here degrades to the prior behaviour rather than throwing.
* Mirror parity: qnfo-ops/deployed-current.worker.js is rewritten byte-identical
  in the same commit (repo convention).
* VERSION-PIN-AGNOSTIC-1 (issue 1355): the version bump is BEST-EFFORT. A stale
  version anchor is a warning, never a failure -- a frozen literal must not be
  able to block a real fix (STALE-PREFLIGHT-1).
"""
import ast
import os
import subprocess
import sys

ROOT = os.environ.get("REPO_ROOT") or os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)
TARGET = os.path.join(ROOT, "qnfo-ops", "worker.js")
MIRROR = os.path.join(ROOT, "qnfo-ops", "deployed-current.worker.js")

MARKER = "SELFHEAL-EXCLUSION-TABLE-1"

OLD = (
    "AND text = ?2 AND (meta IS NULL OR (meta NOT LIKE '%no such column%' "
    "AND meta NOT LIKE '%no such table%'))"
)
NEW = (
    "AND text = ?2 /* SELFHEAL-EXCLUSION-TABLE-1 */ AND NOT EXISTS "
    "(SELECT 1 FROM tool_error_exclusions x WHERE "
    "instr(COALESCE(meta,''), x.pattern) > 0 OR "
    "instr(COALESCE(text,''), x.pattern) > 0)"
)

OLD_VER = 'var VERSION = "2.37.22-github409-retry";'
NEW_VER = 'var VERSION = "2.37.23-analyzer-excl-table";'


def die(code, msg):
    print("FAIL-CLOSED exit %d: %s" % (code, msg))
    sys.exit(code)


def syntax_ok(path):
    """ESM-aware syntax check via a temporary .mjs (node --check)."""
    tmp = "/tmp/_analyzer_patch_check.mjs"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(open(path, encoding="utf-8").read())
    r = subprocess.run(
        ["node", "--check", tmp], capture_output=True, text=True
    )
    return r.returncode == 0, (r.stderr or "").strip()[:400]


def main():
    if not os.path.isfile(TARGET):
        die(3, "target missing: %s" % TARGET)

    src = open(TARGET, encoding="utf-8").read()

    if MARKER in src:
        print("ALREADY APPLIED (%s present)" % MARKER)
        return 0

    n = src.count(OLD)
    if n != 1:
        die(3, "anchor count %d (expected exactly 1) for the hardcoded exclusion predicate" % n)

    patched = src.replace(OLD, NEW, 1)

    # Best-effort version bump (never fatal -- VERSION-PIN-AGNOSTIC-1).
    if patched.count(OLD_VER) == 1:
        patched = patched.replace(OLD_VER, NEW_VER, 1)
        print("VERSION bumped: %s" % NEW_VER)
    else:
        print("WARN: version anchor not found exactly once; version NOT bumped (non-fatal)")

    # The script itself must stay parseable (ast) and the patched JS must parse.
    ast.parse(open(os.path.abspath(__file__), encoding="utf-8").read())

    ok, err = syntax_ok_bytes(patched)
    if not ok:
        die(3, "patched JS failed syntax check: %s" % err)

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(patched)
    print("patched %s" % TARGET)

    if os.path.isdir(os.path.dirname(MIRROR)):
        with open(MIRROR, "w", encoding="utf-8") as fh:
            fh.write(patched)
        same = open(TARGET, encoding="utf-8").read() == open(MIRROR, encoding="utf-8").read()
        print("mirror %s byte-identical=%s" % (MIRROR, same))
        if not same:
            die(3, "mirror parity check failed")

    print("APPLIED %s" % MARKER)
    return 0


def syntax_ok_bytes(text):
    tmp = "/tmp/_analyzer_patch_check.mjs"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    return r.returncode == 0, (r.stderr or "").strip()[:400]


if __name__ == "__main__":
    sys.exit(main())

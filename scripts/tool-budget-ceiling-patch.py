#!/usr/bin/env python3
"""TOOL-BUDGET-CEILING-1 (2026-09-30) -- qnfo-ops

ROOT CAUSE (measured 2026-09-30 against qnfo-ops/worker.js @ 2.37.31-continuation-inherit):
  The tool loop runs against TWO independent budgets, both below the canonical
  OPS-SETTINGS-IMMUTABLE-1 ceilings:

    (1) ITERATION CAP   var MAX_TOOL_ITERS = 12;   (worker.js:104)
        At iter >= maxIters the loop STRIPS the tools and forces a tool-less answer
        instead of aborting, so a long task silently degrades at round 12.

    (2) NON-STREAM WALL envInt(env, "OPS_NONSTREAM_DEADLINE_MS", 3e4)  (worker.js:4208)
        Streaming clients get the canonical 300000 ms (OPS_LOOP_DEADLINE_MS, 3e5).
        Every NON-streaming client -- including the mobile ChatBox client this endpoint
        serves -- got 30000 ms, i.e. 10% of canonical. That is the measured
        "tool budget exhausted before these could run" symptom: the turn is cut
        mid-battery and the client has to re-prompt.

  Verified precondition: qnfo-ops/wrangler.toml declares NO [vars] block, so no env
  override masks these code defaults -- the default IS the live budget.

FIX (restores both to canonical; never lowers a ceiling):
  MAX_TOOL_ITERS            12   -> 40
  OPS_NONSTREAM_DEADLINE_MS 3e4  -> 3e5     (30000 ms -> 300000 ms, canonical)
  VERSION                       -> 2.37.32-tool-budget-ceiling-1
"""
import pathlib
import re
import sys

MARK = "TOOL-BUDGET-CEILING-1"
TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]

SUBS = [
    ("var MAX_TOOL_ITERS = 12;",
     "// TOOL-BUDGET-CEILING-1 canonical ceilings restored (2026-09-30)\nvar MAX_TOOL_ITERS = 40;"),
    ('envInt(env, "OPS_NONSTREAM_DEADLINE_MS", 3e4)',
     'envInt(env, "OPS_NONSTREAM_DEADLINE_MS", 3e5)'),
]

VER_RE = re.compile(r'var VERSION = "[^"]*";')
NEW_VER = 'var VERSION = "2.37.32-tool-budget-ceiling-1";'


def patch(p):
    src = p.read_text()
    if MARK in src:
        return "already applied"
    out = src
    for old, new in SUBS:
        n = out.count(old)
        if n != 1:
            return "STALE-ANCHOR count=%d for %r" % (n, old)
        out = out.replace(old, new, 1)
    if len(VER_RE.findall(out)) != 1:
        return "STALE-ANCHOR VERSION count=%d" % len(VER_RE.findall(out))
    out = VER_RE.sub(NEW_VER, out, count=1)
    p.write_text(out)
    return "patched"


def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    rc = 0
    for t in TARGETS:
        p = root / t
        if not p.is_file():
            print("%s: MISSING %s" % (MARK, t))
            rc = 1
            continue
        try:
            r = patch(p)
        except Exception as e:
            print("%s: ERROR %s %s" % (MARK, t, e))
            rc = 1
            continue
        print("%s: %s -> %s" % (MARK, t, r))
        if r.startswith("STALE-ANCHOR"):
            rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(main())

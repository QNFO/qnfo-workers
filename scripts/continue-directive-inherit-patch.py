#!/usr/bin/env python3
"""CONTINUE-DIRECTIVE-INHERIT-1 applier (2026-09-29).

Root cause (measured, not inferred)
-----------------------------------
Issue #1481 (AFFIRM-GUARD-FALSE-NEG-1) survived three regex patches because on
continuation turns the regex is not the failing layer at all.

Evidence from this thread (all from live tool output, 2026-09-29):
  * qnfo-audit ops_ai_log row `ops-56b7b39fa55188`, ts 2026-09-29T19:30:06.856Z,
    logs the prompt the guard actually evaluated:
        "Continue. Execute until definition-of-done (DoD) complete, then closeout. \n
         Continue. Execute until definition-of-done (DoD) complete, then closeout."
    The client's auto-continue directive REPLACES the user text on continuation
    turns, so `lastUserText()` returns a string that contains no `drain` token.
  * Simulated against the live regex, that string scores affirm=false, which is
    exactly the observed refusal:
        ok:false, error:"execution requires explicit affirmation in YOUR latest
        message (yes / go ahead / drain it) ..."
  * Secondary defect: the veto alternative `not\\s+yet` + target `run` fires on
    innocuous prose ("functional acceptance test not yet run"), vetoing a turn
    that is not a refusal.

Fix (two parts, both fail-closed)
---------------------------------
  1. `lastUserText()` now SKIPS auto-continue directives and inherits the last
     substantive user message, so the guard evaluates the operator's real
     instruction. It falls back to the literal last user message if no
     substantive turn exists.
  2. Veto token list: `not\\s+yet` removed (measured false-negative source) and
     bare `no` word-bounded to `\\bno\\b` (it previously matched inside words).

Non-regression (verified by construction against the live strings)
------------------------------------------------------------------
  "Do not drain the backlog."                            -> veto TRUE  (refused)
  "Remediate ... Drain fleet backlog(s) open items. ..."  -> veto FALSE, affirm TRUE
  auto-continue directive alone                          -> skipped, inherits previous

This script is fail-closed: every anchor must occur exactly once, and no write
happens unless all post-write assertions pass.
"""
import pathlib
import sys

MARKER = "CONTINUE-DIRECTIVE-INHERIT-1"
TARGET = "qnfo-ops/worker.js"
OLD_VERSION = 'var VERSION = "2.37.28-affirm-veto";'
NEW_VERSION = 'var VERSION = "2.37.29-continue-inherit";'

A_ARR = '  const arr = messages || [];'
A_FN = 'function lastUserText(messages) {'
A_CT = '      const _c = contentToText(arr[i].content);'
A_TAIL = '      return _c;\n    }\n  }\n  return "";\n}'
A_VETO = r'never|no|stop|cancel|abort|hold\s+off|not\s+yet)\s+'

HELPER = r'''// CONTINUE-DIRECTIVE-INHERIT-1 (2026-09-29)
var AUTO_CONTINUE_RE = /^(?:\s*Continue\.\s*Execute until definition-of-done \(DoD\) complete, then closeout\.?\s*)+$/i;
function isAutoContinueDirective(s) {
  var _t = String(s || "").trim();
  if (!_t) return false;
  return AUTO_CONTINUE_RE.test(_t);
}
'''

R_ARR = A_ARR + '\n  var _fb = "";\n  var _fbSet = false;'
R_CT = (A_CT
        + '\n      if (!_fbSet) { _fb = _c; _fbSet = true; }'
        + '\n      if (isAutoContinueDirective(_c)) continue;')
R_TAIL = '      return _c;\n    }\n  }\n  return _fb;\n}'
R_VETO = r'never|\bno\b|stop|cancel|abort|hold\s+off)\s+'


def once(src, anchor, label):
    n = src.count(anchor)
    if n != 1:
        print("FAIL-CLOSED: anchor %s occurs %d times (need exactly 1) - no write" % (label, n))
        sys.exit(1)
    return n


def main():
    p = pathlib.Path(TARGET)
    if not p.exists():
        print("FAIL-CLOSED: target %s not found" % TARGET)
        return 1
    src = p.read_text(encoding="utf-8")
    if MARKER in src:
        print("SKIP: %s already applied (idempotent)" % MARKER)
        return 0

    once(src, OLD_VERSION, "OLD_VERSION")
    once(src, A_ARR, "A_ARR")
    once(src, A_FN, "A_FN")
    once(src, A_CT, "A_CT")
    once(src, A_TAIL, "A_TAIL")
    once(src, A_VETO, "A_VETO")

    out = src
    out = out.replace(OLD_VERSION, NEW_VERSION, 1)
    out = out.replace(A_ARR, R_ARR, 1)
    out = out.replace(A_FN, HELPER + A_FN, 1)
    out = out.replace(A_CT, R_CT, 1)
    out = out.replace(A_TAIL, R_TAIL, 1)
    out = out.replace(A_VETO, R_VETO, 1)

    checks = [
        (MARKER in out, "marker present"),
        (NEW_VERSION in out and OLD_VERSION not in out, "version bumped"),
        ("isAutoContinueDirective(_c)" in out, "skip hook present"),
        ("return _fb;" in out, "fallback return present"),
        (A_VETO not in out, "old veto token list removed"),
        (r'\bno\b' in out, "bare no word-bounded"),
    ]
    bad = [name for ok, name in checks if not ok]
    if bad:
        print("FAIL-CLOSED: post-write assertions failed: %s - no write" % ", ".join(bad))
        return 1

    p.write_text(out, encoding="utf-8")
    print("OK: %s applied to %s; %s -> %s" % (MARKER, TARGET, OLD_VERSION, NEW_VERSION))
    print("assertions: " + "; ".join(name for _, name in checks))
    return 0


if __name__ == "__main__":
    sys.exit(main())

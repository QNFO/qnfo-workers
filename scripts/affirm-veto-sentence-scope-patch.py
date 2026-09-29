#!/usr/bin/env python3
"""AFFIRM-VETO-SENTENCE-SCOPE-1 applier (2026-09-29).

WHY THIS EXISTS
---------------
`AFFIRM-GUARD-VETO-1` (scripts/affirm-guard-veto-patch.py, live as
VERSION 2.37.28-affirm-veto) closed #1481 and #1482 by adding an
adjacency-scoped refusal veto. It works: the drain authorizes again on
"Drain fleet backlog(s) open items" -- measured, ops_issue_run -> triggered:true
and the job actually ran (cloud_ops_events job-run backlog-exec
2026-09-29T19:25:45Z: processed:40, closed:0, rechecked:40).

But the veto is scoped by WORD ADJACENCY, not by clause, so a negation that
targets something ELSE vetoes the drain. Measured false negative, verbatim
operator continuation turn 2026-09-29T19:26Z:

    "INCOMPLETE: live behavioral replay of the refused drain instruction
     against the patched guard (merge + CI + applier verified; functional
     acceptance test not yet run)."

  -> ops_issue_run(confirm:true) returned ok:false, error
     "execution requires explicit affirmation in YOUR latest message ..."

The veto fired on `not yet run` -- a negation of the *acceptance test*, in a
different sentence from `drain`. Any operator turn that happens to contain
"not yet run" / "don't fix" / "no close" therefore re-creates #1481.

THE FIX
-------
Scope the veto to the CLAUSE it belongs to. Split the turn on sentence
boundaries and veto only when the SAME clause both negates AND names a
drain-class verb. Both known-good and known-bad cases then hold:

  REFUSAL (must refuse)   "Do not drain the backlog."
      one clause: negation + `drain`                      -> VETO

  OWNER STANDING ORDER (must authorize)
      "Do not stop, do not terminate, do not interrupt execution.
       Drain fleet backlog(s) open items."
      clause 1: negations target stop/terminate/interrupt -- no drain-class
                verb, no veto. clause 2: `Drain`, no negation -> AUTHORIZE

  MEASURED FALSE NEGATIVE (must authorize)
      "... the refused drain instruction ... acceptance test not yet run)."
      clause 1: `drain`, no negation -> no veto.
      clause 2: `not yet run`, no drain-class verb -> no veto. -> AUTHORIZE

`execut\\w*` stays out of the veto targets (see AFFIRM-GUARD-VETO-1), so
"do not interrupt execution. Drain ..." is unaffected.

RESIDUAL RISK -- STATED, NOT HIDDEN
-----------------------------------
Still a keyword gate over free text: accident prevention, NOT an auth boundary.
Clause splitting is naive (no abbreviation handling: "e.g." / "i.e." / "v1.2"
create false breaks). A false break can only LOSE a veto when the negation and
the drain verb straddle it -- e.g. "Do not, e.g., drain the backlog." splits
after "Do not," and loses the veto. That hole is left open deliberately rather
than papered over: the `confirm:true` argument and the bearer token remain the
real boundary (#1277 CF-ONE-ACCESS-NOT-DEPLOYED-1).

FAIL-CLOSED / IDEMPOTENT
------------------------
- Marker present             -> exit 0, no write.
- Veto-line matches != 1     -> exit 1, no write (never half-applies).
- VERSION literals != 1      -> exit 1, no write.
- VERSION matched by regex, never pinned (VERSION-ANCHOR-DRIFT-1: the fleet
  bumps VERSION several times an hour, so an exact literal is orphaned fast).
- Post-write assertions on marker, new version, clause split, and ABSENCE of
  the old adjacency-only veto line.
"""
import os
import re
import sys

MARKER = "AFFIRM-VETO-SENTENCE-SCOPE-1"
TARGETS = ("qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js")

# VERSION-ANCHOR-DRIFT-1: match, never pin.
VERSION_RE = re.compile(r'var VERSION = "2\.37\.(\d+)-[^"]*";')
NEW_SLUG = "affirm-veto-clause"

# Structural identification of the live adjacency-only veto line. Avoids pinning
# the full regex literal, which drifts as the guard is edited.
OLD_SIG_A = "hold\\s+off"
OLD_SIG_B = "return false;"

NEW_LINE = r'''    var __segs = __s.split(/[.!?;\n]+/);
    for (var __i = 0; __i < __segs.length; __i++) {
      // AFFIRM-VETO-SENTENCE-SCOPE-1 (2026-09-29): refusal veto scoped to the
      // CLAUSE it belongs to. A negation in a different sentence (e.g.
      // "acceptance test not yet run") must not veto the drain (#1481 class).
      if (/(?:do\s+not|don'?t|never|no|stop|cancel|abort|hold\s+off|not\s+yet)\s+(?:the\s+|a\s+|any\s+)?(?:drain|run|execute|proceed|trigger|remediate|fix|close|clear)\b/i.test(__segs[__i]) && /\b(?:drain|execute|proceed|trigger|run)\b/i.test(__segs[__i])) return false;
    }'''

REQUIRED_PROBES = (MARKER, "__segs", "affirm-veto-clause")


def main():
    root = os.getcwd()
    touched = []
    for rel in TARGETS:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print("SKIP (missing): " + rel)
            continue
        src = open(path, encoding="utf-8").read()
        if MARKER in src:
            print("OK (already patched): " + rel)
            continue

        lines = src.split("\n")
        idx = [i for i, l in enumerate(lines) if OLD_SIG_A in l and OLD_SIG_B in l]
        if len(idx) != 1:
            print("FAIL (fail-closed): veto-line matches = %d (expected exactly 1) in %s"
                  % (len(idx), rel))
            return 1

        vms = list(VERSION_RE.finditer(src))
        if len(vms) != 1:
            print("FAIL (fail-closed): VERSION literal occurrences = %d in %s" % (len(vms), rel))
            return 1
        vm = vms[0]
        old_version = vm.group(0)
        new_version = 'var VERSION = "2.37.%d-%s";' % (int(vm.group(1)) + 1, NEW_SLUG)

        lines[idx[0]] = NEW_LINE
        out = "\n".join(lines).replace(old_version, new_version, 1)

        for probe in REQUIRED_PROBES + (new_version, "don'?t", "return false;"):
            if probe not in out:
                print("FAIL (post-write assertion): missing %r in %s" % (probe, rel))
                return 1

        # The adjacency-only veto must be GONE: no line may carry the old
        # signature without the new clause-split loop.
        for l in out.split("\n"):
            if OLD_SIG_A in l and OLD_SIG_B in l:
                print("FAIL (post-write assertion): adjacency-only veto survived in %s" % rel)
                return 1

        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED %s  (%d -> %d bytes)  %s -> %s"
              % (rel, len(src), len(out), old_version, new_version))
        touched.append(rel)

    if not touched:
        print("nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())

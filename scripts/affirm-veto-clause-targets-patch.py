#!/usr/bin/env python3
"""AFFIRM-VETO-CLAUSE-TARGETS-1 applier (2026-09-29).

SUPERSEDES scripts/affirm-veto-sentence-scope-patch.py (AFFIRM-VETO-SENTENCE-SCOPE-1).
That patch was committed, then DETERMINISTICALLY FALSIFIED before it could be
trusted: its same-clause target list included `run`, and the measured false
negative turns on the words "not yet run", so the veto still fired. Simulated
(2026-09-29T19:27Z, run_code, three guards x six cases):

  case                                    old(2.37.28)  v1(sentence-scope)  v2(this)
  A "Do not drain the backlog."               refuse         refuse            refuse
  B "Drain fleet backlog(s) open items."      authorize      authorize         authorize
  C "Do not stop, do not terminate, do not
     interrupt execution. Drain ..."          authorize      authorize         authorize
  D "... the refused drain instruction ...
     acceptance test not yet run)."           refuse         refuse  <-- BUG   authorize
  E "Continue."                               refuse         refuse            refuse
  F "No, hold off on the drain."              refuse         refuse            refuse

THE FIX
-------
Clause-scope the veto AND narrow the same-clause target list to verbs that are
drain-class on their own: (drain|execute|proceed|trigger|remediate). `run`,
`fix`, `close`, `clear` stay in the NEGATION-side list (so "do not run the
drain" still vetoes via its `drain`) but are dropped from the same-clause
requirement, because they are ordinary status words ("not yet run", "don't
fix", "no close") whose presence in a neighbouring sentence must not veto the
drain. That is the #1481 class, re-created by the previous patch.

THREE-STATE APPLIER (handles any order of arrival)
--------------------------------------------------
  state UNPATCHED : adjacency-only veto line present  -> insert the clause loop
  state V1        : "__segs[__i]" if-line present     -> swap in the corrected
                                                         if-line (loop retained)
  state V2        : marker present                    -> exit 0, no write
Both worker copies are targeted; a missing file is SKIPPED, not failed.

RESIDUAL RISK -- STATED, NOT HIDDEN
-----------------------------------
Still a keyword gate over free text: accident prevention, NOT an auth boundary.
Clause splitting is naive (no abbreviation handling: "e.g." / "i.e." / "v1.2"
create false breaks). A false break can only LOSE a veto when the negation and
the drain verb straddle it -- e.g. "Do not, e.g., drain the backlog." splits
after "Do not," and loses the veto. Left open deliberately: the `confirm:true`
argument and the bearer token remain the real boundary (#1277).

FAIL-CLOSED / IDEMPOTENT
------------------------
- marker present            -> exit 0, no write
- candidate lines != 1      -> exit 1, no write (never half-applies)
- VERSION literals != 1     -> exit 1, no write
- VERSION matched by regex, never pinned (VERSION-ANCHOR-DRIFT-1)
- post-write assertions incl. ABSENCE of the flawed `trigger|run)` target list
"""
import os
import re
import sys

MARKER = "AFFIRM-VETO-CLAUSE-TARGETS-1"
SUPERSEDED_MARKER = "AFFIRM-VETO-SENTENCE-SCOPE-1"
TARGETS = ("qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js")

VERSION_RE = re.compile(r'var VERSION = "2\.37\.(\d+)-[^"]*";')
NEW_SLUG = "affirm-veto-clause"

NEG = r"(?:do\s+not|don'?t|never|no|stop|cancel|abort|hold\s+off|not\s+yet)\s+(?:the\s+|a\s+|any\s+)?(?:drain|run|execute|proceed|trigger|remediate|fix|close|clear)\b"
SAME_CLAUSE_TARGETS = r"\b(?:drain|execute|proceed|trigger|remediate)\b"

V2_IF_6 = ("      /* " + MARKER + " */ if (/" + NEG + "/i.test(__segs[__i]) && /"
           + SAME_CLAUSE_TARGETS + "/i.test(__segs[__i])) return false;")

V2_BLOCK_4 = ("    var __segs = __s.split(/[.!?;\\n]+/);\n"
              "    for (var __i = 0; __i < __segs.length; __i++) {\n"
              "      // " + MARKER + " (2026-09-29): veto scoped to its OWN clause; the\n"
              "      // same-clause target list excludes run/fix/close/clear so status prose\n"
              "      // such as \"not yet run\" in a neighbouring sentence cannot veto the drain.\n"
              "      if (/" + NEG + "/i.test(__segs[__i]) && /"
              + SAME_CLAUSE_TARGETS + "/i.test(__segs[__i])) return false;\n"
              "    }")

OLD_SIG_A = "hold\\s+off"
OLD_SIG_B = "return false;"
FLAWED_SIG = "trigger|run)"


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
        v1_idx = [i for i, l in enumerate(lines) if "__segs[__i]" in l and OLD_SIG_B in l]
        old_idx = [i for i, l in enumerate(lines)
                   if OLD_SIG_A in l and OLD_SIG_B in l and "__segs" not in l]

        if len(v1_idx) == 1:
            state = "V1"
            lines[v1_idx[0]] = V2_IF_6
        elif len(v1_idx) == 0 and len(old_idx) == 1:
            state = "UNPATCHED"
            lines[old_idx[0]] = V2_BLOCK_4
        else:
            print("FAIL (fail-closed): candidate lines v1=%d old=%d in %s"
                  % (len(v1_idx), len(old_idx), rel))
            return 1

        vms = list(VERSION_RE.finditer(src))
        if len(vms) != 1:
            print("FAIL (fail-closed): VERSION literal occurrences = %d in %s" % (len(vms), rel))
            return 1
        vm = vms[0]
        old_version = vm.group(0)
        new_version = 'var VERSION = "2.37.%d-%s";' % (int(vm.group(1)) + 1, NEW_SLUG)

        out = "\n".join(lines).replace(old_version, new_version, 1)
        out = out.replace(SUPERSEDED_MARKER, MARKER)

        for probe in (MARKER, "__segs", "affirm-veto-clause", new_version,
                      "don'?t", "trigger|remediate"):
            if probe not in out:
                print("FAIL (post-write assertion): missing %r in %s" % (probe, rel))
                return 1
        if FLAWED_SIG in out:
            print("FAIL (post-write assertion): flawed `trigger|run)` target list survived in %s" % rel)
            return 1

        open(path, "w", encoding="utf-8").write(out)
        print("PATCHED [%s] %s  (%d -> %d bytes)  %s -> %s"
              % (state, rel, len(src), len(out), old_version, new_version))
        touched.append(rel)

    if not touched:
        print("nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())

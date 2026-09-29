#!/usr/bin/env python3
"""idea-hub-rss-stamp-gate-patch.py -- F10-RSS-PIPELINE-STAMP-GATE-1 (issue #1412).

DEFECT (live reproduction, external vantage, 2026-09-29T17:11:22Z):
  curl https://ideas.qnfo.org/rss.xml  (container, exit 0, NOT the #1190 same-zone path)
  item 2 <title> read:
    "RETRY (prior submission was dropped by an expressed-step abort). Notation-commissioning
     audit: apply the two-part criterion from the [redacted] thesis to the contradictory
     epistemologies of physics and quantum mechanics."
  and item 1 carried internal instruction text appended to the idea summary:
    "... cross-link to qnf-DLF-001 before execution. (re-"

ROOT CAUSE:
  publicTitle(s) = clean(s,1000) >= 12 chars AND not INTERNAL/OPS/JUNK AND has RESEARCH.
  An orchestrator retry stamp prefixed to the idea summary contains no INTERNAL/OPS/JUNK
  token, and the summary body legitimately contains RESEARCH tokens ("physics", "quantum",
  "geometry"). So the stamp is admitted verbatim into the public title and description.
  This is the F10 leak class first observed 2026-09-24 (raw-feed defects) and still live.

FIX:
  A dedicated STAMP detector, tested BEFORE the allow/deny lists, in publicTitle() only.
  It is deliberately NOT added to INTERNAL, because INTERNAL also feeds blocked(), which
  scans every message of a thread -- adding "before execution" there would quarantine whole
  legitimate threads. publicTitle() is the narrow surface that emits titles.
  Fail-closed: a stamped summary is never a public title, and because session() also gates
  on publicTitle(first.content), the stamped thread is withheld from /rss.xml, /api/feed,
  /api/sessions and /api/session/<id> by mechanism rather than by accident (#1182).

SCOPE: both artifacts (mirror-guard requires byte parity).
FAIL-CLOSED: every anchor must occur exactly once; a miss raises and nothing is written.
IDEMPOTENT: re-running on a patched file is a no-op.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = [
    os.path.join(ROOT, "idea-hub", "worker.js"),
    os.path.join(ROOT, "idea-hub", "deployed-current.worker.js"),
]

OLD_VERSION = "const VERSION='1.0.6-quarantine-wired-20260926';"
NEW_VERSION = "const VERSION='1.0.7-rss-pipeline-stamp-gate';"

OLD_TITLE = (
    "function publicTitle(s){const t=clean(s,1000);"
    "return t.length>=12&&!has(t,INTERNAL)&&!has(t,OPS)&&!has(t,JUNK)&&has(t,RESEARCH)}"
)

NEW_TITLE = r"""// F10-RSS-PIPELINE-STAMP-GATE-1 (issue #1412, 2026-09-29): publicTitle() previously
// required only a RESEARCH token, so an orchestrator retry stamp prefixed to the idea
// summary passed verbatim into the public RSS title. Live reproduction (external curl,
// 2026-09-29T17:11:22Z) item 2 of https://ideas.qnfo.org/rss.xml read
//   "RETRY (prior submission was dropped by an expressed-step abort). Notation-commissioning
//    audit: ... physics and quantum mechanics."
// It passed because "physics"/"quantum" are RESEARCH tokens and the stamp matches no
// INTERNAL/OPS/JUNK entry. Detected here, before the lists; deliberately NOT in INTERNAL,
// which also feeds blocked() and would quarantine whole threads on a phrase like
// "before execution". Fail-closed: a stamped summary is never a public title.
const STAMP=/(prior submission was dropped|expressed-step abort|dropped by an expressed|notation-commissioning|cross-link to qnf-|cross-link to dlf-|before execution|retry\s*\()/i;
function publicTitle(s){const t=clean(s,1000);if(STAMP.test(t))return false;return t.length>=12&&!has(t,INTERNAL)&&!has(t,OPS)&&!has(t,JUNK)&&has(t,RESEARCH)}"""


def patch(path):
    if not os.path.isfile(path):
        raise SystemExit("FAIL-CLOSED: missing file " + path)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()

    if "F10-RSS-PIPELINE-STAMP-GATE-1" in text:
        print("already applied: " + path)
        return False

    for label, old, new in (
        ("version", OLD_VERSION, NEW_VERSION),
        ("publicTitle", OLD_TITLE, NEW_TITLE),
    ):
        n = text.count(old)
        if n != 1:
            raise SystemExit(
                "FAIL-CLOSED: anchor '%s' occurs %d times in %s (expected 1)" % (label, n, path)
            )
        text = text.replace(old, new)

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("patched " + path)
    return True


def main():
    changed = False
    for p in TARGETS:
        changed = patch(p) or changed
    return 0 if changed or True else 1


if __name__ == "__main__":
    sys.exit(main())

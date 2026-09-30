#!/usr/bin/env python3
"""lifecycle-version-sot-apply.py - LIFECYCLE-VERSION-SOT-1 (issue 1370), 2026-09-29.

VERSION-AGNOSTIC REVISION (2026-09-29) -- closes #1394 by removing the second
STALE-PREFLIGHT-1 recurrence from the lifecycle deploy path.

WHY THIS REVISION EXISTS -- measured, not assumed.

The first revision of this applier pinned the version literal it expected:
  EDITS[0] = ('const QNFO_VERSION = "1.6.2";', 'const QNFO_VERSION = "1.6.3-version-sot";')
and the companion workflow asserted the same frozen literal:
  grep -q 'const QNFO_VERSION = "1.6.3-version-sot";' qnfo-lifecycle/worker.js

Both fail CLOSED on the next version bump. Measured state 2026-09-29 ~16:31Z:
  * qnfo-lifecycle/worker.js AND its mirror both read "1.6.4-metric-freshness"
    (sha 3629a0939cb8639fa440554957ea2090fb6697ed, 35174 B, byte-identical);
  * live /health answered "1.6.3-version-sot";
  * deployment_history id 120 recorded a qnfo-lifecycle deploy at 16:13:04Z with
    version_id "unknown" -- the deploy path ran but shipped nothing new;
  * deployment_history held ZERO rows for qnfo-lifecycle at 1.6.4.

So the artifact was already correct and the deploy was blocked by the applier's own
anchor. An applier whose anchors are overtaken by a concurrent writer becomes a
permanently red job with no detector (ANCHOR-INVALIDATION-RED-JOB-1, #1383).

FIX: this applier no longer owns the version TAG. It owns the PROPERTY -- that the
version is defined exactly once and that /health and the heartbeat both derive from
it. Any tag matching the constant pattern is accepted, so a future bump cannot break
this script. The legacy 1.6.2 literal is still upgraded if a stale checkout is
presented, so the original remediation (one fact, three literals -> one literal) is
preserved rather than discarded.

FAIL-CLOSED: each substitution must match EXACTLY once, unless the replacement is
already present (an idempotent re-run is a no-op, not an error). A miss raises and
nothing is written, so a partial patch cannot be committed.
"""
import io
import re
import sys

# The one fact. ANY tag is acceptable -- the applier does not own the tag.
VERSION_CONST_RE = re.compile(r'const QNFO_VERSION = "[^"]+";')

# Legacy tag upgraded on sight, so a stale checkout still receives the original fix.
LEGACY = 'const QNFO_VERSION = "1.6.2";'
LEGACY_NEW = 'const QNFO_VERSION = "1.6.3-version-sot";'

# The two derivations. Both must hold for the single-source-of-truth property.
EDITS = [
    ('version: "1.6.2-cronconsolidate",', "version: QNFO_VERSION,"),
    ('"fabric-20260910"', "QNFO_VERSION"),
]

# Both artifacts are deployed-from files; mirror-guard.py fails the build if they
# diverge, so they are patched together and compared byte-for-byte afterwards.
TARGETS = [
    "qnfo-lifecycle/worker.js",
    "qnfo-lifecycle/deployed-current.worker.js",
]


def patch(path):
    try:
        text = io.open(path, encoding="utf-8").read()
    except IOError as exc:
        raise SystemExit("FAIL-CLOSED: cannot read %s: %s" % (path, exc))

    if LEGACY in text:
        text = text.replace(LEGACY, LEGACY_NEW)

    hits = VERSION_CONST_RE.findall(text)
    if len(hits) != 1:
        raise SystemExit(
            "FAIL-CLOSED: expected exactly one QNFO_VERSION constant in %s, found %d"
            % (path, len(hits))
        )

    for old, new in EDITS:
        n = text.count(old)
        if n == 0:
            if new in text:
                continue  # already applied
            raise SystemExit("FAIL-CLOSED: anchor absent in %s: %r" % (path, old))
        if n != 1:
            raise SystemExit(
                "FAIL-CLOSED: anchor occurs %d times in %s: %r" % (n, path, old)
            )
        text = text.replace(old, new)

    io.open(path, "w", encoding="utf-8").write(text)
    print("patched %s :: %s" % (path, hits[0]))


def main():
    for path in TARGETS:
        patch(path)
    a = io.open(TARGETS[0], "rb").read()
    b = io.open(TARGETS[1], "rb").read()
    if a != b:
        raise SystemExit(
            "FAIL-CLOSED: mirror pair diverged after patch (%d vs %d bytes)"
            % (len(a), len(b))
        )
    print("mirror pair byte-identical (%d bytes)" % len(a))
    return 0


if __name__ == "__main__":
    sys.exit(main())

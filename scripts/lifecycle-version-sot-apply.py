#!/usr/bin/env python3
"""lifecycle-version-sot-apply.py - LIFECYCLE-VERSION-SOT-1 (issue 1370), 2026-09-29.

WHY THIS FILE EXISTS AT ALL -- measured, not assumed.

scripts/driftguard-label-and-lifecycle-sot-patch.py was committed in five revisions
(e20b2241, 3cd590d2, ca2bbc46, 57d0a44f) and its workflow
(.github/workflows/apply-driftguard-label-and-lifecycle-sot.yml) in two (b4e017c9,
ad410ecf). Measured state on 2026-09-29 after all seven commits:

  * qnfo-lifecycle/worker.js was still last committed 2026-09-27 (9743cef8) -- the
    artifact was never patched;
  * the repository history contains ZERO qnfo-driftguard-bot commits, i.e. the
    workflow's "Commit and push" step has never produced an effect;
  * live /health still answered version "1.6.2-cronconsolidate";
  * qnfo-audit.deployment_history held ZERO rows for qnfo-lifecycle, while
    scripts/raw_put.py deploys for qnfo-ops landed normally (id 116, 16:03:38Z).

An applier that has never applied anything, and a workflow that has never committed, is
the ORPHANED-APPLIER-1 failure mode with an invocation path that does not execute. This
script is the minimal self-contained replacement: it does not import or call the earlier
applier, it does not depend on the drift guard's exit code, and it asserts its own
post-conditions. The companion workflow runs it, then commits, then deploys, then checks
live.

THE DEFECT (LIFECYCLE-VERSION-SOT-1): one fact, three independent literals.
  * bundle constant:      const QNFO_VERSION = "1.6.2";
  * /health response:     version: "1.6.2-cronconsolidate",
  * heartbeat write:      .bind("qnfo-lifecycle", "fabric-20260910", new Date()...)
Only the third reaches qnfo-audit.fleet_heartbeat, so the version recorded for
qnfo-lifecycle was "fabric-20260910" -- a tag matching neither of the other two.

Consequence that made this worth fixing rather than reclassifying: scripts/
deploy-drift-guard.py reported qnfo-lifecycle as DRIFT on every run (repo constant 1.6.2
vs live /health 1.6.2-cronconsolidate) even though both repository artifacts are
byte-identical (sha d3b76f91bea19cf5ad8acd802c993494d4de45d2, 30293 B) and the live
bundle was 30295 B -- a 2-byte trailing-whitespace delta, not a live mutation. A
permanently red drift gate on a worker whose bytes match live is worse than no gate: it
trains the operator to ignore the gate.

FIX: /health and the heartbeat both derive from QNFO_VERSION, and the constant is bumped
to the tag that describes this build. After this patch one source of truth remains.

FAIL-CLOSED: each substitution must match EXACTLY once, unless the replacement is
already present (an idempotent re-run is a no-op, not an error). A miss raises and
nothing is written, so a partial patch cannot be committed.
"""
import io
import sys

EDITS = [
    ('const QNFO_VERSION = "1.6.2";', 'const QNFO_VERSION = "1.6.3-version-sot";'),
    ('version: "1.6.2-cronconsolidate",', "version: QNFO_VERSION,"),
    ('"fabric-20260910"', "QNFO_VERSION"),
]

# Both artifacts are deployed-from files; mirror-guard.py fails the build if they diverge,
# so they are patched together and compared byte-for-byte afterwards.
TARGETS = [
    "qnfo-lifecycle/worker.js",
    "qnfo-lifecycle/deployed-current.worker.js",
]


def patch(path):
    try:
        text = io.open(path, encoding="utf-8").read()
    except IOError as exc:
        raise SystemExit("FAIL-CLOSED: cannot read %s: %s" % (path, exc))
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
    print("patched %s" % path)


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

#!/usr/bin/env python3
"""SCHEDULES-LIVE-1 - force a redeploy of qnfo-cloud-ops and qnfo-email.

Why this patch exists (root cause, verified in the 2026-09-30 ops session):

  * The deploy path's schedules PUT sent {"crons":[...]} and Cloudflare answered
    HTTP 400 / code 10026 "Could not parse request body" on EVERY deploy, so no
    repo `crons` declaration ever reached the API fleet-wide.  That defect is now
    fixed on main (CF-SCHEDULES-BODY-SHAPE-1 in scripts/raw_put.py).
  * But the fix has never RUN in production: qnfo-cloud-ops was last deployed at
    2026-09-30T08:08:36Z, BEFORE the body-shape fix landed on main (~08:20:41Z).
    Its registered triggers are still the pre-fix single weekly value
    ["30 5 * * 1"], so the worker wakes once a week and the whole 21-cron
    schedule set (research-scan, email-triage, briefing, outreach, worker-health,
    weekly digest) is dead.
  * Same shape of gap for qnfo-email: EMAIL-APPROVAL-GATE-1 (the owner-approval
    + sender-reputation predicate on drainReplyQueue) is on main but the live
    worker is 2.1.5, deployed 07:47:22Z, i.e. before the gate landed.  The
    ungated `decision='escalate'` send query is still what is running.

Bumping VERSION on both workers makes the applier/autodeploy lane redeploy them,
which re-runs the (now fixed) schedules PUT for cloud-ops and ships the gate for
email.  That is the whole point: this patch is a delivery trigger, not a logic
change.

Fail-closed: every anchor must match exactly once, or the script exits non-zero
and changes nothing.  Idempotent: a second run is a no-op.
"""
import json
import os
import sys

MARK = "SCHEDULES-LIVE-1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (relative path, old, new) - anchors verified unique against main on 2026-09-30
EDITS = [
    (
        "qnfo-cloud-ops/worker.js",
        'var VERSION = "1.15.1-cron-alias-dispatch";',
        'var VERSION = "1.15.3-schedules-live-1"; /* ' + MARK + " */",
    ),
    (
        "qnfo-email/worker.js",
        'VERSION="2.1.5"',
        'VERSION="2.1.6-approval-gate-1"/* ' + MARK + " */",
    ),
]

# Some workers keep a byte-mirror the parity guard reads; patch it too when present.
MIRRORS = ["deployed-current.worker.js"]


def main():
    report = {"marker": MARK, "landed": [], "skipped": [], "errors": []}

    for rel, old, new in EDITS:
        candidates = [rel]
        d = os.path.dirname(os.path.join(ROOT, rel))
        for m in MIRRORS:
            p = os.path.join(d, m)
            if os.path.isfile(p):
                candidates.append(os.path.relpath(p, ROOT))

        for c in candidates:
            path = os.path.join(ROOT, c)
            if not os.path.isfile(path):
                report["errors"].append(c + ": missing")
                continue
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    src = fh.read()
            except Exception as e:  # pragma: no cover
                report["errors"].append(c + ": read " + str(e))
                continue

            if MARK in src:
                report["skipped"].append(c + ": already-patched")
                continue

            n = src.count(old)
            if n != 1:
                report["errors"].append(
                    c + ": anchor count=" + str(n) + " (need exactly 1)"
                )
                continue

            with open(path, "w", encoding="utf-8") as fh:
                fh.write(src.replace(old, new, 1))
            report["landed"].append(c)

    print(json.dumps(report, indent=2))
    return 0 if (report["landed"] or report["skipped"]) and not report["errors"] else 1


if __name__ == "__main__":
    sys.exit(main())

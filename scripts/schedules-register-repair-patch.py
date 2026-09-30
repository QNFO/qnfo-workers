#!/usr/bin/env python3
"""SCHEDULES-REGISTER-REPAIR-1  (issue #1500)

Force a qnfo-cloud-ops redeploy through the applier channel so raw_put.py
re-PUTs the declared cron triggers (wrangler.toml, 21 crons) to the
Cloudflare API.

Root cause established by audit:
  * live registered triggers for qnfo-cloud-ops = ["30 5 * * 1"] (1 cron)
  * declared (wrangler.toml, buildCrons(2))          = 21 crons
  * "30 5 * * 1" is the PRE-DOW-FIX value of the `visibility` job
    (CF dow 1 = Sunday; the job intends Monday)
  * dispatchMap(2) therefore has no entry for the live trigger
  * scheduled() falls through, and syncSchedules() - the self-repair path
    that would PUT the 21 crons - is only reachable from scheduled()
  * the lone live trigger is WEEKLY, so the worker does not wake again
    until the next Sunday 05:30 UTC -> the repair is unreachable.

This patch is deliberately a no-op version bump: its only job is to make
the applier see a changed tree for qnfo-cloud-ops and deploy it, which is
the credentialed path that performs the schedules PUT.

Fail-closed: refuses to write if the anchor is not present exactly once.
Idempotent: no-ops when the marker is already present.
"""
import pathlib
import sys

MARK = "SCHEDULES-REGISTER-REPAIR-1"
OLD = 'var VERSION = "1.15.1-cron-alias-dispatch";'
NEW = 'var VERSION = "1.15.2-schedules-register-repair"; // ' + MARK

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [
    "qnfo-cloud-ops/worker.js",
    "qnfo-cloud-ops/deployed-current.worker.js",
]


def main() -> int:
    changed = []
    for rel in TARGETS:
        p = ROOT / rel
        if not p.exists():
            print("SKIP(missing): %s" % rel)
            continue
        src = p.read_text()
        if MARK in src:
            print("SKIP(already-applied): %s" % rel)
            continue
        n = src.count(OLD)
        if n != 1:
            print("FAIL(anchor count=%d, expected 1): %s" % (n, rel))
            return 1
        p.write_text(src.replace(OLD, NEW, 1))
        changed.append(rel)
        print("PATCHED: %s" % rel)

    if not changed:
        print("no-op (nothing to change)")
    else:
        print("changed=%d" % len(changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())

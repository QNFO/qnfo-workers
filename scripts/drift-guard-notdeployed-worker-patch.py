#!/usr/bin/env python3
"""drift-guard-notdeployed-worker-patch.py

NOT-DEPLOYED-IDENTITY-1 + DUP-WORKER-1 (2026-09-29) -- now a STATE ASSERTION, not a patch.

STATUS: SUPERSEDED AS A PATCHER. This script no longer edits any file. Both fixes it was
written to apply have landed by other routes, and it is kept (and kept GREEN) so that the
workflow that runs it, .github/workflows/apply-drift-guard-notdeployed-fix.yml, becomes a
regression guard instead of a permanently failing job.

WHY IT HAD TO CHANGE (measured 2026-09-29, issue #1382)
  The previous revision anchored on two exact strings in scripts/deploy-drift-guard.py:
      A1  '            else:\\n                not_deployed.append(d)\\n'
      A2  '        worker = wrangler_name(d) or d\\n        if wanted and d not in wanted ...'
  Re-counted against main (guard sha 9952ef80, 17,531 B):
      A1 count = 0    (the guard now emits not_deployed.append((d, worker)))
      A2 count = 0    (a concurrent writer refactored this into
                       'declared = wrangler_name(d)' + 'worker = declared or d')
      A3 count = 1
  A1 and A2 are hard preconditions: count != 1 exits 3 BEFORE any edit. So the workflow step
  'apply fail-closed patch' failed on every run, the job never reached py_compile or the
  commit, and the fix could never land. A fail-closed guard whose anchors have all been
  overtaken by other writers is not "safe"; it is a permanently red job that trains people
  to ignore CI. That is the defect this revision closes.

WHAT IT ASSERTS NOW (exit 0 = both invariants hold, exit 3 = a regression)
  I1  scripts/deploy-drift-guard.py emits the RESOLVED worker for the NOT_DEPLOYED class:
      'not_deployed.append((d, worker))' present and the bare 'not_deployed.append(d)'
      absent.
  I2  scripts/fleet-autoaudit.py de-duplicates a repeated class note (NOTE-APPEND-IDEMPOTENT-1):
      the guard can legitimately emit one resolved worker twice, because two repo
      directories declare the same wrangler name -- verified on main:
          memory-mcp/wrangler.toml      -> name = "qnfo-memory-mcp"
          qnfo-memory-mcp/wrangler.toml -> name = "qnfo-memory-mcp"
      Without I2 the consumer concatenated the class into the malformed value
      'NO_REPO_VERSION+NO_REPO_VERSION' (measured in worker_live_audit on the 2026-09-29
      16:00:58Z FLEET-AUTOAUDIT-1 run).

ADVERSARIAL
  * A green run proves two string invariants in two files. It proves NOTHING about whether
    the fleet is healthy, and nothing about whether NOT_DEPLOYED is the correct class for
    any particular worker.
  * It deliberately does NOT re-add a guard-side dedupe. Deduping inside the guard would
    skip a whole repo directory and break the guard's documented invariant that every
    directory yields exactly one class. The fix belongs in the consumer, where it is.
  * I1 is a substring assertion. A rewrite that preserves the substring while changing
    behaviour would pass. That is the accepted cost of not pinning a whole file.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
CONSUMER = os.path.join(ROOT, "scripts", "fleet-autoaudit.py")

I1_WANT = "not_deployed.append((d, worker))"
I1_BAD = "not_deployed.append(d)"
I2_WANT = 'if note not in rows[worker]["note"].split("+")'


def read(path):
    if not os.path.isfile(path):
        print("::error::missing " + path)
        return None
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def main():
    guard = read(GUARD)
    consumer = read(CONSUMER)
    if guard is None or consumer is None:
        return 3

    failures = []
    if I1_WANT not in guard:
        failures.append("I1: %s absent from deploy-drift-guard.py" % I1_WANT)
    if I1_BAD in guard:
        failures.append("I1: legacy %s still present (NOT_DEPLOYED keyed by directory)"
                        % I1_BAD)
    if I2_WANT not in consumer:
        failures.append("I2: NOTE-APPEND-IDEMPOTENT-1 absent from fleet-autoaudit.py")

    if failures:
        for f in failures:
            print("::error::" + f)
        return 3

    print("SUPERSEDED-AS-PATCHER: no file edited (both fixes already landed)")
    print("I1 OK: deploy-drift-guard.py emits the resolved worker for NOT_DEPLOYED")
    print("I2 OK: fleet-autoaudit.py de-duplicates a repeated class note")
    print("invariants asserted: 2/2")
    return 0


if __name__ == "__main__":
    sys.exit(main())

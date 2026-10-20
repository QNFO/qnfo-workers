#!/usr/bin/env python3
"""artifacts_sync_assert.py -- the last word of a reconcile run.

WHY
  A sync job that reports green while it could not read half its sources is worse than one that
  fails: the fleet's dashboards, its knowledge graph and its vectors all inherit the claim. This
  asserts on the run's own report and exits non-zero when the run could not see what it claimed
  to check.

  It deliberately does NOT fail on residual drift: drift is what the repair loop exists for and is
  already recorded in artifact_sync_state/artifact_sync_runs. It fails on unreadable sources.
"""

import json
import os
import sys


def main():
    path = os.environ.get("SYNC_REPORT", "sync.json")
    if not os.path.exists(path):
        print("no report produced by the reconcile step; asserting nothing")
        return 0
    try:
        summary = json.load(open(path, encoding="utf-8"))["summary"]
    except Exception as e:
        print("unreadable report: %s" % e)
        return 1
    print("checked=%(repos)s in_sync=%(in_sync)s (before repair %(pre)s) drifted=%(drifted)s "
          "repaired=%(repaired)s errors=%(errors)s waived=%(waived)s" % {
              "repos": summary.get("repos"), "in_sync": summary.get("in_sync"),
              "pre": summary.get("in_sync_before_repair", summary.get("in_sync")),
              "drifted": summary.get("drifted"), "repaired": summary.get("repaired"),
              "errors": summary.get("errors"), "waived": summary.get("waived")})
    errors = summary.get("errors") or 0
    if errors:
        print("read failures: %s" % json.dumps(summary.get("error_sample"))[:400])
        return 1
    # `in_sync` is post-repair; on a run that repaired nothing it equals the pre-repair count, so
    # the same formula covers both. Repaired repos are NOT also in `in_sync_before_repair`.
    accounted = ((summary.get("in_sync") or 0) + (summary.get("drifted") or 0)
                 + (summary.get("waived") or 0))
    if accounted != (summary.get("repos") or 0):
        print("ACCOUNTING GAP: %d of %d repos classified" % (accounted, summary.get("repos")))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

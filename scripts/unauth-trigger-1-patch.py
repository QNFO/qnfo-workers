#!/usr/bin/env python3
"""SUPERSEDED 2026-09-30 -- do not re-implement.

UNAUTH-TRIGGER-1 (agent_issues 1672) was already closed by
scripts/_retired/patch-fleet-exec-tick-unauth-1.py, which landed as commit
81581bf and DELETED the unauthenticated POST /tick route from
fleet-exec/worker.js (marker FLEET-EXEC-TICK-UNAUTH-1 is present on main).

This applier is now a no-op because BOTH of its anchors are dead:

  * "guard /tick" targets the literal
        if (url.pathname === "/tick" && request.method === "POST") {
    which no longer exists in fleet-exec/worker.js, so the applier returns
    STALE-ANCHOR rc=1 on every apply pass -- permanent applier rot.

  * "guard /run" rests on a false premise. /run is NOT externally reachable.
    An uncredentialed POST to https://fleet-exec.q08.workers.dev/run returns
    HTTP 404 {"ok":false,"error":"not found"} because the deployed default
    export is schedDefault (the scheduler); /run lives on the internal
    execDefault module, reached only in-process via execMod.fetch(). Measured
    2026-09-30 by qnfo-ops.

Removal was preferred over gating for /tick because fleet-exec/wrangler.toml
declares NO secret bindings, so no fail-closed token gate could be installed
without provisioning a secret, and the route had ZERO callers in the repo --
production dispatch uses scheduled(), which calls runTick(env) directly.

If an authenticated on-demand fleet-task trigger is wanted, implement it on an
authenticated control worker (qnfo-fleet-control already gates equivalent routes
with RUN_SECRET / ADVISOR_TOKEN), not by re-adding routes to fleet-exec.
"""
import sys


def main() -> int:
    print("SUPERSEDED: UNAUTH-TRIGGER-1 already closed by "
          "patch-fleet-exec-tick-unauth-1.py (commit 81581bf); no-op")
    return 0


if __name__ == "__main__":
    sys.exit(main())

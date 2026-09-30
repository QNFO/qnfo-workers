#!/usr/bin/env python3
"""FLEET-EXEC-TICK-UNAUTH-1 -- fleet-exec exposed an UNAUTHENTICATED control-plane trigger.

ROOT CAUSE (measured 2026-09-30 by qnfo-ops, issue #1672)
--------------------------------------------------------
fleet-exec/worker.js schedDefault.fetch() served:

    if (url.pathname === "/tick" && request.method === "POST") {
      const fired = await runTick(env);
      return json({ ok: true, fired: fired });
    }

with no token or secret check anywhere in the file (grep RUN_SECRET -> 0 matches).
Proof of exploitability, same turn: an uncredentialed fetch to
https://fleet-exec.q08.workers.dev/tick returned HTTP 200
{"ok":true,"fired":[{"name":"self-audit-systemwide-every-6h",...,"dispatched":200}]}
and produced fleet_runs id 1981 (status ok, steps_run 4) plus a fleet_crons
next_fire rewrite. Any internet caller could force every due fleet_cron to
dispatch, burn Workers AI neurons and D1 writes on the owner's account, and run
any enabled fleet_task including workflow steps that INSERT into agent_issues.

WHY REMOVE RATHER THAN GATE
---------------------------
fleet-exec/wrangler.toml declares NO secret bindings, so a token gate cannot be
added fail-closed without provisioning a new secret. The route has ZERO callers
in the repo (grep -rn '/tick' matches only its own definition). Production cron
dispatch never used it: scheduled() calls runTick(env) directly.

FIX
---
Delete the route. /health and the 404 fallback remain; scheduled() is untouched.

CONTRACT (repo applier conventions)
-----------------------------------
* exactly-one-occurrence anchors; a mismatch aborts rc 1 and writes nothing
* idempotent: a second run is a no-op once the marker is present
* no deploy, no network -- apply-pending-patches.yml commits and deploys
* primary target fleet-exec/worker.js; the deployed-current mirror is best-effort

VERIFICATION PERFORMED BEFORE COMMIT (2026-09-30, qnfo-ops container)
--------------------------------------------------------------------
* run against the real 12247-byte fleet-exec/worker.js and its identical mirror
* second run: already-applied, rc 0 (idempotent)
* node --check on the patched bundle as ESM: SYNTAX OK
"""
import hashlib
import os
import sys
from pathlib import Path

MARKER = "FLEET-EXEC-TICK-UNAUTH-1"
PRIMARY = "fleet-exec/worker.js"
MIRROR = "fleet-exec/deployed-current.worker.js"

OLD = (
    '    if (url.pathname === "/tick" && request.method === "POST") {\n'
    '      const fired = await runTick(env);\n'
    '      return json({ ok: true, fired: fired });\n'
    '    }\n'
)

NEW = (
    '    // FLEET-EXEC-TICK-UNAUTH-1 (issue #1672): the unauthenticated POST /tick route was\n'
    '    // removed. It had zero callers in the repo, and fleet-exec declares no secrets, so it\n'
    '    // could not be gated fail-closed without provisioning one. Cron dispatch is unaffected:\n'
    '    // scheduled() above calls runTick(env) directly and never used this route. Any future\n'
    '    // on-demand trigger belongs on an authenticated control worker, not here.\n'
)


def patch(path):
    p = Path(path)
    if not p.exists():
        return "missing", None
    src = p.read_text(encoding="utf-8")
    if MARKER in src:
        return "already-applied", None
    n = src.count(OLD)
    if n != 1:
        return "anchor-mismatch(%d)" % n, None
    out = src.replace(OLD, NEW, 1)
    p.write_text(out, encoding="utf-8")
    return "patched", hashlib.sha256(out.encode("utf-8")).hexdigest()


def main():
    root = os.environ.get("REPO_ROOT", ".")
    os.chdir(root)
    results = {}
    for target in (PRIMARY, MIRROR):
        try:
            st, sha = patch(target)
        except Exception as e:
            st, sha = "error:%s" % e, None
        results[target] = {"status": st, "sha256": sha}
    for k, v in results.items():
        print("%-45s %s %s" % (k, v["status"], v["sha256"] or ""))
    bad = [k for k, v in results.items() if v["status"] not in ("patched", "already-applied", "missing")]
    if bad:
        print("FAIL " + ",".join(bad))
        return 1
    print("OK " + MARKER)
    return 0


if __name__ == "__main__":
    sys.exit(main())

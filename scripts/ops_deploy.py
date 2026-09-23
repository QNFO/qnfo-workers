#!/usr/bin/env python3
"""ops_deploy.py - canonical server-side worker deploy via qnfo-ops POST /ops/deploy.

WHY (DEPLOY-GUARD-BYPASS-1 + REPO-IS-DEPLOY-SOURCE-1 + SERVER-SIDE-DEPLOY-1):
  The canonical deploy path is qnfo-ops's opsDeploy route, which runs the ENTIRE sequence
  server-side: deploy-guard lock -> fetch source from QNFO/qnfo-workers main (uncached GitHub API)
  -> cf_worker_deploy (BINDING-PRESERVE-1 + expected_version race guard) -> verify -> ledger + release.
  A raw `wrangler deploy` BYPASSES the lock and NEVER writes /ledger - which is exactly why
  service_registry.version keeps re-staling (F1b). A raw CF API PUT /workers/scripts/<name> is
  reverted by qnfo-fleet-control's */20 repo redeploy.

PRECONDITION: the version-bumped source MUST be committed + pushed to QNFO/qnfo-workers main FIRST
(the route fetches from main).

Usage:
  python scripts/ops_deploy.py <worker> <dir> <from_version> <to_version>
  python scripts/ops_deploy.py vault-indexer vault-indexer 0.1.20 0.1.21

Auth: OPS_ROUTER_AUTH_KEY, read from the env or the ~/.env mirror (the value is never printed).

Exit codes: 0 ok | 1 route reported not-ok | 2 usage | 3 auth/transport error
"""
import json
import os
import sys
import urllib.error
import urllib.request

ROUTE = "https://qnfo-ops.q08.workers.dev/ops/deploy"
REPO = "QNFO/qnfo-workers"


def load_key():
    """Return OPS_ROUTER_AUTH_KEY from the environment or the ~/.env mirror, else None."""
    k = os.environ.get("OPS_ROUTER_AUTH_KEY")
    if k and k.strip():
        return k.strip()
    envp = os.path.join(os.path.expanduser("~"), ".env")
    try:
        with open(envp, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if line.startswith("OPS_ROUTER_AUTH_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


def deploy(worker, directory, from_version, to_version):
    key = load_key()
    if not key:
        print(json.dumps({"error": "OPS_ROUTER_AUTH_KEY not found (env or ~/.env)"}))
        return 3
    body = json.dumps({
        "worker": worker,
        "repo": REPO,
        "path": directory.rstrip("/") + "/worker.js",
        "from_version": from_version,
        "to_version": to_version,
    }).encode("utf-8")
    req = urllib.request.Request(
        ROUTE, data=body, method="POST",
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "User-Agent": "qnfo-ops-deploy-client/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            j = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        try:
            j = json.loads(e.read().decode("utf-8", "replace"))
        except Exception:
            j = {"error": "http_" + str(e.code)}
        print(json.dumps(j))
        return 3 if e.code != 200 else 0
    except Exception as e:  # noqa: BLE001 - transport errors are reported, not raised
        print(json.dumps({"error": str(e)}))
        return 3
    print(json.dumps(j))
    return 0 if j.get("ok") else 1


def main(argv):
    if len(argv) != 5:
        print(__doc__)
        return 2
    return deploy(argv[1], argv[2], argv[3], argv[4])


if __name__ == "__main__":
    sys.exit(main(sys.argv))

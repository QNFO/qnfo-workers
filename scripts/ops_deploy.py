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


def source_sanity(worker, directory):
    """Refuse to deploy a source that is a redaction placeholder or implausibly small.

    build_body() sends <dir>/worker.js to /ops/deploy. For at least one worker that file is
    an intentional PLACEHOLDER, not the real source: personal-api/worker.js is 33 bytes
    containing '<REDACTED - commit via ops agent>', while the real 175503-byte bundle exists
    ONLY in personal-api/deployed-current.worker.js. Deploying the stub would replace a live
    production worker with a placeholder string. Fail closed on suspicious size or an explicit
    REDACTED marker. Found 2026-09-24 while tracing a prompt-store-verify failure, which reads
    the stub - so that failure was an artifact of the placeholder, not a missing clause in the
    live twin.
    """
    src = os.path.join(directory, "worker.js")
    try:
        size = os.path.getsize(src)
        with open(src, "r", encoding="utf-8", errors="replace") as f:
            head = f.read(300)
    except OSError:
        return 0
    if size < 512 or "REDACTED" in head:
        print(json.dumps({
            "error": "source-is-placeholder",
            "worker": worker,
            "size": size,
            "detail": "worker.js is %d bytes and/or carries a REDACTED marker; the real "
                      "artifact is deployed-current.worker.js. Refusing to deploy a "
                      "placeholder over a live worker." % size}))
        return 1
    return 0


def mirror_preflight(worker):
    """CORRECTED 2026-09-24 after reading line 58 of this file. The previous docstring
    claimed opsDeploy fetches <dir>/deployed-current.worker.js. THAT IS FALSE - build_body()
    sends `path = directory + "/worker.js"`, so /ops/deploy reads the SOURCE, not the mirror.
    The mirror matters to the OTHER canonical path: qnfo-fleet-control.canonical() fetches
    qnfo-workers/main/<name>/deployed-current.worker.js - i.e. the fleet-control redeploy
    cron, which can silently revert a source fix that never reached the mirror (canonical
    case: qnfo-deploy-guard source 1.3.12 / mirror 1.3.11). Scoped to the target worker only,
    so one lagging worker never blocks an unrelated deploy.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    guard = os.path.join(here, "mirror-guard.py")
    if not os.path.exists(guard):
        return 0
    import subprocess
    try:
        p = subprocess.run([sys.executable, guard], capture_output=True, text=True)
    except Exception:
        return 0
    if p.returncode == 0:
        return 0
    out = (p.stdout or "") + (p.stderr or "")
    for line in out.splitlines():
        if line.startswith(worker) and " LAG " in line:
            print(json.dumps({"error": "mirror-preflight-failed", "worker": worker,
                              "detail": "deployed-current.worker.js lags worker.js - run "
                                        "'python scripts/mirror-guard.py --fix' and commit BOTH files",
                              "line": line.strip()}))
            return 1
    return 0


def main(argv):
    if len(argv) != 5:
        print(__doc__)
        return 2
    rcs = source_sanity(argv[1], argv[2])
    if rcs:
        return rcs
    rcm = mirror_preflight(argv[1])
    if rcm:
        return rcm
    return deploy(argv[1], argv[2], argv[3], argv[4])


if __name__ == "__main__":
    sys.exit(main(sys.argv))

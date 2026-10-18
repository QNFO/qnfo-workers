#!/usr/bin/env python3
"""artifacts_sync_gate.py -- throttle for artifacts-canonical-sync.

WHY
  This workflow is chained to mirror-sync, which fires on every push to main (~50/hour measured
  2026-10-18). Without a gate, each of those pushes would clone and push 180 replicas: real cost,
  no benefit, because a replica 90 minutes behind is still a faithful replica.

CONTRACT
  Prints `run=<true|false>` and `note=<reason>` for $GITHUB_OUTPUT.
  Fails OPEN on a read error: a broken gate must not stop the sync that repairs drift. The sync
  itself still fails closed.
"""

import json
import os
import sys
import urllib.request

D1 = os.environ.get("QNFO_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
WINDOW_MIN = int(os.environ.get("SYNC_THROTTLE_MINUTES", "90"))


def main():
    acct = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")
    tok = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    if not (acct and tok):
        print("run=true")
        print("note=no_credentials_gate_bypassed")
        return 0
    sql = ("SELECT COUNT(*) AS recent FROM artifact_sync_runs "
           "WHERE started_at > datetime('now', '-%d minutes')" % WINDOW_MIN)
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query" % (acct, D1),
        data=json.dumps({"sql": sql}).encode(), method="POST",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            recent = json.load(r)["result"][0]["results"][0]["recent"]
    except Exception as e:
        print("run=true")
        print("note=gate_error_" + str(e)[:40].replace(" ", "_"))
        return 0
    print("run=" + ("true" if recent == 0 else "false"))
    print("note=recent_runs_%d_window_%dmin" % (recent, WINDOW_MIN))
    return 0


if __name__ == "__main__":
    sys.exit(main())

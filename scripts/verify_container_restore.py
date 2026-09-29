#!/usr/bin/env python3
"""Independent read-back for CONTAINER-CONFIG-RESTORE-8 (issues #1485 / #1487 / #1494).

WHY A SEPARATE VERIFIER
  The previous restore runs published artifacts whose "verify" step could not fail: the
  authoritative read-back ended in SystemExit(0) on the ABSENT path (CONTAINER-CONFIG-
  RESTORE-5 note) and/or carried continue-on-error:true, so a run in which [[containers]]
  was still missing produced a GREEN job with a buried ::error:: annotation. That is the
  CI-CLASS / WRANGLER-NOT-SKIPPABLE-1 defect class: a guard that cannot fail.

WHAT IT ASSERTS
  1. GET /settings bindings MUST contain AUDIT, PILOT_TOKEN, SHELL_CONTAINER.
     (Live evidence 2026-09-29T20:5xZ: cf_worker_bindings returned count=1,
      [{secret_text PILOT_TOKEN}] - the D1 and durable-object bindings were stripped.)
  2. GET /status with PILOT_TOKEN MUST NOT carry the outage signature
     "Cannot read properties of undefined" (the ctx.container-undefined failure).
  3. GET /settings `containers` is reported. When the /status probe is unavailable it is
     used as the gate instead, because the probe exercises the runtime path directly.

  Exit 0 only when (1) holds AND (2) holds (or (3) holds when the probe is unavailable).
  The artifact ci-status/restore-container-config-v2.json is written on EVERY path, so the
  blocker stays readable from the repo even when the restore fails closed.

Usage: CLOUDFLARE_API_TOKEN=... [PILOT_TOKEN=...] python3 scripts/verify_container_restore.py
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ACCT = (os.environ.get("CF_ACCOUNT_ID")
        or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or "edb167b78c9fb901ea5bca3ce58ccc4b")
WORKER = os.environ.get("WORKER", "qnfo-containers-pilot")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "ci-status", "restore-container-config-v2.json")
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; verify_container_restore.py)"
API = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s" % (ACCT, WORKER)
REQUIRED_BINDINGS = ("AUDIT", "PILOT_TOKEN", "SHELL_CONTAINER")
OUTAGE_SIGNATURE = "Cannot read properties of undefined"


def req(url, tok):
    r = urllib.request.Request(url, headers={"Authorization": "Bearer " + tok,
                                            "User-Agent": UA})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode("utf-8", "replace")
            try:
                return resp.status, json.loads(raw)
            except ValueError:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, body
    except Exception as e:  # noqa: BLE001
        return 0, "ERR " + str(e)


def write_artifact(payload):
    try:
        os.makedirs(os.path.dirname(ART), exist_ok=True)
        with open(ART, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, sort_keys=False)
        print("artifact written: %s" % ART)
    except Exception as e:  # noqa: BLE001
        print("::warning::could not write artifact %s: %s" % (ART, e))


def main():
    tok = (os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN") or "").strip()
    art = {
        "workflow": "restore-container-config-v2",
        "marker": "CONTAINER-CONFIG-RESTORE-8-VERIFY",
        "issues": [1485, 1487, 1494],
        "worker": WORKER,
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if not tok:
        art.update({"verdict": "FAIL", "reason": "no CLOUDFLARE_API_TOKEN in env"})
        write_artifact(art)
        print("::error::no CLOUDFLARE_API_TOKEN in env - cannot verify; #1485 stays open")
        return 1

    st, body = req(API + "/settings", tok)
    if st != 200 or not isinstance(body, dict) or not body.get("success"):
        art.update({"verdict": "FAIL", "reason": "GET /settings HTTP %s" % st,
                    "settings_error": str(body)[:300]})
        write_artifact(art)
        print("::error::GET /settings HTTP %s - cannot verify" % st)
        return 1

    res = body.get("result") or {}
    names = [x.get("name") for x in (res.get("bindings") or [])]
    containers = res.get("containers")
    missing = [n for n in REQUIRED_BINDINGS if n not in names]
    art.update({"settings_http": st, "bindings": names, "missing_bindings": missing,
                "containers": containers,
                "compatibility_date": res.get("compatibility_date"),
                "compatibility_flags": res.get("compatibility_flags"),
                "exports": res.get("exports")})
    print("bindings: %s" % json.dumps(names))
    print("containers: %s" % json.dumps(containers))
    print("missing bindings: %s" % json.dumps(missing))

    pt = os.environ.get("PILOT_TOKEN")
    probe_ok = None
    if pt:
        st2, body2 = req("https://%s.q08.workers.dev/status" % WORKER, pt)
        txt = str(body2)[:400]
        probe_ok = (st2 == 200) and (OUTAGE_SIGNATURE not in txt)
        art.update({"status_http": st2, "status_body": txt, "probe_ok": probe_ok})
        print("GET /status -> HTTP %s probe_ok=%s" % (st2, probe_ok))
    else:
        art.update({"status_http": None, "probe_ok": None,
                    "note": "PILOT_TOKEN absent - gating on containers metadata instead"})

    if missing:
        art.update({"verdict": "FAIL", "reason": "bindings still missing: %s" % missing})
        write_artifact(art)
        print("::error::bindings STILL missing %s - #1485 remains open" % missing)
        return 1

    if probe_ok is None:
        if not containers:
            art.update({"verdict": "FAIL",
                        "reason": "no probe and containers metadata absent"})
            write_artifact(art)
            print("::error::no /status probe and containers metadata absent - cannot "
                  "claim a restore; #1485 remains open")
            return 1
    elif not probe_ok:
        art.update({"verdict": "FAIL", "reason": "status probe still shows the outage"})
        write_artifact(art)
        print("::error::/status still shows the ctx.container outage - #1485 remains open")
        return 1

    art.update({"verdict": "PASS"})
    write_artifact(art)
    print("PASS: bindings present (%s); container runtime probe clean" % json.dumps(names))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""container_restore_gate.py - RESTORE-ONLY-WHEN-RED-1 (2026-09-30, issue #1485 follow-up).

WHY THIS EXISTS -- MEASURED
  container-config-selfheal-cron.yml ran scripts/restore_container_config.py on EVERY run, and
  it runs after every push to main (workflow_run off fleet-autodeploy / mirror-sync /
  deploy-qnfo-ops). Every run re-PUT qnfo-containers-pilot's /content, whether or not anything
  was wrong. Measured 2026-09-30:
    * cloud_ops_events: last kind=container.error at 2026-09-29T19:45:21Z, while container.exec
      successes continued up to 18:23Z the next day -- the container had been healthy ~23 h;
    * CF modified_on for qnfo-containers-pilot advanced 17:39:17Z, 17:59:53Z, 18:09:35Z ... i.e.
      one blind re-upload per push, each one filed by qnfo-deploy-guard as
      DEPLOY-UNLOGGED-MUTATION + DEPLOY-UNCOORDINATED-DEPLOY (agent_issues 1503, 1609, 1610),
      and each one restarting a container that other agents were using;
    * the workflow's own verdict could never be GREEN: PILOT_TOKEN is not provisioned in this
      repository and /settings.containers reads null even for a running container
      (SETTINGS-NOT-A-CONTAINER-OBSERVATION-POINT-1), so "is it broken?" was never answered
      before acting.

WHAT IT DECIDES
  need_restore=true only on POSITIVE evidence of the #1485 failure class:
    1. GET /health is not 200 (worker-level outage), OR
    2. with PILOT_TOKEN: /status shows the ctx.container-undefined signature, OR
    3. the newest container.* event in cloud_ops_events is a container.error within the last
       ERROR_WINDOW_H hours (the failure that #1485 produced: every container tool 500s).
  Otherwise need_restore=false. When the D1 evidence cannot be read, the gate does NOT restore
  on /health 200 alone -- a blind re-upload is the defect this file removes -- and says so.

OUTPUT
  Prints one JSON line and, under GitHub Actions, writes need_restore / reason / evidence to
  $GITHUB_OUTPUT. Exit code is always 0 (the gate informs; the workflow decides).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

ACCT = (os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or "edb167b78c9fb901ea5bca3ce58ccc4b")
TOKEN = (os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN") or "").strip()
AUDIT_D1 = os.environ.get("AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
WORKER = os.environ.get("WORKER", "qnfo-containers-pilot")
BASE = "https://%s.q08.workers.dev" % WORKER
ERROR_WINDOW_H = int(os.environ.get("ERROR_WINDOW_H", "6"))
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; container_restore_gate.py)"


def http(url, headers=None, data=None, method=None, timeout=60):
    h = {"User-Agent": UA}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, "ERR %s" % e


def newest_container_event():
    """(kind, ts, age_h) of the newest container.* event, or None when D1 is unreadable."""
    if not TOKEN:
        return None
    sql = ("SELECT kind, ts, (julianday('now') - julianday(ts)) * 24.0 AS age_h "
           "FROM cloud_ops_events WHERE kind LIKE 'container.%' ORDER BY ts DESC LIMIT 1")
    st, body = http("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query"
                    % (ACCT, AUDIT_D1),
                    headers={"Authorization": "Bearer " + TOKEN,
                             "Content-Type": "application/json"},
                    data=json.dumps({"sql": sql}).encode(), method="POST")
    if st != 200:
        return None
    try:
        rows = json.loads(body)["result"][0]["results"]
    except (ValueError, KeyError, IndexError, TypeError):
        return None
    if not rows:
        return ("none", None, None)
    r = rows[0]
    return (r.get("kind"), r.get("ts"), r.get("age_h"))


def decide():
    ev = {}
    hst, _ = http(BASE + "/health")
    ev["health_http"] = hst
    if hst != 200:
        return True, "worker /health HTTP %s" % hst, ev
    pilot = os.environ.get("PILOT_TOKEN", "")
    if pilot:
        sst, sbody = http(BASE + "/status", headers={"Authorization": "Bearer " + pilot})
        ev["status_http"] = sst
        if "Cannot read properties of undefined" in sbody:
            return True, "/status reports ctx.container undefined (#1485 signature)", ev
        if '"containerRunning": true' in sbody.replace('":true', '": true'):
            return False, "/status reports containerRunning=true", ev
    newest = newest_container_event()
    ev["newest_container_event"] = newest
    if newest is None:
        return False, ("container evidence unreadable (D1 query failed) and /health is 200: "
                       "NOT restoring blind (RESTORE-ONLY-WHEN-RED-1)"), ev
    kind, ts, age_h = newest
    if kind == "container.error" and age_h is not None and float(age_h) <= ERROR_WINDOW_H:
        return True, "newest container event is container.error at %s (%.1fh ago)" % (ts, float(age_h)), ev
    return False, "newest container event is %s at %s: container healthy, nothing to restore" % (kind, ts), ev


def main():
    need, reason, ev = decide()
    out = {"need_restore": need, "reason": reason, "evidence": ev}
    print(json.dumps(out))
    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        with open(gh, "a", encoding="utf-8") as fh:
            fh.write("need_restore=%s\n" % ("true" if need else "false"))
            fh.write("reason=%s\n" % reason.replace("\n", " "))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

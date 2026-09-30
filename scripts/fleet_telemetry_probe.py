#!/usr/bin/env python3
"""fleet_telemetry_probe.py -- read-only fleet performance/efficiency snapshot.

WHY THIS EXISTS
  The fleet dashboard reports "N worker(s) with 24h errors" from the Workers
  analytics GraphQL API but only as a per-script total: it cannot say WHY a
  worker errored (exceededCpu vs scriptThrewException vs exceededResources),
  WHEN (still erroring, or only before the last deploy), or what each worker
  COSTS (CPU, subrequests, Workers AI neurons). The GraphQL API is reachable
  from CI (CLOUDFLARE_API_TOKEN) but not from agent sessions, so every
  error/efficiency investigation started blind.

  This probe prints, and writes to ci-status/fleet-telemetry.json:
    - 24h errors per script broken down by invocation status, with the hour of
      the most recent error (so "fixed by deploy X" is checkable);
    - 30d requests / errors / CPU p50/p99 per script (efficiency ranking and
      zero-traffic retirement candidates, per quniverse-fleet-lessons);
    - Workers AI neurons per model over 30d (free-first routing evidence);
    - AI Gateway request/error/cost per provider+model over 7d.

  Every query degrades independently: a dataset the token cannot read is
  reported as {"error": ...}, never as zero (a governance metric displayed as
  zero is worse than undefined).

Exit 0 always (diagnostic; never gates a pipeline).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request

ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "edb167b78c9fb901ea5bca3ce58ccc4b"
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
OUT = os.environ.get("TELEMETRY_OUT", "ci-status/fleet-telemetry.json")


def gql(query: str) -> dict:
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4/graphql",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = json.loads(r.read().decode())
    except Exception as e:  # noqa: BLE001 - diagnostic, report and continue
        return {"error": "http: " + str(e)[:300]}
    if body.get("errors"):
        return {"error": json.dumps(body["errors"])[:600]}
    try:
        return {"rows": body["data"]["viewer"]["accounts"][0]}
    except Exception as e:  # noqa: BLE001
        return {"error": "shape: " + str(e)[:200]}


def iso(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    if not TOKEN:
        print("fleet_telemetry_probe: CLOUDFLARE_API_TOKEN not set", file=sys.stderr)
        return 0
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    d1 = iso(now - dt.timedelta(days=1))
    d7 = iso(now - dt.timedelta(days=7))
    # workersInvocationsAdaptive retention is shorter than 30d on some plans; fall back to 7d.
    d30 = iso(now - dt.timedelta(days=30))
    end = iso(now)
    acct = 'accounts(filter:{accountTag:"%s"})' % ACCOUNT
    out: dict = {"generated_at": end, "account": ACCOUNT}

    # 1. 24h errors by script x status x hour
    q = ('query { viewer { %s { workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:"%s", datetime_leq:"%s", status_neq:"success"}) '
         '{ sum { requests errors } dimensions { scriptName status datetimeHour } } } } }') % (acct, d1, end)
    r = gql(q)
    if "error" in r:
        out["errors_24h"] = {"error": r["error"]}
    else:
        agg: dict = {}
        for row in r["rows"].get("workersInvocationsAdaptive", []):
            dm, sm = row["dimensions"], row["sum"]
            if not sm.get("errors"):
                continue
            a = agg.setdefault(dm["scriptName"], {"errors": 0, "by_status": {}, "last_error_hour": "", "hours": {}})
            a["errors"] += sm["errors"]
            a["by_status"][dm["status"]] = a["by_status"].get(dm["status"], 0) + sm["errors"]
            a["hours"][dm["datetimeHour"]] = a["hours"].get(dm["datetimeHour"], 0) + sm["errors"]
            a["last_error_hour"] = max(a["last_error_hour"], dm["datetimeHour"])
        out["errors_24h"] = dict(sorted(agg.items(), key=lambda kv: -kv[1]["errors"]))

    # 2. per-script requests / errors / cpu over 30d (7d fallback)
    for since, label in ((d30, "30d"), (d7, "7d")):
        q = ('query { viewer { %s { workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:"%s", datetime_leq:"%s"}) '
             '{ sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 wallTimeP99 } dimensions { scriptName } } } } }') % (acct, since, end)
        r = gql(q)
        if "error" not in r:
            rows = []
            for row in r["rows"].get("workersInvocationsAdaptive", []):
                rows.append({"script": row["dimensions"]["scriptName"], **row["sum"], **row["quantiles"]})
            rows.sort(key=lambda x: -x["requests"])
            out["usage"] = {"window": label, "scripts": rows}
            break
        out["usage"] = {"window": label, "error": r["error"]}

    # 3. Workers AI neurons per model (30d, 7d fallback)
    for since, label in ((d30, "30d"), (d7, "7d")):
        q = ('query { viewer { %s { aiInferenceAdaptiveGroups(limit:1000, filter:{datetime_geq:"%s", datetime_leq:"%s"}) '
             '{ count sum { totalNeurons } dimensions { modelId } } } } }') % (acct, since, end)
        r = gql(q)
        if "error" not in r:
            rows = [{"model": x["dimensions"]["modelId"], "requests": x["count"], "neurons": x["sum"]["totalNeurons"]}
                    for x in r["rows"].get("aiInferenceAdaptiveGroups", [])]
            rows.sort(key=lambda x: -(x["neurons"] or 0))
            tot = sum(x["neurons"] or 0 for x in rows)
            # Workers AI: 10k neurons/day free, then $0.011 per 1k neurons.
            out["workers_ai"] = {"window": label, "neurons_total": tot, "models": rows}
            break
        out["workers_ai"] = {"window": label, "error": r["error"]}

    # 4. AI Gateway per provider/model (7d)
    q = ('query { viewer { %s { aiGatewayRequestsAdaptiveGroups(limit:1000, filter:{datetime_geq:"%s", datetime_leq:"%s"}) '
         '{ count sum { cost erroredRequests cachedRequests } dimensions { gateway provider model } } } } }') % (acct, d7, end)
    r = gql(q)
    if "error" in r:
        out["ai_gateway_7d"] = {"error": r["error"]}
    else:
        rows = [{**x["dimensions"], "requests": x["count"], **x["sum"]} for x in r["rows"].get("aiGatewayRequestsAdaptiveGroups", [])]
        rows.sort(key=lambda x: -(x.get("cost") or 0))
        out["ai_gateway_7d"] = rows

    os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, sort_keys=False)
    print(json.dumps(out, indent=1)[:60000])
    return 0


if __name__ == "__main__":
    sys.exit(main())

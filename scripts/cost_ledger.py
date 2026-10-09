#!/usr/bin/env python3
"""COST-LEDGER-DAILY-1 (2026-10-09, pillar cost; owner request 2026-10-09: realistic targets from actual usage, a monthly
total that covers the Cloudflare fleet and all billing, extrapolated from the last 7-10 days rather than a 30-day window).

WHAT  Writes qnfo-audit.cost_daily, one row per (date, source), for the last LOOKBACK_DAYS complete days plus today:
        workers_ai             account-wide Workers AI neurons (GraphQL aiInferenceAdaptiveGroups) at $0.011 per 1k after
                               10k free per day: the billed Workers AI amount, not only the fleet-attributed calls;
        ai_gateway:<provider>  AI Gateway cost per provider (GraphQL aiGatewayRequestsAdaptiveGroups.sum.cost): unified billing
                               (paid from gateway credit) and BYOK (paid to the provider) both cost the owner money;
        cloudflare_plan        the account's subscriptions (GET /accounts/{id}/subscriptions) spread per day; when the token is
                               refused, the seeded monthly baseline in cost_source_registry, with the refusal in the note;
        direct_providers_external  the owner's stated spend outside the fleet (no API sees it), per day, marked unverified.
      v_cost_run_rate (migration 2026-10-09-14) projects each source and the total to 30 days from the 7- and 10-day means.
RUNS  A step of remediation-consumer.yml (hourly; rewrites the same rows, so it is idempotent). Never fails the job.
"""
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remediation_consumer as RC  # noqa: E402

LOOKBACK_DAYS = int(os.environ.get("COST_LOOKBACK_DAYS", "10"))
NEURON_USD_PER_1K = 0.011
FREE_NEURONS_PER_DAY = 10000


def cf(method, path, body=None, timeout=30):
    req = urllib.request.Request(RC.CF_API + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + RC.TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace") or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8", "replace") or "{}")
        except Exception:  # noqa: BLE001
            return e.code, {}


def gql(query, call=cf):
    st, j = call("POST", "/graphql", {"query": query})
    if st != 200 or j.get("errors"):
        raise RuntimeError("graphql %s %s" % (st, json.dumps(j.get("errors"))[:200]))
    acc = (((j.get("data") or {}).get("viewer") or {}).get("accounts") or [{}])[0]
    return acc


def day_window(day):
    start = dt.datetime.combine(day, dt.time(0, 0), tzinfo=dt.timezone.utc)
    end = min(start + dt.timedelta(days=1), dt.datetime.now(dt.timezone.utc))
    return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")


def workers_ai_day(day, call=cf):
    a, b = day_window(day)
    acc = gql('query { viewer { accounts(filter: { accountTag: "%s" }) { aiInferenceAdaptiveGroups(limit: 1000, filter: { datetime_geq: "%s", datetime_lt: "%s" }) { count sum { totalNeurons } } } } }'
              % (RC.ACCOUNT, a, b), call)
    rows = acc.get("aiInferenceAdaptiveGroups") or []
    neurons = sum(float((r.get("sum") or {}).get("totalNeurons") or 0) for r in rows)
    reqs = sum(int(r.get("count") or 0) for r in rows)
    return max(0.0, neurons - FREE_NEURONS_PER_DAY) / 1000 * NEURON_USD_PER_1K, reqs, neurons


def gateway_day(day, call=cf):
    a, b = day_window(day)
    acc = gql('query { viewer { accounts(filter: { accountTag: "%s" }) { aiGatewayRequestsAdaptiveGroups(limit: 2000, filter: { datetime_geq: "%s", datetime_lt: "%s" }) { count sum { cost } dimensions { provider model } } } } }'
              % (RC.ACCOUNT, a, b), call)
    by = {}
    for r in acc.get("aiGatewayRequestsAdaptiveGroups") or []:
        d = r.get("dimensions") or {}
        prov = str(d.get("provider") or "unknown").lower()
        model = str(d.get("model") or "")
        if prov in ("compat", "unknown", "universal") and "/" in model:
            prov = model.split("/")[0].lower()
        if prov in ("workers-ai", "workers_ai"):
            continue  # neuron-billed, counted in workers_ai
        c = float((r.get("sum") or {}).get("cost") or 0)
        u, n = by.get(prov, (0.0, 0))
        by[prov] = (u + c, n + int(r.get("count") or 0))
    return by


def plan_monthly(d1, call=cf):
    st, j = call("GET", "/accounts/%s/subscriptions" % RC.ACCOUNT)
    if st == 200 and j.get("success") is not False and isinstance(j.get("result"), list):
        total, names = 0.0, []
        for s in j["result"]:
            price = float(s.get("price") or 0)
            freq = str(s.get("frequency") or "monthly").lower()
            monthly = price / 12 if freq in ("yearly", "annual") else price * 4.33 if freq == "weekly" else price
            if monthly > 0:
                total += monthly
                names.append("%s %.2f/%s" % (((s.get("rate_plan") or {}).get("public_name") or s.get("id") or "plan"), price, freq))
        return total, "subscriptions API: " + "; ".join(names)[:300]
    seeded = d1("SELECT usd FROM cost_daily WHERE source = 'cloudflare_plan' AND instr(COALESCE(note, ''), 'seeded') > 0 ORDER BY date LIMIT 1")
    base = float(seeded[0]["usd"]) if seeded else 0.0
    return base, "seeded monthly baseline (subscriptions API answered %s: %s)" % (st, json.dumps(j.get("errors") or "")[:120])


def stated_external(d1):
    r = d1("SELECT usd FROM cost_daily WHERE source = 'direct_providers_external' ORDER BY date LIMIT 1")
    return float(r[0]["usd"]) if r else 0.0


def upsert(d1, date, source, scope, usd, reqs, note):
    d1("INSERT INTO cost_daily (date, source, scope, usd, requests, note, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) "
       "ON CONFLICT(date, source) DO UPDATE SET usd = excluded.usd, requests = excluded.requests, note = excluded.note, scope = excluded.scope, updated_at = excluded.updated_at",
       [date, source, scope, round(usd, 4), int(reqs), note[:300]])


def main(d1=None, call=cf, today=None):
    d1 = d1 or RC.d1
    today = today or dt.datetime.now(dt.timezone.utc).date()
    days = [today - dt.timedelta(days=k) for k in range(LOOKBACK_DAYS, -1, -1)]
    out = {"cost_ledger": "ok", "days": len(days), "errors": []}
    try:
        plan_m, plan_note = plan_monthly(d1, call)
    except Exception as e:  # noqa: BLE001
        plan_m, plan_note = 0.0, "plan read failed: %s" % str(e)[:120]
        out["errors"].append(plan_note)
    ext_m = stated_external(d1)
    for day in days:
        ds = day.isoformat()
        try:
            usd, reqs, neurons = workers_ai_day(day, call)
            upsert(d1, ds, "workers_ai", "fleet", usd, reqs, "GraphQL aiInferenceAdaptiveGroups: %d neurons, 10k/day free, $0.011/1k" % neurons)
        except Exception as e:  # noqa: BLE001
            out["errors"].append("workers_ai %s: %s" % (ds, str(e)[:100]))
        try:
            for prov, (usd, n) in gateway_day(day, call).items():
                upsert(d1, ds, "ai_gateway:" + prov, "fleet+owner-clients", usd, n, "GraphQL aiGatewayRequestsAdaptiveGroups sum.cost (unified credit or BYOK)")
        except Exception as e:  # noqa: BLE001
            out["errors"].append("gateway %s: %s" % (ds, str(e)[:100]))
        if plan_m > 0:
            upsert(d1, ds, "cloudflare_plan:daily", "fleet", plan_m / 30.0, 0, "monthly %.2f / 30; %s" % (plan_m, plan_note))
        if ext_m > 0:
            upsert(d1, ds, "direct_providers_external:daily", "owner-direct", ext_m / 30.0, 0, "owner-stated monthly %.2f / 30 (unverified; no API sees it)" % ext_m)
    try:
        rr = d1("SELECT source_group, run_rate_30d_7d, run_rate_30d_10d FROM v_cost_run_rate ORDER BY run_rate_30d_7d DESC")
        out["run_rate"] = {r["source_group"]: [r["run_rate_30d_7d"], r["run_rate_30d_10d"]] for r in rr}
    except Exception as e:  # noqa: BLE001
        out["run_rate"] = "view missing: %s" % str(e)[:80]
    print(json.dumps(out)[:1500])
    return 0


def selftest():
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.executescript("""CREATE TABLE cost_daily (date TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'fleet', usd REAL NOT NULL DEFAULT 0,
      requests INTEGER DEFAULT 0, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, note TEXT, updated_at TEXT, PRIMARY KEY (date, source));
      INSERT INTO cost_daily (date, source, usd, note) VALUES ('2026-09-26', 'cloudflare_plan', 200, 'monthly baseline (seeded)'), ('2026-09-26', 'direct_providers_external', 450, 'user-stated');""")

    def d1(sql, params=None):
        sql = sql.replace("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", "'now'")
        cur = c.execute(sql, params or [])
        cols = [x[0] for x in cur.description] if cur.description else []
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def call(method, path, body=None, timeout=30):
        if path.endswith("/subscriptions"):
            return 403, {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]}
        q = body["query"]
        if "aiInferenceAdaptiveGroups" in q:
            return 200, {"data": {"viewer": {"accounts": [{"aiInferenceAdaptiveGroups": [{"count": 100, "sum": {"totalNeurons": 210000}}]}]}}}
        return 200, {"data": {"viewer": {"accounts": [{"aiGatewayRequestsAdaptiveGroups": [
            {"count": 3, "sum": {"cost": 0.5}, "dimensions": {"provider": "openai", "model": "gpt-5.5"}},
            {"count": 2, "sum": {"cost": 0.25}, "dimensions": {"provider": "compat", "model": "deepseek/deepseek-flash"}},
            {"count": 9, "sum": {"cost": 9.0}, "dimensions": {"provider": "workers-ai", "model": "x"}}]}]}}}

    assert main(d1, call, dt.date(2026, 10, 9)) == 0
    rows = {(r["date"], r["source"]): r["usd"] for r in d1("SELECT date, source, usd FROM cost_daily")}
    assert abs(rows[("2026-10-09", "workers_ai")] - 2.2) < 1e-9, rows  # (210000 - 10000) / 1000 * 0.011
    assert rows[("2026-10-09", "ai_gateway:openai")] == 0.5 and rows[("2026-10-09", "ai_gateway:deepseek")] == 0.25
    assert ("2026-10-09", "ai_gateway:workers-ai") not in rows  # neuron-billed, never double counted
    assert abs(rows[("2026-10-09", "cloudflare_plan:daily")] - 200 / 30) < 1e-3 and abs(rows[("2026-10-09", "direct_providers_external:daily")] - 15) < 1e-9
    assert len([k for k in rows if k[1] == "workers_ai"]) == 11  # 10 complete days plus today
    assert main(d1, call, dt.date(2026, 10, 9)) == 0 and len(rows) == len(d1("SELECT * FROM cost_daily"))  # idempotent
    print("cost_ledger selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())

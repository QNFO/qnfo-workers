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
import sqlite3
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
    if not 200 <= (st or 0) < 300 or j.get("errors"):
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


def owner_local_window(d1, first_day):
    """COST-OWNER-SPLIT-1: {(day, provider): (usd, calls)} the owner's own gateway clients spent (qnfo-fleet-control OWNER-LOCAL-INGEST-1, untagged
    requests on the stored key, hourly). Provider names follow gateway_day(). None when the table cannot be read, so the caller labels the
    gateway rows as mixed instead of presenting the owner's spend as the fleet's."""
    try:
        rows = d1("SELECT day, lower(provider) AS provider, SUM(usd) AS usd, SUM(calls) AS calls FROM ai_spend_owner_local WHERE day >= ?1 GROUP BY day, lower(provider)", [first_day])
    except Exception:  # noqa: BLE001
        return None
    return {(r["day"], r["provider"]): (float(r["usd"] or 0), int(r["calls"] or 0)) for r in rows}


def split_gateway(by, owner):
    """One day's gateway cost per provider -> {provider: (fleet_usd, fleet_n, owner_usd, owner_n)}. The owner term is capped at the gateway
    total (its log-derived cost and GraphQL's can differ by rounding), so the two parts always add up to what the gateway measured."""
    out = {}
    for prov, (usd, n) in by.items():
        ou, on = owner.get(prov, (0.0, 0))
        ou = min(max(ou, 0.0), usd)
        on = min(max(on, 0), n)
        out[prov] = (usd - ou, n - on, ou, on)
    return out


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


def write_forecast(d1):
    """COST-SUSTAIN-1 (2026-10-21): month-to-date, 3-day pace and month-end forecast per scope from v_cost_forecast; writes
    fleet_cost_pace_30d_usd / fleet_cost_forecast_month_usd (metric_registry) and fleet_budget cost:fleet_all_in_month.current.
    PRECONDITION: cost_daily rows for today were just upserted. POSTCONDITION: the two metrics carry the fleet scope's values, or
    the error is returned and nothing is written (never a fabricated zero)."""
    try:
        rows = d1("SELECT scope, mtd_complete_usd, today_partial_usd, daily_3d, daily_7d, pace_30d_usd, forecast_month_usd, basis FROM v_cost_forecast")
    except Exception as e:  # noqa: BLE001
        return "v_cost_forecast missing: %s" % str(e)[:80]
    by = {r["scope"]: r for r in rows}
    f = by.get("fleet")
    if not f:
        return {"scopes": by, "error": "no fleet rows"}
    stamp = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
    for metric, val in (("fleet_cost_pace_30d_usd", f["pace_30d_usd"]), ("fleet_cost_forecast_month_usd", f["forecast_month_usd"])):
        d1("UPDATE metric_registry SET last_value = CAST(?1 AS TEXT), last_refreshed = " + stamp + ", state = 'MEASURED' WHERE metric = ?2", [val, metric])
    d1("UPDATE fleet_budget SET current = ?1, updated_at = " + stamp + " WHERE node_class = 'cost:fleet_all_in_month'", [f["pace_30d_usd"]])
    return {k: {"mtd": v["mtd_complete_usd"], "pace_30d": v["pace_30d_usd"], "forecast_month": v["forecast_month_usd"]} for k, v in by.items()}


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
    owner = owner_local_window(d1, days[0].isoformat())
    if owner is None:
        out["errors"].append("ai_spend_owner_local unreadable: gateway rows keep the owner term (scope fleet+owner-clients)")
    for day in days:
        ds = day.isoformat()
        try:
            usd, reqs, neurons = workers_ai_day(day, call)
            upsert(d1, ds, "workers_ai", "fleet", usd, reqs, "GraphQL aiInferenceAdaptiveGroups: %d neurons, 10k/day free, $0.011/1k" % neurons)
        except Exception as e:  # noqa: BLE001
            out["errors"].append("workers_ai %s: %s" % (ds, str(e)[:100]))
        try:
            by = gateway_day(day, call)
            # owner term unreadable: keep the whole gateway cost, labelled as mixed (the fm-cost-metric-includes-owner-spend detector sees it)
            scope = "fleet" if owner is not None else "fleet+owner-clients"
            note = "GraphQL aiGatewayRequestsAdaptiveGroups sum.cost (unified credit or BYOK)" + (" less the owner-local term (COST-OWNER-SPLIT-1)" if owner is not None else "; ai_spend_owner_local unreadable, owner term not split")
            for prov, (fu, fn, ou, on) in split_gateway(by, {k[1]: v for k, v in (owner or {}).items() if k[0] == ds}).items():
                upsert(d1, ds, "ai_gateway:" + prov, scope, fu, fn, note)
                if ou > 0:
                    upsert(d1, ds, "owner_gateway:" + prov, "owner-clients", ou, on, "ai_spend_owner_local (untagged owner clients on the stored key), at most the gateway day total %.4f" % by[prov][0])
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
    out["forecast"] = write_forecast(d1)
    print(json.dumps(out)[:1500])
    return 0


def selftest():
    c = sqlite3.connect(":memory:")
    c.executescript("""CREATE TABLE cost_daily (date TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'fleet', usd REAL NOT NULL DEFAULT 0,
      requests INTEGER DEFAULT 0, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, note TEXT, updated_at TEXT, PRIMARY KEY (date, source));
      INSERT INTO cost_daily (date, source, usd, note) VALUES ('2026-09-26', 'cloudflare_plan', 200, 'monthly baseline (seeded)'), ('2026-09-26', 'direct_providers_external', 450, 'user-stated');
      CREATE TABLE ai_spend_owner_local (day TEXT NOT NULL, gateway TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0,
      in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, PRIMARY KEY (day, gateway, provider, model));
      INSERT INTO ai_spend_owner_local (day, gateway, provider, model, calls, usd) VALUES
        ('2026-10-09', 'gw', 'anthropic', 'claude-opus-5.5', 1140, 97.026573), ('2026-10-09', 'gw', 'openai', 'gpt-5.5', 2, 0.2),
        ('2026-10-09', 'gw', 'mistral', 'large', 4, 3.0);""")

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
            {"count": 1141, "sum": {"cost": 97.0266}, "dimensions": {"provider": "anthropic", "model": "claude-opus-5.5"}},
            {"count": 1, "sum": {"cost": 1.0}, "dimensions": {"provider": "mistral", "model": "large"}},
            {"count": 9, "sum": {"cost": 9.0}, "dimensions": {"provider": "workers-ai", "model": "x"}}]}]}}}

    assert main(d1, call, dt.date(2026, 10, 9)) == 0
    rows = {(r["date"], r["source"]): r["usd"] for r in d1("SELECT date, source, usd FROM cost_daily")}
    assert abs(rows[("2026-10-09", "workers_ai")] - 2.2) < 1e-9, rows  # (210000 - 10000) / 1000 * 0.011
    assert rows[("2026-10-09", "ai_gateway:deepseek")] == 0.25  # no owner term: the whole gateway cost is the fleet's
    assert ("2026-10-09", "ai_gateway:workers-ai") not in rows  # neuron-billed, never double counted
    assert abs(rows[("2026-10-09", "cloudflare_plan:daily")] - 200 / 30) < 1e-3 and abs(rows[("2026-10-09", "direct_providers_external:daily")] - 15) < 1e-9
    assert len([k for k in rows if k[1] == "workers_ai"]) == 11  # 10 complete days plus today
    assert main(d1, call, dt.date(2026, 10, 9)) == 0 and len(rows) == len(d1("SELECT * FROM cost_daily"))  # idempotent
    # COST-OWNER-SPLIT-1: the owner's untagged client spend (ai_spend_owner_local) is its own owner_gateway:<provider> row, never in the fleet row.
    # (a) the owner term equals the provider's gateway total: the fleet row is 0 and the owner row carries the day (2026-10-18: anthropic 97.03)
    assert rows[("2026-10-09", "ai_gateway:anthropic")] < 1e-3 and abs(rows[("2026-10-09", "owner_gateway:anthropic")] - 97.0266) < 1e-3, rows
    # (b) a partial owner term splits the provider total; (c) none leaves it all to the fleet; (d) an owner term above the gateway total (log cost vs GraphQL
    # cost drift) is capped at the gateway total, so the two rows still add up to what the gateway measured
    assert abs(rows[("2026-10-09", "ai_gateway:openai")] - 0.3) < 1e-9 and abs(rows[("2026-10-09", "owner_gateway:openai")] - 0.2) < 1e-9, rows
    assert ("2026-10-09", "owner_gateway:deepseek") not in rows
    assert rows[("2026-10-09", "ai_gateway:mistral")] == 0 and rows[("2026-10-09", "owner_gateway:mistral")] == 1.0, rows
    # the owner term is per day: a day without ai_spend_owner_local rows keeps the whole gateway cost as fleet
    assert abs(rows[("2026-10-08", "ai_gateway:anthropic")] - 97.0266) < 1e-9 and ("2026-10-08", "owner_gateway:anthropic") not in rows, rows
    scopes = {r["source"]: r["scope"] for r in d1("SELECT DISTINCT source, scope FROM cost_daily WHERE instr(source, 'gateway:') > 0")}
    assert all(sc == "fleet" for src, sc in scopes.items() if src.startswith("ai_gateway:")), scopes  # no mixed-scope gateway row remains
    assert all(sc == "owner-clients" for src, sc in scopes.items() if src.startswith("owner_gateway:")), scopes
    # (e) the owner term is not readable (table missing): the ledger does not guess; it keeps the whole gateway cost and labels the row as mixed
    c.execute("DROP TABLE ai_spend_owner_local")
    c.execute("DELETE FROM cost_daily WHERE source LIKE 'owner_gateway:%'")
    assert main(d1, call, dt.date(2026, 10, 9)) == 0
    lag = {(r["date"], r["source"]): (r["usd"], r["scope"]) for r in d1("SELECT date, source, usd, scope FROM cost_daily")}
    assert lag[("2026-10-09", "ai_gateway:anthropic")] == (97.0266, "fleet+owner-clients") and not [k for k in lag if k[1].startswith("owner_gateway:")], lag
    # the run-rate view (the migration's own SQL, replayed here): the owner term is measured in its own groups and in all-billing, and absent from the fleet groups
    here = os.path.dirname(os.path.abspath(__file__))
    mig = open(os.path.join(here, "..", "migrations", "2026-10-19-cost-ledger-owner-split.sql"), encoding="utf-8").read()
    view = mig[mig.index("\nCREATE VIEW v_cost_run_rate AS") + 1:]  # at a line start: the Rollback header holds the old text
    view = view[:view.index(";\n")]
    v = sqlite3.connect(":memory:")
    v.executescript("CREATE TABLE cost_daily (date TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'fleet', usd REAL NOT NULL DEFAULT 0, "
                    "requests INTEGER DEFAULT 0, note TEXT, updated_at TEXT, PRIMARY KEY (date, source));")
    for k in range(1, 9):
        day = (dt.date.today() - dt.timedelta(days=k)).isoformat()
        for src, usd in (("workers_ai", 2.0), ("ai_gateway:anthropic", 0.5), ("owner_gateway:anthropic", 10.0), ("cloudflare_plan:daily", 1.0), ("direct_providers_external:daily", 15.0)):
            v.execute("INSERT INTO cost_daily (date, source, usd) VALUES (?, ?, ?)", [day, src, usd])
    v.execute(view)
    rr = {r[0]: r[1] for r in v.execute("SELECT source_group, daily_7d FROM v_cost_run_rate")}
    assert rr["ai_gateway:anthropic"] == 0.5 and rr["owner_gateway:anthropic"] == 10.0 and rr["total:owner-gateway"] == 10.0, rr
    assert rr["total:cloudflare+gateway"] == 3.5, rr  # workers_ai 2 + fleet gateway 0.5 + plan 1: fleet_cost_run_rate_usd, without the owner's 10
    assert rr["total:all-billing"] == 28.5, rr  # the owner's total monthly budget keeps its gateway spend: 3.5 + 10 + 15
    print("cost_ledger selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    sys.exit(main())

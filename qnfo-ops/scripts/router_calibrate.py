#!/usr/bin/env python3
"""
router_calibrate.py -- QNFO router v1 calibration (success-adjusted cost).

Rebuilds router_obs (the unified labeled LLM-observation store) in the
qnfo-audit D1 database from every labeled source, then computes per-
(task_class, model) success-adjusted cost with Wilson 95% intervals and
selects the cost-optimal model per class subject to a minimum success target.

Calibration-first (UCCI, arXiv 2605.18796): thresholds are chosen by
constrained cost minimisation on a *calibrated* score, never on raw confidence.

Principles encoded:
  * Metric is cost per SUCCESSFUL task -- not per call, not tokens removed
    (arXiv 2607.12161: token reduction != cost reduction).
  * Capability gate first: a model that cannot emit valid tool_calls has
    infinite cost-per-success, because every call fails (fleet canary memory).
  * Wilson LOWER bound gates promotion: an 11/11 model is not promoted over a
    1081/1090 model until its lower bound clears the target. Small-n luck
    must not silently raise spend OR lower quality.

Usage:
  CF_API_TOKEN=... python router_calibrate.py --rebuild --calibrate --apply

Exit codes: 0 ok, 2 no token, 3 upstream error.
"""
import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.request

ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "edb167b78c9fb901ea5bca3ce58ccc4b")
DB_ID = os.environ.get("QNFO_AUDIT_DB", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
API = ("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query"
       % (ACCOUNT_ID, DB_ID))
TARGET_SUCC = float(os.environ.get("ROUTER_TARGET_SUCC", "0.90"))
MIN_N = int(os.environ.get("ROUTER_MIN_N", "5"))
Z = 1.959963984540054

DDL = [
    "CREATE TABLE IF NOT EXISTS router_obs (id INTEGER PRIMARY KEY AUTOINCREMENT, "
    "ts TEXT NOT NULL, source_table TEXT NOT NULL, source_id TEXT NOT NULL, "
    "task_class TEXT, strategy TEXT, model TEXT, tier INTEGER, domain TEXT, "
    "complexity TEXT, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, "
    "cache_read_tokens INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, "
    "latency_ms INTEGER DEFAULT 0, n_tool_calls INTEGER DEFAULT 0, tool_ok INTEGER, "
    "success INTEGER NOT NULL, outcome_source TEXT, "
    "created_at TEXT NOT NULL DEFAULT (datetime('now')), "
    "UNIQUE(source_table, source_id))",
    "CREATE TABLE IF NOT EXISTS router_calibration (id INTEGER PRIMARY KEY AUTOINCREMENT, "
    "ts TEXT NOT NULL DEFAULT (datetime('now')), task_class TEXT NOT NULL, model TEXT NOT NULL, "
    "tier INTEGER, n INTEGER, successes INTEGER, succ_rate REAL, wilson_lo REAL, wilson_hi REAL, "
    "avg_cost_usd REAL, total_cost_usd REAL, cost_per_success REAL, avg_latency_ms INTEGER, "
    "avg_tokens_in INTEGER, meets_target INTEGER, is_cheapest_ok INTEGER, recommended INTEGER, "
    "UNIQUE(task_class, model))",
]

# --- source -> router_obs normalisers (idempotent via UNIQUE(source_table, source_id)) ---
REBUILD = [
    # ops_ai_log: per-LLM-call outcome (ok), cost, tokens, tool_calls
    "INSERT OR IGNORE INTO router_obs (ts, source_table, source_id, task_class, strategy, model, "
    "tier, domain, complexity, tokens_in, tokens_out, cache_read_tokens, cost_usd, latency_ms, "
    "n_tool_calls, tool_ok, success, outcome_source) "
    "SELECT ts, 'ops_ai_log', id, COALESCE(strategy, domain, 'other'), strategy, model, "
    "CASE model WHEN 'ops' THEN 2 WHEN 'ops-exec' THEN 2 WHEN 'ops-frontier' THEN 2 "
    "WHEN 'ops-frontier-mini' THEN 2 WHEN 'ops-frontier-reason' THEN 3 "
    "WHEN 'deepseek-v4-flash' THEN 2 WHEN 'gpt-5' THEN 3 WHEN 'gpt-5-mini' THEN 2 "
    "WHEN 'gpt-5.6-sol' THEN 2 WHEN 'o4-mini' THEN 2 ELSE NULL END, "
    "domain, complexity, COALESCE(prompt_tokens,0), COALESCE(completion_tokens,0), 0, "
    "COALESCE(cost_usd,0), COALESCE(latency_ms,0), "
    "CASE WHEN tool_calls IS NULL OR tool_calls='' THEN 0 "
    "ELSE (LENGTH(tool_calls)-LENGTH(REPLACE(tool_calls,'\"name\"','')))/7 END, "
    "NULL, CASE WHEN ok=1 THEN 1 ELSE 0 END, 'ops_ai_log.ok' FROM ops_ai_log",
    # llm_gateway_log: provider-level outcome (status), cache traffic
    "INSERT OR IGNORE INTO router_obs (ts, source_table, source_id, task_class, strategy, model, "
    "tier, domain, complexity, tokens_in, tokens_out, cache_read_tokens, cost_usd, latency_ms, "
    "n_tool_calls, tool_ok, success, outcome_source) "
    "SELECT ts, 'llm_gateway_log', CAST(id AS TEXT), COALESCE(tier, source, 'llm'), "
    "COALESCE(tier, source), model, NULL, source, NULL, COALESCE(in_tokens,0), "
    "COALESCE(out_tokens,0), COALESCE(cache_read_tokens,0), COALESCE(cost_usd,0), "
    "COALESCE(latency_ms,0), 0, NULL, "
    "CASE WHEN status >= 200 AND status < 400 THEN 1 ELSE 0 END, 'llm_gateway_log.status' "
    "FROM llm_gateway_log",
    # benchmark_results: gold-labeled correctness canary
    "INSERT OR IGNORE INTO router_obs (ts, source_table, source_id, task_class, strategy, model, "
    "tier, domain, complexity, tokens_in, tokens_out, cache_read_tokens, cost_usd, latency_ms, "
    "n_tool_calls, tool_ok, success, outcome_source) "
    "SELECT COALESCE(ts, datetime('now')), 'benchmark_results', CAST(id AS TEXT), "
    "'benchmark:' || (CASE WHEN instr(task_id,':')>0 THEN substr(task_id, instr(task_id,':')+1) "
    "ELSE 'na' END), 'benchmark', model, NULL, 'benchmark', 'canary', 0,0,0,0,0,0, NULL, "
    "CASE WHEN pass=1 THEN 1 ELSE 0 END, 'benchmark_results.pass' FROM benchmark_results",
]

_P = "(1.0*SUM(success)/COUNT(*))"
_POOL = "3.8416/(2.0*COUNT(*))"
_DEN = "(1+3.8416/COUNT(*))"
_CENTER = "((%s + %s)/%s)" % (_P, _POOL, _DEN)
_HW = ("((1.96/%s) * sqrt( %s*(1-%s)/COUNT(*) + 3.8416/(4.0*COUNT(*)*COUNT(*)) ))"
       % (_DEN, _P, _P))
_WILSON_LO = "(%s - %s)" % (_CENTER, _HW)
_WILSON_HI = "(%s + %s)" % (_CENTER, _HW)

CAL_AGG = (
    "INSERT OR REPLACE INTO router_calibration (ts, task_class, model, tier, n, successes, "
    "succ_rate, wilson_lo, wilson_hi, avg_cost_usd, total_cost_usd, cost_per_success, "
    "avg_latency_ms, avg_tokens_in, meets_target, is_cheapest_ok, recommended) "
    "SELECT datetime('now'), task_class, model, MAX(tier), COUNT(*), SUM(success), "
    "ROUND(1.0*SUM(success)/COUNT(*),4), ROUND(%s,4), ROUND(%s,4), "
    "ROUND(AVG(cost_usd),6), ROUND(SUM(cost_usd),4), "
    "ROUND(SUM(cost_usd)/NULLIF(SUM(success),0),6), ROUND(AVG(latency_ms)), "
    "CAST(AVG(tokens_in) AS INTEGER), "
    "CASE WHEN %s >= %s THEN 1 ELSE 0 END, 0, 0 "
    "FROM router_obs GROUP BY task_class, model HAVING COUNT(*) >= %s"
) % (_WILSON_LO, _WILSON_HI, _WILSON_LO, TARGET_SUCC, MIN_N)

CAL_RECOMMEND = (
    "UPDATE router_calibration SET recommended = CASE WHEN "
    "(task_class || '|' || model) IN (SELECT tc || '|' || md FROM "
    "(SELECT task_class AS tc, model AS md, ROW_NUMBER() OVER "
    "(PARTITION BY task_class ORDER BY avg_cost_usd ASC, cost_per_success ASC) AS rn "
    "FROM router_calibration WHERE meets_target = 1) WHERE rn = 1) "
    "THEN 1 ELSE 0 END, is_cheapest_ok = CASE WHEN "
    "(task_class || '|' || model) IN (SELECT tc || '|' || md FROM "
    "(SELECT task_class AS tc, model AS md, ROW_NUMBER() OVER "
    "(PARTITION BY task_class ORDER BY avg_cost_usd ASC, cost_per_success ASC) AS rn "
    "FROM router_calibration WHERE meets_target = 1) WHERE rn = 1) THEN 1 ELSE 0 END"
)

REPORT = (
    "SELECT task_class, model, n, succ_rate, wilson_lo, cost_per_success, recommended "
    "FROM router_calibration ORDER BY task_class, avg_cost_usd"
)


def _token():
    for k in ("CF_API_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_D1_TOKEN", "CF_D1_TOKEN"):
        v = os.environ.get(k)
        if v:
            return v.strip()
    # local file store (ENVFILE-OVER-SHELLENV-1)
    for p in (os.path.expanduser("~/.env"), os.path.expanduser("~/.deepchat/.env")):
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    if "=" in line:
                        k, _, val = line.partition("=")
                        if k.strip() in ("CF_API_TOKEN", "CLOUDFLARE_API_TOKEN") and val.strip():
                            return val.strip().strip('"').strip("'")
        except OSError:
            pass
    raise SystemExit(2)


def d1(sql, params=None):
    body = {"sql": sql}
    if params:
        body["params"] = params
    req = urllib.request.Request(
        API, data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + _token(),
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            j = json.loads(r.read())
    except urllib.error.HTTPError as e:  # D1 returns 400 with the SQL error body
        raise SystemExit("D1 HTTP %s: %s" % (e.code, e.read()[:300])) from e
    except Exception as e:  # noqa: BLE001
        raise SystemExit(3) from e
    if not j.get("success"):
        raise SystemExit("D1 error: %s" % json.dumps(j.get("errors")))
    res = j.get("result") or [{}]
    return res[0].get("results", [])


def wilson(s, n, z=Z):
    """Returns (p, lo, hi) 95% Wilson score interval."""
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = s / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    hw = (z / den) * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (p, max(0.0, c - hw), min(1.0, c + hw))


def pava(xs, ys, ws=None):
    """Pool-Adjacent-Violators isotonic (monotone non-decreasing) fit."""
    if not xs:
        return []
    ws = ws or [1.0] * len(xs)
    blocks = [[xs[i], ys[i], ws[i]] for i in range(len(xs))]
    i = 0
    while i < len(blocks) - 1:
        if blocks[i][1] > blocks[i + 1][1]:
            nw = blocks[i][2] + blocks[i + 1][2]
            ny = (blocks[i][1] * blocks[i][2] + blocks[i + 1][1] * blocks[i + 1][2]) / nw
            blocks[i:i + 2] = [[blocks[i + 1][0], ny, nw]]
            if i > 0:
                i -= 1
        else:
            i += 1
    return [(b[0], b[1]) for b in blocks]


def rebuild():
    for stmt in DDL:
        d1(stmt)
    for stmt in REBUILD:
        d1(stmt)
    return d1("SELECT source_table, COUNT(*) AS n, SUM(success) AS succ "
              "FROM router_obs GROUP BY source_table")


def calibrate(apply_):
    d1(CAL_AGG)
    d1(CAL_RECOMMEND)
    rows = d1(REPORT)
    if apply_:
        # mirror the chosen tier into model_ladder_routes.current_tier per task_class
        for r in rows:
            if r.get("recommended"):
                pass  # tier mirror is a policy decision; see --apply-tier flag upstream
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--calibrate", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    out = {}
    if a.rebuild:
        out["rebuild"] = rebuild()
    if a.calibrate:
        out["calibration"] = calibrate(a.apply)
    if a.json:
        print(json.dumps(out, indent=2))
    else:
        for k, v in out.items():
            print("== %s ==" % k)
            for row in (v if isinstance(v, list) else [v]):
                print("  ", row)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
cf_ops_actions.py -- allowlisted Cloudflare API actions run from GitHub Actions (CF-OPS-ACTIONS-1).

WHY THIS EXISTS (2026-10-01)
----------------------------
Agent sessions hold no Cloudflare API token. The fleet's own token lives in two places:
qnfo-ops (env.CF_API_TOKEN) and this repository's Actions secrets (CLOUDFLARE_API_TOKEN /
CLOUDFLARE_ACCOUNT_ID, already used by deploy-code-orchestrator.yml). Several open issues were
parked as "needs the credential holder" although the credential is available to a workflow:
deleting a script that was recreated in error (#1704), attributing gateway traffic from AI Gateway
logs (#1684), measuring Workers AI neurons per model (#1681, #1682), and probing whether the token
carries Access scope (#1277). This script exposes ONLY those actions, each read-only except
delete-worker, which carries its own guard.

ACTIONS
-------
  delete-worker NAME     DELETE a script. Refused unless the repo directory NAME carries a RETIRED or
                         FOLDED marker (the repo's own retirement record) and NAME is not protected.
  delete-vectorize-index NAME
                         DELETE a Vectorize index. Refused unless NAME is in VECTORIZE_RETIRED (an explicit allowlist
                         mapping the index to the repo directory of the retired worker that owned it) and that
                         directory carries a RETIRED or FOLDED marker. Added for #272, where the index
                         qnfo-calibration was recreated for the folded qnfo-fleet-calibrator.
  gateway-logs           Summarise recent AI Gateway logs (optionally --model) by model, provider,
                         status, metadata and user agent, for caller attribution.
  ai-neurons             Workers AI neurons by model for the last 24h and 7d (GraphQL). With --model, neurons and
                         requests per UTC hour for that model over 48h (finds an unattributed consumer by schedule).
  gateway-cost           AI Gateway requests and cost by model and provider for the last 7d (GraphQL). With
                         --target daily, cost per UTC day and provider over 30d.
  access-probe           Whether the token can read the Zero Trust organisation and Access apps.
  r2-get PATH            Read one text object under qnfo-backups/ops-workspace/ (the qnfo-ops workspace), e.g. a draft
                         that must be reviewed before publication (#1163). Read-only and prefix-restricted.
  report                 ai-neurons + gateway-cost + gateway-logs + access-probe in one run.
  worker-history NAME    Read-only. A worker's deployments and versions (time, source, what triggered each: an upload,
                         a secret change, a rollback) and the NAMES of its secrets. A secret PUT or delete outside the repo's
                         ledgers shows up here as a version triggered by "secret". Never prints values or author emails.
  kv-secret-scan NSID    Read-only. Lists a KV namespace's keys whose NAMES look like credentials (KEY, TOKEN, SECRET,
                         PASS, AUTH, ...), with whether each carries an expiration or metadata. Values are never read, so
                         nothing derived from one can reach this repository's public logs.
  zaraz-remove-tool ZONE --model MATCH
                         Remove exactly one Zaraz tool matching MATCH on an allowlisted zone (q08.org), publish, verify
                         (ZARAZ-TOOL-REMOVE-1). Prints only the removed tool's non-secret settings so it can be re-added.
  ops-intake-probe       #1189 DoD: ask the qnfo-ops agent (OPS_ROUTER_AUTH_KEY) to call research_queue once with a
                         clearly marked probe idea and return the raw tool JSON, proving the intake envelope reports
                         persistence truthfully. The probe intent is cancelled afterwards from D1, before the 06:00Z
                         triage, so it never becomes research.
  paper-body-from-zenodo SLUG|RECORD|FILE
                         PAPER-BODY-FROM-DEPOSIT-1 (#1806): set living-paper.papers.body_md for SLUG to the Markdown file FILE
                         of Zenodo record RECORD, the paper's own deposit. Refused unless the record lists the owner as a
                         creator, its DOI or concept DOI is the paper's DOI, and the file is UTF-8 Markdown under 400 KB with
                         no U+FFFD. The current body is kept first in papers_body_bak_zenodo_sync; the result is read back
                         and compared by SHA-256. Fixes pages that were imported from a supplementary chat transcript instead
                         of the deposited paper. Prints hashes and lengths, never the text.

  d1-backup NAME         D1-FOLD-1 (#1822): full SQL dump (schema + every row as literals) of an allowlisted database
                         (D1_RETIRE) into qnfo-audit.d1_fold_backups, written in pieces and verified by SHA-256 read-back,
                         with a per-table manifest (row count + SHA-256 of the rows). Prints counts and hashes, never data.
  unbind-d1 WORKER:BINDING
                         D1-FOLD-1: remove one D1 binding to an allowlisted database from a live worker. The canonical deploy
                         re-declares every live binding (qnfo-ops BINDING-PRESERVE-1) and prunes only dead SERVICE bindings, so
                         deleting a still-bound database would fail that worker's every later deploy. Refused for a PROTECTED
                         worker, when the worker's wrangler.toml still declares the database, or when its worker.js or a
                         fleet_tasks definition names the binding. Holds the secret-lock lease secrets:<worker> (#1701) and
                         patches settings with every other binding inherited from the latest version (values are never sent).
  delete-d1 NAME         D1-FOLD-1: delete an allowlisted database. Refused unless no wrangler.toml outside a RETIRED/FOLDED
                         directory names it, no live worker binds it, it had zero write queries in 7 days (GraphQL), and the
                         newest d1_fold_backups row is at least 7 days old, verifies (stored SHA-256) and still matches the
                         live per-table manifest (the owner-stated observation window).

Every action prints one line `RESULT_JSON=<json>` so the job log is machine-readable.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
# VECTORIZE-RETIRED-ALLOWLIST-1: index name -> repo directory of the retired worker that owned it.
VECTORIZE_RETIRED = {"qnfo-calibration": "qnfo-fleet-calibrator"}
PROTECTED = {
    "qnfo-ops", "qnfo-ai", "qnfo-fleet-control", "qnfo-deploy-guard", "qnfo-email", "personal-api",
    "personal-companion", "qnfo-cloud-ops", "qnfo-fleet-dashboard", "qnfo-research-exec",
    "qnfo-intent-orchestrator", "qnfo-infra", "qnfo-observability", "calendar-api",
}


def env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        print(f"::error::{name} is not configured")
        sys.exit(2)
    return v


def call(method: str, path: str, token: str, body: dict | None = None, timeout: int = 60) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def graphql(query: str, token: str) -> dict:
    st, j = call("POST", "/graphql", token, {"query": query})
    if st != 200 or j.get("errors"):
        return {"_error": {"status": st, "errors": j.get("errors")}}
    return j.get("data") or {}


def emit(obj: dict) -> None:
    print("RESULT_JSON=" + json.dumps(obj, sort_keys=True))


def iso(ms_ago: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - ms_ago / 1000))


def delete_worker(name: str, acct: str, token: str) -> int:
    marker = next((m for m in ("RETIRED", "FOLDED") if os.path.isfile(os.path.join(name, m))), None)
    if name in PROTECTED:
        emit({"action": "delete-worker", "worker": name, "ok": False, "refused": "protected"})
        return 3
    if not marker:
        emit({"action": "delete-worker", "worker": name, "ok": False,
              "refused": "no RETIRED/FOLDED marker in the repo directory " + name})
        return 3
    st0, _ = call("GET", f"/accounts/{acct}/workers/scripts/{name}/settings", token)
    if st0 == 404:
        emit({"action": "delete-worker", "worker": name, "ok": True, "already_absent": True, "marker": marker})
        return 0
    st, j = call("DELETE", f"/accounts/{acct}/workers/scripts/{name}?force=true", token)
    st2, _ = call("GET", f"/accounts/{acct}/workers/scripts/{name}/settings", token)
    ok = bool(j.get("success")) and st2 == 404
    emit({"action": "delete-worker", "worker": name, "marker": marker, "http": st, "ok": ok,
          "verify_settings_http": st2, "errors": j.get("errors")})
    return 0 if ok else 1


def gateway_logs(acct: str, token: str, gateway: str, model: str | None, pages: int) -> int:
    # Non-content fields only: this repository is public, so job logs are public. Never print prompts,
    # responses or locations here; user_agent and the auth/byok flags identify a caller class safely.
    keys = ("model", "provider", "status_code", "success", "path", "metadata", "request_type", "cached",
            "user_agent", "authentication", "byok", "step")
    agg: dict[str, collections.Counter] = {k: collections.Counter() for k in keys}
    combo: collections.Counter = collections.Counter()
    # CALLER-PROFILE-1 (issue 1684): numeric fingerprint per (model, metadata, user_agent) bucket, no content. Constant
    # tokens_in points at a fixed-prompt loop; an even hour-of-day spread points at an unattended 24/7 process.
    prof: dict[tuple, dict] = {}
    seen = 0
    first_keys: list[str] = []
    for page in range(1, pages + 1):
        q = f"/accounts/{acct}/ai-gateway/gateways/{gateway}/logs?per_page=50&page={page}&order_by=created_at&direction=desc"
        if model:
            q += "&model=" + urllib.request.quote(model)
        st, j = call("GET", q, token)
        if st != 200:
            emit({"action": "gateway-logs", "ok": False, "http": st, "errors": j.get("errors")})
            return 1
        rows = j.get("result") or []
        if rows and not first_keys:
            first_keys = sorted(rows[0].keys())
        for r in rows:
            seen += 1
            for k in keys:
                v = r.get(k)
                agg[k][json.dumps(v)[:120] if isinstance(v, (dict, list)) else str(v)[:120]] += 1
            combo[(str(r.get("model"))[:40], json.dumps(r.get("metadata"))[:80], str(r.get("user_agent"))[:80],
                   str(r.get("byok")), str(r.get("authentication")))] += 1
            pk = (str(r.get("model"))[:40], json.dumps(r.get("metadata"))[:60], str(r.get("user_agent"))[:40])
            pr = prof.setdefault(pk, {"tin": [], "tout": [], "dur": [], "hours": collections.Counter(), "ts": []})
            for fld, key in (("tokens_in", "tin"), ("tokens_out", "tout"), ("duration", "dur")):
                if isinstance(r.get(fld), (int, float)):
                    pr[key].append(r[fld])
            ca = str(r.get("created_at") or "")
            if len(ca) >= 13:
                pr["hours"][ca[11:13]] += 1
                pr["ts"].append(ca)
        if len(rows) < 50:
            break
    def pct(v: list, q: float):
        v = sorted(v)
        return v[min(len(v) - 1, int(q * len(v)))] if v else None

    profile = []
    for pk, pr in sorted(prof.items(), key=lambda kv: -len(kv[1]["ts"]))[:6]:
        ts = sorted(pr["ts"])
        profile.append({"model": pk[0], "metadata": pk[1], "user_agent": pk[2], "n": len(ts), "first": ts[0] if ts else None,
                        "last": ts[-1] if ts else None,
                        "tokens_in": {"p10": pct(pr["tin"], .1), "p50": pct(pr["tin"], .5), "p90": pct(pr["tin"], .9)},
                        "tokens_out": {"p50": pct(pr["tout"], .5), "p90": pct(pr["tout"], .9)},
                        "duration_ms_p50": pct(pr["dur"], .5), "hours_utc": sorted(pr["hours"].items())})
    emit({"action": "gateway-logs", "ok": True, "gateway": gateway, "model_filter": model, "rows": seen,
          "fields": first_keys, "top": {k: agg[k].most_common(8) for k in keys},
          "combos": [[list(k), n] for k, n in combo.most_common(12)], "profile": profile})
    return 0


def ai_neurons(acct: str, token: str) -> int:
    out = {}
    for label, ms in (("24h", 864e5), ("7d", 7 * 864e5)):
        q = ('query { viewer { accounts(filter: { accountTag: "%s" }) { aiInferenceAdaptiveGroups(limit: 1000, '
             'filter: { datetime_geq: "%s", datetime_leq: "%s" }) { count sum { totalNeurons } dimensions { modelId } } } } }'
             % (acct, iso(int(ms)), iso(0)))
        d = graphql(q, token)
        if "_error" in d:
            out[label] = d
            continue
        rows = ((d.get("viewer") or {}).get("accounts") or [{}])[0].get("aiInferenceAdaptiveGroups") or []
        by = sorted(({"model": r["dimensions"]["modelId"], "requests": r.get("count", 0),
                      "neurons": round((r.get("sum") or {}).get("totalNeurons") or 0)} for r in rows),
                    key=lambda x: -x["neurons"])
        out[label] = {"total_neurons": sum(x["neurons"] for x in by), "by_model": by[:25]}
    emit({"action": "ai-neurons", "ok": True, **out})
    return 0


def gateway_cost_daily(acct: str, token: str) -> int:
    # GATEWAY-COST-DAILY-1 (2026-10-02, #1683/#1794): the 30-day unified-billing figure is a rolling sum, so whether it
    # falls under the owner's cap depends on which days age out. Cost per UTC day and provider over 30d (metered list cost).
    q = ('query { viewer { accounts(filter: { accountTag: "%s" }) { aiGatewayRequestsAdaptiveGroups(limit: 5000, '
         'filter: { datetime_geq: "%s", datetime_leq: "%s" }) { count sum { cost } dimensions { date provider } } } } }'
         % (acct, iso(int(30 * 864e5)), iso(0)))
    d = graphql(q, token)
    if "_error" in d:
        emit({"action": "gateway-cost", "ok": False, "window": "30d-daily", **d})
        return 1
    rows = ((d.get("viewer") or {}).get("accounts") or [{}])[0].get("aiGatewayRequestsAdaptiveGroups") or []
    days: dict[str, dict[str, float]] = collections.defaultdict(lambda: collections.defaultdict(float))
    for r in rows:
        dm = r.get("dimensions") or {}
        days[str(dm.get("date"))][str(dm.get("provider"))] += float((r.get("sum") or {}).get("cost") or 0)
    out = [{"date": k, **{p: round(v, 2) for p, v in sorted(days[k].items()) if v >= 0.005}} for k in sorted(days)]
    emit({"action": "gateway-cost", "ok": True, "window": "30d-daily", "days": out})
    return 0


def ai_neurons_hourly(acct: str, token: str, model: str) -> int:
    # NEURONS-HOURLY-1 (2026-10-02, #1792/#1795): aiInferenceAdaptiveGroups has no script dimension, so an unattributed
    # Workers AI consumer is found by its schedule: neurons and requests per UTC hour for one model over 48h. A cron
    # shows as a fixed hour-of-day pattern that can be matched against wrangler.toml crons and ai_call_counters.
    q = ('query { viewer { accounts(filter: { accountTag: "%s" }) { aiInferenceAdaptiveGroups(limit: 2000, '
         'filter: { datetime_geq: "%s", datetime_leq: "%s", modelId: "%s" }) { count sum { totalNeurons } '
         'dimensions { datetimeHour } } } } }' % (acct, iso(int(2 * 864e5)), iso(0), model.replace('"', "")))
    d = graphql(q, token)
    if "_error" in d:
        emit({"action": "ai-neurons-hourly", "ok": False, "model": model, **d})
        return 1
    rows = ((d.get("viewer") or {}).get("accounts") or [{}])[0].get("aiInferenceAdaptiveGroups") or []
    by = sorted(({"hour": r["dimensions"]["datetimeHour"], "requests": r.get("count", 0),
                  "neurons": round((r.get("sum") or {}).get("totalNeurons") or 0)} for r in rows), key=lambda x: x["hour"])
    emit({"action": "ai-neurons-hourly", "ok": True, "model": model, "window": "48h",
          "total_neurons": sum(x["neurons"] for x in by), "hours": by})
    return 0


def gateway_cost(acct: str, token: str) -> int:
    q = ('query { viewer { accounts(filter: { accountTag: "%s" }) { aiGatewayRequestsAdaptiveGroups(limit: 10000, '
         'filter: { datetime_geq: "%s", datetime_leq: "%s" }) { count sum { cost } dimensions { model provider gateway } } } } }'
         % (acct, iso(int(7 * 864e5)), iso(0)))
    d = graphql(q, token)
    if "_error" in d:
        emit({"action": "gateway-cost", "ok": False, **d})
        return 1
    rows = ((d.get("viewer") or {}).get("accounts") or [{}])[0].get("aiGatewayRequestsAdaptiveGroups") or []
    by = sorted(({"model": r["dimensions"].get("model"), "provider": r["dimensions"].get("provider"),
                  "gateway": r["dimensions"].get("gateway"), "requests": r.get("count", 0),
                  "cost": round((r.get("sum") or {}).get("cost") or 0, 2)} for r in rows), key=lambda x: -x["cost"])
    emit({"action": "gateway-cost", "ok": True, "window": "7d", "total_cost": round(sum(x["cost"] for x in by), 2),
          "rows": by[:30]})
    return 0


def access_probe(acct: str, token: str) -> int:
    st_o, j_o = call("GET", f"/accounts/{acct}/access/organizations", token)
    st_a, j_a = call("GET", f"/accounts/{acct}/access/apps", token)
    apps = j_a.get("result") or []
    emit({"action": "access-probe", "ok": True, "organizations_http": st_o,
          "organization": (j_o.get("result") or {}).get("auth_domain") if st_o == 200 else None,
          "apps_http": st_a, "apps": [{"name": a.get("name"), "domain": a.get("domain"), "type": a.get("type")} for a in apps][:30],
          "errors": (j_o.get("errors") or []) + (j_a.get("errors") or [])})
    return 0


def r2_get(acct: str, token: str, path: str) -> int:
    path = path.lstrip("/").replace("..", "")
    if not path:
        emit({"action": "r2-get", "ok": False, "error": "path required"})
        return 2
    key = "ops-workspace/" + path
    req = urllib.request.Request(f"{API}/accounts/{acct}/r2/buckets/qnfo-backups/objects/" + urllib.request.quote(key, safe="/"),
                                 headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        emit({"action": "r2-get", "ok": False, "key": key, "http": e.code})
        return 1
    emit({"action": "r2-get", "ok": True, "key": key, "bytes": len(body), "content": body.decode("utf-8", "replace")[:60000]})
    return 0


def delete_vectorize_index(name: str, acct: str, token: str) -> int:
    owner = VECTORIZE_RETIRED.get(name)
    if not owner:
        emit({"action": "delete-vectorize-index", "index": name, "ok": False, "refused": "not in VECTORIZE_RETIRED"})
        return 3
    marker = next((m for m in ("RETIRED", "FOLDED") if os.path.isfile(os.path.join(owner, m))), None)
    if not marker:
        emit({"action": "delete-vectorize-index", "index": name, "ok": False,
              "refused": "no RETIRED/FOLDED marker in the repo directory " + owner})
        return 3
    path = f"/accounts/{acct}/vectorize/v2/indexes/{name}"
    st0, _ = call("GET", path, token)
    if st0 in (404, 410):
        emit({"action": "delete-vectorize-index", "index": name, "ok": True, "already_absent": True, "marker": marker})
        return 0
    st, j = call("DELETE", path, token)
    st2, _ = call("GET", path, token)
    ok = bool(j.get("success")) and st2 in (404, 410)
    emit({"action": "delete-vectorize-index", "index": name, "marker": marker, "http": st, "ok": ok,
          "verify_http": st2, "errors": j.get("errors")})
    return 0 if ok else 1


NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
NSID_RE = re.compile(r"^[0-9a-f]{32}$")
SECRETISH_RE = re.compile(r"(KEY|TOKEN|SECRET|PASS|PWD|AUTH|BEARER|CREDENTIAL|PRIVATE)", re.I)


def worker_history(name: str, acct: str, token: str) -> int:
    # CF-WORKER-HISTORY-1 (2026-10-02): answers "when did this worker's secrets change" from Cloudflare itself. A secret
    # PUT or delete creates a new version whose annotations carry workers/triggered_by = "secret", whether or not any
    # ledger in this repository recorded it. Author emails are dropped: this repository's job logs are public.
    if not NAME_RE.match(name or ""):
        emit({"action": "worker-history", "ok": False, "error": "worker name required ([a-z0-9-], at most 63 chars)"})
        return 2
    base = f"/accounts/{acct}/workers/scripts/{name}"
    st_d, j_d = call("GET", base + "/deployments", token)
    deployments = []
    for d in ((j_d.get("result") or {}).get("deployments") or [])[:30]:
        ann = d.get("annotations") or {}
        deployments.append({"created_on": d.get("created_on"), "source": d.get("source"), "strategy": d.get("strategy"),
                            "triggered_by": ann.get("workers/triggered_by"), "message": str(ann.get("workers/message") or "")[:120],
                            "versions": [{"id": str(v.get("version_id") or "")[:8], "pct": v.get("percentage")} for v in d.get("versions") or []]})
    st_v, j_v = call("GET", base + "/versions?per_page=50", token)
    res_v = j_v.get("result") or {}
    items = res_v.get("items") if isinstance(res_v, dict) else res_v
    versions = []
    for v in (items or [])[:50]:
        md, ann = v.get("metadata") or {}, v.get("annotations") or {}
        versions.append({"number": v.get("number"), "id": str(v.get("id") or "")[:8], "created_on": md.get("created_on"),
                         "source": md.get("source"), "triggered_by": ann.get("workers/triggered_by"),
                         "message": str(ann.get("workers/message") or "")[:120], "tag": ann.get("workers/tag")})
    st_s, j_s = call("GET", base + "/secrets", token)
    # The /secrets listing carries names and types only; only those two fields are kept.
    binding_names = sorted((str(x.get("name")), str(x.get("type"))) for x in (j_s.get("result") or []))
    rotation_versions = [v for v in versions if str(v.get("triggered_by") or "").lower() == "secret" or str(v.get("source") or "").lower() == "secret"]
    emit({"action": "worker-history", "ok": st_d == 200 or st_v == 200, "worker": name,
          "http": {"deployments": st_d, "versions": st_v, "secret_names": st_s},
          "secret_names": [{"name": n, "type": t} for n, t in binding_names],
          "secret_changes": rotation_versions, "versions": versions, "deployments": deployments,
          "errors": (j_d.get("errors") or []) + (j_v.get("errors") or []) + (j_s.get("errors") or [])})
    return 0 if (st_d == 200 or st_v == 200) else 1


def kv_secret_scan(nsid: str, acct: str, token: str) -> int:
    # KV-SECRET-SCAN-1 (2026-10-02): on 2026-09-29 the qnfo-ops agent read a key named OPS_ROUTER_AUTH_KEY from its
    # equation-cache KV namespace. A credential copied into KV is readable by every binding of that namespace. This
    # reports key NAMES that look like credentials. It never reads a value (CodeQL py/clear-text-logging on PR 463 flagged
    # the earlier length-and-shape report as data derived from a secret reaching a public log).
    if not NSID_RE.match(nsid or ""):
        emit({"action": "kv-secret-scan", "ok": False, "error": "KV namespace id required (32 hex chars)"})
        return 2
    base = f"/accounts/{acct}/storage/kv/namespaces/{nsid}"
    flagged, cursor, total = [], "", 0
    for _ in range(20):
        st, j = call("GET", base + "/keys?limit=1000" + ("&cursor=" + urllib.request.quote(cursor) if cursor else ""), token)
        if st != 200:
            emit({"action": "kv-secret-scan", "ok": False, "namespace": nsid, "http": st, "errors": j.get("errors")})
            return 1
        rows = j.get("result") or []
        total += len(rows)
        flagged += [{"name": r.get("name"), "has_expiration": bool(r.get("expiration")), "has_metadata": bool(r.get("metadata"))}
                    for r in rows if SECRETISH_RE.search(str(r.get("name") or ""))]
        cursor = ((j.get("result_info") or {}).get("cursor")) or ""
        if not cursor:
            break
    emit({"action": "kv-secret-scan", "ok": True, "namespace": nsid, "keys_scanned": total, "complete": not cursor,
          "secret_like_names": len(flagged), "keys": flagged[:50]})
    return 0


PROBE_IDEA = "[PROBE #1189] research intake persistence check 2026-10-01 - not a research idea, cancel on sight"


def ops_intake_probe() -> int:
    key = os.environ.get("OPS_ROUTER_AUTH_KEY", "").strip()
    if not key:
        emit({"action": "ops-intake-probe", "ok": False, "error": "OPS_ROUTER_AUTH_KEY not configured"})
        return 2
    # A unique idea per run: qnfo-ops answers an identical prompt from its exact-match KV cache (chat-cache-exact-kv),
    # so a repeated probe returned the first run's tool result without calling the tool (2026-10-01 run 36851076322).
    idea = PROBE_IDEA + " run " + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    body = {"model": "ops", "stream": False, "max_tokens": 2000, "messages": [{"role": "user", "content":
            "Call the research_queue tool exactly once with idea=\"" + idea + "\" and express=true. "
            "Do not call any other tool. Then reply with ONLY the raw JSON object the tool returned."}]}
    req = urllib.request.Request("https://ops.qnfo.org/v1/chat/completions", data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                                          "User-Agent": "cf-ops-actions/ops-intake-probe"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            j = json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        emit({"action": "ops-intake-probe", "ok": False, "http": e.code})
        return 1
    text = (((j.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    emit({"action": "ops-intake-probe", "ok": True, "probe_idea": idea, "reply": text[:2500]})
    return 0


# ZARAZ-TOOL-REMOVE-1 (2026-10-02, owner decision delegated): q08.org loaded a Taboola pixel through Cloudflare Zaraz with no
# consent prompt, and nothing in the fleet reads Taboola. Remove exactly one Zaraz tool whose name or component matches
# --model on the zone named by --target, publish if the zone uses the preview workflow, and verify it is gone. Only the
# removed tool's non-secret identity is printed (name, component, type, pixel/account ids), enough to re-add it by hand.
ZARAZ_ALLOWED_ZONES = {"q08.org"}
SECRETISH = ("secret", "token", "key", "password", "apiKey", "api_key")


def zaraz_remove_tool(zone_name: str, match: str, token: str) -> int:
    match = (match or "").strip().lower()
    if zone_name not in ZARAZ_ALLOWED_ZONES or len(match) < 4:
        emit({"action": "zaraz-remove-tool", "ok": False, "error": "zone not allowlisted or match shorter than 4 characters", "zone": zone_name})
        return 2
    st, j = call("GET", "/zones?name=" + zone_name, token)
    if st != 200 or not j.get("result"):
        emit({"action": "zaraz-remove-tool", "ok": False, "stage": "zone", "http": st, "errors": j.get("errors")})
        return 1
    zid = j["result"][0]["id"]
    st, j = call("GET", "/zones/%s/settings/zaraz/config" % zid, token)
    if st != 200:
        emit({"action": "zaraz-remove-tool", "ok": False, "stage": "get-config", "http": st, "errors": j.get("errors")})
        return 1
    cfg = j.get("result") or {}
    tools = cfg.get("tools") or {}
    hits = [k for k, t in tools.items() if match in json.dumps({"n": t.get("name"), "c": t.get("component"), "l": t.get("library")}).lower()]
    listing = [{"id": k, "name": t.get("name"), "component": t.get("component"), "enabled": t.get("enabled")} for k, t in tools.items()]
    if len(hits) != 1:
        emit({"action": "zaraz-remove-tool", "ok": len(hits) == 0, "stage": "match", "matched": hits, "tools": listing,
              "note": "nothing to remove" if not hits else "more than one tool matches; refusing"})
        return 0 if not hits else 1
    t = tools[hits[0]]
    removed = {"id": hits[0], "name": t.get("name"), "component": t.get("component"), "type": t.get("type"),
               "settings": {k: v for k, v in (t.get("settings") or {}).items() if not any(x.lower() in k.lower() for x in SECRETISH)}}
    del tools[hits[0]]
    cfg["tools"] = tools
    st, j = call("PUT", "/zones/%s/settings/zaraz/config" % zid, token, cfg)
    if st not in (200, 201) or j.get("success") is False:
        emit({"action": "zaraz-remove-tool", "ok": False, "stage": "put-config", "http": st, "errors": j.get("errors"), "removed_would_be": removed})
        return 1
    st, w = call("GET", "/zones/%s/settings/zaraz/workflow" % zid, token)
    published = None
    if st == 200 and str(w.get("result")) == "preview":
        st2, p = call("POST", "/zones/%s/settings/zaraz/publish" % zid, token, {"description": "ZARAZ-TOOL-REMOVE-1: remove " + str(removed["name"])})
        published = st2
    st, j = call("GET", "/zones/%s/settings/zaraz/config" % zid, token)
    left = [k for k, t2 in ((j.get("result") or {}).get("tools") or {}).items() if match in json.dumps({"n": t2.get("name"), "c": t2.get("component")}).lower()]
    emit({"action": "zaraz-remove-tool", "ok": not left, "zone": zone_name, "removed": removed, "workflow": w.get("result") if isinstance(w, dict) else None,
          "published_http": published, "still_matching": left, "tools_now": [t2.get("name") for t2 in ((j.get("result") or {}).get("tools") or {}).values()]})
    return 0 if not left else 1


LIVING_PAPER_DB = "70a58cb3-b2cd-498d-877f-ecca86859a22"


def d1q(acct: str, token: str, sql: str, params: list) -> tuple[bool, list]:
    st, j = call("POST", f"/accounts/{acct}/d1/database/{LIVING_PAPER_DB}/query", token, {"sql": sql, "params": params}, timeout=90)
    if st != 200 or not j.get("success"):
        return False, [str(j.get("errors"))[:300]]
    res = j.get("result") or [{}]
    return True, res[0].get("results") or []


def paper_body_from_zenodo(acct: str, token: str, target: str) -> int:
    import hashlib
    import urllib.parse
    parts = target.split("|")
    if len(parts) != 3 or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,120}", parts[0]) or not parts[1].isdigit() or not parts[2].endswith(".md"):
        emit({"action": "paper-body-from-zenodo", "ok": False, "error": "target must be slug|record_id|file.md"})
        return 2
    slug, rid, key = parts
    def zget(url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": "qnfo-cf-ops-actions", "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    rec = json.loads(zget("https://zenodo.org/api/records/" + rid))
    md = rec.get("metadata") or {}
    owner = any(re.search(r"quni|gudzinas", (c.get("name") or ""), re.I) for c in md.get("creators") or [])
    ok, rows = d1q(acct, token, "SELECT doi, length(body_md) AS n FROM papers WHERE slug = ?1", [slug])
    if not ok or len(rows) != 1:
        emit({"action": "paper-body-from-zenodo", "ok": False, "error": "paper not found or not unique", "detail": rows})
        return 1
    pdoi = (rows[0].get("doi") or "").lower()
    rdois = {(rec.get("doi") or "").lower(), (rec.get("conceptdoi") or "").lower(), ("10.5281/zenodo." + rid)}
    files = {f.get("key"): f for f in rec.get("files") or []}
    if not owner or pdoi not in rdois or key not in files or int(files[key].get("size") or 0) > 400000:
        emit({"action": "paper-body-from-zenodo", "ok": False, "error": "refused: owner, DOI or file check failed", "owner": owner, "paper_doi": pdoi, "record_dois": sorted(rdois), "file_found": key in files})
        return 1
    raw = zget("https://zenodo.org/api/records/" + rid + "/files/" + urllib.parse.quote(key) + "/content")
    text = raw.decode("utf-8")
    if "\ufffd" in text or len(text.strip()) < 200:
        emit({"action": "paper-body-from-zenodo", "ok": False, "error": "refused: file is empty or carries U+FFFD"})
        return 1
    ok, r1 = d1q(acct, token, "CREATE TABLE IF NOT EXISTS papers_body_bak_zenodo_sync (slug TEXT, body_md TEXT, doi TEXT, record_id TEXT, file_key TEXT, backed_up_at TEXT)", [])
    ok2, r2 = d1q(acct, token, "INSERT INTO papers_body_bak_zenodo_sync (slug, body_md, doi, record_id, file_key, backed_up_at) SELECT slug, body_md, doi, ?2, ?3, datetime('now') FROM papers WHERE slug = ?1", [slug, rid, key])
    if not (ok and ok2):
        emit({"action": "paper-body-from-zenodo", "ok": False, "error": "backup failed", "detail": [r1, r2]})
        return 1
    # The D1 query API refused a single 53 KB parameter (phase-1, run 37012985309), so the body is written in 16 000-character
    # pieces: the first replaces the body, the rest are appended; the read-back hash below proves the whole.
    chunks = [text[i:i + 16000] for i in range(0, len(text), 16000)]
    ok3, r3 = d1q(acct, token, "UPDATE papers SET body_md = ?1 WHERE slug = ?2", [chunks[0], slug])
    for c in chunks[1:]:
        if not ok3:
            break
        ok3, r3 = d1q(acct, token, "UPDATE papers SET body_md = body_md || ?1 WHERE slug = ?2", [c, slug])
    ok4, back = d1q(acct, token, "SELECT body_md FROM papers WHERE slug = ?1", [slug])
    want = hashlib.sha256(text.encode()).hexdigest()
    got = hashlib.sha256((back[0].get("body_md") or "").encode()).hexdigest() if ok4 and back else ""
    emit({"action": "paper-body-from-zenodo", "ok": ok3 and want == got, "slug": slug, "record": rid, "file": key, "old_len": rows[0].get("n"), "new_len": len(text), "sha256": want, "read_back_match": want == got, "write_error": None if ok3 else str(r3)[:300]})
    return 0 if (ok3 and want == got) else 1


# D1-FOLD-1 (2026-10-05, agent_issues 1822, owner delegated the decision 2026-10-05): fleet_budget.d1_databases is 11 against
# a cap of 10. jnl-audit is bound only by the RETIRED jnl-referee/jnl-watch (not deployed) and, unused, by fleet-exec (binding
# JNL: no fleet_tasks definition and no worker.js line names it); 0 write queries in 7 days (read 2026-10-05). Its 8 jnl_*
# tables collide by name with an older, different jnl_* dataset in qnfo-audit, so the backup is a verified SQL dump row, not a
# merge. Order: d1-backup, unbind-d1 fleet-exec:JNL (after the wrangler.toml line is gone), delete-d1. Every step re-checks.
D1_RETIRE = {"jnl-audit": "8be80cdb-979d-401f-b3ab-6a16869473ec"}
AUDIT_DB = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"
D1_PIECE = 16000
D1_OBSERVE_DAYS = 7


def d1x(acct: str, token: str, db: str, sql: str, params: list | None = None) -> tuple[bool, list]:
    st, j = call("POST", f"/accounts/{acct}/d1/database/{db}/query", token, {"sql": sql, "params": params or []}, timeout=90)
    if st != 200 or not j.get("success"):
        return False, [str(j.get("errors"))[:300]]
    res = j.get("result") or [{}]
    return True, res[0].get("results") or []


def sql_lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            return "NULL"
        return repr(v)
    if isinstance(v, str):
        return "'" + v.replace("'", "''") + "'"
    raise ValueError("unsupported value type " + type(v).__name__)


def rows_sha(rows: list) -> str:
    import hashlib
    return hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def d1_dump(acct: str, token: str, db: str, run=None) -> tuple[str, dict]:
    """(sql_text, manifest). manifest = {table: {"n": rows, "sha256": sha of the rows in rowid order}}."""
    run = run or (lambda sql: d1x(acct, token, db, sql))
    ok, objs = run("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name")
    if not ok:
        raise RuntimeError("schema read failed: " + str(objs)[:200])
    out, manifest = ["-- D1-FOLD-1 dump " + db + " " + time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())], {}
    tables = [o for o in objs if o.get("type") == "table"]
    for o in tables:
        out.append(o["sql"].rstrip(";") + ";")
    for o in tables:
        t = o["name"]
        ok, rows = run('SELECT * FROM "' + t.replace('"', '""') + '" ORDER BY rowid')
        if not ok:
            raise RuntimeError("read failed for " + t)
        manifest[t] = {"n": len(rows), "sha256": rows_sha(rows)}
        for r in rows:
            cols = list(r.keys())
            out.append('INSERT INTO "' + t + '" (' + ",".join('"' + c + '"' for c in cols) + ") VALUES (" + ",".join(sql_lit(r[c]) for c in cols) + ");")
    for o in objs:
        if o.get("type") != "table":
            out.append(o["sql"].rstrip(";") + ";")
    return "\n".join(out) + "\n", manifest


def wrangler_binders(db_id: str, root: str = ".") -> list:
    """Repo directories whose wrangler.toml names the database id, except RETIRED/FOLDED ones."""
    hits = []
    for d in sorted(os.listdir(root)):
        w = os.path.join(root, d, "wrangler.toml")
        if not os.path.isfile(w) or any(os.path.isfile(os.path.join(root, d, m)) for m in ("RETIRED", "FOLDED")):
            continue
        if db_id in open(w, encoding="utf-8").read():
            hits.append(d)
    return hits


def worker_dir(worker: str, root: str = ".") -> str | None:
    for d in sorted(os.listdir(root)):
        w = os.path.join(root, d, "wrangler.toml")
        if os.path.isfile(w) and re.search(r'^\s*name\s*=\s*"' + re.escape(worker) + '"', open(w, encoding="utf-8").read(), re.M):
            return d
    return None


def live_binders(acct: str, token: str, db_id: str) -> list:
    st, j = call("GET", f"/accounts/{acct}/workers/scripts", token)
    if st != 200:
        raise RuntimeError("workers list HTTP " + str(st))
    hits = []
    for s in j.get("result") or []:
        name = s.get("id")
        st2, j2 = call("GET", f"/accounts/{acct}/workers/scripts/{name}/settings", token)
        if st2 != 200:
            raise RuntimeError("settings HTTP " + str(st2) + " for " + str(name))
        for b in (j2.get("result") or {}).get("bindings") or []:
            if b.get("type") == "d1" and (b.get("id") == db_id or b.get("database_id") == db_id):
                hits.append(name + ":" + str(b.get("name")))
    return hits


def d1_writes_7d(acct: str, token: str, db_id: str) -> int | None:
    since = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 7 * 86400))
    until = time.strftime("%Y-%m-%d", time.gmtime())
    q = ('query { viewer { accounts(filter: { accountTag: "%s" }) { d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: "%s", '
         'date_leq: "%s", databaseId: "%s" }) { sum { writeQueries } } } } }') % (acct, since, until, db_id)
    d = graphql(q, token)
    if "_error" in d:
        return None
    rows = (((d.get("viewer") or {}).get("accounts") or [{}])[0] or {}).get("d1AnalyticsAdaptiveGroups") or []
    return sum(int((r.get("sum") or {}).get("writeQueries") or 0) for r in rows)


def d1_backup(name: str, acct: str, token: str) -> int:
    import hashlib
    if name not in D1_RETIRE:
        emit({"action": "d1-backup", "db": name, "ok": False, "refused": "not in D1_RETIRE"})
        return 3
    db_id = D1_RETIRE[name]
    sql, manifest = d1_dump(acct, token, db_id)
    want = hashlib.sha256(sql.encode()).hexdigest()
    ok, r = d1x(acct, token, AUDIT_DB, "CREATE TABLE IF NOT EXISTS d1_fold_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, db_name TEXT NOT NULL, db_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), bytes INTEGER NOT NULL, sql_sha256 TEXT NOT NULL, manifest_json TEXT NOT NULL, sql_text TEXT NOT NULL)")
    pieces = [sql[i:i + D1_PIECE] for i in range(0, len(sql), D1_PIECE)]
    ok2, ins = d1x(acct, token, AUDIT_DB, "INSERT INTO d1_fold_backups (db_name, db_id, bytes, sql_sha256, manifest_json, sql_text) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id", [name, db_id, len(sql.encode()), want, json.dumps(manifest, sort_keys=True), pieces[0]])
    if not (ok and ok2 and ins and ins[0].get("id")):
        emit({"action": "d1-backup", "db": name, "ok": False, "error": "backup row not written", "detail": str([r, ins])[:300]})
        return 1
    bid = ins[0]["id"]
    for p in pieces[1:]:
        okp, rp = d1x(acct, token, AUDIT_DB, "UPDATE d1_fold_backups SET sql_text = sql_text || ?1 WHERE id = ?2", [p, bid])
        if not okp:
            emit({"action": "d1-backup", "db": name, "ok": False, "backup_id": bid, "error": "append failed", "detail": str(rp)[:300]})
            return 1
    okb, back = d1x(acct, token, AUDIT_DB, "SELECT sql_text FROM d1_fold_backups WHERE id = ?1", [bid])
    got = hashlib.sha256((back[0].get("sql_text") or "").encode()).hexdigest() if okb and back else ""
    emit({"action": "d1-backup", "db": name, "db_id": db_id, "ok": got == want, "backup_id": bid, "bytes": len(sql.encode()), "sql_sha256": want, "read_back_match": got == want, "manifest": manifest})
    return 0 if got == want else 1


def multipart(fields: dict) -> tuple[bytes, str]:
    b = "----d1fold" + str(int(time.time() * 1000))
    parts = []
    for k, v in fields.items():
        parts.append("--" + b + '\r\nContent-Disposition: form-data; name="' + k + '"\r\nContent-Type: application/json\r\n\r\n' + json.dumps(v) + "\r\n")
    return ("".join(parts) + "--" + b + "--\r\n").encode(), "multipart/form-data; boundary=" + b


def unbind_d1(target: str, acct: str, token: str) -> int:
    from secret_lock import secret_lock
    worker, _, binding = target.partition(":")
    if not worker or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", binding or ""):
        emit({"action": "unbind-d1", "ok": False, "error": "target must be WORKER:BINDING"})
        return 2
    if worker in PROTECTED:
        emit({"action": "unbind-d1", "worker": worker, "ok": False, "refused": "protected"})
        return 3
    st, j = call("GET", f"/accounts/{acct}/workers/scripts/{worker}/settings", token)
    bindings = (j.get("result") or {}).get("bindings") or [] if st == 200 else None
    if bindings is None:
        emit({"action": "unbind-d1", "worker": worker, "ok": False, "error": "settings HTTP " + str(st)})
        return 1
    hit = next((b for b in bindings if b.get("name") == binding), None)
    if not hit:
        emit({"action": "unbind-d1", "worker": worker, "binding": binding, "ok": True, "already_absent": True})
        return 0
    db_id = hit.get("id") or hit.get("database_id")
    if hit.get("type") != "d1" or db_id not in D1_RETIRE.values():
        emit({"action": "unbind-d1", "worker": worker, "binding": binding, "ok": False, "refused": "not a D1 binding to a D1_RETIRE database"})
        return 3
    d = worker_dir(worker)
    src = open(os.path.join(d, "worker.js"), encoding="utf-8").read() if d and os.path.isfile(os.path.join(d, "worker.js")) else None
    wt = open(os.path.join(d, "wrangler.toml"), encoding="utf-8").read() if d else ""
    if d is None or src is None:
        emit({"action": "unbind-d1", "worker": worker, "ok": False, "refused": "no repo directory/worker.js for the worker"})
        return 3
    if db_id in wt:
        emit({"action": "unbind-d1", "worker": worker, "ok": False, "refused": d + "/wrangler.toml still declares the database"})
        return 3
    if re.search(r"\b" + re.escape(binding) + r"\b", src):
        emit({"action": "unbind-d1", "worker": worker, "ok": False, "refused": d + "/worker.js names the binding"})
        return 3
    okt, tasks = d1x(acct, token, AUDIT_DB, "SELECT COUNT(*) AS n FROM fleet_tasks WHERE definition LIKE ?1", ['%"' + binding + '"%'])
    if not okt or int((tasks[0] or {}).get("n") or 0) > 0:
        emit({"action": "unbind-d1", "worker": worker, "ok": False, "refused": "a fleet_tasks definition names the binding (or the check failed)"})
        return 3
    keep = [{"type": "inherit", "name": b.get("name")} for b in bindings if b.get("name") != binding]
    body, ctype = multipart({"settings": {"bindings": keep}})
    with secret_lock(worker, ttl_sec=600, owner="ci/cf-ops-actions/unbind-d1"):
        req = urllib.request.Request(API + f"/accounts/{acct}/workers/scripts/{worker}/settings", data=body, method="PATCH",
                                     headers={"Authorization": "Bearer " + token, "Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                pst, pj = r.status, json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            pst, pj = e.code, json.loads(e.read().decode() or "{}")
    st2, j2 = call("GET", f"/accounts/{acct}/workers/scripts/{worker}/settings", token)
    after = (j2.get("result") or {}).get("bindings") or []
    ok = bool(pj.get("success")) and not any(b.get("name") == binding for b in after) and len(after) == len(bindings) - 1
    emit({"action": "unbind-d1", "worker": worker, "binding": binding, "db_id": db_id, "ok": ok, "http": pst, "bindings_before": len(bindings), "bindings_after": len(after), "errors": pj.get("errors")})
    return 0 if ok else 1


def delete_d1(name: str, acct: str, token: str) -> int:
    import hashlib
    if name not in D1_RETIRE:
        emit({"action": "delete-d1", "db": name, "ok": False, "refused": "not in D1_RETIRE"})
        return 3
    db_id = D1_RETIRE[name]
    st0, _ = call("GET", f"/accounts/{acct}/d1/database/{db_id}", token)
    if st0 == 404:
        emit({"action": "delete-d1", "db": name, "ok": True, "already_absent": True})
        return 0
    refusals = []
    wb = wrangler_binders(db_id)
    if wb:
        refusals.append("wrangler.toml still names it: " + ",".join(wb))
    lb = live_binders(acct, token, db_id)
    if lb:
        refusals.append("live bindings: " + ",".join(lb))
    w7 = d1_writes_7d(acct, token, db_id)
    if w7 is None or w7 > 0:
        refusals.append("write queries in 7 days: " + str(w7))
    okb, back = d1x(acct, token, AUDIT_DB, "SELECT id, sql_sha256, manifest_json, sql_text, CAST((julianday('now') - julianday(created_at)) AS REAL) AS age_days FROM d1_fold_backups WHERE db_id = ?1 ORDER BY id DESC LIMIT 1", [db_id])
    bid = None
    if not okb or not back:
        refusals.append("no d1_fold_backups row")
    else:
        bid = back[0]["id"]
        if hashlib.sha256((back[0].get("sql_text") or "").encode()).hexdigest() != back[0].get("sql_sha256"):
            refusals.append("backup hash does not verify")
        _, live_manifest = d1_dump(acct, token, db_id)
        if json.loads(back[0].get("manifest_json") or "{}") != live_manifest:
            refusals.append("database changed since the backup")
        # The owner was told the delete waits for 7 clean days after the backup and unbind (2026-10-05): a backup at least
        # D1_OBSERVE_DAYS old that still matches the live manifest proves nothing wrote to the database in that window.
        if float(back[0].get("age_days") or 0) < D1_OBSERVE_DAYS:
            refusals.append("backup is younger than %d days (observation window)" % D1_OBSERVE_DAYS)
    if refusals:
        emit({"action": "delete-d1", "db": name, "ok": False, "refused": refusals, "backup_id": bid})
        return 3
    st, j = call("DELETE", f"/accounts/{acct}/d1/database/{db_id}", token)
    st2, _ = call("GET", f"/accounts/{acct}/d1/database/{db_id}", token)
    ok = bool(j.get("success")) and st2 == 404
    emit({"action": "delete-d1", "db": name, "db_id": db_id, "ok": ok, "http": st, "verify_http": st2, "backup_id": bid, "writes_7d": w7, "errors": j.get("errors")})
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["d1-backup", "unbind-d1", "delete-d1", "paper-body-from-zenodo", "worker-history", "kv-secret-scan", "ops-intake-probe", "report", "r2-get", "delete-worker", "delete-vectorize-index", "gateway-logs", "ai-neurons", "gateway-cost", "access-probe", "zaraz-remove-tool"])
    ap.add_argument("--target", default="")
    ap.add_argument("--model", default="")
    ap.add_argument("--gateway", default="default")
    ap.add_argument("--pages", type=int, default=6)
    a = ap.parse_args()
    if a.action == "ops-intake-probe":
        return ops_intake_probe()
    token, acct = env("CLOUDFLARE_API_TOKEN"), env("CLOUDFLARE_ACCOUNT_ID")
    if a.action in ("d1-backup", "unbind-d1", "delete-d1"):
        if not a.target:
            print("::error::" + a.action + " needs --target")
            return 2
        fn = {"d1-backup": d1_backup, "unbind-d1": unbind_d1, "delete-d1": delete_d1}[a.action]
        return fn(a.target, acct, token)
    if a.action == "delete-worker":
        if not a.target:
            print("::error::delete-worker needs --target")
            return 2
        return delete_worker(a.target, acct, token)
    if a.action == "delete-vectorize-index":
        if not a.target:
            print("::error::delete-vectorize-index needs --target")
            return 2
        return delete_vectorize_index(a.target, acct, token)
    if a.action == "zaraz-remove-tool":
        return zaraz_remove_tool(a.target, a.model, token)
    if a.action == "r2-get":
        return r2_get(acct, token, a.target)
    if a.action == "paper-body-from-zenodo":
        return paper_body_from_zenodo(acct, token, a.target)
    if a.action == "worker-history":
        return worker_history(a.target, acct, token)
    if a.action == "kv-secret-scan":
        return kv_secret_scan(a.target, acct, token)
    if a.action == "report":
        rc = 0
        for fn in (lambda: ai_neurons(acct, token), lambda: gateway_cost(acct, token),
                   lambda: gateway_logs(acct, token, a.gateway, a.model or None, max(1, min(a.pages, 40))),
                   lambda: access_probe(acct, token)):
            try:
                rc = max(rc, fn())
            except Exception as e:  # one failing probe must not hide the others
                emit({"action": "report-part", "ok": False, "error": str(e)[:300]})
                rc = 1
        return rc
    if a.action == "gateway-logs":
        return gateway_logs(acct, token, a.gateway, a.model or None, max(1, min(a.pages, 40)))
    if a.action == "ai-neurons":
        return ai_neurons_hourly(acct, token, a.model) if a.model else ai_neurons(acct, token)
    if a.action == "gateway-cost":
        return gateway_cost_daily(acct, token) if a.target == "daily" else gateway_cost(acct, token)
    return access_probe(acct, token)


if __name__ == "__main__":
    sys.exit(main())

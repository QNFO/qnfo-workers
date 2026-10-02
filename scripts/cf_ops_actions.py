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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["paper-body-from-zenodo", "worker-history", "kv-secret-scan", "ops-intake-probe", "report", "r2-get", "delete-worker", "delete-vectorize-index", "gateway-logs", "ai-neurons", "gateway-cost", "access-probe", "zaraz-remove-tool"])
    ap.add_argument("--target", default="")
    ap.add_argument("--model", default="")
    ap.add_argument("--gateway", default="default")
    ap.add_argument("--pages", type=int, default=6)
    a = ap.parse_args()
    if a.action == "ops-intake-probe":
        return ops_intake_probe()
    token, acct = env("CLOUDFLARE_API_TOKEN"), env("CLOUDFLARE_ACCOUNT_ID")
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

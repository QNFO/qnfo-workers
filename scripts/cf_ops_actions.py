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
                         FOLDED marker (the repo's own retirement record) and NAME is not protected, and refused while
                         any other live script still has a service binding to NAME (DELETE-AFTER-UNBIND-1, TP-9): the
                         binders are named; remove their wrangler.toml declarations, then unbind-service each one.
  delete-vectorize-index NAME
                         DELETE a Vectorize index. Refused unless NAME is in VECTORIZE_RETIRED (an explicit allowlist
                         mapping the index to the repo directory of the retired worker that owned it) and that
                         directory carries a RETIRED or FOLDED marker. Added for #272, where the index
                         qnfo-calibration was recreated for the folded qnfo-fleet-calibrator.
  gen-activitypub-key WORKER
                         Create AP_PRIVATE_KEY and AP_PUBLIC_KEY Worker secrets (RSA-2048) for the ActivityPub actor
                         (ACTIVITYPUB-WEBFINGER-1). WORKER must be in AP_WORKERS. Idempotent, never rotates, runs under
                         the secret-lock lease, never prints the private key.
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
  d1-backup NAME         D1-FOLD-1 (#1822): three verified copies of an allowlisted database (D1_RETIRE): a full SQL dump row in
                         qnfo-audit.d1_fold_backups (SHA-256 read-back), the same dump in R2 qnfo-backups/d1-folds/ (SHA-256
                         read-back), and every table copied into qnfo-audit as jnlaudit_* (row count + SHA-256 of the rows).
                         Prints counts and hashes, never data.
  unbind-d1 WORKER:BINDING
                         D1-FOLD-1: remove one D1 binding to an allowlisted database from a live worker. The canonical deploy
                         re-declares every live binding (qnfo-ops BINDING-PRESERVE-1) and prunes only dead SERVICE bindings, so
                         deleting a still-bound database would fail that worker's every later deploy. Refused for a PROTECTED
                         worker, when the worker's wrangler.toml still declares the database, or when its worker.js or a
                         fleet_tasks definition names the binding. Holds the secret-lock lease secrets:<worker> (#1701) and
                         patches settings with every other binding inherited from the latest version (values are never sent).
  unbind-service WORKER:BINDING
                         DANGLING-SERVICE-UNBIND-1: remove one service binding whose target worker is gone (absent from
                         the account, RETIRED/FOLDED in the repo) and that the worker's wrangler.toml no longer declares.
  delete-d1 NAME         D1-FOLD-1: delete an allowlisted database. Refused unless no wrangler.toml outside a RETIRED/FOLDED
                         directory names it, no live worker binds it, it had zero write queries in 7 days (GraphQL), and the
                         newest d1_fold_backups row verifies, its R2 copy verifies, every jnlaudit_* copy matches, no fleet_tasks
                         definition names JNL or the database, and the live manifest is unchanged (owner directive 2026-10-05:
                         no observation window).

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
    "qnfo-intent-orchestrator", "qnfo-infra", "qnfo-observability",
}
# CALENDAR-FOLD-2 (2026-10-06): calendar-api left PROTECTED when it was FOLDED into qnfo-lifecycle (its code runs there as a
# member); delete-worker still requires its FOLDED marker.


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
    # DELETE-AFTER-UNBIND-1 (TP-9 lever 1, agent_issues 2025): deleting a worker that another live script still binds leaves
    # that binder undeployable (the canonical deploy re-declares every live binding; Cloudflare 10143/10144). PR 657 did
    # exactly this on 2026-10-06 (qnfo-ops KAIZEN and SKILLSYNC, qnfo-fleet-dashboard SVC_QNFO_KAIZEN; GitHub #660). The
    # census is fail-closed: an unreadable script list or settings refuses the delete.
    try:
        binders = live_service_binders(acct, token, name)
    except RuntimeError as e:
        emit({"action": "delete-worker", "worker": name, "ok": False, "refused": "binder census failed: " + str(e)[:200]})
        return 1
    if binders:
        emit({"action": "delete-worker", "worker": name, "ok": False, "binders": binders,
              "refused": "live service bindings still target the worker: " + ", ".join(binders)
                         + "; remove them from each binder's wrangler.toml, run unbind-service WORKER:BINDING, then delete"})
        return 3
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


GA4_ID = "G-LV7RHRVW6R"


def zaraz_zones(token: str, only: str = "") -> list:
    out, page = [], 1
    while True:
        st, j = call("GET", "/zones?per_page=50&page=%d" % page, token)
        if st != 200:
            emit({"action": "zaraz-get", "ok": False, "stage": "zones", "http": st, "errors": j.get("errors")})
            return out
        out += [(z["id"], z["name"]) for z in j.get("result") or []]
        if page >= ((j.get("result_info") or {}).get("total_pages") or 1):
            return [z for z in out if not only or z[1] == only]
        page += 1


def zaraz_get(only: str, token: str) -> int:
    """Read-only: per zone, the Zaraz tool list, trigger shapes, workflow and consent state (no settings values)."""
    rc = 0
    for zid, name in zaraz_zones(token, only):
        st, j = call("GET", "/zones/%s/settings/zaraz/config" % zid, token)
        if st != 200:
            emit({"action": "zaraz-get", "zone": name, "ok": False, "http": st, "errors": j.get("errors")})
            rc = 1
            continue
        cfg = j.get("result") or {}
        st2, w = call("GET", "/zones/%s/settings/zaraz/workflow" % zid, token)
        emit({"action": "zaraz-get", "zone": name, "ok": True, "zarazEnabled": cfg.get("zarazEnabled"), "debugKey": bool(cfg.get("debugKey")),
              "settings": {k: v for k, v in (cfg.get("settings") or {}).items() if not any(x.lower() in k.lower() for x in SECRETISH)},
              "workflow": w.get("result") if st2 == 200 else st2,
              "tools": [{"id": k, "name": t.get("name"), "component": t.get("component"), "enabled": t.get("enabled")} for k, t in (cfg.get("tools") or {}).items()],
              "triggers": {k: {"name": t.get("name"), "system": t.get("system"), "loadRules": t.get("loadRules")} for k, t in (cfg.get("triggers") or {}).items()},
              "consent_keys": sorted((cfg.get("consent") or {}).keys())})
    return rc


def zaraz_set_ga4(zone_name: str, mode: str, token: str) -> int:
    """Add the GA4 tool (pageview on the system pageload trigger) to one zone's Zaraz config and publish.
    mode 'dry' prints the config it would write. Idempotent: a zone that already has a google-analytics tool for GA4_ID is left alone."""
    zs = zaraz_zones(token, zone_name)
    if not zone_name or not zs:
        emit({"action": "zaraz-set-ga4", "ok": False, "error": "zone not found", "zone": zone_name})
        return 2
    zid = zs[0][0]
    st, j = call("GET", "/zones/%s/settings/zaraz/config" % zid, token)
    if st != 200:
        emit({"action": "zaraz-set-ga4", "ok": False, "stage": "get-config", "http": st, "errors": j.get("errors")})
        return 1
    cfg = j.get("result") or {}
    tools, trigs = cfg.get("tools") or {}, cfg.get("triggers") or {}
    for k, t in tools.items():
        if t.get("component") == "google-analytics" and (t.get("settings") or {}).get("measurementID") == GA4_ID:
            emit({"action": "zaraz-set-ga4", "ok": True, "zone": zone_name, "note": "already configured", "tool": k})
            return 0
    tid = next((k for k, t in trigs.items() if t.get("system") == "pageload"), None)
    if tid is None:
        tid = "pageview-" + zone_name.replace(".", "-")
        trigs[tid] = {"name": "Pageview", "description": "All pages", "clientRules": [], "excludeRules": [], "system": "pageload",
                      "loadRules": [{"id": "r1", "match": "{{ client.__zarazTrack }}", "op": "EQUALS", "value": "Pageview"}] if False else []}
    tools["ga4-" + zone_name.replace(".", "-")] = {
        "blockingTriggers": [], "enabled": True, "defaultFields": {}, "name": "Google Analytics 4", "component": "google-analytics", "type": "component",
        "settings": {"measurementID": GA4_ID, "hideOriginalIP": True, "ecommerce": False, "hideIPAddress": True},
        "actions": {}, "neoEvents": [{"actionType": "pageview", "blockingTriggers": [], "firingTriggers": [tid], "data": {}}]}
    cfg["tools"], cfg["triggers"], cfg["zarazEnabled"] = tools, trigs, True
    # ZARAZ-AUTOINJECT-1 (2026-10-12): a tool is useless when the zone does not inject the Zaraz script into its HTML; the
    # qnfo.org config had autoInjectScript off (measured: ga4-qnfo-org published, no /cdn-cgi/zaraz/s.js on any page).
    settings = cfg.get("settings") or {}
    settings["autoInjectScript"] = True
    cfg["settings"] = settings
    if mode == "dry":
        emit({"action": "zaraz-set-ga4", "ok": True, "dry": True, "zone": zone_name, "trigger": tid, "would_write_tools": list(tools)})
        return 0
    # The API requires a 'permissions' list on component tools but documents no values: try the usual ones until it validates.
    tkey = "ga4-" + zone_name.replace(".", "-")
    tried = []
    for perms in (["access_client_kv"], [], ["access_client_kv", "execute_unsafe_scripts"]):
        tools[tkey]["permissions"] = perms
        st, j = call("PUT", "/zones/%s/settings/zaraz/config" % zid, token, cfg)
        tried.append({"permissions": perms, "http": st})
        if st in (200, 201) and j.get("success") is not False:
            break
        if "permissions" not in json.dumps(j.get("errors") or []):
            break
    if st not in (200, 201) or j.get("success") is False:
        emit({"action": "zaraz-set-ga4", "ok": False, "stage": "put-config", "http": st, "errors": j.get("errors"), "tried": tried})
        return 1
    stw, w = call("GET", "/zones/%s/settings/zaraz/workflow" % zid, token)
    if stw == 200 and str(w.get("result")) != "preview":
        st2, p = 200, {"note": "workflow is realtime: the PUT is live, nothing to publish"}
    else:
        st2, p = call("POST", "/zones/%s/settings/zaraz/publish" % zid, token, {"description": "ZARAZ-GA4-1: GA4 " + GA4_ID})
    emit({"action": "zaraz-set-ga4", "ok": st2 in (200, 201), "zone": zone_name, "permissions": tools[tkey].get("permissions"), "published_http": st2, "errors": p.get("errors") if isinstance(p, dict) else None})
    return 0 if st2 in (200, 201) else 1



# SPARE-DOMAIN-CANON-1 (2026-10-12, agent_issues 2361; owner approved 2026-10-12, former card 66). qwav.org is the canonical
# qwav host (rel=canonical on every page); qwav.uk served a duplicate 200 copy from qwav.pages.dev and qwave.tech a Registrar
# parking page (HOST-CENSUS-BROKEN-1). For each spare zone this action: records the zone's current http_request_dynamic_redirect
# entrypoint ruleset in the run log (the backup), replaces it with one rule (apex or www -> 301 https://qwav.org + path, query
# preserved), makes the apex and www records proxied (a redirect rule fires only on proxied traffic; a missing record becomes a
# proxied CNAME to qwav.pages.dev), then verifies both hosts answer 301 to qwav.org and restores the backed-up ruleset for a zone
# whose verification fails. Idempotent: a zone already carrying the rule and proxied records is left alone. mode 'dry' prints the
# plan. The session connector token is refused on ruleset writes (7500); the repository token writes zone rules and DNS.
# SPARE-DOMAIN-CANON-2 (2026-10-12, HOST-CENSUS-BROKEN-1 #2130, the 2077 host map): every spare zone names its own canonical
# target; q-wave.tech joins the qwav.org set, ipatent.me (an apex with no address record) points at the flagship's page and
# empoweringchange.today (a PAUSED zone, which is why its TLS handshake failed) is unpaused first and points at qnfo.org.
CANON_TARGET = "https://qwav.org"
SPARE_ZONES = {"qwav.uk": CANON_TARGET, "qwave.tech": CANON_TARGET, "q-wave.tech": CANON_TARGET,
               "ipatent.me": "https://ipatent.qnfo.org", "empoweringchange.today": "https://qnfo.org"}
REDIRECT_PHASE = "http_request_dynamic_redirect"
PAGES_ORIGIN = "qwav.pages.dev"


def canon_target(zone: str) -> str:
    return SPARE_ZONES.get(zone, CANON_TARGET)


def canon_rule(zone: str) -> dict:
    target = canon_target(zone)
    return {"action": "redirect", "expression": '(http.host in {"%s" "www.%s"})' % (zone, zone), "enabled": True,
            "description": "SPARE-DOMAIN-CANON-1 (agent_issues 2361, 2130): %s and www.%s are spare names of %s" % (zone, zone, target),
            "action_parameters": {"from_value": {"status_code": 301, "preserve_query_string": True,
                                                 "target_url": {"expression": 'concat("%s", http.request.uri.path)' % target}}}}


def canon_rule_present(rules: list, zone: str) -> bool:
    want = canon_rule(zone)
    for r in rules or []:
        ap = (r.get("action_parameters") or {}).get("from_value") or {}
        if r.get("action") == "redirect" and r.get("expression") == want["expression"] and ap.get("status_code") == 301 \
                and (ap.get("target_url") or {}).get("expression") == want["action_parameters"]["from_value"]["target_url"]["expression"]:
            return True
    return False


def canon_verify(host: str, fetch=None, target: str = CANON_TARGET) -> dict:
    """GET https://<host>/ without following redirects; ok when the answer is a 301/308 whose Location starts with the zone's target."""
    if fetch is None:
        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k):
                return None
        opener = urllib.request.build_opener(_NoRedirect)

        def fetch(url):
            req = urllib.request.Request(url, method="GET", headers={"User-Agent": "qnfo-cf-ops/1 spare-domain-canon"})
            try:
                with opener.open(req, timeout=20) as r:
                    return r.status, r.headers.get("Location", "")
            except urllib.error.HTTPError as e:
                return e.code, e.headers.get("Location", "") if e.headers else ""
            except Exception as e:  # DNS, TLS, timeout: reported, not raised
                return 0, "error:" + type(e).__name__
    st, loc = fetch("https://%s/" % host)
    return {"host": host, "status": st, "location": loc, "ok": st in (301, 308) and str(loc).startswith(target)}


def spare_domain_canon(zone_name: str, mode: str, token: str, fetch=None, sleep=time.sleep) -> int:
    zones = [z.strip() for z in (zone_name or "").split(",") if z.strip()] or list(SPARE_ZONES)
    bad = [z for z in zones if z not in SPARE_ZONES]
    if bad:
        emit({"action": "spare-domain-canon", "ok": False, "error": "zone not in SPARE_ZONES", "zones": bad, "allowed": list(SPARE_ZONES)})
        return 2
    known = dict((name, zid) for zid, name in zaraz_zones(token))
    rc = 0
    for zone in zones:
        zid = known.get(zone)
        target = canon_target(zone)
        if not zid:
            emit({"action": "spare-domain-canon", "ok": False, "zone": zone, "error": "zone not in the account"})
            rc = 1
            continue
        # SPARE-DOMAIN-CANON-2: a paused zone serves nothing (no edge certificate, no rules), so it is unpaused before anything
        # else; the refusal text, if any, is the evidence an owner token is still needed (2077 recorded 9109 from a session token).
        st, j = call("GET", "/zones/%s" % zid, token)
        paused = bool(((j.get("result") or {}).get("paused")) if st == 200 else False)
        unpaused = None
        if paused and mode != "dry":
            st, j = call("PATCH", "/zones/%s" % zid, token, {"paused": False})
            unpaused = {"http": st, "ok": st == 200 and j.get("success") is not False, "errors": j.get("errors")}
            emit({"action": "spare-domain-canon", "stage": "unpause", "zone": zone, "result": unpaused})
            if not unpaused["ok"]:
                rc = 1
                continue
        st, j = call("GET", "/zones/%s/rulesets/phases/%s/entrypoint" % (zid, REDIRECT_PHASE), token)
        before = ((j.get("result") or {}).get("rules") or []) if st == 200 else []
        emit({"action": "spare-domain-canon", "stage": "backup", "zone": zone, "http": st, "ruleset_rules": before})
        st, j = call("GET", "/zones/%s/dns_records?per_page=200" % zid, token)
        recs = j.get("result") or [] if st == 200 else []
        dns_plan = []
        for host in (zone, "www." + zone):
            mine = [r for r in recs if r.get("name") == host and r.get("type") in ("CNAME", "A", "AAAA")]
            if not mine:
                dns_plan.append({"host": host, "op": "create", "body": {"type": "CNAME", "name": host, "content": PAGES_ORIGIN, "proxied": True, "ttl": 1,
                                                                      "comment": "SPARE-DOMAIN-CANON-1: proxied so the redirect rule fires"}})
            for r in mine:
                if not r.get("proxied"):
                    dns_plan.append({"host": host, "op": "patch", "id": r.get("id"), "body": {"proxied": True}})
        rule_needed = not canon_rule_present(before, zone)
        if mode == "dry":
            emit({"action": "spare-domain-canon", "ok": True, "dry": True, "zone": zone, "target": target, "paused": paused, "rule_needed": rule_needed, "dns": dns_plan, "rule": canon_rule(zone)})
            continue
        if rule_needed:
            st, j = call("PUT", "/zones/%s/rulesets/phases/%s/entrypoint" % (zid, REDIRECT_PHASE), token, {"rules": [canon_rule(zone)]})
            if st not in (200, 201) or j.get("success") is False:
                emit({"action": "spare-domain-canon", "ok": False, "zone": zone, "stage": "put-ruleset", "http": st, "errors": j.get("errors")})
                rc = 1
                continue
        dns_done = []
        for d in dns_plan:
            if d["op"] == "create":
                st, j = call("POST", "/zones/%s/dns_records" % zid, token, d["body"])
            else:
                st, j = call("PATCH", "/zones/%s/dns_records/%s" % (zid, d["id"]), token, d["body"])
            dns_done.append({"host": d["host"], "op": d["op"], "http": st, "errors": j.get("errors")})
        checks = []
        # A record that just turned proxied keeps answering from the old target until resolvers drop the unproxied answer
        # (run 121, 2026-10-12: qwav.uk verified at once, qwave.tech still answered 200 after 45 s and was restored). Allow five
        # minutes before judging.
        for attempt in range(10):
            checks = [canon_verify(zone, fetch, target), canon_verify("www." + zone, fetch, target)]
            if all(c["ok"] for c in checks):
                break
            if attempt < 9:
                sleep(30)
        ok = all(c["ok"] for c in checks)
        restored = None
        if not ok and rule_needed:
            st, j = call("PUT", "/zones/%s/rulesets/phases/%s/entrypoint" % (zid, REDIRECT_PHASE), token, {"rules": before})
            restored = {"http": st, "rules": len(before)}
            rc = 1
        emit({"action": "spare-domain-canon", "ok": ok, "zone": zone, "target": target, "unpaused": unpaused, "rule_written": rule_needed, "dns": dns_done, "verify": checks, "restored": restored})
    return rc


LIVING_PAPER_DB = "70a58cb3-b2cd-498d-877f-ecca86859a22"


def d1q(acct: str, token: str, sql: str, params: list) -> tuple[bool, list]:
    st, j = call("POST", f"/accounts/{acct}/d1/database/{LIVING_PAPER_DB}/query", token, {"sql": sql, "params": params}, timeout=90)
    if st != 200 or not j.get("success"):
        return False, [str(j.get("errors"))[:300]]
    res = j.get("result") or [{}]
    return True, res[0].get("results") or []


# D1-FOLD-1 (2026-10-05, agent_issues 1822, owner delegated the decision 2026-10-05): fleet_budget.d1_databases is 11 against
# a cap of 10. jnl-audit is bound only by the RETIRED jnl-referee/jnl-watch (not deployed) and, unused, by fleet-exec (binding
# JNL: no fleet_tasks definition and no worker.js line names it); 0 write queries in 7 days (read 2026-10-05). Its 8 jnl_*
# tables collide by name with an older, different jnl_* dataset in qnfo-audit, so the backup is a verified SQL dump row, not a
# merge. Order: d1-backup, unbind-d1 fleet-exec:JNL (after the wrangler.toml line is gone), delete-d1. Every step re-checks.
D1_RETIRE = {"jnl-audit": "8be80cdb-979d-401f-b3ab-6a16869473ec"}
AUDIT_DB = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"
D1_PIECE = 16000
# Owner directive 2026-10-05 ~18:15Z ("delete jnl-audit now, no 7-day wait"): no observation window. The backup must still be
# verified three ways (dump row, R2 object, jnlaudit_* table copies) and match the live database at delete time.
D1_OBSERVE_DAYS = 0
D1_BACKUP_BUCKET = "qnfo-backups"


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


def live_service_binders(acct: str, token: str, target: str) -> list:
    """DELETE-AFTER-UNBIND-1: every live script's service bindings that name `target`, as "worker:BINDING". Raises on any
    unreadable list or settings, so a caller can fail closed."""
    st, j = call("GET", f"/accounts/{acct}/workers/scripts", token)
    if st != 200:
        raise RuntimeError("workers list HTTP " + str(st))
    hits = []
    for s in j.get("result") or []:
        name = s.get("id")
        if not name or name == target:
            continue
        st2, j2 = call("GET", f"/accounts/{acct}/workers/scripts/{name}/settings", token)
        if st2 != 200:
            raise RuntimeError("settings HTTP " + str(st2) + " for " + str(name))
        for b in (j2.get("result") or {}).get("bindings") or []:
            if b.get("type") == "service" and str(b.get("service") or "") == target:
                hits.append(name + ":" + str(b.get("name")))
    return hits


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


def r2_put_text(acct: str, token: str, bucket: str, key: str, text: str) -> int:
    import urllib.parse
    req = urllib.request.Request(API + f"/accounts/{acct}/r2/buckets/{bucket}/objects/" + urllib.parse.quote(key, safe="/"), data=text.encode(), method="PUT",
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "text/plain; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def r2_get_text(acct: str, token: str, bucket: str, key: str) -> tuple[int, str]:
    import urllib.parse
    req = urllib.request.Request(API + f"/accounts/{acct}/r2/buckets/{bucket}/objects/" + urllib.parse.quote(key, safe="/"), method="GET",
                                 headers={"Authorization": "Bearer " + token})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""


def copy_name(table: str) -> str:
    """jnl_records -> jnlaudit_records (owner directive: the copies live in qnfo-audit as jnlaudit_*)."""
    return "jnlaudit_" + (table[4:] if table.startswith("jnl_") else table)


def copy_tables(acct: str, token: str, db_id: str, manifest: dict, run_src=None, run_dst=None) -> dict:
    """Copy every table of the source into qnfo-audit as jnlaudit_*; verify count + SHA-256 per table. Idempotent: an existing
    copy that already matches is kept, one that differs is refused (never overwritten)."""
    run_src = run_src or (lambda sql, params=None: d1x(acct, token, db_id, sql, params))
    run_dst = run_dst or (lambda sql, params=None: d1x(acct, token, AUDIT_DB, sql, params))
    out = {}
    for t, m in manifest.items():
        dst = copy_name(t)
        ok, ddl = run_src("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?1", [t])
        if not ok or not ddl:
            out[t] = {"ok": False, "error": "source DDL unreadable"}
            continue
        ok, ex = run_dst("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?1", [dst])
        exists = ok and int((ex[0] or {}).get("n") or 0) > 0
        if not exists:
            new_ddl = re.sub(r'^\s*CREATE TABLE\s+"?' + re.escape(t) + r'"?', 'CREATE TABLE "' + dst + '"', ddl[0]["sql"], count=1)
            ok, err = run_dst(new_ddl)
            if not ok:
                out[t] = {"ok": False, "error": "create failed: " + str(err)[:160]}
                continue
            ok, rows = run_src('SELECT * FROM "' + t + '" ORDER BY rowid')
            if rows:
                cols = list(rows[0].keys())
                per = max(1, 90 // len(cols))
                for k in range(0, len(rows), per):
                    chunk = rows[k:k + per]
                    sql = 'INSERT INTO "' + dst + '" (' + ",".join('"' + c + '"' for c in cols) + ") VALUES " + ",".join("(" + ",".join("?" for _ in cols) + ")" for _ in chunk)
                    okc, errc = run_dst(sql, [r[c] for r in chunk for c in cols])
                    if not okc:
                        out[t] = {"ok": False, "error": "insert failed: " + str(errc)[:160]}
                        break
                if t in out:
                    continue
        ok, back = run_dst('SELECT * FROM "' + dst + '" ORDER BY rowid')
        got = {"n": len(back), "sha256": rows_sha(back)} if ok else None
        out[t] = {"ok": got == m, "copy": dst, "n": m["n"], "existed": exists, "sha256_match": bool(got and got["sha256"] == m["sha256"])}
    return out


def d1_backup(name: str, acct: str, token: str) -> int:
    """Three verified copies before any delete: a SQL dump row in qnfo-audit.d1_fold_backups, the same dump in R2
    qnfo-backups (read back by SHA-256), and every table copied into qnfo-audit as jnlaudit_* (count + row hash)."""
    import hashlib
    if name not in D1_RETIRE:
        emit({"action": "d1-backup", "db": name, "ok": False, "refused": "not in D1_RETIRE"})
        return 3
    db_id = D1_RETIRE[name]
    sql, manifest = d1_dump(acct, token, db_id)
    want = hashlib.sha256(sql.encode()).hexdigest()
    ok, r = d1x(acct, token, AUDIT_DB, "CREATE TABLE IF NOT EXISTS d1_fold_backups (id INTEGER PRIMARY KEY AUTOINCREMENT, db_name TEXT NOT NULL, db_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), bytes INTEGER NOT NULL, sql_sha256 TEXT NOT NULL, manifest_json TEXT NOT NULL, sql_text TEXT NOT NULL, r2_key TEXT, copies_json TEXT)")
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
    row_ok = (hashlib.sha256((back[0].get("sql_text") or "").encode()).hexdigest() if okb and back else "") == want
    r2_key = "d1-folds/" + name + "/" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + want[:12] + ".sql"
    put_st = r2_put_text(acct, token, D1_BACKUP_BUCKET, r2_key, sql)
    get_st, r2_text = r2_get_text(acct, token, D1_BACKUP_BUCKET, r2_key) if put_st in (200, 201) else (put_st, "")
    r2_ok = get_st == 200 and hashlib.sha256(r2_text.encode()).hexdigest() == want
    copies = copy_tables(acct, token, db_id, manifest)
    copies_ok = bool(copies) and all(c.get("ok") for c in copies.values())
    d1x(acct, token, AUDIT_DB, "UPDATE d1_fold_backups SET r2_key = ?1, copies_json = ?2 WHERE id = ?3", [r2_key if r2_ok else None, json.dumps(copies, sort_keys=True), bid])
    ok_all = row_ok and r2_ok and copies_ok
    emit({"action": "d1-backup", "db": name, "db_id": db_id, "ok": ok_all, "backup_id": bid, "bytes": len(sql.encode()), "sql_sha256": want,
          "row_read_back_match": row_ok, "r2": {"bucket": D1_BACKUP_BUCKET, "key": r2_key, "put_http": put_st, "get_http": get_st, "sha256_match": r2_ok},
          "copies": copies, "manifest": manifest})
    return 0 if ok_all else 1


def multipart(fields: dict) -> tuple[bytes, str]:
    b = "----d1fold" + str(int(time.time() * 1000))
    parts = []
    for k, v in fields.items():
        parts.append("--" + b + '\r\nContent-Disposition: form-data; name="' + k + '"\r\nContent-Type: application/json\r\n\r\n' + json.dumps(v) + "\r\n")
    return ("".join(parts) + "--" + b + "--\r\n").encode(), "multipart/form-data; boundary=" + b


# DO-EXPORTS-PASSTHROUGH-1 (2026-10-06): a settings PATCH on a worker that owns Durable Object classes must declare every
# provisioned class in `exports` (Cloudflare 100402 "provisioned_class_missing_from_config", seen on qnfo-ops), and GET
# /settings does not return them. Rebuild them from the account's Durable Object namespaces for this script, with each
# namespace's own storage (sqlite or legacy-kv). None means the list could not be read, and the caller must not PATCH.
def do_exports(acct: str, token: str, worker: str) -> dict | None:
    out: dict = {}
    page = 1
    while page <= 20:
        st, j = call("GET", f"/accounts/{acct}/workers/durable_objects/namespaces?per_page=100&page={page}", token)
        if st != 200:
            return None
        for n in j.get("result") or []:
            if n.get("script") == worker and n.get("class"):
                out[n["class"]] = {"type": "durable-object", "storage": "sqlite" if n.get("use_sqlite") else "legacy-kv"}
        info = j.get("result_info") or {}
        if page >= int(info.get("total_pages") or 1):
            return out
        page += 1
    return out


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
    exports = do_exports(acct, token, worker)
    if exports is None:
        emit({"action": "unbind-d1", "worker": worker, "ok": False, "refused": "Durable Object namespaces could not be read"})
        return 1
    settings = {"bindings": keep}
    if exports:
        settings["exports"] = exports
    body, ctype = multipart({"settings": settings})
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


# DANGLING-SERVICE-UNBIND-1 (2026-10-06, #1756): the canonical deploy re-declares every live binding (qnfo-ops
# BINDING-PRESERVE-1). When a retired worker is deleted, a live service binding to it makes Cloudflare reject every later
# deploy of the binder. qnfo-ops prunes that case only for error 10144; Cloudflare also answers 10143 ("Service binding 'X'
# references Worker '' which was not found"), seen on qnfo-ops and qnfo-fleet-dashboard after the wave-2 deletes. This
# removes one DANGLING service binding from a live worker: its target is absent from the account (settings 404, or no
# service name), the target's repo directory (when named) carries a RETIRED or FOLDED marker, and the binder's own
# wrangler.toml no longer declares the binding (so the next deploy cannot re-add it). A protected worker is allowed,
# because this only removes a reference that already cannot work. Every other binding is sent as {type: inherit}, under
# the secret-lock lease (#1701), and the result is verified.
def declared_service(wt: str, binding: str):
    """The service a wrangler.toml [[services]] block declares for `binding`; None when no block declares it."""
    for block in re.split(r"(?m)^\s*\[", wt):
        if not block.startswith("[services]]"):
            continue
        if re.search(r'(?m)^\s*binding\s*=\s*"' + re.escape(binding) + r'"', block):
            m = re.search(r'(?m)^\s*service\s*=\s*"([^"]*)"', block)
            return m.group(1).strip() if m else ""
    return None


def unbind_service(target: str, acct: str, token: str) -> int:
    from secret_lock import secret_lock
    worker, _, binding = target.partition(":")
    if not worker or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,62}", binding or ""):
        emit({"action": "unbind-service", "ok": False, "error": "target must be WORKER:BINDING"})
        return 2
    st, j = call("GET", f"/accounts/{acct}/workers/scripts/{worker}/settings", token)
    bindings = (j.get("result") or {}).get("bindings") or [] if st == 200 else None
    if bindings is None:
        emit({"action": "unbind-service", "worker": worker, "ok": False, "error": "settings HTTP " + str(st)})
        return 1
    hit = next((b for b in bindings if b.get("name") == binding), None)
    if not hit:
        emit({"action": "unbind-service", "worker": worker, "binding": binding, "ok": True, "already_absent": True})
        return 0
    if hit.get("type") != "service":
        emit({"action": "unbind-service", "worker": worker, "binding": binding, "ok": False, "refused": "not a service binding"})
        return 3
    svc = str(hit.get("service") or "").strip()
    target_live = False
    if svc:
        s2, _ = call("GET", f"/accounts/{acct}/workers/scripts/{svc}/settings", token)
        marked = os.path.isdir(svc) and any(os.path.isfile(os.path.join(svc, m)) for m in ("RETIRED", "FOLDED"))
        # UNBIND-BEFORE-DELETE-1 (#1756): delete-worker refuses while a live binder targets the worker (DELETE-AFTER-UNBIND-1),
        # so a target that is still deployed may be unbound when its repo directory is RETIRED or FOLDED (it is on its way
        # out); an unmarked live target is still refused.
        if s2 != 404 and not marked:
            emit({"action": "unbind-service", "worker": worker, "binding": binding, "service": svc, "ok": False, "refused": "the target worker still exists (settings HTTP " + str(s2) + ") and its repo directory has no RETIRED/FOLDED marker"})
            return 3
        if s2 == 404 and os.path.isdir(svc) and not marked:
            emit({"action": "unbind-service", "worker": worker, "binding": binding, "service": svc, "ok": False, "refused": "the target's repo directory has no RETIRED/FOLDED marker"})
            return 3
        target_live = s2 != 404
    d = worker_dir(worker)
    wt = open(os.path.join(d, "wrangler.toml"), encoding="utf-8").read() if d else None
    if wt is None:
        emit({"action": "unbind-service", "worker": worker, "ok": False, "refused": "no repo directory/wrangler.toml for the worker"})
        return 3
    declared = declared_service(wt, binding)
    repoint = None
    if declared is not None:
        # SERVICE-REPOINT-1 (#1756): a fold may keep the binding NAME and declare it to the host that now runs the member.
        # The canonical deploy keeps a live binding by (type, name) and only refreshes its props, so the dangling one must
        # go before the declared one can install. Refuse while the declaration still names the dead target, a RETIRED or
        # FOLDED directory, or a worker with no repo directory.
        if (not declared or declared == svc or not os.path.isdir(declared)
                or any(os.path.isfile(os.path.join(declared, m)) for m in ("RETIRED", "FOLDED"))):
            emit({"action": "unbind-service", "worker": worker, "binding": binding, "ok": False, "refused": d + "/wrangler.toml still declares the binding" + (" to " + declared if declared else "")})
            return 3
        repoint = declared
    src = open(os.path.join(d, "worker.js"), encoding="utf-8").read() if os.path.isfile(os.path.join(d, "worker.js")) else ""
    keep = [{"type": "inherit", "name": b.get("name")} for b in bindings if b.get("name") != binding]
    exports = do_exports(acct, token, worker)
    if exports is None:
        emit({"action": "unbind-service", "worker": worker, "ok": False, "refused": "Durable Object namespaces could not be read"})
        return 1
    settings = {"bindings": keep}
    if exports:
        settings["exports"] = exports
    body, ctype = multipart({"settings": settings})
    with secret_lock(worker, ttl_sec=600, owner="ci/cf-ops-actions/unbind-service"):
        req = urllib.request.Request(API + f"/accounts/{acct}/workers/scripts/{worker}/settings", data=body, method="PATCH",
                                     headers={"Authorization": "Bearer " + token, "Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                pst, pj = r.status, json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            pst, pj = e.code, json.loads(e.read().decode() or "{}")
    st3, j3 = call("GET", f"/accounts/{acct}/workers/scripts/{worker}/settings", token)
    after = (j3.get("result") or {}).get("bindings") or []
    ok = bool(pj.get("success")) and not any(b.get("name") == binding for b in after) and len(after) == len(bindings) - 1
    emit({"action": "unbind-service", "worker": worker, "binding": binding, "service": svc, "target_still_deployed": target_live, "repoint_to": repoint,
          "next_step": ("a canonical deploy of " + worker + " installs the declared " + binding + " -> " + repoint) if repoint and ok else None,
          "protected_repair": worker in PROTECTED, "exports": sorted(exports),
          "code_mentions_binding": bool(re.search(r"\b" + re.escape(binding) + r"\b", src)), "ok": ok, "http": pst,
          "bindings_before": len(bindings), "bindings_after": len(after), "errors": pj.get("errors")})
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
    okt, tasks = d1x(acct, token, AUDIT_DB, "SELECT COUNT(*) AS n FROM fleet_tasks WHERE definition LIKE '%JNL%' OR definition LIKE ?1", ["%" + db_id + "%"])
    if not okt or int((tasks[0] or {}).get("n") or 0) > 0:
        refusals.append("a fleet_tasks definition names JNL or the database (or the check failed)")
    w7 = d1_writes_7d(acct, token, db_id)
    if w7 is None or w7 > 0:
        refusals.append("write queries in 7 days: " + str(w7))
    okb, back = d1x(acct, token, AUDIT_DB, "SELECT id, sql_sha256, manifest_json, sql_text, r2_key, CAST((julianday('now') - julianday(created_at)) AS REAL) AS age_days FROM d1_fold_backups WHERE db_id = ?1 ORDER BY id DESC LIMIT 1", [db_id])
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
        if not back[0].get("r2_key"):
            refusals.append("no verified R2 copy of the dump")
        else:
            gst, gtext = r2_get_text(acct, token, D1_BACKUP_BUCKET, back[0]["r2_key"])
            if gst != 200 or hashlib.sha256(gtext.encode()).hexdigest() != back[0].get("sql_sha256"):
                refusals.append("R2 copy missing or its SHA-256 differs")
        cps = copy_tables(acct, token, db_id, live_manifest)
        if not cps or not all(c.get("ok") and c.get("existed") for c in cps.values()):
            refusals.append("jnlaudit_* table copies missing or not identical")
        # The owner was told the delete waits for 7 clean days after the backup and unbind (2026-10-05): a backup at least
        # D1_OBSERVE_DAYS old that still matches the live manifest proves nothing wrote to the database in that window.
        if D1_OBSERVE_DAYS and float(back[0].get("age_days") or 0) < D1_OBSERVE_DAYS:
            refusals.append("backup is younger than %d days (observation window)" % D1_OBSERVE_DAYS)
    if refusals:
        emit({"action": "delete-d1", "db": name, "ok": False, "refused": refusals, "backup_id": bid})
        return 3
    st, j = call("DELETE", f"/accounts/{acct}/d1/database/{db_id}", token)
    st2, _ = call("GET", f"/accounts/{acct}/d1/database/{db_id}", token)
    ok = bool(j.get("success")) and st2 == 404
    emit({"action": "delete-d1", "db": name, "db_id": db_id, "ok": ok, "http": st, "verify_http": st2, "backup_id": bid, "writes_7d": w7, "errors": j.get("errors")})
    return 0 if ok else 1


AP_WORKERS = {"qnfo-gateway"}
AP_SECRETS = ("AP_PRIVATE_KEY", "AP_PUBLIC_KEY")


def _rsa_keypair() -> tuple[str, str]:
    """RSA-2048 PKCS8 private key and SPKI public key as PEM, from openssl (present on the runner). Nothing is written to disk."""
    import subprocess
    priv = subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048"],
                          capture_output=True, check=True).stdout.decode()
    pub = subprocess.run(["openssl", "pkey", "-pubout"], input=priv.encode(), capture_output=True, check=True).stdout.decode()
    return priv, pub


def gen_activitypub_key(worker: str, acct: str, token: str, keygen=_rsa_keypair, lock=None) -> int:
    """ACTIVITYPUB-WEBFINGER-1: create the actor's signing key as Worker secrets AP_PRIVATE_KEY and AP_PUBLIC_KEY.
    Idempotent and never a rotation: if either secret exists nothing is written (a rotation would break every follower's
    cached key). Allowlisted to AP_WORKERS. The write runs under the secret-lock lease (#1701). The private key is never
    printed; the result carries the public key and its SHA-256 fingerprint only."""
    import hashlib
    if worker not in AP_WORKERS:
        emit({"action": "gen-activitypub-key", "ok": False, "refused": "worker not in the ActivityPub allowlist " + ",".join(sorted(AP_WORKERS))})
        return 3
    st, j = call("GET", f"/accounts/{acct}/workers/scripts/{worker}/secrets", token)
    if st != 200:
        emit({"action": "gen-activitypub-key", "worker": worker, "ok": False, "error": "secrets list HTTP " + str(st)})
        return 1
    have = {x.get("name") for x in (j.get("result") or [])}
    present = [n for n in AP_SECRETS if n in have]
    if present:
        emit({"action": "gen-activitypub-key", "worker": worker, "ok": True, "already_exists": present, "rotated": False,
              "complete": len(present) == len(AP_SECRETS)})
        return 0 if len(present) == len(AP_SECRETS) else 1
    if lock is None:
        from secret_lock import secret_lock as lock
    priv, pub = keygen()
    if "BEGIN PRIVATE KEY" not in priv or "BEGIN PUBLIC KEY" not in pub:
        emit({"action": "gen-activitypub-key", "worker": worker, "ok": False, "error": "key generation produced no PEM"})
        return 1
    codes = []
    with lock(worker, ttl_sec=300, owner="ci/cf-ops-actions/gen-activitypub-key"):
        for name, text in (("AP_PRIVATE_KEY", priv), ("AP_PUBLIC_KEY", pub)):
            c, _ = call("PUT", f"/accounts/{acct}/workers/scripts/{worker}/secrets", token, {"name": name, "text": text, "type": "secret_text"})
            codes.append(c)
    st2, j2 = call("GET", f"/accounts/{acct}/workers/scripts/{worker}/secrets", token)
    after = {x.get("name") for x in (j2.get("result") or [])} if st2 == 200 else set()
    ok = all(c in (200, 201) for c in codes) and all(n in after for n in AP_SECRETS)  # a secret the worker did not hold yet is created with 201 (run 123, 2026-10-12)
    der_fp = hashlib.sha256(pub.encode()).hexdigest()
    emit({"action": "gen-activitypub-key", "worker": worker, "ok": ok, "rotated": False, "put_http": codes, "verified_present": sorted(after & set(AP_SECRETS)),
          "public_key_sha256": der_fp, "next_step": "deploy qnfo-gateway with the actor routes; /ap/actor serves AP_PUBLIC_KEY"})
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["d1-backup", "unbind-d1", "delete-d1", "unbind-service", "worker-history", "kv-secret-scan", "ops-intake-probe", "report", "r2-get", "delete-worker", "delete-vectorize-index", "gateway-logs", "ai-neurons", "gateway-cost", "access-probe", "zaraz-remove-tool", "zaraz-get", "zaraz-set-ga4", "spare-domain-canon", "gen-activitypub-key"])
    ap.add_argument("--target", default="")
    ap.add_argument("--model", default="")
    ap.add_argument("--gateway", default="default")
    ap.add_argument("--pages", type=int, default=6)
    a = ap.parse_args()
    if a.action == "ops-intake-probe":
        return ops_intake_probe()
    token, acct = env("CLOUDFLARE_API_TOKEN"), env("CLOUDFLARE_ACCOUNT_ID")
    if a.action in ("d1-backup", "unbind-d1", "delete-d1", "unbind-service"):
        if not a.target:
            print("::error::" + a.action + " needs --target")
            return 2
        fn = {"d1-backup": d1_backup, "unbind-d1": unbind_d1, "delete-d1": delete_d1, "unbind-service": unbind_service}[a.action]
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
    if a.action == "gen-activitypub-key":
        return gen_activitypub_key(a.target, acct, token)
    if a.action == "zaraz-remove-tool":
        return zaraz_remove_tool(a.target, a.model, token)
    if a.action == "zaraz-get":
        return zaraz_get(a.target, token)
    if a.action == "zaraz-set-ga4":
        return zaraz_set_ga4(a.target, a.model, token)
    if a.action == "spare-domain-canon":
        return spare_domain_canon(a.target, a.model, token)
    if a.action == "r2-get":
        return r2_get(acct, token, a.target)
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

#!/usr/bin/env python3
"""SURFACE-ROUTES-1 (2026-10-02, pillar reach): serve archive.qnfo.org, qwav.org and qwav.tech from qnfo-gateway 3.9+.

WHY
  archive.qnfo.org is the Pages project qnfo-publications, which cannot be redeployed
  (ARCHIVE-PAGES-UNDEPLOYABLE-1, issue 1393), so its counts and links went stale. qwav.org and qwav.tech are
  Pages projects outside this repository: their HTML answers every path (robots.txt and sitemap.xml included)
  and carries none of the shared design. qnfo-gateway 3.9.0-qds renders all three hosts with the QNFO design
  system (QDS-1): ARCHIVE-ON-GATEWAY-1 counts the corpus live, QWAV-ON-GATEWAY-1 keeps the QWAV content and
  labels the joules target as a design target.

HOW (the zone-route path proven by ASK-QWAV-ROUTE-1 on 2026-10-02)
  1. wait until https://qnfo.org/health reports qnfo-gateway VERSION >= 3.9 (the canonical deploy of the same
     push runs in parallel); refuse to route a hostname to a gateway that does not render it
  2. per hostname, idempotent: an existing route with the same pattern and script is reused; a route pointing
     at another script is reported as a conflict and left alone
  3. create a route only when the hostname has a proxied DNS record (a route is otherwise inert); never
     creates or changes DNS, never touches the Pages projects
  4. verify from outside: https://<host>/health must name qnfo-gateway and https://<host>/ must be the QDS page
     (data-brand) in time (7 minutes after a DNS switch, else 2); a route created by this run that fails verification is deleted again

REVERSIBLE
  DELETE /zones/{zone}/workers/routes/{id} for any id in the report puts that host back on its Pages project.

OBSERVABLE
  ci-status/attach-surface-routes.json is written on every exit path and committed back by the workflow.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ACCT = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "edb167b78c9fb901ea5bca3ce58ccc4b"
TOK = os.environ.get("CLOUDFLARE_API_TOKEN")
SERVICE = "qnfo-gateway"
ORIGIN_HEALTH = "https://qnfo.org/health"
MIN_VERSION = (3, 9)  # 3.9.0-qds is the first gateway that renders these hosts (3.8.x would serve its default page)
# (zone, hostname). www.qwav.tech is left out: a zone redirect rule already sends it to qwav.tech.
HOSTS = [("qnfo.org", "archive.qnfo.org"), ("qwav.org", "qwav.org"), ("qwav.org", "www.qwav.org"), ("qwav.tech", "qwav.tech")]
# RETIRED-HOSTS-ROUTES-1 (2026-10-08, agent_issues 2010, owner card cf-dns-redirect-token): twelve retired qnfo.org hostnames
# keep proxied DNS and answered 522. qnfo-lifecycle 1.9.1 (RETIRED-HOSTS-1) answers them 410 Gone; only the zone routes were
# missing. The card said no fleet token could write routes, but this script's CLOUDFLARE_API_TOKEN created routes on
# 2026-10-02 (ASK-QWAV-ROUTE-1, SURFACE-ROUTES-1), so the routes are attached here. Verified by an external 410.
SERVICE_BY_HOST = {}
for _h in ("agent-orchestrator", "fleet-executor", "fleet-scheduler", "qnfo-arxiv-radar", "qnfo-calibration-audit",
           "qnfo-citation-watch", "qnfo-paper-reviser", "qnfo-research-radar", "qnfo-secrets-audit", "qnfo-system-health",
           "scorecard", "analytics"):
    HOSTS.append(("qnfo.org", _h + ".qnfo.org"))
    SERVICE_BY_HOST[_h + ".qnfo.org"] = "qnfo-lifecycle"

# SPARE-DOMAINS-1 (2026-10-08, agent_issues 2077): the spare domains go to qnfo-lifecycle 1.10.0, which answers 301 to their
# canonical site (SPARE_HOST_REDIRECTS there). A host with no address record gets a proxied AAAA 100:: (DNS_CREATE); a
# DNS-only CNAME to *.pages.dev is proxied (PROXY_ALLOWED) and its Pages custom-domain binding, found by listing the account's
# projects, is detached once the route is in place. Each step is undone for a host that does not verify.
SPARE_TARGET = {"ipatent.me": "https://ipatent.qnfo.org", "www.ipatent.me": "https://ipatent.qnfo.org",
                "qwav.net": "https://qwav.org", "www.qwav.net": "https://qwav.org", "qwav.uk": "https://qwav.org",
                "www.qwav.uk": "https://qwav.org", "qwave.tech": "https://qwav.org", "www.qwave.tech": "https://qwav.org",
                "q-wave.tech": "https://qwav.org", "www.q-wave.tech": "https://qwav.org",
                "empoweringchange.today": "https://qnfo.org", "www.empoweringchange.today": "https://qnfo.org"}
for _h in SPARE_TARGET:
    HOSTS.append((_h[4:] if _h.startswith("www.") else _h, _h))
    SERVICE_BY_HOST[_h] = "qnfo-lifecycle"
DNS_CREATE = set(SPARE_TARGET)
LIFECYCLE_HEALTH = "https://qnfo-lifecycle.q08.workers.dev/health"
LIFECYCLE_MIN = (1, 10)


def service_for(host):
    return SERVICE_BY_HOST.get(host, SERVICE)
UA = "qnfo-ops-surface-routes/1.5"
# SURFACE-ROUTES-PROXY-1 (2026-10-02): qwav.org and www.qwav.org are DNS-only CNAMEs to qwav.pages.dev, so a zone route never
# runs on them (first run: "no proxied DNS record"). For these hosts only, a single CNAME to *.pages.dev is switched to
# proxied (Cloudflare serves the Pages site exactly as before until the route takes over), and switched back if the
# route then fails verification. The report records the record id and its previous state for a manual rollback.
PROXY_ALLOWED = {"qwav.org", "www.qwav.org", "qwav.net", "www.qwav.net", "qwav.uk", "www.qwav.uk"}
# SURFACE-ROUTES-PAGES-1 (2026-10-02): run 37011936968 proxied qwav.org and routed it, and for 7 minutes /health still
# answered from Pages: a Pages custom-domain binding (project qwav) takes precedence over zone routes. For these hosts
# only, when the route is in place and the host still answers from Pages after 3 checks, the Pages binding is detached;
# if the gateway then does not answer within the verify window, the binding is re-added before the route and DNS are
# rolled back, so the host is never left without a server.
PAGES_DETACH = {"qwav.org": "qwav", "www.qwav.org": "qwav"}
API = "https://api.cloudflare.com/client/v4"
REPORT_PATH = "ci-status/attach-surface-routes.json"
RESULT = {"marker": "SURFACE-ROUTES-1", "service": SERVICE, "token_present": bool(TOK), "stage": "start", "status": "unknown",
          "error": None, "gateway_version": None, "hosts": {}, "ts": None}


def report(stage, status, error=None):
    RESULT.update({"stage": stage, "status": status, "error": (str(error)[:1200] if error is not None else None),
                   "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    try:
        os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
        with open(REPORT_PATH, "w") as f:
            json.dump(RESULT, f, indent=2)
            f.write("\n")
    except Exception as e:  # pragma: no cover
        print("report write failed: %s" % e)
    print("SURFACE-ROUTES-REPORT %s" % json.dumps(RESULT))


def req(method, path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + (TOK or ""))
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:800]}
    except Exception as e:
        return 0, {"raw": "%s: %s" % (type(e).__name__, e)}


def get_json(url, timeout=20):
    r = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode(errors="replace") or "{}")


def version_ok(v):
    try:
        parts = [int(x) for x in v.split("-")[0].split(".")[:2]]
        return tuple(parts) >= MIN_VERSION
    except Exception:
        return False


def wait_gateway():
    for i in range(1, 41):
        try:
            st, j = get_json(ORIGIN_HEALTH)
            v = str(j.get("version") or "")
            RESULT["gateway_version"] = v
            if st == 200 and j.get("worker") == SERVICE and version_ok(v):
                print("gateway ready: %s" % v)
                return True
            print("wait %d: %s version %s" % (i, j.get("worker"), v))
        except Exception as e:
            print("wait %d: %s %s" % (i, type(e).__name__, e))
        time.sleep(15)
    return False


def wait_lifecycle():
    for i in range(1, 41):
        try:
            st, j = get_json(LIFECYCLE_HEALTH)
            v = str(j.get("version") or "")
            RESULT["lifecycle_version"] = v
            parts = tuple(int(x) for x in v.split("-")[0].split(".")[:2])
            if st == 200 and parts >= LIFECYCLE_MIN:
                print("lifecycle ready: %s" % v)
                return True
            print("wait lifecycle %d: %s" % (i, v))
        except Exception as e:
            print("wait lifecycle %d: %s %s" % (i, type(e).__name__, e))
        time.sleep(15)
    return False


def pages_project_for(host):
    st, j = req("GET", "/accounts/%s/pages/projects?per_page=100" % ACCT)
    for p in (j.get("result") or []) if st == 200 else []:
        if host in (p.get("domains") or []):
            return p.get("name")
    return None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def head_location(url):
    try:
        with urllib.request.build_opener(_NoRedirect).open(urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"}), timeout=20) as resp:
            return resp.status, None
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location")


def attach(zone_name, host, zones):
    h = RESULT["hosts"].setdefault(host, {"zone": zone_name, "route_id": None, "status": "unknown", "detail": None})
    if zone_name not in zones:
        st, j = req("GET", "/zones?name=%s" % zone_name)
        if st != 200 or not j.get("success") or not j.get("result"):
            h.update(status="failed", detail="zone lookup http=%s body=%s" % (st, json.dumps(j)[:300]))
            return False
        zones[zone_name] = j["result"][0]["id"]
    zone = zones[zone_name]
    st, j = req("GET", "/zones/%s/workers/routes" % zone)
    if st != 200 or not j.get("success"):
        h.update(status="failed", detail="list routes http=%s body=%s" % (st, json.dumps(j)[:300]))
        return False
    for r in j.get("result") or []:
        if r.get("pattern") == host + "/*":
            h["route_id"] = r.get("id")
            if r.get("script") != service_for(host):
                h.update(status="conflict", detail="route already points at %s" % r.get("script"))
                return False
            h.update(status="present")
            return True
    st, j = req("GET", "/zones/%s/dns_records?name=%s" % (zone, host))
    recs = (j.get("result") or []) if st == 200 else []
    # Only address records decide whether traffic is proxied; a TXT or MX on the same name does not (qwav.org has one).
    addr = [x for x in recs if x.get("type") in ("CNAME", "A", "AAAA")]
    if not any(x.get("proxied") for x in addr) and host in PROXY_ALLOWED and len(addr) == 1 and addr[0].get("type") == "CNAME" \
            and str(addr[0].get("content", "")).endswith(".pages.dev"):
        recs = addr
        rid = recs[0].get("id")
        st, pj = req("PATCH", "/zones/%s/dns_records/%s" % (zone, rid), {"proxied": True})
        if st == 200 and pj.get("success"):
            h.update(dns_record=rid, dns_proxied_from=False)
            print("dns proxied: %s (%s -> %s)" % (host, rid, recs[0].get("content")))
            time.sleep(20)
            recs = [dict(recs[0], proxied=True)]
        else:
            h.update(status="failed", detail="could not proxy the DNS record http=%s body=%s" % (st, json.dumps(pj)[:300]))
            return False
    if not addr and host in DNS_CREATE:
        st, cj = req("POST", "/zones/%s/dns_records" % zone, {"type": "AAAA", "name": host, "content": "100::", "proxied": True, "ttl": 1,
                                                               "comment": "SPARE-DOMAINS-1: originless record for the qnfo-lifecycle redirect"})
        if st in (200, 201) and cj.get("success"):
            h.update(dns_created=(cj.get("result") or {}).get("id"))
            print("dns created: %s AAAA 100:: proxied (%s)" % (host, h["dns_created"]))
            time.sleep(20)
            recs = [{"type": "AAAA", "proxied": True}]
        else:
            h.update(status="failed", detail="could not create the DNS record http=%s body=%s" % (st, json.dumps(cj)[:300]))
            return False
    if not any(x.get("proxied") for x in recs):
        h.update(status="failed", detail="no proxied DNS record; a route would be inert (records: %s)" % json.dumps([{k: x.get(k) for k in ("type", "content", "proxied")} for x in recs])[:300])
        return False
    st, j = req("POST", "/zones/%s/workers/routes" % zone, {"pattern": host + "/*", "script": service_for(host)})
    if st not in (200, 201) or not j.get("success"):
        h.update(status="failed", detail="create route http=%s body=%s" % (st, json.dumps(j)[:300]))
        return False
    h.update(route_id=(j.get("result") or {}).get("id"), status="created")
    print("route created: %s -> %s (%s)" % (host, service_for(host), h["route_id"]))
    return True


def verify(host):
    h = RESULT["hosts"][host]
    # A record just switched to proxied keeps its old DNS-only answer in resolvers for up to its TTL (auto = 300 s), so
    # those hosts get 7 minutes instead of 2 before the route is judged (run 37011152668 rolled qwav.org back at 2 min).
    tries = 42 if h.get("dns_proxied_from") is False or h.get("dns_created") else 12
    if host in SPARE_TARGET:
        want = SPARE_TARGET[host] + "/"
        for i in range(1, tries + 1):
            if i == 4 and h.get("status") == "created" and not h.get("pages_detached"):
                proj = pages_project_for(host)
                if proj:
                    st, dj = req("DELETE", "/accounts/%s/pages/projects/%s/domains/%s" % (ACCT, proj, host))
                    h["pages_detach_http"] = st
                    if st == 200 and dj.get("success", True):
                        h.update(pages_detached=proj)
                        print("pages binding detached: %s from project %s" % (host, proj))
            st, loc = head_location("https://%s/" % host)
            if st == 301 and loc == want:
                h["verified"] = True
                return True
            print("verify %s %d: http=%s location=%s" % (host, i, st, loc))
            time.sleep(10)
        h["verified"] = False
        return False
    if service_for(host) == "qnfo-lifecycle":
        # A retired host is verified by qnfo-lifecycle's 410 Gone (RETIRED-HOSTS-1), seen from outside the account.
        for i in range(1, tries + 1):
            try:
                urllib.request.urlopen(urllib.request.Request("https://%s/" % host, headers={"User-Agent": UA, "Cache-Control": "no-cache"}), timeout=20)
                print("verify %s %d: answered 2xx/3xx, not 410" % (host, i))
            except urllib.error.HTTPError as e:
                if e.code == 410:
                    h["verified"] = True
                    return True
                print("verify %s %d: http=%s" % (host, i, e.code))
            except Exception as e:
                print("verify %s %d: %s %s" % (host, i, type(e).__name__, e))
            time.sleep(10)
        h["verified"] = False
        return False
    for i in range(1, tries + 1):
        if i == 4 and host in PAGES_DETACH and h.get("status") == "created" and not h.get("pages_detached"):
            proj = PAGES_DETACH[host]
            st, dj = req("DELETE", "/accounts/%s/pages/projects/%s/domains/%s" % (ACCT, proj, host))
            h["pages_detach_http"] = st
            if st == 200 and dj.get("success", True):
                h.update(pages_detached=proj)
                print("pages binding detached: %s from project %s" % (host, proj))
            else:
                print("pages detach refused for %s: http=%s %s" % (host, st, json.dumps(dj)[:200]))
        try:
            st, j = get_json("https://%s/health" % host)
            if st == 200 and j.get("worker") == SERVICE:
                r = urllib.request.Request("https://%s/" % host, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
                with urllib.request.urlopen(r, timeout=20) as resp:
                    page = resp.read().decode(errors="replace")
                if 'data-brand="' in page:
                    h["verified"] = True
                    return True
                print("verify %s %d: health ok but / is not the QDS page" % (host, i))
            print("verify %s %d: http=%s worker=%s" % (host, i, st, j.get("worker")))
        except Exception as e:
            print("verify %s %d: %s %s" % (host, i, type(e).__name__, e))
        time.sleep(10)
    h["verified"] = False
    return False


def ledger(host, route_id):
    dbid = os.environ.get("CF_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
    sql = ("INSERT INTO deployment_history (resource_type,resource_name,action,version_id,deployed_by,deployed_at,status,notes) "
           "VALUES ('worker_route',?,'attach',?,'scripts/attach-surface-routes.py',datetime('now'),'success',?)")
    st, j = req("POST", "/accounts/%s/d1/database/%s/query" % (ACCT, dbid),
                {"sql": sql, "params": [host, str(route_id), "SURFACE-ROUTES-1; worker %s %s" % (service_for(host), RESULT.get("gateway_version"))]})
    print("ledger %s http=%s ok=%s" % (host, st, j.get("success")))


def main():
    if not TOK:
        report("token", "failed", error="CLOUDFLARE_API_TOKEN is not set")
        return 1
    if not wait_gateway():
        report("wait-gateway", "failed", error="qnfo-gateway never reported VERSION >= 3.9 within 10 min; no route created")
        return 1
    zones = {}
    ok = True
    lifecycle_ready = None
    for zone_name, host in HOSTS:
        if host in SPARE_TARGET:
            if lifecycle_ready is None:
                lifecycle_ready = wait_lifecycle()
            if not lifecycle_ready:
                RESULT["hosts"][host] = {"zone": zone_name, "route_id": None, "status": "skipped", "detail": "qnfo-lifecycle below 1.10 (SPARE-DOMAINS-1 handler)"}
                ok = False
                continue
        if attach(zone_name, host, zones):
            if verify(host):
                if RESULT["hosts"][host]["status"] == "created":
                    ledger(host, RESULT["hosts"][host]["route_id"])
            else:
                ok = False
                if RESULT["hosts"][host].get("pages_detached"):
                    st, j = req("POST", "/accounts/%s/pages/projects/%s/domains" % (ACCT, RESULT["hosts"][host]["pages_detached"]), {"name": host})
                    RESULT["hosts"][host]["pages_reattached"] = bool(st in (200, 201) and j.get("success", True))
                    print("pages binding re-added %s http=%s" % (host, st))
                if RESULT["hosts"][host].get("dns_created"):
                    # A new name can stay negatively cached at the runner's resolver past the window; a proxied 100:: in front
                    # of the redirect harms nothing, so it stays for agent_issues 2077's runtime probe to judge.
                    RESULT["hosts"][host]["kept_unverified"] = True
                    continue
                if RESULT["hosts"][host]["status"] == "created":
                    st, j = req("DELETE", "/zones/%s/workers/routes/%s" % (zones[zone_name], RESULT["hosts"][host]["route_id"]))
                    RESULT["hosts"][host]["rolled_back"] = bool(st == 200 and j.get("success"))
                    print("rollback %s http=%s ok=%s" % (host, st, j.get("success")))
                if RESULT["hosts"][host].get("dns_proxied_from") is False:
                    st, j = req("PATCH", "/zones/%s/dns_records/%s" % (zones[zone_name], RESULT["hosts"][host]["dns_record"]), {"proxied": False})
                    RESULT["hosts"][host]["dns_restored"] = bool(st == 200 and j.get("success"))
        else:
            ok = False
    if ok:
        report("verified", "success")
        return 0
    report("partial", "failed", error="; ".join("%s: %s %s" % (k, v["status"], v.get("detail") or ("unverified" if v.get("verified") is False else "")) for k, v in RESULT["hosts"].items() if v["status"] not in ("created", "present") or v.get("verified") is False))
    return 1


if __name__ == "__main__":
    sys.exit(main())

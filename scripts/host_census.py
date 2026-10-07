#!/usr/bin/env python3
# HOST-CENSUS-1 (2026-10-07, pillar core, agent_issues 2077 follow-up)
"""Census of every public hostname the Cloudflare account serves, run from the GitHub runner.

WHY
  On 2026-10-07 a session probed every hostname by hand and found what no loop had: ipatent.me (the flagship's own
  domain) has no address record at all, qwave.tech and www.qwave.tech serve a Cloudflare Registrar parking page,
  empoweringchange.today's zone is paused so TLS fails, and qwav.net / qwav.uk serve duplicate pages. Probes only ran
  for hosts that already had an issue, so a host nobody had filed on could stay broken forever.

WHAT
  Every CENSUS_EVERY_H hours (called from scripts/remediation_consumer.py, which qnfo-cloud-ops dispatches hourly):
  1. Enumerate hosts from the account itself, read-only: each zone's apex, its A/AAAA/CNAME names, the custom domains of
     its Pages projects and Workers, and the literal host of each Workers route. A zone that is paused, or whose apex
     has no address record, is a finding without any request.
  2. GET https://<host>/ from this runner (outside the account, so not the issue-1190 same-account artifact), redirects
     followed up to 5 hops, at most 64 KiB read. The body never leaves the probe (this repository is public): only a
     verdict token is kept.
  3. Classify: ok (2xx, 3xx that ends in a 2xx/3xx/401/403, or 410 Gone on purpose), or broken with a reason token
     (status=5xx, status=404, parked, tls, dns, timeout, error:<type>).
  4. Write metric public_hosts_broken, one cloud_ops_events row host-census-<day> with every host's token, and keep one
     open agent_issue HOST-CENSUS-BROKEN-1 listing the broken hosts (filed once, rewritten when the set changes, closed
     with evidence when the set is empty).
NEVER
  writes DNS, routes, rules or zone settings; sends a credential to a probed host; follows a redirect to http.
"""

import concurrent.futures
import json
import re
import ssl
import socket
import time
import urllib.error
import urllib.request

CENSUS_EVERY_H = 6
CENSUS_TIMEOUT_S = 15
CENSUS_READ_CAP = 64 * 1024
CENSUS_MAX_HOSTS = 200
CENSUS_WORKERS = 16
ISSUE_PREFIX = "HOST-CENSUS-BROKEN-1"
METRIC = "public_hosts_broken"
UA = "qnfo-host-census/1 (+https://fleet.qnfo.org)"
# Registrar parking / placeholder pages: the host answers, but nobody's site is there.
PARKED_RE = re.compile(rb"<title>\s*(Cloudflare Registrar|Domain parked|This domain is parked)", re.I)
# Names that are mail or verification plumbing, never a site.
SKIP_NAME_RE = re.compile(r"(^_)|(^|\.)(_domainkey|_dmarc|cf-bounce|mail|smtp|imap|pop|mx|autodiscover|autoconfig)\.", re.I)


def classify(status, body, err):
    """One verdict token for one probe. 'ok' or a broken reason."""
    if err:
        return err
    if status is None:
        return "error:no-status"
    if body and PARKED_RE.search(body):
        return "parked"
    if status == 410:
        return "ok"  # retired on purpose (qnfo-lifecycle RETIRED-HOSTS-1)
    if 200 <= status < 400 or status in (401, 403):
        return "ok"
    return "status=%d" % status


def is_broken(token):
    return token != "ok"


def _err_token(e):
    r = getattr(e, "reason", None)
    if isinstance(r, (ssl.SSLError, ssl.CertificateError)) or isinstance(e, (ssl.SSLError, ssl.CertificateError)):
        return "tls"
    if isinstance(r, socket.gaierror) or isinstance(e, socket.gaierror):
        return "dns"
    if isinstance(r, (socket.timeout, TimeoutError)) or isinstance(e, (socket.timeout, TimeoutError)):
        return "timeout"
    if isinstance(r, str) and r == "redirect-to-http":
        return "redirect-to-http"
    return "error:%s" % type(r if isinstance(r, BaseException) else e).__name__


class _HttpsOnlyRedirect(urllib.request.HTTPRedirectHandler):
    max_redirections = 5

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not str(newurl).lower().startswith("https://"):
            raise urllib.error.URLError("redirect-to-http")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_HttpsOnlyRedirect)


def probe(host, opener=None):
    req = urllib.request.Request("https://%s/" % host, method="GET", headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with (opener or _OPENER).open(req, timeout=CENSUS_TIMEOUT_S) as r:
            return classify(r.status, r.read(CENSUS_READ_CAP), None)
    except urllib.error.HTTPError as e:
        try:
            body = e.read(CENSUS_READ_CAP)
        except Exception:  # noqa: BLE001
            body = b""
        return classify(e.code, body, None)
    except Exception as e:  # noqa: BLE001 - the failure is the observation
        return classify(None, b"", _err_token(e))


def host_of_route(pattern):
    """'papers.qnfo.org/*' -> 'papers.qnfo.org'; wildcard hosts and path-only routes are skipped."""
    h = str(pattern or "").split("/", 1)[0].strip().lower()
    if not h or "*" in h:
        return None
    return h


def enumerate_hosts(cf_get):
    """Read-only enumeration. cf_get(path) -> parsed Cloudflare API JSON. Returns (hosts, pre_findings)."""
    hosts, pre = set(), {}
    zones = (cf_get("/zones?per_page=50") or {}).get("result") or []
    for z in zones:
        name = z.get("name")
        if not name:
            continue
        if z.get("paused"):
            pre[name] = "zone-paused"
            continue
        recs = (cf_get("/zones/%s/dns_records?per_page=500" % z.get("id")) or {}).get("result") or []
        addr = [r for r in recs if r.get("type") in ("A", "AAAA", "CNAME")]
        names = {str(r.get("name", "")).lower() for r in addr}
        if name not in names:
            pre[name] = "no-address-record"
        for n in names:
            if n and "*" not in n and not SKIP_NAME_RE.search(n):
                hosts.add(n)
        for r in (cf_get("/zones/%s/workers/routes" % z.get("id")) or {}).get("result") or []:
            h = host_of_route(r.get("pattern"))
            if h:
                hosts.add(h)
    return hosts, pre


def census(cf_get, prober=None, now=None):
    hosts, pre = enumerate_hosts(cf_get)
    hosts = sorted(h for h in hosts if h not in pre)[:CENSUS_MAX_HOSTS]
    tokens = dict(pre)
    with concurrent.futures.ThreadPoolExecutor(max_workers=CENSUS_WORKERS) as ex:
        for h, t in zip(hosts, ex.map(prober or probe, hosts)):
            tokens[h] = t
    broken = {h: t for h, t in sorted(tokens.items()) if is_broken(t)}
    return {"at": now or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "hosts": len(tokens), "broken": broken, "tokens": tokens}


def due(d1):
    rows = d1("SELECT MAX(ts) AS t FROM cloud_ops_events WHERE kind = 'host-census'")
    t = rows[0].get("t") if rows else None
    if not t:
        return True
    rows = d1("SELECT CASE WHEN datetime(?1) <= datetime('now', ?2) THEN 1 ELSE 0 END AS due", [str(t).replace("T", " ").rstrip("Z")[:19], "-%d hours" % CENSUS_EVERY_H])
    return bool(rows and rows[0].get("due"))


def record(d1, res, verifier):
    day = res["at"][:10]
    n = len(res["broken"])
    d1("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'host-census', ?3, ?4, 'host-census', ?5)",
       ["host-census-" + day, res["at"], "host census: %d hosts, %d broken" % (res["hosts"], n),
        json.dumps({"tokens": res["tokens"], "broken": res["broken"], "verifier": verifier})[:20000], "ok" if n == 0 else "broken"])
    d1("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1", [METRIC, str(n), res["at"]])
    open_rows = d1("SELECT id, description FROM agent_issues WHERE status = 'open' AND title LIKE ?1", [ISSUE_PREFIX + ":%"])
    listing = "; ".join("%s=%s" % (h, t) for h, t in res["broken"].items())
    now_ms = int(time.time() * 1000)
    if n == 0:
        for r in open_rows:
            d1("UPDATE issue_triage SET close_evidence = ?1 WHERE issue_id = ?2",
               ["HOST-CENSUS-1 %s: all %d public hosts answered ok from the GitHub runner (%s)" % (res["at"], res["hosts"], verifier), r["id"]])
            d1("UPDATE agent_issues SET status = 'closed', close_channel = 'auto-recovery', updated_at = ?1 WHERE id = ?2", [now_ms, r["id"]])
        return {"closed": len(open_rows)}
    title = "%s: %d public hostname%s broken (%s)" % (ISSUE_PREFIX, n, "" if n == 1 else "s", ", ".join(list(res["broken"])[:6]) + ("..." if n > 6 else ""))
    desc = ("Filed by scripts/host_census.py (HOST-CENSUS-1) from the GitHub runner at %s. Broken hosts and their tokens: %s. "
            "Tokens: zone-paused (zone setting), no-address-record (apex has no A/AAAA/CNAME), parked (Registrar placeholder), tls, dns, "
            "timeout, status=<code>. Full census: qnfo-audit cloud_ops_events id host-census-%s. Closes itself when every host answers ok. "
            "Domain and DNS fixes are listed in agent_issues 2077 (SPARE-DOMAINS-VIA-DEPLOY-1).") % (res["at"], listing, res["at"][:10])
    if open_rows:
        d1("UPDATE agent_issues SET title = ?1, description = ?2, updated_at = ?3 WHERE id = ?4", [title, desc, now_ms, open_rows[0]["id"]])
        return {"updated": open_rows[0]["id"]}
    d1("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
       "SELECT ?1, ?2, 'host-census', 'reliability', 'high', 'open', ?3, ?3 WHERE NOT EXISTS "
       "(SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE ?4)", [title, desc, now_ms, ISSUE_PREFIX + ":%"])
    return {"filed": True}


def run(d1, cf_get, verifier):
    if not due(d1):
        return {"skipped": "ran within %dh" % CENSUS_EVERY_H}
    res = census(cf_get)
    out = record(d1, res, verifier)
    out.update({"hosts": res["hosts"], "broken": len(res["broken"])})
    return out


def selftest():
    cases = [
        ((200, b"<html><title>QNFO</title>", None), "ok"),
        ((200, b"<html><head><title>Cloudflare Registrar</title>", None), "parked"),
        ((301, b"", None), "ok"), ((403, b"", None), "ok"), ((410, b"", None), "ok"),
        ((404, b"", None), "status=404"), ((522, b"", None), "status=522"),
        ((None, b"", "tls"), "tls"), ((None, b"", None), "error:no-status"),
    ]
    for (st, body, err), want in cases:
        got = classify(st, body, err)
        if got != want:
            return {"ok": False, "case": [st, err], "got": got, "want": want}
    for pat, want in (("papers.qnfo.org/*", "papers.qnfo.org"), ("qnfo.org/ipatent*", "qnfo.org"), ("*.qnfo.org/*", None), ("", None)):
        if host_of_route(pat) != want:
            return {"ok": False, "route": pat}
    fake = {
        "/zones?per_page=50": {"result": [{"id": "z1", "name": "a.org"}, {"id": "z2", "name": "parked.me"}, {"id": "z3", "name": "p.today", "paused": True}]},
        "/zones/z1/dns_records?per_page=500": {"result": [{"type": "CNAME", "name": "a.org"}, {"type": "AAAA", "name": "www.a.org"}, {"type": "TXT", "name": "a.org"}, {"type": "MX", "name": "cf-bounce.a.org"}, {"type": "CNAME", "name": "_x.a.org"}]},
        "/zones/z1/workers/routes": {"result": [{"pattern": "api.a.org/*"}, {"pattern": "*.a.org/*"}]},
        "/zones/z2/dns_records?per_page=500": {"result": []},
        "/zones/z2/workers/routes": {"result": []},
    }
    hosts, pre = enumerate_hosts(lambda p: fake.get(p))
    if hosts != {"a.org", "www.a.org", "api.a.org"} or pre != {"parked.me": "no-address-record", "p.today": "zone-paused"}:
        return {"ok": False, "enumerate": [sorted(hosts), pre]}
    res = census(lambda p: fake.get(p), prober=lambda h: "ok" if h != "www.a.org" else "status=522", now="2026-10-07T00:00:00Z")
    if res["broken"] != {"p.today": "zone-paused", "parked.me": "no-address-record", "www.a.org": "status=522"} or res["hosts"] != 5:
        return {"ok": False, "census": res}
    return {"ok": True}


if __name__ == "__main__":
    print(json.dumps(selftest()))

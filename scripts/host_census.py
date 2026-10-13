#!/usr/bin/env python3
# HOST-CENSUS-1 (2026-10-07, pillar core, agent_issues 2077 follow-up); HOST-CENSUS-FP-1 (2026-10-13, agent_issues 2130)
"""Census of every public hostname the Cloudflare account serves, run from the GitHub runner.

WHY
  On 2026-10-07 a session probed every hostname by hand and found what no loop had: ipatent.me (the flagship's own
  domain) has no address record at all, qwave.tech and www.qwave.tech serve a Cloudflare Registrar parking page,
  empoweringchange.today's zone is paused so TLS fails, and qwav.net / qwav.uk serve duplicate pages. Probes only ran
  for hosts that already had an issue, so a host nobody had filed on could stay broken forever.
  HOST-CENSUS-FP-1 (2026-10-13): the 03:40Z census filed ipatent.qnfo.org, qnfo-system-health.qnfo.org, www.q-wave.tech and
  www.qwav.org as "timeout" after one 15 s attempt; all four had answered on 2026-10-12 and answered again within two hours
  (200, 410, 301 -> 200, 301 -> 200). The other four entries were two domains whose registrations the owner let lapse
  (human_actions 65 and 73, DEFAULT-ADOPTED-1: the domains lapse and the fleet does not retry them), so HOST-CENSUS-BROKEN-1
  could never close on a true measurement of what the fleet can fix.

WHAT
  Every CENSUS_EVERY_H hours (called from scripts/remediation_consumer.py, which qnfo-cloud-ops dispatches hourly):
  1. Enumerate hosts from the account itself, read-only: each zone's apex, its A/AAAA/CNAME names, the custom domains of
     its Pages projects and Workers, and the literal host of each Workers route. A zone that is paused, or whose apex
     has no address record, is a finding without any request.
  2. GET https://<host>/ from this runner (outside the account, so not the issue-1190 same-account artifact), redirects
     followed up to 5 hops and the final target judged, at most 64 KiB read. The body never leaves the probe (this
     repository is public): only a verdict token is kept. A broken answer is retried CENSUS_RETRIES times, CENSUS_RETRY_PAUSE_S
     apart, with the longer CENSUS_RETRY_TIMEOUT_S; a host is broken only when every attempt is (a real outage still is).
  3. Classify: ok (2xx, 3xx that ends in a 2xx/3xx/401/403, or 410 Gone on purpose: the retired hosts of qnfo-lifecycle
     RETIRED-HOSTS-1), or broken with a reason token (status=5xx, status=404, parked, tls, dns, timeout, redirect-loop,
     error:<type>).
  4. Owner-bound: a broken host whose zone (or the host itself) is named in the title of an IDENTITY-BOUND human_actions
     card that is open or resolved on its default (DEFAULT-ADOPTED-1), AND whose registration the registrar reports lapsed
     or payment-expired, is listed apart with the card ids and not counted. When the registrar cannot be read, only the
     tokens a lapsed registration produces (dns, tls, parked, zone-paused, no-address-record) qualify. A card whose domain
     the registrar reports active does not hide anything: the host counts as fleet-fixable breakage.
  5. Write metric public_hosts_broken (fleet-fixable hosts only), one cloud_ops_events row host-census-<day> with every
     host's token, the owner-bound list and the hosts that recovered on a retry, and keep one open agent_issue
     HOST-CENSUS-BROKEN-1 listing the broken hosts (filed once, rewritten when the set changes, closed with evidence when
     the set is empty).
NEVER
  writes DNS, routes, rules or zone settings; sends a credential to a probed host; follows a redirect to http; keeps any
  field of a registrar record other than the lapse verdict (the record carries contact data and this run log is public).
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
# HOST-CENSUS-FP-1: one attempt is not a measurement. A broken answer is asked again, with a longer timeout.
CENSUS_RETRIES = 2
CENSUS_RETRY_TIMEOUT_S = 30
CENSUS_RETRY_PAUSE_S = 5
CENSUS_READ_CAP = 64 * 1024
CENSUS_MAX_HOSTS = 200
# A census that saw fewer hosts than this read too little of the account (token scope, API error) to prove anything.
CENSUS_MIN_HOSTS = 30
CENSUS_WORKERS = 16
CENSUS_META_CAP = 20000
ISSUE_PREFIX = "HOST-CENSUS-BROKEN-1"
METRIC = "public_hosts_broken"
UA = "qnfo-host-census/1 (+https://fleet.qnfo.org)"
# Registrar parking / placeholder pages: the host answers, but nobody's site is there.
PARKED_RE = re.compile(rb"<title>\s*(Cloudflare Registrar|Domain parked|This domain is parked)", re.I)
# Names that are mail or verification plumbing, never a site.
SKIP_NAME_RE = re.compile(r"(^_)|(^|\.)(_domainkey|_dmarc|cf-bounce|mail|smtp|imap|pop|mx|autodiscover|autoconfig)\.", re.I)
# A redirect status that reaches the caller was not followed: a loop, more than 5 hops, or no Location header.
REDIRECT_CODES = (301, 302, 303, 307, 308)
# The tokens a lapsed or unpaid registration produces; used only when the registrar itself cannot be read.
REGISTRATION_TOKENS = ("dns", "tls", "parked", "zone-paused", "no-address-record")
# IDENTITY-BOUND owner cards that still stand: open, or resolved on their stated default (DEFAULT-ADOPTED-1).
OWNER_CARD_SQL = ("SELECT id, title FROM human_actions WHERE why LIKE '%IDENTITY-BOUND:%' AND (status = 'open' OR "
                  "(status = 'resolved' AND resolution LIKE 'DEFAULT-ADOPTED%')) ORDER BY id")


# Hosts whose root is intentionally empty: the service answers at one path (an MCP endpoint answers 401 without a key,
# which classify() reads as alive). A host not listed here is probed at "/".
PROBE_PATHS = {
    "mcp.q08.org": "/mcp",
    # HOST-CENSUS-BROKEN-1 (agent_issues 2130, 2026-10-12): these workers answer 404 JSON at "/" by design and 200 at /health.
    "lifecycle.qnfo.org": "/health",
    "research-exec.qnfo.org": "/health",
}


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


def probe(host, timeout=CENSUS_TIMEOUT_S, opener=None):
    req = urllib.request.Request("https://%s%s" % (host, PROBE_PATHS.get(host, "/")), method="GET", headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with (opener or _OPENER).open(req, timeout=timeout) as r:
            return classify(r.status, r.read(CENSUS_READ_CAP), None)
    except urllib.error.HTTPError as e:
        if e.code in REDIRECT_CODES:
            return "redirect-loop"  # the opener follows redirects, so one that reaches here never got to a final answer
        try:
            body = e.read(CENSUS_READ_CAP)
        except Exception:  # noqa: BLE001
            body = b""
        return classify(e.code, body, None)
    except Exception as e:  # noqa: BLE001 - the failure is the observation
        return classify(None, b"", _err_token(e))


def probe_with_retry(host, prober=None, sleep=None):
    """-> (token, failed_attempt_tokens). Broken only when every attempt is; the last attempt's token is the verdict."""
    p, sleep = prober or probe, sleep or time.sleep
    failed = []
    token = p(host, CENSUS_TIMEOUT_S)
    for _ in range(CENSUS_RETRIES):
        if not is_broken(token):
            break
        failed.append(token)
        sleep(CENSUS_RETRY_PAUSE_S)
        token = p(host, CENSUS_RETRY_TIMEOUT_S)
    return token, failed


def host_of_route(pattern):
    """'papers.qnfo.org/*' -> 'papers.qnfo.org'; wildcard hosts and path-only routes are skipped."""
    h = str(pattern or "").split("/", 1)[0].strip().lower()
    if not h or "*" in h:
        return None
    return h


def enumerate_hosts(cf_get, zones_out=None):
    """Read-only enumeration. cf_get(path) -> parsed Cloudflare API JSON. Returns (hosts, pre_findings).
    zones_out, when a dict, receives {zone name: account id} for every zone read."""
    hosts, pre = set(), {}
    zones = (cf_get("/zones?per_page=50") or {}).get("result") or []
    for z in zones:
        name = z.get("name")
        if not name:
            continue
        if zones_out is not None:
            zones_out[name] = (z.get("account") or {}).get("id")
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


def zone_of(host, zones):
    """The longest zone name the host is, or is under; None when no zone of the account holds it."""
    best = None
    for z in zones:
        if (host == z or host.endswith("." + z)) and (best is None or len(z) > len(best)):
            best = z
    return best


def registration_state(cf_get, account_id, zone):
    """'lapsed' (the name is unregistered), 'expired' (payment expired, in grace or parked), 'active', or None when the
    registrar cannot be read (token scope, a zone registered elsewhere that the endpoint refuses, an API error). Only this
    verdict leaves the function: the record carries contact data and the run log is public."""
    if not account_id or not zone:
        return None
    try:
        j = cf_get("/accounts/%s/registrar/domains/%s" % (account_id, zone)) or {}
    except Exception:  # noqa: BLE001 - unreadable is a verdict of its own
        return None
    if not isinstance(j, dict) or j.get("success") is False:
        return None
    r = j.get("result")
    if not isinstance(r, dict) or not r:
        return None
    if r.get("available") is True:
        return "lapsed"
    suspension = (r.get("policies") or {}).get("suspension") or {}
    status = str(r.get("last_known_status") or "")
    if suspension.get("payment_expired") is True or status.lower().startswith("expired") or status in ("pendingDelete", "redemptionPeriod"):
        return "expired"
    return "active"


def names_host(title, name):
    """True when the card title names this exact hostname (q-wave.tech is not qwave.tech, qnfo.org is not ipatent.qnfo.org)."""
    return bool(name) and re.search(r"(?<![A-Za-z0-9.-])%s(?![A-Za-z0-9-]|\.[A-Za-z0-9])" % re.escape(name), str(title or ""), re.I) is not None


def owner_cards(d1):
    return [{"id": r.get("id"), "title": r.get("title") or ""} for r in (d1(OWNER_CARD_SQL) or [])]


def split_owner_bound(broken, zones, cards, cf_get):
    """broken {host: token} -> (fleet-fixable {host: token}, owner-bound {host: {token, why, cards}}, hints {host: text})."""
    fleet, owner, hints, reg = {}, {}, {}, {}
    for h, t in sorted(broken.items()):
        z = zone_of(h, zones) or h
        ids = sorted({c["id"] for c in (cards or []) if names_host(c["title"], h) or names_host(c["title"], z)})
        if z not in reg:
            reg[z] = registration_state(cf_get, zones.get(z), z)
        state = reg[z]
        if ids and state in ("lapsed", "expired"):
            owner[h] = {"token": t, "why": "registration-%s" % state, "cards": ids}
        elif ids and state is None and t in REGISTRATION_TOKENS:
            owner[h] = {"token": t, "why": "registrar-unreadable", "cards": ids}
        else:
            fleet[h] = t
            if state in ("lapsed", "expired") and not ids:
                hints[h] = "registration %s and no IDENTITY-BOUND owner card names %s: file one" % (state, z)
            elif ids and state == "active":
                hints[h] = "owner card %s names %s but the registrar reports it active: a fleet fault" % (",".join(str(i) for i in ids), z)
    return fleet, owner, hints


def census(cf_get, prober=None, now=None, cards=None, sleep=None):
    zones = {}
    hosts, pre = enumerate_hosts(cf_get, zones)
    hosts = sorted(h for h in hosts if h not in pre)[:CENSUS_MAX_HOSTS]
    tokens, retried = dict(pre), {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=CENSUS_WORKERS) as ex:
        for h, (t, failed) in zip(hosts, ex.map(lambda x: probe_with_retry(x, prober, sleep), hosts)):
            tokens[h] = t
            if failed:
                retried[h] = failed
    all_broken = {h: t for h, t in sorted(tokens.items()) if is_broken(t)}
    broken, owner_bound, hints = split_owner_bound(all_broken, zones, cards, cf_get)
    recovered = {h: f for h, f in sorted(retried.items()) if not is_broken(tokens[h])}
    return {"at": now or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "hosts": len(tokens), "broken": broken,
            "owner_bound": owner_bound, "hints": hints, "recovered": recovered, "tokens": tokens}


def due(d1):
    rows = d1("SELECT MAX(ts) AS t FROM cloud_ops_events WHERE kind = 'host-census'")
    t = rows[0].get("t") if rows else None
    if not t:
        return True
    rows = d1("SELECT CASE WHEN datetime(?1) <= datetime('now', ?2) THEN 1 ELSE 0 END AS due", [str(t).replace("T", " ").rstrip("Z")[:19], "-%d hours" % CENSUS_EVERY_H])
    return bool(rows and rows[0].get("due"))


def _owner_listing(owner_bound):
    return "; ".join("%s=%s (%s, human_actions %s)" % (h, o["token"], o["why"], ",".join(str(i) for i in o["cards"])) for h, o in owner_bound.items())


def _meta(res, verifier):
    """The census row's meta as JSON that always parses: past the cap the ok tokens go first, never a cut mid-string."""
    m = {"tokens": res["tokens"], "broken": res["broken"], "owner_bound": res.get("owner_bound") or {}, "hints": res.get("hints") or {},
         "recovered": res.get("recovered") or {}, "retries": CENSUS_RETRIES, "retry_timeout_s": CENSUS_RETRY_TIMEOUT_S, "verifier": verifier}
    s = json.dumps(m)
    if len(s) > CENSUS_META_CAP:
        m["tokens"] = {h: t for h, t in res["tokens"].items() if is_broken(t)}
        m["tokens_ok_omitted"] = sum(1 for t in res["tokens"].values() if not is_broken(t))
        s = json.dumps(m)
    return s


def record(d1, res, verifier):
    day = res["at"][:10]
    n = len(res["broken"])
    owner_bound = res.get("owner_bound") or {}
    d1("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'host-census', ?3, ?4, 'host-census', ?5)",
       ["host-census-" + day, res["at"], "host census: %d hosts, %d broken, %d owner-bound" % (res["hosts"], n, len(owner_bound)),
        _meta(res, verifier), "ok" if n == 0 else "broken"])
    d1("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3, state = 'MEASURED' WHERE metric = ?1", [METRIC, str(n), res["at"]])
    open_rows = d1("SELECT id, description FROM agent_issues WHERE status = 'open' AND title LIKE ?1", [ISSUE_PREFIX + ":%"])
    listing = "; ".join("%s=%s%s" % (h, t, " (%s)" % res["hints"][h] if h in (res.get("hints") or {}) else "") for h, t in res["broken"].items())
    owner_txt = _owner_listing(owner_bound)
    now_ms = int(time.time() * 1000)
    if n == 0 and res["hosts"] < CENSUS_MIN_HOSTS:
        d1("UPDATE cloud_ops_events SET status = 'degraded', text = text || ' (too few hosts to judge; nothing closed)' WHERE id = ?1", ["host-census-" + day])
        return {"degraded": res["hosts"]}
    if n == 0:
        for r in open_rows:
            d1("UPDATE issue_triage SET close_evidence = ?1 WHERE issue_id = ?2",
               ["HOST-CENSUS-1 %s: %d of %d public hosts answered ok from the GitHub runner (up to %d attempts per broken answer); "
                "owner-bound, not fleet-fixable: %s (%s)" % (res["at"], res["hosts"] - len(owner_bound), res["hosts"], 1 + CENSUS_RETRIES,
                                                            owner_txt or "none", verifier), r["id"]])
            d1("UPDATE agent_issues SET status = 'closed', close_channel = 'auto-recovery', updated_at = ?1 WHERE id = ?2", [now_ms, r["id"]])
        return {"closed": len(open_rows)}
    title = "%s: %d public hostname%s broken (%s)" % (ISSUE_PREFIX, n, "" if n == 1 else "s", ", ".join(list(res["broken"])[:6]) + ("..." if n > 6 else ""))
    desc = ("Filed by scripts/host_census.py (HOST-CENSUS-1) from the GitHub runner at %s. Broken hosts and their tokens (a probed "
            "host counts only after %d failed attempts, the retries with a %d s timeout): %s. Tokens: zone-paused (zone setting), no-address-record (apex has no "
            "A/AAAA/CNAME), parked (Registrar placeholder), tls, dns, timeout, redirect-loop, status=<code>. Owner-bound, not counted "
            "(a lapsed or unpaid registration with a standing IDENTITY-BOUND owner card): %s. Full census: qnfo-audit cloud_ops_events "
            "id host-census-%s. Closes itself when every fleet-fixable host answers ok. Domain and DNS fixes are listed in agent_issues "
            "2077 (SPARE-DOMAINS-VIA-DEPLOY-1).") % (res["at"], 1 + CENSUS_RETRIES, CENSUS_RETRY_TIMEOUT_S, listing, owner_txt or "none", res["at"][:10])
    if open_rows:
        d1("UPDATE agent_issues SET title = ?1, description = ?2, updated_at = ?3 WHERE id = ?4", [title, desc, now_ms, open_rows[0]["id"]])
        return {"updated": open_rows[0]["id"]}
    d1("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
       "SELECT ?1, ?2, 'host-census', 'reliability', 'high', 'open', ?3, ?3 WHERE NOT EXISTS "
       "(SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE ?4)", [title, desc, now_ms, ISSUE_PREFIX + ":%"])
    return {"filed": True}


def run(d1, cf_get, verifier, prober=None, sleep=None):
    if not due(d1):
        return {"skipped": "ran within %dh" % CENSUS_EVERY_H}
    try:
        cards, cards_error = owner_cards(d1), None
    except Exception as e:  # noqa: BLE001 - without cards nothing is owner-bound, so the census only reads stricter
        cards, cards_error = [], str(e)[:200]
    res = census(cf_get, prober=prober, cards=cards, sleep=sleep)
    out = record(d1, res, verifier)
    out.update({"hosts": res["hosts"], "broken": len(res["broken"]), "owner_bound": len(res["owner_bound"]), "recovered": len(res["recovered"])})
    if cards_error:
        out["owner_cards_error"] = cards_error
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
    if PROBE_PATHS.get("mcp.q08.org") != "/mcp" or PROBE_PATHS.get("lifecycle.qnfo.org") != "/health" or PROBE_PATHS.get("research-exec.qnfo.org") != "/health" or PROBE_PATHS.get("papers.qnfo.org", "/") != "/":
        return {"ok": False, "probe_paths": PROBE_PATHS}
    for pat, want in (("papers.qnfo.org/*", "papers.qnfo.org"), ("qnfo.org/ipatent*", "qnfo.org"), ("*.qnfo.org/*", None), ("", None)):
        if host_of_route(pat) != want:
            return {"ok": False, "route": pat}
    fake = {
        "/zones?per_page=50": {"result": [{"id": "z1", "name": "a.org", "account": {"id": "acc"}}, {"id": "z2", "name": "parked.me", "account": {"id": "acc"}}, {"id": "z3", "name": "p.today", "paused": True, "account": {"id": "acc"}}]},
        "/zones/z1/dns_records?per_page=500": {"result": [{"type": "CNAME", "name": "a.org"}, {"type": "AAAA", "name": "www.a.org"}, {"type": "TXT", "name": "a.org"}, {"type": "MX", "name": "cf-bounce.a.org"}, {"type": "CNAME", "name": "_x.a.org"}]},
        "/zones/z1/workers/routes": {"result": [{"pattern": "api.a.org/*"}, {"pattern": "*.a.org/*"}]},
        "/zones/z2/dns_records?per_page=500": {"result": []},
        "/zones/z2/workers/routes": {"result": []},
    }
    hosts, pre = enumerate_hosts(lambda p: fake.get(p))
    if hosts != {"a.org", "www.a.org", "api.a.org"} or pre != {"parked.me": "no-address-record", "p.today": "zone-paused"}:
        return {"ok": False, "enumerate": [sorted(hosts), pre]}
    no_sleep = lambda s: None  # noqa: E731
    res = census(lambda p: fake.get(p), prober=lambda h, t: "ok" if h != "www.a.org" else "status=522", now="2026-10-07T00:00:00Z", sleep=no_sleep)
    if res["broken"] != {"p.today": "zone-paused", "parked.me": "no-address-record", "www.a.org": "status=522"} or res["hosts"] != 5 or res["owner_bound"]:
        return {"ok": False, "census": res}
    # HOST-CENSUS-FP-1: a timeout that answers on the retry is ok (and recorded); one that never answers is still broken.
    seq = {"api.a.org": ["timeout", "ok"], "www.a.org": ["timeout", "timeout", "timeout"]}
    calls = []

    def flaky(h, t):
        calls.append((h, t))
        s = seq.get(h)
        return s.pop(0) if s else "ok"
    res = census(lambda p: fake.get(p), prober=flaky, now="2026-10-13T00:00:00Z", sleep=no_sleep)
    if res["tokens"].get("api.a.org") != "ok" or res["recovered"] != {"api.a.org": ["timeout"]} or res["broken"].get("www.a.org") != "timeout" \
            or sorted(t for h, t in calls if h == "www.a.org") != [CENSUS_TIMEOUT_S, CENSUS_RETRY_TIMEOUT_S, CENSUS_RETRY_TIMEOUT_S]:
        return {"ok": False, "retry": res, "calls": calls}
    # Owner-bound: a lapsed registration named by a standing card is listed apart; the same card on an active domain hides nothing.
    cards = [{"id": 65, "title": "Renew or let lapse three spare domains: parked.me (expired), p.today"}]
    fake_reg = dict(fake)
    fake_reg["/accounts/acc/registrar/domains/parked.me"] = {"success": True, "result": {"name": "parked.me", "available": True}}
    fake_reg["/accounts/acc/registrar/domains/p.today"] = {"success": True, "result": {"name": "p.today", "available": False, "last_known_status": "registrationActive", "policies": {"suspension": {"payment_expired": False}}}}
    res = census(lambda p: fake_reg.get(p), prober=lambda h, t: "ok", now="2026-10-13T00:00:00Z", cards=cards, sleep=no_sleep)
    if res["owner_bound"] != {"parked.me": {"token": "no-address-record", "why": "registration-lapsed", "cards": [65]}} or res["broken"] != {"p.today": "zone-paused"}:
        return {"ok": False, "owner_bound": res}
    return {"ok": True}


if __name__ == "__main__":
    print(json.dumps(selftest()))

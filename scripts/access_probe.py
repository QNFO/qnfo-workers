#!/usr/bin/env python3
"""ACCESS-PROBE-1 (agent_issue 1277, CF-ONE-ACCESS-NOT-DEPLOYED-1): read-only check of whether a
Cloudflare Access application fronts a hostname.

A hostname is ACCESS when an unauthenticated GET / (redirects NOT followed) returns a redirect to
*.cloudflareaccess.com or a /cdn-cgi/access/ login path, or a 401/403 carrying a CF Access marker.
Anything else that answers is NO_ACCESS; a network failure is ERROR (never counted as ACCESS).

This script makes no change anywhere, uses no credential, and sends one plain GET per hostname.
Which hostnames SHOULD be behind Access is an owner decision (docs/CF-ACCESS-ROLLOUT-1277.md): public
publication surfaces must stay open.

Usage:
  python3 scripts/access_probe.py HOST [HOST ...]            report only, exit 0
  python3 scripts/access_probe.py --require HOST [...] --   exit 1 if any REQUIRED host is not ACCESS
  python3 scripts/access_probe.py --json HOST [...]
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = "qnfo-access-probe/1 (read-only)"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def _is_access_redirect(location):
    """True only when the Location HOST is cloudflareaccess.com or a subdomain of it, or the PATH
    starts with /cdn-cgi/access/. A substring match would accept e.g. https://evil.example/?x=cloudflareaccess.com."""
    if not location:
        return False
    u = urllib.parse.urlsplit(location)
    host = (u.hostname or "").lower()
    if host == "cloudflareaccess.com" or host.endswith(".cloudflareaccess.com"):
        return True
    return u.path.lower().startswith("/cdn-cgi/access/")


def classify(status, headers, location):
    hdr = {k.lower(): v for k, v in headers.items()}
    if _is_access_redirect(location):
        return "ACCESS"
    if status in (401, 403) and any(k.startswith("cf-access") for k in hdr):
        return "ACCESS"
    return "NO_ACCESS"


def probe(host, timeout=10):
    url = "https://%s/" % host
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        r = opener.open(req, timeout=timeout)
        status, headers, location = r.status, dict(r.headers), r.headers.get("Location")
    except urllib.error.HTTPError as e:  # 3xx/4xx/5xx arrive here when redirects are refused
        status, headers, location = e.code, dict(e.headers), e.headers.get("Location")
    except Exception as e:  # network/TLS failure: unknown, never ACCESS
        return {"host": host, "verdict": "ERROR", "status": None, "detail": str(e)[:160]}
    return {"host": host, "verdict": classify(status, headers, location), "status": status,
            "location": location}


def main(argv):
    as_json = "--json" in argv
    required, hosts, in_req = [], [], False
    for a in argv:
        if a == "--json":
            continue
        if a == "--require":
            in_req = True
        elif a == "--":
            in_req = False
        elif in_req:
            required.append(a)
        else:
            hosts.append(a)
    results = [probe(h) for h in dict.fromkeys(hosts + required)]
    if as_json:
        print(json.dumps(results, indent=1))
    else:
        for r in results:
            print("%-28s %-9s status=%s %s" % (r["host"], r["verdict"], r.get("status"),
                                               r.get("location") or r.get("detail") or ""))
    bad = [r["host"] for r in results if r["host"] in required and r["verdict"] != "ACCESS"]
    if bad:
        print("REQUIRED hosts not behind Access: " + ", ".join(bad), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

#!/usr/bin/env python3
# HOST-CENSUS-FP-1 (2026-10-13, agent_issues 2130, pillar core): offline suite for scripts/host_census.py.
"""Each census rule has a case here, run with no network beyond a local HTTPS server on 127.0.0.1:
  1. retry: a broken answer is asked again (longer timeout, pause between); a host that never answers is still broken.
  2. redirects: the chain is followed and the final target judged; a loop is redirect-loop, an http hop redirect-to-http.
  3. intentional 410 (qnfo-lifecycle RETIRED-HOSTS-1) is ok; 5xx and a parked final page are not.
  4. owner-bound: a lapsed or unpaid registration named by a standing IDENTITY-BOUND card is listed apart and not counted;
     the same card on an active registration hides nothing; a lapsed registration with no card is counted with a hint.
  5. record(): the metric counts fleet-fixable hosts only, the issue lists owner-bound hosts apart, closes on an empty
     fleet-fixable set with the owner-bound hosts named in the evidence, and the meta always parses as JSON.
Run: python3 scripts/host_census_test.py (exit 1 on any failure). Wired into PR checks by scripts/host-census.test.mjs.
"""

import http.server
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import host_census as hc  # noqa: E402

FAILS = []


def check(cond, name, detail=None):
    if cond:
        print("PASS " + name)
    else:
        FAILS.append(name)
        print("FAIL " + name + ("" if detail is None else ": " + json.dumps(detail, default=str)[:600]))


NO_SLEEP = lambda s: None  # noqa: E731


# 1. retry ------------------------------------------------------------------------------------------------------------
def test_retry():
    calls, pauses = [], []

    def seq_prober(answers):
        def p(h, t):
            calls.append(t)
            return answers.pop(0)
        return p
    tok, failed = hc.probe_with_retry("x", seq_prober(["timeout", "ok"]), pauses.append)
    check(tok == "ok" and failed == ["timeout"], "retry: a timeout that answers on the second attempt is ok", [tok, failed])
    check(calls == [hc.CENSUS_TIMEOUT_S, hc.CENSUS_RETRY_TIMEOUT_S] and pauses == [hc.CENSUS_RETRY_PAUSE_S],
          "retry: the retry uses the longer timeout after a pause", [calls, pauses])
    check(hc.CENSUS_RETRY_TIMEOUT_S > hc.CENSUS_TIMEOUT_S and hc.CENSUS_RETRIES >= 1, "retry: constants retry at least once with a longer timeout")
    calls.clear()
    tok, failed = hc.probe_with_retry("x", seq_prober(["timeout", "timeout", "timeout", "ok"]), NO_SLEEP)
    check(tok == "timeout" and failed == ["timeout"] * hc.CENSUS_RETRIES and len(calls) == 1 + hc.CENSUS_RETRIES,
          "retry: a host that never answers is still broken after 1 + CENSUS_RETRIES attempts", [tok, failed, calls])
    calls.clear()
    tok, failed = hc.probe_with_retry("x", seq_prober(["ok"]), NO_SLEEP)
    check(tok == "ok" and failed == [] and len(calls) == 1, "retry: an ok host is asked once")
    tok, failed = hc.probe_with_retry("x", seq_prober(["status=522", "status=503", "status=502"]), NO_SLEEP)
    check(tok == "status=502" and failed == ["status=522", "status=503"], "retry: the verdict is the last attempt's token", [tok, failed])


# 2 and 3. probe() against a local HTTPS server ----------------------------------------------------------------------
class _H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        base = "https://%s" % self.headers.get("Host")
        routes = {
            "/chain": (301, base + "/chain2", b""), "/chain2": (302, base + "/final", b""), "/final": (200, None, b"<title>QNFO</title>"),
            "/loop": (301, base + "/loop", b""),
            "/nolocation": (301, None, b""),
            "/topark": (301, base + "/parked", b""), "/parked": (200, None, b"<html><head><title>Cloudflare Registrar</title>"),
            "/tohttp": (301, "http://%s/final" % self.headers.get("Host"), b""),
            "/todown": (308, base + "/down", b""), "/down": (503, None, b"down"),
            "/gone": (410, None, b"<title>Retired</title>"),
            "/missing": (404, None, b"{}"),
            "/key": (401, None, b""),
        }
        if self.path == "/slow":
            time.sleep(1.5)
            routes["/slow"] = (200, None, b"late")
        code, loc, body = routes.get(self.path, (404, None, b""))
        self.send_response(code)
        if loc:
            self.send_header("Location", loc)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _local_https():
    """-> (host, opener, cleanup) or None when openssl is absent. The certificate is trusted explicitly; verification stays on."""
    if not shutil.which("openssl"):
        return None
    d = tempfile.mkdtemp(prefix="hc-tls-")
    crt, key = os.path.join(d, "c.pem"), os.path.join(d, "k.pem")
    r = subprocess.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1",
                        "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "keyUsage=critical,digitalSignature,keyCertSign",
                        "-keyout", key, "-out", crt], capture_output=True)
    if r.returncode != 0:
        return None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _H)
    sctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    sctx.load_cert_chain(crt, key)
    srv.socket = sctx.wrap_socket(srv.socket, server_side=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    cctx = ssl.create_default_context(cafile=crt)
    if hasattr(ssl, "VERIFY_X509_STRICT"):
        cctx.verify_flags &= ~ssl.VERIFY_X509_STRICT  # a one-day self-signed test anchor; hostname and chain are still verified
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=cctx), hc._HttpsOnlyRedirect)

    def cleanup():
        srv.shutdown()
        shutil.rmtree(d, ignore_errors=True)
    return "127.0.0.1:%d" % srv.server_address[1], opener, cleanup


def test_probe_local():
    env = _local_https()
    if env is None:
        print("SKIP probe against a local HTTPS server: openssl absent")
        return
    host, opener, cleanup = env
    try:
        cases = [
            ("/chain", "ok", "redirects: a 301 -> 302 -> 200 chain is followed and the final 200 judged"),
            ("/loop", "redirect-loop", "redirects: a redirect loop is broken (redirect-loop), not a 3xx ok"),
            ("/nolocation", "redirect-loop", "redirects: a 301 with no Location never reaches a final answer"),
            ("/topark", "parked", "redirects: a redirect that ends on a Registrar parking page is parked"),
            ("/tohttp", "redirect-to-http", "redirects: a hop to http is refused"),
            ("/todown", "status=503", "redirects: a 308 to a 503 judges the final 503"),
            ("/gone", "ok", "retired: an intentional 410 Gone is ok"),
            ("/missing", "status=404", "status: 404 at the probed path is broken"),
            ("/key", "ok", "status: 401 (an endpoint that wants a key) is alive"),
        ]
        for path, want, name in cases:
            hc.PROBE_PATHS[host] = path
            got = hc.probe(host, 5, opener)
            check(got == want, name, {"path": path, "got": got})
        hc.PROBE_PATHS[host] = "/slow"
        got = hc.probe(host, 0.5, opener)
        check(got == "timeout", "timeout: the timeout argument reaches the request", got)
    finally:
        hc.PROBE_PATHS.pop(host, None)
        cleanup()


def test_probe_errors():
    class Raises:
        def __init__(self, exc):
            self.exc, self.timeouts = exc, []

        def open(self, req, timeout=None):
            self.timeouts.append(timeout)
            raise self.exc
    o = Raises(urllib.error.URLError(socket.timeout("timed out")))
    check(hc.probe("h.example", 7, o) == "timeout" and o.timeouts == [7], "errors: a socket timeout is timeout and the timeout is passed", o.timeouts)
    check(hc.probe("h.example", 5, Raises(urllib.error.URLError(socket.gaierror(-2, "Name or service not known")))) == "dns", "errors: NXDOMAIN is dns")
    check(hc.probe("h.example", 5, Raises(urllib.error.URLError(ssl.SSLError(1, "sslv3 alert handshake failure")))) == "tls", "errors: a handshake failure is tls")
    check(hc.probe("h.example", 5, Raises(urllib.error.HTTPError("https://h.example/", 301, "Moved", {}, None))) == "redirect-loop",
          "errors: an unfollowed 301 is redirect-loop")


# 4. owner-bound -------------------------------------------------------------------------------------------------------
REG = {
    "lapsed.me": {"success": True, "result": {"name": "lapsed.me", "available": True, "can_register": True}},
    "unpaid.today": {"success": True, "result": {"name": "unpaid.today", "available": False, "last_known_status": "registrationActive",
                                                 "policies": {"suspension": {"parked": False, "payment_expired": True}},
                                                 "registrant_contact": {"email": "someone@example.invalid", "phone": "+1.5550100"}}},
    "parked.tech": {"success": True, "result": {"name": "parked.tech", "available": False, "last_known_status": "expiredParked", "policies": {"suspension": {}}}},
    "paid.org": {"success": True, "result": {"name": "paid.org", "available": False, "last_known_status": "registrationActive",
                                             "policies": {"suspension": {"payment_expired": False}}}},
    "refused.net": {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}], "result": None},
}


def reg_get(path):
    if path.startswith("/accounts/acc/registrar/domains/"):
        name = path.rsplit("/", 1)[1]
        if name == "boom.org":
            raise RuntimeError("HTTP 403")
        return REG.get(name)
    return None


def test_registration_state():
    want = {"lapsed.me": "lapsed", "unpaid.today": "expired", "parked.tech": "expired", "paid.org": "active", "refused.net": None,
            "boom.org": None, "unknown.org": None}
    for zone, w in want.items():
        got = hc.registration_state(reg_get, "acc", zone)
        check(got == w, "registrar: %s reads %s" % (zone, w), got)
    check(hc.registration_state(reg_get, None, "lapsed.me") is None, "registrar: no account id reads unknown")
    out = json.dumps([hc.registration_state(reg_get, "acc", z) for z in REG])
    check("example.invalid" not in out and "5550100" not in out, "registrar: no contact field leaves registration_state")


def test_names_host():
    t65 = "Renew or let lapse three spare domains: ipatent.me (expired), q-wave.tech, empoweringchange.today"
    t73 = "ipatent.me does not resolve at the TLD (NXDOMAIN): renew or re-delegate the registration"
    cases = [(t65, "ipatent.me", True), (t65, "q-wave.tech", True), (t65, "qwave.tech", False), (t65, "empoweringchange.today", True),
             (t73, "ipatent.me", True), (t73, "ipatent.media", False), ("Verify qnfo.org and ipatent.qnfo.org", "qnfo.org", True),
             ("Verify ipatent.qnfo.org in Search Console", "qnfo.org", False), ("ipatent.media is new", "ipatent.me", False),
             ("see www.ipatent.me.", "ipatent.me", False), ("see www.ipatent.me.", "www.ipatent.me", True)]
    for title, name, want in cases:
        check(hc.names_host(title, name) == want, "names_host(%r, %r) is %s" % (title[:40], name, want))


def test_split_owner_bound():
    zones = {z: "acc" for z in ("lapsed.me", "unpaid.today", "paid.org", "refused.net", "nocard.tech", "parked.tech")}
    REG["nocard.tech"] = REG["lapsed.me"]
    cards = [{"id": 65, "title": "Renew or let lapse: lapsed.me, unpaid.today, paid.org"}, {"id": 73, "title": "lapsed.me does not resolve"},
             {"id": 80, "title": "refused.net renewal"}]
    broken = {"lapsed.me": "dns", "www.lapsed.me": "dns", "unpaid.today": "tls", "www.unpaid.today": "tls", "paid.org": "status=522",
              "refused.net": "tls", "www.refused.net": "timeout", "nocard.tech": "dns", "x.other.org": "timeout"}
    fleet, owner, hints = hc.split_owner_bound(broken, zones, cards, reg_get)
    check(owner.get("lapsed.me") == {"token": "dns", "why": "registration-lapsed", "cards": [65, 73]} and owner.get("www.lapsed.me", {}).get("cards") == [65, 73],
          "owner-bound: a dropped registration named by cards is listed apart, its www too", owner)
    check(owner.get("unpaid.today", {}).get("why") == "registration-expired" and "www.unpaid.today" in owner,
          "owner-bound: a payment-expired registration (TLS fails) is listed apart", owner)
    check(fleet.get("paid.org") == "status=522" and "registrar reports it active" in hints.get("paid.org", ""),
          "honest: a card on a domain the registrar reports active hides nothing", [fleet, hints])
    check(owner.get("refused.net", {}).get("why") == "registrar-unreadable" and fleet.get("www.refused.net") == "timeout",
          "fallback: registrar unreadable, only registration tokens (tls) are owner-bound; a timeout still counts", [owner, fleet])
    check(fleet.get("nocard.tech") == "dns" and "no IDENTITY-BOUND owner card" in hints.get("nocard.tech", ""),
          "honest: a lapsed registration with no owner card is counted, with a hint to file one", [fleet, hints])
    check(fleet.get("x.other.org") == "timeout", "a host outside every zone and card is counted")
    fleet2, owner2, _ = hc.split_owner_bound(broken, zones, [], reg_get)
    check(owner2 == {} and fleet2 == broken, "no cards: nothing is owner-bound")
    fleet3, owner3, _ = hc.split_owner_bound(broken, zones, [{"id": 9, "title": "Something else entirely"}], reg_get)
    check(owner3 == {}, "a card that names no host hides nothing")


# 5. census + record + run ----------------------------------------------------------------------------------------------
FAKE = {
    "/zones?per_page=50": {"result": [{"id": "z1", "name": "a.org", "account": {"id": "acc"}}, {"id": "z2", "name": "lapsed.me", "account": {"id": "acc"}},
                                      {"id": "z3", "name": "unpaid.today", "account": {"id": "acc"}}]},
    "/zones/z1/dns_records?per_page=500": {"result": [{"type": "CNAME", "name": "a.org"}, {"type": "AAAA", "name": "www.a.org"}]},
    "/zones/z1/workers/routes": {"result": [{"pattern": "api.a.org/*"}, {"pattern": "gone.a.org/*"}]},
    "/zones/z2/dns_records?per_page=500": {"result": [{"type": "AAAA", "name": "lapsed.me"}, {"type": "AAAA", "name": "www.lapsed.me"}]},
    "/zones/z2/workers/routes": {"result": []},
    "/zones/z3/dns_records?per_page=500": {"result": [{"type": "CNAME", "name": "unpaid.today"}]},
    "/zones/z3/workers/routes": {"result": []},
}


def fake_cf(path):
    return reg_get(path) if path.startswith("/accounts/") else FAKE.get(path)


CARDS = [{"id": 65, "title": "Renew or let lapse three spare domains: lapsed.me (expired), unpaid.today"}]


class FakeD1:
    def __init__(self, open_issue=True, last_census=None, cards=CARDS, cards_raise=False):
        self.calls, self.open_issue, self.last_census, self.cards, self.cards_raise = [], open_issue, last_census, cards, cards_raise

    def __call__(self, sql, params=None):
        self.calls.append((sql, list(params or [])))
        if sql.startswith("SELECT MAX(ts)"):
            return [{"t": self.last_census}]
        if sql == hc.OWNER_CARD_SQL:
            if self.cards_raise:
                raise RuntimeError("no such table: human_actions")
            return list(self.cards)
        if sql.startswith("SELECT id, description FROM agent_issues"):
            return [{"id": 2130, "description": "old"}] if self.open_issue else []
        return []

    def find(self, prefix):
        return [p for s, p in self.calls if s.startswith(prefix)]


def _pad(res, n):
    for i in range(n):
        res["tokens"]["h%03d.a.org" % i] = "ok"
    res["hosts"] = len(res["tokens"])
    return res


def test_census_and_record():
    answers = {"a.org": ["ok"], "www.a.org": ["timeout", "ok"], "api.a.org": ["status=522"] * 3, "gone.a.org": ["ok"],
               "lapsed.me": ["dns"] * 3, "www.lapsed.me": ["dns"] * 3, "unpaid.today": ["tls"] * 3}
    res = hc.census(fake_cf, prober=lambda h, t: answers[h].pop(0), now="2026-10-13T06:00:00Z", cards=CARDS, sleep=NO_SLEEP)
    check(res["broken"] == {"api.a.org": "status=522"}, "census: only the fleet-fixable host is broken", res["broken"])
    check(set(res["owner_bound"]) == {"lapsed.me", "www.lapsed.me", "unpaid.today"} and all(o["cards"] == [65] for o in res["owner_bound"].values()),
          "census: the lapsed and unpaid registrations are owner-bound with card 65", res["owner_bound"])
    check(res["recovered"] == {"www.a.org": ["timeout"]} and res["tokens"]["www.a.org"] == "ok", "census: the transient timeout recovered and is recorded", res["recovered"])

    d1 = FakeD1()
    out = hc.record(d1, _pad(res, 40), "test@sha")
    metric = d1.find("UPDATE metric_registry")
    desc = d1.find("UPDATE agent_issues SET title")
    meta = json.loads(d1.find("INSERT OR REPLACE INTO cloud_ops_events")[0][3])
    check(out == {"updated": 2130} and metric and metric[0][1] == "1", "record: the metric counts the one fleet-fixable host", [out, metric])
    check(desc and desc[0][0].startswith("HOST-CENSUS-BROKEN-1: 1 public hostname broken (api.a.org)") and "lapsed.me" not in desc[0][0],
          "record: the title names only fleet-fixable hosts", desc and desc[0][0])
    check(desc and "Owner-bound, not counted" in desc[0][1] and "lapsed.me=dns (registration-lapsed, human_actions 65)" in desc[0][1],
          "record: the description lists owner-bound hosts apart with the card id", desc and desc[0][1])
    check(meta.get("owner_bound", {}).get("unpaid.today", {}).get("why") == "registration-expired" and meta.get("retries") == hc.CENSUS_RETRIES
          and meta.get("recovered") == {"www.a.org": ["timeout"]}, "record: meta carries owner_bound, retries and recovered", meta)

    # Close: no fleet-fixable host left; the owner-bound hosts are named in the evidence.
    res2 = dict(res, broken={})
    d1 = FakeD1()
    out = hc.record(d1, _pad(res2, 40), "test@sha")
    ev = d1.find("UPDATE issue_triage SET close_evidence")
    closed = d1.find("UPDATE agent_issues SET status = 'closed'")
    check(out == {"closed": 1} and closed and ev and "owner-bound, not fleet-fixable: " in ev[0][0] and "human_actions 65" in ev[0][0]
          and d1.find("UPDATE metric_registry")[0][1] == "0", "record: an empty fleet-fixable set closes the issue, owner-bound hosts named", [out, ev])
    # Degraded: too few hosts closes nothing.
    small = dict(res2, tokens={"a.org": "ok"}, hosts=1)
    d1 = FakeD1()
    out = hc.record(d1, small, "test@sha")
    check(out == {"degraded": 1} and not d1.find("UPDATE agent_issues SET status = 'closed'"), "record: a census of too few hosts closes nothing", out)
    # Meta past the cap still parses.
    big = dict(res, tokens=dict(res["tokens"]))
    for i in range(3000):
        big["tokens"]["ok-host-%05d.example.org" % i] = "ok"
    d1 = FakeD1()
    hc.record(d1, big, "test@sha")
    raw = d1.find("INSERT OR REPLACE INTO cloud_ops_events")[0][3]
    try:
        m = json.loads(raw)
        good = m.get("tokens_ok_omitted", 0) >= 3000 and m["tokens"].get("api.a.org") == "status=522" and "owner_bound" in m
    except ValueError:
        good = False
    check(good and len(raw) <= hc.CENSUS_META_CAP, "record: meta past the cap drops ok tokens and still parses", len(raw))


def test_run():
    answers = {"a.org": "ok", "www.a.org": "ok", "api.a.org": "ok", "gone.a.org": "ok", "lapsed.me": "dns", "www.lapsed.me": "dns", "unpaid.today": "tls"}
    prober = lambda h, t: answers[h]  # noqa: E731
    saved_min = hc.CENSUS_MIN_HOSTS
    hc.CENSUS_MIN_HOSTS = 3
    try:
        d1 = FakeD1()
        out = hc.run(d1, fake_cf, "test@sha", prober=prober, sleep=NO_SLEEP)
        check(out.get("closed") == 1 and out.get("owner_bound") == 3 and out.get("broken") == 0,
              "run: with the cards read from D1, only owner-bound hosts remain and the issue closes", out)
        d1 = FakeD1(cards_raise=True)
        out = hc.run(d1, fake_cf, "test@sha", prober=prober, sleep=NO_SLEEP)
        check(out.get("broken") == 3 and out.get("owner_bound") == 0 and "owner_cards_error" in out,
              "run: when the cards cannot be read nothing is owner-bound (stricter, never looser)", out)
        d1 = FakeD1(last_census="2999-01-01T00:00:00Z")
        out = hc.run(d1, fake_cf, "test@sha", prober=prober, sleep=NO_SLEEP)
        check("skipped" in out, "run: a census within CENSUS_EVERY_H is skipped", out)
    finally:
        hc.CENSUS_MIN_HOSTS = saved_min


def main():
    sel = hc.selftest()
    check(sel.get("ok") is True, "host_census.selftest() is green", sel)
    for t in (test_retry, test_probe_local, test_probe_errors, test_registration_state, test_names_host, test_split_owner_bound,
              test_census_and_record, test_run):
        try:
            t()
        except Exception as e:  # noqa: BLE001
            check(False, t.__name__ + " raised", repr(e))
    print(json.dumps({"ok": not FAILS, "failed": FAILS}))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())

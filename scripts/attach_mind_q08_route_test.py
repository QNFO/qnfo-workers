"""ATTACH-MIND-LOCK-1 offline suite for scripts/attach-mind-q08-route.py. The script runs on every push of itself (attach-mind-q08-route.yml) with the repository Cloudflare token, so
what a run WRITES is the property under test. It runs the real main() against a fake Cloudflare API and counts writes:
  * live state (script found, route and record exist, health and entries answer): no write at all, the run verifies and reports ok;
  * fresh route and record, verification passes: exactly one POST route and one POST record;
  * verification fails after a fresh create: both are deleted, the report says so, and a failed DELETE is reported as failed, not as removed;
  * route reused, verification fails: nothing is deleted and the report says so (the first message claimed "removed");
  * a route owned by another script is left untouched; a script that cannot be found, or an API that cannot be read, stops at stage deploy with zero writes and a message that says which;
  * the file has no mutation of any worker setting left (it once PUT the workers.dev subdomain, a call that could never succeed), judged by secret-mutation-guard's own signals,
    not by a text match.
No network, no sleeping, nothing written outside a temp dir."""
import contextlib, importlib.util, io, os, re, sys, tempfile, types

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ["CLOUDFLARE_API_TOKEN"] = "x"
os.environ["CLOUDFLARE_ACCOUNT_ID"] = "acct"
os.environ["CF_ZONE_ID"] = "zone1"
TMP = tempfile.mkdtemp(prefix="amq-")
fail = 0
def ok(c, msg, extra=None):
    global fail
    if not c:
        fail += 1
        print("FAIL", msg, ("" if extra is None else ":: " + str(extra)[:400]))

_n = [0]
def load():
    _n[0] += 1
    spec = importlib.util.spec_from_file_location("amq_%d" % _n[0], os.path.join(HERE, "attach-mind-q08-route.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.OUT = os.path.join(TMP, "out.json")
    import time as _t
    m.time = types.SimpleNamespace(sleep=lambda s: None, time=_t.time, strftime=_t.strftime, gmtime=_t.gmtime)
    return m

def run(**o):
    m = load()
    calls = []
    st = {"routes": [dict(r) for r in o.get("routes", [])], "dns": [dict(d) for d in o.get("dns", [])]}
    def req(method, path, body=None, timeout=25, retries=2):
        calls.append((method, path))
        if method == "GET" and path == "/accounts/acct/workers/scripts/q08-mind": return (o.get("get_script", 200), {})
        if method == "GET" and path.startswith("/accounts/acct/workers/scripts?"): return (o.get("list_status", 200), {"result": [{"id": n} for n in o.get("listed", [])]})
        if method == "GET" and path == "/zones/zone1/workers/routes": return (200, {"result": st["routes"]})
        if method == "POST" and path == "/zones/zone1/workers/routes": st["routes"].append({"id": "newr", "pattern": body["pattern"], "script": body["script"]}); return (200, {"result": {"id": "newr"}})
        if method == "GET" and path.startswith("/zones/zone1/dns_records?"): return (200, {"result": st["dns"]})
        if method == "POST" and path == "/zones/zone1/dns_records": st["dns"].append({"id": "newd"}); return (200, {"result": {"id": "newd"}})
        if method == "DELETE" and path.startswith("/zones/zone1/workers/routes/"): return (o.get("del_route", 200), {})
        if method == "DELETE" and path.startswith("/zones/zone1/dns_records/"): return (o.get("del_dns", 200), {})
        return (404, {})
    def public_get(url, timeout=20):
        if "/health" in url: return o.get("health", (200, {"worker": "q08-mind", "version": "2.2.0"}))
        if "/api/entries.json" in url: return o.get("entries", (200, {"entries": [1, 2, 3]}))
        return (0, None)
    m.req, m.public_get = req, public_get
    with contextlib.redirect_stdout(io.StringIO()):
        rc = m.main()
    writes = [c for c in calls if c[0] != "GET"]
    return rc, m.R, writes

def RB(R):
    return R.get("rolled_back") or {"removed": [], "failed": []}

LIVE_ROUTE = [{"id": "r1", "pattern": "mind.q08.org/*", "script": "q08-mind"}]

# live state: the run the merge of this PR starts
rc, R, w = run(routes=LIVE_ROUTE, dns=[{"id": "d1"}])
ok(rc == 0 and R["status"] == "ok" and R["verified"] is True and R["route_reused"] is True and R["dns_created"] is False, "live state verifies ok with the route and record reused", (rc, R["status"], R["stage"]))
ok(w == [], "live state: no write of any kind", w)

# fresh create, verification passes
rc, R, w = run()
ok(rc == 0 and [c[0] + " " + c[1] for c in w] == ["POST /zones/zone1/workers/routes", "POST /zones/zone1/dns_records"], "fresh: exactly one route and one record are created", w)

# fresh create, verification fails: both rolled back and reported as removed
rc, R, w = run(health=(530, None))
ok(rc == 1 and R["stage"] == "verify" and [c[0] for c in w] == ["POST", "POST", "DELETE", "DELETE"], "fresh + failed verification: the route and the record are deleted", w)
ok(len(RB(R)["removed"]) == 2 and not RB(R)["failed"] and "removed" in R["error"] and "FAILED" not in R["error"], "and the report lists what was removed", R["error"])

# a DELETE that fails is reported as failed
rc, R, w = run(health=(530, None), del_route=500)
ok(RB(R)["failed"] == ["route newr (http 500)"] and RB(R)["removed"] == ["record newd (http 200)"] and "removal FAILED for route newr" in R["error"], "a failed route delete is reported as FAILED and the record delete as removed", R)

# route reused, verification fails: nothing deleted, and the report no longer claims it
rc, R, w = run(routes=LIVE_ROUTE, dns=[{"id": "d1"}], health=(530, None))
ok(rc == 1 and not [c for c in w if c[0] == "DELETE"] and RB(R) == {"removed": [], "failed": []}, "reused route and record + failed verification: nothing is deleted", w)
ok("nothing was removed" in R["error"] and "were removed" not in R["error"], "and the report says nothing was removed (it used to say they were)", R["error"])

# route created, record reused, verification fails: only the created route is deleted
rc, R, w = run(dns=[{"id": "d1"}], health=(530, None))
ok([c[0] + " " + c[1].split("/")[3] for c in w if c[0] != "GET"] == ["POST workers", "DELETE workers"], "fresh route + existing record: only the route this run created is deleted", w)

# a route owned by another script is left alone
rc, R, w = run(routes=[{"id": "rx", "pattern": "mind.q08.org/*", "script": "somebody-else"}])
ok(rc == 1 and R["stage"] == "route" and w == [] and "left untouched" in R["error"], "a route that points at another script is left untouched, zero writes", (R["stage"], w))

# the script cannot be found
rc, R, w = run(get_script=404, list_status=200, listed=["other"])
ok(rc == 1 and R["stage"] == "deploy" and w == [] and "is absent (GET 404 and not in the scripts list)" in R["error"] and "no route or record was touched" in R["error"], "absent script: stops at deploy with zero writes and says absent", R["error"])
# the script is found by the list
rc, R, w = run(get_script=404, listed=["q08-mind"], routes=LIVE_ROUTE, dns=[{"id": "d1"}])
ok(rc == 0 and w == [], "found by the scripts list (GET 404): proceeds, zero writes", (rc, R["status"]))

# the API cannot be read: not "absent"
for status in (0, 401, 403, 429, 500):
    rc, R, w = run(get_script=status, list_status=status)
    ok(rc == 1 and R["stage"] == "deploy" and w == [] and "could not be confirmed" in R["error"] and "is absent" not in R["error"], "API answers %s: fails closed with zero writes and says not confirmed (not absent)" % status, R["error"])

# no mutation of a worker setting is left in the file
src = open(os.path.join(HERE, "attach-mind-q08-route.py"), encoding="utf-8").read()
spec = importlib.util.spec_from_file_location("smg", os.path.join(HERE, "secret-mutation-guard.py"))
smg = importlib.util.module_from_spec(spec); spec.loader.exec_module(smg)
ok(smg.signals(src) == [], "secret-mutation-guard finds no mutation signal in the script (so no lock is needed, and none is pretended)", smg.signals(src))
ok("/subdomain" not in src and "secret_lock" not in src and not re.search(r"[\"']PUT[\"']", src), "no workers.dev subdomain call, no lock wrapper, no PUT verb")
ok(src.count("req(\"DELETE\"") == 2 and "route_reused\"] is False" in src and "dns_created\"] is True" in src, "the only deletes are the two created-only rollbacks, behind their guards")

print("%d failed" % fail if fail else "all passed")
sys.exit(1 if fail else 0)

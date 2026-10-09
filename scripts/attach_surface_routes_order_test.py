"""SPARE-DOMAINS-ORDER-1 offline check: the spare hosts are processed before the two qwav.org hosts, and the qwav.org pair is
skipped only when its last recorded result was a failed, rolled-back verification inside 48 hours."""
import importlib.util, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "x")
spec = importlib.util.spec_from_file_location("asr", os.path.join(HERE, "attach-surface-routes.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
fail = 0
def ok(c, msg):
    global fail
    if not c:
        fail += 1
        print("FAIL", msg)
hosts = [h for _, h in m.HOSTS]
i_org, i_www = hosts.index("qwav.org"), hosts.index("www.qwav.org")
spare_idx = [hosts.index(h) for h in m.SPARE_TARGET]
ok(min(i_org, i_www) > max(spare_idx), "qwav.org and www.qwav.org come after every spare host: %r" % hosts)
ok(len(hosts) == len(set(hosts)), "no host listed twice")
ok(hosts[0] == "archive.qnfo.org", "verified hosts keep their place")
now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
old = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 72 * 3600))
def last(ts, verified, rolled):
    return {"ts": ts, "hosts": {"qwav.org": {"verified": verified, "rolled_back": rolled}}}
m._LAST = last(now, False, True);  ok(m.recently_failed("qwav.org") is True, "failed and rolled back just now: skipped")
m._LAST = last(old, False, True);  ok(m.recently_failed("qwav.org") is False, "older than 48h: tried again")
m._LAST = last(now, True, False);  ok(m.recently_failed("qwav.org") is False, "verified last time: not skipped")
m._LAST = last(now, False, False); ok(m.recently_failed("qwav.org") is False, "unverified but not rolled back: not skipped")
m._LAST = {};                      ok(m.recently_failed("qwav.org") is False, "no record: not skipped")
print("%d failed" % fail if fail else "all passed")
sys.exit(1 if fail else 0)

import sqlite3, os, json, urllib.request

KEY = sqlite3.connect(os.path.expandvars(r"%APPDATA%\DeepChat\app_db\agent.db")).execute("SELECT api_key FROM providers WHERE name='QNFO Ops'").fetchone()[0]

def fetch(url, method="GET", body=None, timeout=60):
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json", "User-Agent": "qnfo-capability-feed/1.0"})
    return urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace")

reg = json.loads(fetch("https://qnfo-ops.q08.workers.dev/registry"))
svcs = [s for s in reg.get("registry", []) if s.get("base_url")]
results = []
for s in svcs:
    url = s["base_url"].rstrip("/") + "/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "qnfo-capability-feed/1.0"})
        j = json.loads(urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace"))
        caps = j.get("capabilities")
        if isinstance(caps, str):
            caps = [x for x in caps.split(",") if x.strip()]
        lims = j.get("limitations") if isinstance(j.get("limitations"), list) else []
        results.append({"service": s["service"], "version": j.get("version"), "capabilities": caps if isinstance(caps, list) else [], "limitations": lims})
    except Exception:
        results.append({"service": s["service"], "version": None, "capabilities": [], "limitations": []})

r = json.loads(fetch("https://qnfo-ops.q08.workers.dev/capability-audit/report", method="POST", body={"results": results}))
print("POST stored:", r.get("stored"), "ts:", r.get("ts"))

a = json.loads(fetch("https://qnfo-ops.q08.workers.dev/capability-audit?offset=0&limit=50"))
print("GET -> conforming:", a.get("conforming"), "| non_conforming:", len(a.get("non_conforming", [])), "| unverified:", len(a.get("unverified", [])))
for x in a.get("non_conforming", [])[:4]:
    print("   NC:", x.get("service"), x.get("reason"), x.get("source"))
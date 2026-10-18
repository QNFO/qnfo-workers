#!/usr/bin/env python3
"""CF-OBS-BRIDGE-1 (2026-10-18, owner directive "INTEGRATE CLOUDFLARE OBSERVABILITY ISSUES INTO UNIFIED TRACKING, AUDITING, AND
REMEDIATION. THE SYSTEM SHALL AUTOMATICALLY SWEEP FOR ALL KNOWN ISSUES AND RESOLVE AUTOMATICALLY").

WHAT  Closes the loop between Cloudflare Workers Observability Issues and the fleet's own tracker:
      1. SWEEP   reads every page of /workers/observability/issues?status=active (Cloudflare API, read).
      2. TRACK   every live group (seen in the last LIVE_H hours, not external scan noise) gets ONE open agent_issues row
                 "CF-OBS-ISSUE-1: <service>: <title>", deduped on the Cloudflare id carried in its description, with:
                   - a code-task line for <service>/worker.js when that file exists, so the code loop attempts the fix;
                   - its issue-<id> contract re-pointed at a d1-query probe that passes once the group has not recurred for
                     QUIET_H hours (read from fleet_issue_dispatch, which qnfo-fleet-control pollObservability refreshes
                     every 10 minutes). The existing autoclose trigger then closes the issue with verified evidence.
      3. RESOLVE when a CF-OBS-ISSUE-1 issue is closed by verification and its group has been quiet QUIET_H hours, the
                 group is PATCHed to status=resolved in Cloudflare. Cloudflare re-activates a resolved group on its next
                 occurrence, and the next sweep then files a fresh issue (relapse is visible, never silent).
      One run row per sweep in cloud_ops_events (kind cf-obs-bridge); the fm-cf-obs-untracked contract audits the gap.
WHY   Before this, pollObservability mirrored groups into fleet_issue_dispatch, but nothing turned a live group into a tracked,
      probed, closable issue, so 29 groups sat active (3824 occurrences) while the remediation loop never saw them.
RUNS  A step of remediation-consumer.yml (runner, depth 0: an agent_issues insert from a D1 trigger nests past D1's limit).
      Deterministic, no model call. Never fails the job.
"""
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PREFIX = "CF-OBS-ISSUE-1: "
LIVE_H = 24          # a group last seen within this window is a live defect worth tracking
QUIET_H = 6          # a tracked group quiet this long passes its probe
NOISE = ("potential vulnerability scan",)
MAX_NEW = 15         # bound new issues per run so a burst cannot flood the tracker
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def now_ms():
    return int(time.time() * 1000)


def is_noise(it):
    t = str(it.get("title") or "").lower()
    return any(n in t for n in NOISE)


def title_for(it):
    svc = str(it.get("service") or "?")[:40]
    t = " ".join(str(it.get("title") or "issue").split())[:110]
    return PREFIX + svc + ": " + t


def probe_for(cf_id):
    fp = "cf-obs-" + cf_id
    return ("SELECT '1' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM fleet_issue_dispatch d WHERE d.fingerprint = '%s' "
            "AND d.state <> 'resolved' AND CAST(json_extract(d.payload, '$.lastObserved') AS INTEGER) > "
            "(CAST(strftime('%%s', 'now') AS INTEGER) - %d) * 1000) THEN '1' ELSE '0' END AS observed") % (fp.replace("'", "''"), QUIET_H * 3600)


def code_task_line(svc):
    path = os.path.join(ROOT, svc, "worker.js")
    if svc and os.path.isfile(path):
        return "\ncode-task: repo=qnfo-workers path=%s/worker.js" % svc
    return ""


def list_active(cf):
    out = []
    for page in range(1, 11):
        r = cf("GET", "/workers/observability/issues?" + urllib.parse.urlencode({"status": "active", "perPage": 50, "page": page}))
        items = r.get("result") if r.get("success") else None
        if items is None:
            raise RuntimeError("issues list unreadable: " + json.dumps(r.get("errors"))[:200])
        out.extend(items)
        if len(items) < 50:
            return out
    return out


def sweep(d1, cf, now=None):
    now = now or now_ms()
    res = {"active": 0, "live": 0, "noise": 0, "filed": [], "already": 0, "resolved_cf": [], "errors": 0}
    items = list_active(cf)
    res["active"] = len(items)
    filed = 0
    for it in items:
        cid = str(it.get("id") or "")
        if not cid:
            continue
        if is_noise(it):
            res["noise"] += 1
            continue
        if now - int(it.get("lastObserved") or 0) > LIVE_H * 3600 * 1000:
            continue
        res["live"] += 1
        if d1("SELECT id FROM agent_issues WHERE status = 'open' AND title LIKE 'CF-OBS-ISSUE-1:%' AND instr(description, ?1) > 0 LIMIT 1", ["cf-obs-id: " + cid]):
            res["already"] += 1
            continue
        if filed >= MAX_NEW:
            continue
        title = title_for(it)
        if d1("SELECT id FROM agent_issues WHERE status = 'open' AND lower(trim(title)) = lower(trim(?1)) LIMIT 1", [title]):
            res["already"] += 1
            continue
        svc = str(it.get("service") or "")
        desc = ("Charter pillar: reliability. Cloudflare Workers Observability issue group, live: %s occurrence(s), first %s, last %s "
                "(type %s, service %s).\ncf-obs-id: %s\nDashboard: https://dash.cloudflare.com/?to=/:account/workers/observability/issues/%s\n"
                "Find the root cause in the worker and fix it; do not suppress the log line. Closes by verification when the group "
                "has not recurred for %d hours (fleet_issue_dispatch, refreshed every 10 min by qnfo-fleet-control pollObservability); "
                "the bridge then marks the Cloudflare group resolved.%s") % (
            it.get("count"), time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime(int(it.get("firstObserved") or 0) / 1000)),
            time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime(int(it.get("lastObserved") or 0) / 1000)), it.get("type"), svc, cid, cid,
            QUIET_H, code_task_line(svc))
        pri = "high" if (it.get("type") == "exception" or int(it.get("count") or 0) >= 50) else "medium"
        try:
            d1("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) "
               "VALUES (?1, ?2, 'cf-obs-bridge', 'reliability', ?3, 'open', ?4, ?4)", [title, desc, pri, now])
            row = d1("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' ORDER BY id DESC LIMIT 1", [title])
            if row:
                iid = int(row[0]["id"])
                d1("UPDATE remediation_contracts SET verify_probe = ?1, verify_transport = 'd1-query', status = 'active' WHERE class = ?2",
                   [probe_for(cid), "issue-%d" % iid])
                res["filed"].append(iid)
                filed += 1
        except Exception as e:  # noqa: BLE001
            res["errors"] += 1
            print(json.dumps({"evt": "cf-obs-bridge:file", "id": cid, "error": str(e)[:200]}))
    # RESOLVE: verified-closed bridge issues whose group is still active in Cloudflare but quiet QUIET_H hours.
    active_ids = {str(it.get("id")): it for it in items}
    closed = d1("SELECT id, description FROM agent_issues WHERE title LIKE 'CF-OBS-ISSUE-1:%' AND status IN ('closed', 'resolved') "
                "AND updated_at > (CAST(strftime('%s', 'now') AS INTEGER) - 14 * 86400) * 1000")
    for row in closed:
        desc = str(row.get("description") or "")
        k = desc.find("cf-obs-id: ")
        if k < 0:
            continue
        cid = desc[k + 11:].split("\n", 1)[0].strip()
        it = active_ids.get(cid)
        if not it or now - int(it.get("lastObserved") or 0) < QUIET_H * 3600 * 1000:
            continue
        r = cf("PATCH", "/workers/observability/issues/" + urllib.parse.quote(cid), {"status": "resolved"})
        if r.get("success"):
            res["resolved_cf"].append(cid[:8])
        else:
            res["errors"] += 1
    try:
        d1("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), "
           "'cf-obs-bridge', ?2, 'remediation-consumer', ?3)",
           ["cfb-%d-%s" % (now, os.urandom(4).hex()), json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in res.items()}), "ok" if not res["errors"] else "warn"])
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"evt": "cf-obs-bridge:run-row", "error": str(e)[:200]}))
    return res


def live_cf():
    import remediation_consumer as RC  # noqa: E402
    import cf_ops_actions as C  # noqa: E402
    acct, tok = RC.ACCOUNT, RC.TOKEN

    def cf(method, path, body=None):
        st, j = C.call(method, "/accounts/%s%s" % (acct, path), tok, body, timeout=30)
        return j if isinstance(j, dict) else {}
    return RC.d1, cf


def main():
    if not (os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")):
        print(json.dumps({"cf_obs_bridge": "skipped: no token"}))
        return 0
    try:
        d1, cf = live_cf()
        print(json.dumps({"cf_obs_bridge": sweep(d1, cf)}))
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"cf_obs_bridge": "failed: " + str(e)[:300]}))
    return 0


def selftest():
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.executescript("""
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX open_title ON agent_issues(lower(trim(title))) WHERE status = 'open';
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, status TEXT, issue_id INTEGER);
CREATE TRIGGER birth AFTER INSERT ON agent_issues BEGIN INSERT INTO remediation_contracts VALUES ('issue-' || NEW.id, 'needs', 'd1-query', 'needs-machine-probe', NEW.id); END;
CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, category TEXT, payload TEXT, state TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, job TEXT, status TEXT);
""")

    def d1(sql, params=None):
        cur = c.execute(sql, params or [])
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    now = now_ms()
    groups = [
        {"id": "g-live-1", "service": "qnfo-ai", "title": "HttpServerError \u00b7 HTTP 502", "type": "exception", "count": 92, "firstObserved": now - 9e8, "lastObserved": now - 60e3},
        {"id": "g-scan", "service": "qnfo-gateway", "title": "Potential vulnerability scan \u00b7 /wp-login.php \u00b7 low risk", "type": "exception", "count": 4, "firstObserved": now - 1e6, "lastObserved": now - 1e5},
        {"id": "g-old", "service": "qnfo-ops", "title": "HttpServerError \u00b7 HTTP 502", "type": "exception", "count": 9, "firstObserved": now - 9e8, "lastObserved": now - 30 * 36e5},
        {"id": "g-quiet", "service": "radar-hub", "title": "HttpServerError \u00b7 HTTP 503", "type": "exception", "count": 3, "firstObserved": now - 9e8, "lastObserved": now - 8 * 36e5},
    ]
    patched = []

    def cf(method, path, body=None):
        if method == "GET":
            return {"success": True, "result": groups if "page=1" in path else []}
        patched.append((path, body))
        return {"success": True}
    r1 = sweep(d1, cf, now)
    assert r1["active"] == 4 and r1["noise"] == 1 and r1["live"] == 2 and len(r1["filed"]) == 2, r1
    r2 = sweep(d1, cf, now)
    assert r2["filed"] == [] and r2["already"] == 2, r2
    rows = d1("SELECT id, title, description, priority FROM agent_issues ORDER BY id")
    assert rows[0]["title"] == "CF-OBS-ISSUE-1: qnfo-ai: HttpServerError \u00b7 HTTP 502" and rows[0]["priority"] == "high", rows
    assert "cf-obs-id: g-live-1" in rows[0]["description"]
    pr = d1("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-%d'" % rows[0]["id"])[0]["verify_probe"]
    assert pr.startswith("SELECT '1' AS expected") and "cf-obs-g-live-1" in pr, pr
    # the probe fails while the dispatch row is live, passes once it is quiet
    c.execute("INSERT INTO fleet_issue_dispatch VALUES ('cf-obs-g-live-1', 'worker-observability', ?, 'tracked')", [json.dumps({"lastObserved": now - 60e3})])
    assert d1(pr)[0]["observed"] == "0"
    c.execute("UPDATE fleet_issue_dispatch SET payload = ? WHERE fingerprint = 'cf-obs-g-live-1'", [json.dumps({"lastObserved": now - 7 * 36e5})])
    assert d1(pr)[0]["observed"] == "1"
    # a verified-closed issue whose group is quiet is resolved in Cloudflare; a live one is not
    c.execute("UPDATE agent_issues SET status = 'closed', updated_at = ? WHERE description LIKE '%g-quiet%'", [now])
    r3 = sweep(d1, cf, now)
    assert any("g-quiet" in p for p, _ in patched) and all(b == {"status": "resolved"} for _, b in patched), patched
    assert not any("g-live-1" in p for p, _ in patched)
    assert d1("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'cf-obs-bridge'")[0]["n"] == 3
    print("cf_obs_issue_bridge selftest: ok")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else main())
